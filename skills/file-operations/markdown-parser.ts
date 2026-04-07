import fs from 'fs/promises'
import path from 'path'
import yaml from 'js-yaml'

export interface MarkdownSkillMeta {
  name: string
  description: string
  parameters: {
    type: string
    properties: Record<string, {
      type: string
      description: string
      enum?: string[]
      default?: any
      required?: boolean
    }>
    required: string[]
  }
}

/**
 * 从 Markdown 文件解析 skill 元数据
 * 读取 YAML frontmatter，返回 name/description/parameters
 */
export async function parseMarkdownSkill(mdPath: string): Promise<MarkdownSkillMeta> {
  const fullPath = path.join(process.cwd(), mdPath)
  const content = await fs.readFile(fullPath, 'utf-8')

  // 解析 YAML frontmatter (--- 之间的内容)，支持 LF 和 CRLF
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) {
    throw new Error(`Invalid markdown skill file: ${mdPath}, no YAML frontmatter found`)
  }

  const frontmatter = yaml.load(match[1]) as any

  // 转换参数格式
  const properties: Record<string, any> = {}
  const required: string[] = []

  for (const [key, value] of Object.entries(frontmatter.parameters || {})) {
    const param = value as any
    properties[key] = {
      type: param.type,
      description: param.description,
      ...(param.enum && { enum: param.enum }),
      ...(param.default !== undefined && { default: param.default })
    }
    if (param.required === true) {
      required.push(key)
    }
  }

  return {
    name: frontmatter.name,
    description: frontmatter.description,
    parameters: {
      type: 'object',
      properties,
      required
    }
  }
}
