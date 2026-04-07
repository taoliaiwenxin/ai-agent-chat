import { SkillDefinition } from '../index'
import fs from 'fs/promises'
import path from 'path'
import { glob } from 'glob'

export const countLinesSkill: SkillDefinition = {
  name: 'count_lines',
  description: '统计项目中的代码行数。可指定文件类型或目录',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '要统计的目录或文件路径（相对路径，默认为当前目录）'
      },
      extensions: {
        type: 'string',
        description: '文件扩展名，多个用逗号分隔，如 "ts,tsx,js"（可选）'
      }
    },
    required: []
  },
  execute: async (input: { path?: string; extensions?: string }) => {
    const targetPath = input.path || '.'
    const extensions = input.extensions
      ? input.extensions.split(',').map(e => e.trim().replace(/^\./, ''))
      : ['ts', 'tsx', 'js', 'jsx']

    const pattern = extensions.length === 1
      ? `**/*.${extensions[0]}`
      : `**/*.{${extensions.join(',')}}`

    const files = await glob(pattern, {
      cwd: path.resolve(process.cwd(), targetPath),
      ignore: ['node_modules/**', '.git/**', '.next/**', 'dist/**'],
      absolute: true
    })

    let totalLines = 0
    let totalFiles = 0
    const details: Array<{ file: string; lines: number }> = []

    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8')
        const lines = content.split('\n').length
        totalLines += lines
        totalFiles++
        details.push({
          file: path.relative(process.cwd(), file),
          lines
        })
      } catch {
        // 忽略无法读取的文件
      }
    }

    return {
      success: true,
      summary: {
        totalFiles,
        totalLines,
        avgLinesPerFile: totalFiles > 0 ? Math.round(totalLines / totalFiles) : 0
      },
      details: details.sort((a, b) => b.lines - a.lines).slice(0, 20)
    }
  }
}
