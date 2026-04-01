import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { getModelConfig, Message } from '@/lib/models'
import { executeSkill, initSkills, getSkills } from '@/skills'

// 全局初始化标志
let skillsInitialized = false

// 构建 SSE 数据格式
function sse(data: object) {
  return `data: ${JSON.stringify(data)}\n\n`
}

// 调用 Claude 流式 API
async function* streamClaude(
  messages: Message[],
  apiKey: string,
  model: string,
  skills: any[]
) {
  const client = new Anthropic({ apiKey })

  const tools = skills.map(s => ({
    name: s.name,
    description: s.description,
    input_schema: {
      type: 'object' as const,
      properties: s.parameters.properties,
      required: s.parameters.required
    }
  }))

  const systemMessage = messages.find(m => m.role === 'system')
  const nonSystemMessages = messages.filter(m => m.role !== 'system')

  const stream = await client.messages.create({
    model,
    max_tokens: 4096,
    system: systemMessage?.content,
    messages: nonSystemMessages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    })),
    tools: tools.length > 0 ? tools : undefined,
    stream: true
  })

  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta') {
      if (chunk.delta.type === 'text_delta') {
        yield { type: 'text', content: chunk.delta.text }
      }
    } else if (chunk.type === 'content_block_start') {
      if (chunk.content_block.type === 'tool_use') {
        yield {
          type: 'tool_start',
          name: chunk.content_block.name,
          id: chunk.content_block.id
        }
      }
    } else if (chunk.type === 'content_block_stop') {
      if (chunk.content_block?.type === 'tool_use') {
        yield {
          type: 'tool_stop',
          name: chunk.content_block.name,
          input: chunk.content_block.input
        }
      }
    }
  }
}

// 调用 OpenAI 兼容流式 API
async function* streamOpenAICompatible(
  messages: Message[],
  config: {
    apiKey: string
    baseUrl?: string
    model: string
    provider: string
  },
  skills: any[]
) {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl
      ? `${config.baseUrl}/v1`
      : 'https://api.openai.com/v1'
  })

  const tools = skills.map(s => ({
    type: 'function' as const,
    function: {
      name: s.name,
      description: s.description,
      parameters: s.parameters
    }
  }))

  try {
    const stream = await client.chat.completions.create({
      model: config.model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? 'auto' : undefined,
      stream: true
    })

    let currentToolCall: any = null

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta

      if (delta?.content) {
        yield { type: 'text', content: delta.content }
      }

      if (delta?.tool_calls) {
        for (const toolCall of delta.tool_calls) {
          if (toolCall.id) {
            if (currentToolCall) {
              yield {
                type: 'tool_stop',
                name: currentToolCall.name,
                arguments: currentToolCall.arguments
              }
            }
            currentToolCall = {
              id: toolCall.id,
              name: toolCall.function?.name || '',
              arguments: toolCall.function?.arguments || ''
            }
            yield {
              type: 'tool_start',
              name: currentToolCall.name,
              id: toolCall.id
            }
          } else if (toolCall.function?.arguments) {
            if (currentToolCall) {
              currentToolCall.arguments += toolCall.function.arguments
            }
          }
        }
      }
    }

    if (currentToolCall) {
      yield {
        type: 'tool_stop',
        name: currentToolCall.name,
        arguments: currentToolCall.arguments
      }
    }
  } catch (error: any) {
    if (config.provider === 'ollama') {
      if (error.code === 'ECONNREFUSED') {
        throw new Error(
          `无法连接到 Ollama (localhost:11434)。请确保 Ollama 已安装并运行。`
        )
      }
    }
    throw error
  }
}

export async function POST(req: NextRequest) {
  try {
    // 首次调用时初始化 skills
    if (!skillsInitialized) {
      await initSkills()
      skillsInitialized = true
    }

    const { messages } = await req.json()
    const config = getModelConfig()
    const skills = getSkills()

    if (config.provider !== 'ollama' && !config.apiKey) {
      return Response.json(
        { error: `API Key not configured for ${config.provider}` },
        { status: 500 }
      )
    }

    const formattedMessages: Message[] = messages.map((m: any) => ({
      role: m.role,
      content: m.content
    }))

    // 创建 SSE 流
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const toolCalls: Array<{ name: string; input: any; output: any }> = []

          // 根据提供商选择流式方法
          let contentStream: AsyncGenerator<any>

          if (config.provider === 'claude') {
            contentStream = streamClaude(
              formattedMessages,
              config.apiKey!,
              config.model,
              skills
            )
          } else {
            contentStream = streamOpenAICompatible(
              formattedMessages,
              {
                apiKey: config.apiKey || 'ollama',
                baseUrl: config.baseUrl,
                model: config.model,
                provider: config.provider
              },
              skills
            )
          }

          let accumulatedText = ''
          const pendingToolCalls: Array<{ name: string; input: any; id?: string }> = []

          // 发送开始事件
          controller.enqueue(encoder.encode(sse({ type: 'start' })))

          for await (const chunk of contentStream) {
            if (chunk.type === 'text') {
              accumulatedText += chunk.content
              controller.enqueue(encoder.encode(sse({
                type: 'delta',
                content: chunk.content
              })))
            } else if (chunk.type === 'tool_start') {
              pendingToolCalls.push({ name: chunk.name, input: {}, id: chunk.id })
              controller.enqueue(encoder.encode(sse({
                type: 'tool_start',
                name: chunk.name
              })))
            } else if (chunk.type === 'tool_stop') {
              const toolCall = pendingToolCalls.find(t => t.name === chunk.name)
              if (toolCall) {
                try {
                  const args = typeof chunk.arguments === 'string'
                    ? JSON.parse(chunk.arguments)
                    : chunk.input || chunk.arguments
                  toolCall.input = args

                  // 执行工具
                  const output = await executeSkill(chunk.name, args)
                  toolCalls.push({
                    name: chunk.name,
                    input: args,
                    output
                  })

                  controller.enqueue(encoder.encode(sse({
                    type: 'tool_result',
                    name: chunk.name,
                    input: args,
                    output
                  })))
                } catch (error: any) {
                  controller.enqueue(encoder.encode(sse({
                    type: 'tool_error',
                    name: chunk.name,
                    error: error.message
                  })))
                }
              }
            }
          }

          // 如果有工具调用，再次调用模型获取最终回复
          if (toolCalls.length > 0) {
            controller.enqueue(encoder.encode(sse({ type: 'thinking' })))

            const toolResults = toolCalls.map(tc => ({
              role: 'tool' as const,
              content: JSON.stringify(tc.output)
            }))

            const followUpMessages: Message[] = [
              ...formattedMessages,
              { role: 'assistant', content: accumulatedText },
              { role: 'user', content: JSON.stringify(toolResults) }
            ]

            let followUpStream: AsyncGenerator<any>

            if (config.provider === 'claude') {
              followUpStream = streamClaude(
                followUpMessages,
                config.apiKey!,
                config.model,
                []
              )
            } else {
              followUpStream = streamOpenAICompatible(
                followUpMessages,
                {
                  apiKey: config.apiKey || 'ollama',
                  baseUrl: config.baseUrl,
                  model: config.model,
                  provider: config.provider
                },
                []
              )
            }

            for await (const chunk of followUpStream) {
              if (chunk.type === 'text') {
                controller.enqueue(encoder.encode(sse({
                  type: 'delta',
                  content: chunk.content
                })))
              }
            }
          }

          // 发送完成事件
          controller.enqueue(encoder.encode(sse({
            type: 'done',
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined
          })))

          controller.close()
        } catch (error: any) {
          controller.enqueue(encoder.encode(sse({
            type: 'error',
            error: error.message || 'Stream error'
          })))
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })
  } catch (error: any) {
    console.error('Stream API error:', error)
    return Response.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
