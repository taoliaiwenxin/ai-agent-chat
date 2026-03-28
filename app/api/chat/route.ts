import { NextRequest } from 'next/server'
import { callModel, getModelConfig, Message } from '@/lib/models'
import { executeSkill, initSkills, getSkills } from '@/skills'

// 全局初始化标志
let skillsInitialized = false

export async function POST(req: NextRequest) {
  try {
    // 首次调用时初始化 skills（包括从 Markdown 加载）
    if (!skillsInitialized) {
      await initSkills()
      skillsInitialized = true
    }

    const { messages } = await req.json()
    const config = getModelConfig()
    const skills = getSkills()

    console.log('Chat API called with provider:', config.provider, 'model:', config.model)

    if (config.provider !== 'ollama' && !config.apiKey) {
      return Response.json(
        { error: `API Key not configured for ${config.provider}` },
        { status: 500 }
      )
    }

    // 转换消息格式
    const formattedMessages: Message[] = messages.map((m: any) => ({
      role: m.role,
      content: m.content
    }))

    // 第一次调用模型（传入已加载的 skills）
    const response = await callModel(formattedMessages, config, skills)
    console.log('Model response:', response)

    // 记录工具调用
    const toolCalls: Array<{ name: string; input: any; output: any }> = []

    // 如果有工具调用，执行它们并再次调用模型
    if (response.toolCalls && response.toolCalls.length > 0) {
      const toolResults = []

      for (const toolCall of response.toolCalls) {
        try {
          const output = await executeSkill(toolCall.name, toolCall.arguments)
          toolCalls.push({
            name: toolCall.name,
            input: toolCall.arguments,
            output
          })

          // 构建工具结果消息
          if (config.provider === 'claude') {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolCall.name,
              content: JSON.stringify(output)
            })
          } else {
            toolResults.push({
              role: 'tool',
              content: JSON.stringify(output),
              tool_call_id: toolCall.name
            })
          }
        } catch (error: any) {
          toolResults.push({
            role: 'tool',
            content: `Error: ${error.message}`
          })
        }
      }

      // 再次调用模型，传入工具结果
      const followUpMessages: Message[] = [
        ...formattedMessages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: JSON.stringify(toolResults) }
      ]

      const followUpResponse = await callModel(followUpMessages, config, skills)

      return Response.json({
        content: followUpResponse.content,
        toolCalls
      })
    }

    return Response.json({
      content: response.content,
      toolCalls
    })
  } catch (error: any) {
    console.error('Chat API error:', error)
    return Response.json(
      { error: error.message || 'Internal server error', content: null },
      { status: 500 }
    )
  }
}
