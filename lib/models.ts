import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { SkillDefinition } from '@/skills'

export type ModelProvider = 'claude' | 'openai' | 'deepseek' | 'ollama'

export interface ModelConfig {
  provider: ModelProvider
  apiKey?: string
  baseUrl?: string
  model: string
}

export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ToolCall {
  name: string
  arguments: Record<string, any>
}

export interface ModelResponse {
  content: string
  toolCalls?: ToolCall[]
}

// 获取当前配置的模型
export function getModelConfig(): ModelConfig {
  const provider = (process.env.AI_MODEL as ModelProvider) || 'claude'

  switch (provider) {
    case 'openai':
      return {
        provider: 'openai',
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
      }

    case 'deepseek':
      return {
        provider: 'deepseek',
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseUrl: 'https://api.deepseek.com',
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat'
      }

    case 'ollama':
      return {
        provider: 'ollama',
        baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        model: process.env.OLLAMA_MODEL || 'llama3.1'
      }

    case 'claude':
    default:
      return {
        provider: 'claude',
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: process.env.ANTHROPIC_MODEL || 'claude-3-sonnet-20240229'
      }
  }
}

// 构建工具定义（统一格式）
function buildTools(skills: SkillDefinition[]) {
  return skills.map(skill => ({
    name: skill.name,
    description: skill.description,
    parameters: skill.parameters
  }))
}

// 调用 Claude
async function callClaude(
  messages: Message[],
  config: ModelConfig,
  skills: SkillDefinition[]
): Promise<ModelResponse> {
  const client = new Anthropic({ apiKey: config.apiKey })

  const tools = buildTools(skills).map(t => ({
    name: t.name,
    description: t.description,
    input_schema: {
      type: 'object' as const,
      properties: t.parameters.properties,
      required: t.parameters.required
    }
  }))

  // 分离 system 消息和其他消息
  const systemMessage = messages.find(m => m.role === 'system')
  const nonSystemMessages = messages.filter(m => m.role !== 'system')

  const response = await client.messages.create({
    model: config.model,
    max_tokens: 4096,
    system: systemMessage?.content,
    messages: nonSystemMessages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    })),
    tools
  })

  const textContent = response.content
    .filter(c => c.type === 'text')
    .map(c => (c as any).text)
    .join('')

  const toolCalls = response.content
    .filter(c => c.type === 'tool_use')
    .map(c => ({
      name: (c as any).name,
      arguments: (c as any).input
    }))

  return { content: textContent, toolCalls }
}

// 调用 OpenAI/DeepSeek/Ollama（格式相同）
async function callOpenAICompatible(
  messages: Message[],
  config: ModelConfig,
  skills: SkillDefinition[]
): Promise<ModelResponse> {
  const client = new OpenAI({
    apiKey: config.apiKey || 'ollama',
    baseURL: config.baseUrl
      ? `${config.baseUrl}/v1`
      : 'https://api.openai.com/v1'
  })

  const tools = buildTools(skills).map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }
  }))

  try {
    const response = await client.chat.completions.create({
      model: config.model,
      messages,
      tools,
      tool_choice: 'auto'
    })

    const choice = response.choices[0]
    const message = choice.message

    return {
      content: message.content || '',
      toolCalls: message.tool_calls?.map(tc => ({
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments)
      }))
    }
  } catch (error: any) {
    if (config.provider === 'ollama') {
      if (error.code === 'ECONNREFUSED') {
        throw new Error(
          `无法连接到 Ollama (localhost:11434)。请确保 Ollama 已安装并运行。\n` +
          `安装: https://ollama.com/download\n` +
          `运行: ollama run ${config.model}`
        )
      }
      if (error.status === 404 || error.message?.includes('model')) {
        throw new Error(
          `Ollama 模型 "${config.model}" 未找到。请下载模型:\n` +
          `运行: ollama pull ${config.model}`
        )
      }
    }
    throw error
  }
}

// 统一调用接口
export async function callModel(
  messages: Message[],
  config?: ModelConfig,
  skills?: SkillDefinition[]
): Promise<ModelResponse> {
  const cfg = config || getModelConfig()

  console.log(`Using model: ${cfg.provider} (${cfg.model})`)

  // 如果没有提供 skills，使用空数组（无工具调用）
  const skillList = skills || []

  switch (cfg.provider) {
    case 'claude':
      return callClaude(messages, cfg, skillList)
    case 'openai':
    case 'deepseek':
    case 'ollama':
      return callOpenAICompatible(messages, cfg, skillList)
    default:
      throw new Error(`Unknown provider: ${cfg.provider}`)
  }
}
