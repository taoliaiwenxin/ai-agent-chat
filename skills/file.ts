import { SkillDefinition } from './index'
import fs from 'fs/promises'
import path from 'path'

// 限制可访问的目录（安全考虑）
const ALLOWED_BASE_PATH = process.cwd()

function resolveSafePath(inputPath: string): string {
  const resolved = path.resolve(ALLOWED_BASE_PATH, inputPath)
  if (!resolved.startsWith(ALLOWED_BASE_PATH)) {
    throw new Error('Access denied: path outside allowed directory')
  }
  return resolved
}

export const fileSkill: SkillDefinition = {
  name: 'file_operation',
  description: '读取、写入、列出或删除本地文件。支持的操作: read, write, list, delete, exists',
  parameters: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        description: '文件操作类型: read, write, list, delete, exists',
        enum: ['read', 'write', 'list', 'delete', 'exists']
      },
      path: {
        type: 'string',
        description: '文件或目录路径（相对路径）'
      },
      content: {
        type: 'string',
        description: '写入文件的内容（仅 write 操作需要）'
      }
    },
    required: ['operation', 'path']
  },
  execute: async (input: { operation: string; path: string; content?: string }) => {
    const { operation, path: filePath, content } = input
    const fullPath = resolveSafePath(filePath)

    switch (operation) {
      case 'read': {
        const data = await fs.readFile(fullPath, 'utf-8')
        return { success: true, content: data }
      }

      case 'write': {
        if (content === undefined) {
          throw new Error('Content is required for write operation')
        }
        await fs.mkdir(path.dirname(fullPath), { recursive: true })
        await fs.writeFile(fullPath, content, 'utf-8')
        return { success: true, message: `File written: ${filePath}` }
      }

      case 'list': {
        const entries = await fs.readdir(fullPath, { withFileTypes: true })
        return {
          success: true,
          files: entries.map(e => ({
            name: e.name,
            type: e.isDirectory() ? 'directory' : 'file'
          }))
        }
      }

      case 'delete': {
        const stat = await fs.stat(fullPath)
        if (stat.isDirectory()) {
          await fs.rmdir(fullPath, { recursive: true })
        } else {
          await fs.unlink(fullPath)
        }
        return { success: true, message: `Deleted: ${filePath}` }
      }

      case 'exists': {
        try {
          await fs.access(fullPath)
          return { success: true, exists: true }
        } catch {
          return { success: true, exists: false }
        }
      }

      default:
        throw new Error(`Unknown operation: ${operation}`)
    }
  }
}
