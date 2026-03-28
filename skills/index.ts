import { fileSkill } from './file'
import { searchSkill } from './search'
import { createWeatherSkill } from './weather'
import { createUIDesignSkill } from './ui-design'

export interface SkillParameter {
  type: string
  description: string
  enum?: string[]
}

export interface SkillDefinition {
  name: string
  description: string
  parameters: {
    type: string
    properties: Record<string, SkillParameter>
    required: string[]
  }
  execute: (input: any) => Promise<any>
}

// 同步定义的 skills
const syncSkills: SkillDefinition[] = [
  fileSkill,
  searchSkill
]

// 异步加载所有 skills（包括从 Markdown 读取元数据的）
export async function loadSkills(): Promise<SkillDefinition[]> {
  // 异步加载需要从 Markdown 读取元数据的 skills
  const [weatherSkill, uiDesignSkill] = await Promise.all([
    createWeatherSkill(),
    createUIDesignSkill()
  ])

  return [...syncSkills, weatherSkill, uiDesignSkill]
}

// 全局 skills 缓存
let skillsCache: SkillDefinition[] | null = null

// 获取已加载的 skills（确保先调用 loadSkills）
export function getSkills(): SkillDefinition[] {
  if (!skillsCache) {
    throw new Error('Skills not loaded. Call loadSkills() first.')
  }
  return skillsCache
}

// 初始化 skills
export async function initSkills(): Promise<void> {
  skillsCache = await loadSkills()
  console.log('Skills loaded:', skillsCache.map(s => s.name).join(', '))
}

// 执行 skill
export async function executeSkill(name: string, input: any): Promise<any> {
  const skills = getSkills()
  const skill = skills.find(s => s.name === name)
  if (!skill) {
    throw new Error(`Unknown skill: ${name}`)
  }
  return skill.execute(input)
}

// 向后兼容：导出静态 skills 数组（需要在 initSkills 后使用）
export const skills: SkillDefinition[] = syncSkills
