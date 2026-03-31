import { SkillDefinition, executeSkill } from './index'

/**
 * Project Analyzer Skill
 * 使用 skill reference 模式：内部调用 file 和 search skills 来分析项目
 */
export const projectAnalyzerSkill: SkillDefinition = {
  name: 'project_analyzer',
  description: '分析项目结构，统计代码行数、文件类型分布、依赖信息等。内部使用 file_operation 和 search skills。',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '项目路径（相对路径，默认为当前目录）',
        default: '.'
      },
      includeNodeModules: {
        type: 'boolean',
        description: '是否包含 node_modules 目录',
        default: false
      },
      analysisType: {
        type: 'string',
        description: '分析类型: structure, stats, dependencies, all',
        enum: ['structure', 'stats', 'dependencies', 'all'],
        default: 'all'
      }
    },
    required: []
  },
  execute: async (input: {
    path?: string
    includeNodeModules?: boolean
    analysisType?: string
  }) => {
    const { path = '.', includeNodeModules = false, analysisType = 'all' } = input
    const results: Record<string, any> = {}

    try {
      // Skill Reference 1: 使用 file_operation skill 列出目录结构
      if (analysisType === 'structure' || analysisType === 'all') {
        const structure = await executeSkill('file_operation', {
          operation: 'list',
          path: path
        })
        results.structure = structure.success ? structure.files : []
      }

      // Skill Reference 2: 使用 search skill 查找代码文件
      if (analysisType === 'stats' || analysisType === 'all') {
        const codeFiles = await executeSkill('search', {
          type: 'filename',
          query: '.',
          path: path,
          filePattern: '*.{ts,tsx,js,jsx,py,java,go,rs}'
        })

        const configFiles = await executeSkill('search', {
          type: 'filename',
          query: '.',
          path: path,
          filePattern: '*.{json,yaml,yml,md,txt}'
        })

        results.stats = {
          codeFiles: codeFiles.count || 0,
          configFiles: configFiles.count || 0,
          totalFiles: (codeFiles.count || 0) + (configFiles.count || 0)
        }
      }

      // Skill Reference 3: 使用 file_operation skill 读取 package.json
      if (analysisType === 'dependencies' || analysisType === 'all') {
        try {
          const packageJson = await executeSkill('file_operation', {
            operation: 'read',
            path: `${path}/package.json`
          })

          if (packageJson.success) {
            const pkg = JSON.parse(packageJson.content)
            results.dependencies = {
              name: pkg.name,
              version: pkg.version,
              dependencyCount: Object.keys(pkg.dependencies || {}).length,
              devDependencyCount: Object.keys(pkg.devDependencies || {}).length,
              scripts: Object.keys(pkg.scripts || {})
            }
          }
        } catch (e) {
          results.dependencies = { error: 'No package.json found' }
        }
      }

      // 组合所有结果
      return {
        success: true,
        projectPath: path,
        analysisType,
        summary: {
          hasPackageJson: !!results.dependencies?.name,
          totalSourceFiles: results.stats?.codeFiles || 0
        },
        details: results,
        // 说明使用了哪些 skills
        skillsUsed: [
          'file_operation: list, read',
          'search: filename search'
        ]
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        projectPath: path
      }
    }
  }
}
