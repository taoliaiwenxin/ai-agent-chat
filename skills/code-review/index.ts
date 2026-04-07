import { SkillDefinition, executeSkill } from '../index'
import { parseMarkdownSkill } from '../file-operations/markdown-parser'

/**
 * 创建代码审查 skill
 * 从 Markdown 读取元数据，实现中引用 file_operation skill
 */
export async function createCodeReviewSkill(): Promise<SkillDefinition> {
  const meta = await parseMarkdownSkill('skills/code-review/index.md')

  return {
    name: meta.name,
    description: meta.description,
    parameters: meta.parameters,
    execute: async (input: { filePath: string; reviewType?: string }) => {
      const { filePath, reviewType = 'all' } = input
      const issues: Array<{ type: string; line: number; message: string }> = []

      try {
        // Skill Reference: 使用 file_operation skill 读取文件
        const fileResult = await executeSkill('file_operation', {
          operation: 'read',
          path: filePath
        })

        if (!fileResult.success) {
          return {
            success: false,
            error: `无法读取文件: ${filePath}`,
            skillsUsed: ['file_operation']
          }
        }

        const content = fileResult.content as string
        const lines = content.split('\n')

        // 安全审查
        if (reviewType === 'security' || reviewType === 'all') {
          lines.forEach((line, index) => {
            if (/eval\s*\(/.test(line) && !line.includes('//')) {
              issues.push({
                type: 'security',
                line: index + 1,
                message: '发现使用 eval()，存在代码注入风险'
              })
            }
            if (/innerHTML\s*=/.test(line)) {
              issues.push({
                type: 'security',
                line: index + 1,
                message: '发现使用 innerHTML，可能存在 XSS 风险'
              })
            }
          })
        }

        // 风格审查
        if (reviewType === 'style' || reviewType === 'all') {
          lines.forEach((line, index) => {
            if (line.length > 100) {
              issues.push({
                type: 'style',
                line: index + 1,
                message: '行长度超过 100 字符'
              })
            }
            if (line.endsWith(' ') || line.endsWith('\t')) {
              issues.push({
                type: 'style',
                line: index + 1,
                message: '行尾存在多余空格'
              })
            }
          })
        }

        return {
          success: true,
          filePath,
          reviewType,
          totalLines: lines.length,
          issuesFound: issues.length,
          issues,
          skillsUsed: ['file_operation']
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          filePath,
          skillsUsed: ['file_operation']
        }
      }
    }
  }
}
