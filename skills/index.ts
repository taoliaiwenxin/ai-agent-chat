import { fileSkill } from './file'
import { searchSkill } from './search'

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

export const skills: SkillDefinition[] = [
  fileSkill,
  searchSkill
]

export async function executeSkill(name: string, input: any): Promise<any> {
  const skill = skills.find(s => s.name === name)
  if (!skill) {
    throw new Error(`Unknown skill: ${name}`)
  }
  return skill.execute(input)
}
