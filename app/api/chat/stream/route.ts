import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { getModelConfig, Message } from '@/lib/models'
// 【Skill工具入口】从 skills/index.ts 导入 Skill 管理函数
// - initSkills: 初始化并加载所有 skill 定义
// - getSkills: 获取已加载的 skill 列表（用于构建 tool schema）
// - executeSkill: 【核心】执行具体的 skill 工具调用
import { executeSkill, initSkills, getSkills } from '@/skills'

// 全局初始化标志
let skillsInitialized = false

// 【SSE 数据格式】构建 Server-Sent Events 格式的数据包
// 每行以 "data: " 开头，以 "\n\n" 结束，符合 SSE 协议规范
// 前端通过 EventSource 接收这些事件并解析 data 字段
function sse(data: object) {
  return `data: ${JSON.stringify(data)}\n\n`
}

// 【Skill Schema 构建】将 skills 转换为 Claude 的 tools 格式
// 在 SSE 流开始前，将 skill 定义映射为 API 可用的 tool schema
async function* streamClaude(
  messages: Message[],
  apiKey: string,
  model: string,
  skills: any[]
) {
  const client = new Anthropic({ apiKey })

  // 【Skill 转 Tools】将 SkillDefinition[] 转换为 Claude API 的 tool 格式
  // 这使得 LLM 知道有哪些工具可用及其参数结构
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

    console.log("==111=====", stream)

    for await (const chunk of stream) {
      console.log("==22=====", chunk)
      const delta = chunk.choices[0]?.delta

      console.log("==333=====", delta)
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
    // 【Skill 初始化】首次调用时加载所有 skill 定义
    // initSkills() 会扫描 skills/ 目录下的所有 skill 文件（包括 .md 和 .ts）
    // 并将它们注册为可用的工具，供后续 SSE 流中调用
    if (!skillsInitialized) {
      await initSkills()
      skillsInitialized = true
    }

    const { messages } = await req.json()
    const config = getModelConfig()
    // 【获取 Skills】获取已加载的 skill 列表，用于构建传给 LLM 的 tool schema
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

                  // 【核心：Skill 工具执行】
                  // 当 LLM 返回 tool_use 结束信号时，实际调用 executeSkill 函数
                  // - chunk.name: skill 名称（如 "file", "search", "weather" 等）
                  // - args: LLM 生成的参数，会传递给 skill.execute(input)
                  // executeSkill 位于 skills/index.ts:62，会查找并执行对应的 skill
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

          // 【二次调用】如果有 Skill 工具调用完成，将结果再次传给模型
          // 这使得 LLM 能基于工具返回的实际数据生成最终回复
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
