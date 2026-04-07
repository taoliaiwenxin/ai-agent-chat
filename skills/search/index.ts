import { SkillDefinition } from '../index'
import fs from 'fs/promises'
import path from 'path'
import { glob } from 'glob'

// 限制可搜索的目录
const ALLOWED_BASE_PATH = process.cwd()

export const searchSkill: SkillDefinition = {
  name: 'search',
  description: '搜索文件内容或文件名。支持按文件名、文件内容、文件类型搜索',
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        description: '搜索类型: filename, content, or both',
        enum: ['filename', 'content', 'both']
      },
      query: {
        type: 'string',
        description: '搜索关键词'
      },
      path: {
        type: 'string',
        description: '搜索起始目录（相对路径，默认为当前目录）'
      },
      filePattern: {
        type: 'string',
        description: '文件匹配模式，如 *.ts, *.md（可选）'
      }
    },
    required: ['type', 'query']
  },
  execute: async (input: {
    type: string
    query: string
    path?: string
    filePattern?: string
  }) => {
    const { type, query, path: searchPath = '.', filePattern = '*.*' } = input
    const basePath = path.resolve(ALLOWED_BASE_PATH, searchPath)

    const results: Array<{ file: string; matches?: string[] }> = []

    // 获取所有匹配的文件
    const files = await glob(filePattern, {
      cwd: basePath,
      ignore: ['node_modules/**', '.git/**', 'dist/**', '.next/**'],
      absolute: true
    })

    for (const file of files) {
      try {
        const relativePath = path.relative(ALLOWED_BASE_PATH, file)

        // 按文件名搜索
        if (type === 'filename' || type === 'both') {
          if (path.basename(file).toLowerCase().includes(query.toLowerCase())) {
            results.push({ file: relativePath })
            continue
          }
        }

        // 按内容搜索
        if (type === 'content' || type === 'both') {
          // 跳过二进制文件
          const ext = path.extname(file).toLowerCase()
          const binaryExts = ['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.zip', '.exe']
          if (binaryExts.includes(ext)) continue

          const content = await fs.readFile(file, 'utf-8')
          const lines = content.split('\n')
          const matches: string[] = []

          lines.forEach((line, index) => {
            if (line.toLowerCase().includes(query.toLowerCase())) {
              matches.push(`Line ${index + 1}: ${line.trim().slice(0, 100)}`)
            }
          })

          if (matches.length > 0) {
            results.push({
              file: relativePath,
              matches: matches.slice(0, 5) // 限制结果数量
            })
          }
        }
      } catch (e) {
        // 忽略无法读取的文件
      }
    }

    return {
      success: true,
      count: results.length,
      results: results.slice(0, 20) // 限制返回结果数量
    }
  }
}
