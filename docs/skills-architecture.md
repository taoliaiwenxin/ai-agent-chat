# AI Agent Chat - Skills 调用架构详解

## 概述

本文档详细说明本项目中 AI 大模型如何发现、调用和执行 Skills（工具）的完整流程。

## 核心概念

### 什么是 Skill

Skill 是封装好的可执行功能单元，每个 Skill 包含：
- **名称 (name)**: 唯一标识符
- **描述 (description)**: 供 LLM 理解何时使用该工具
- **参数定义 (parameters)**: JSON Schema 格式的参数规范
- **执行逻辑 (execute)**: 实际的业务逻辑实现

```typescript
interface SkillDefinition {
  name: string
  description: string
  parameters: {
    type: string
    properties: Record<string, SkillParameter>
    required: string[]
  }
  execute: (input: any) => Promise<any>
}
```

## 架构流程

### 1. Skill 定义与注册

#### 1.1 定义 Skill

以文件操作 Skill 为例 (`skills/file-operations/index.ts`):

```typescript
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
    // ... 执行逻辑
  }
}
```

#### 1.2 注册到 Skill 系统

`skills/index.ts` 统一管理所有 Skills:

```typescript
const syncSkills: SkillDefinition[] = [
  fileSkill,
  searchSkill,
  projectAnalyzerSkill,
  countLinesSkill
]

let skillsCache: SkillDefinition[] | null = null

export async function initSkills(): Promise<void> {
  skillsCache = await loadSkills()
  console.log('Skills loaded:', skillsCache.map(s => s.name).join(', '))
}

export function getSkills(): SkillDefinition[] {
  if (!skillsCache) {
    throw new Error('Skills not loaded. Call loadSkills() first.')
  }
  return skillsCache
}
```

### 2. Skills 转换为 LLM Tools

不同 LLM 提供商有不同的工具格式，需要转换：

#### 2.1 Claude API 格式

```typescript
// app/api/chat/stream/route.ts:33-40
const tools = skills.map(s => ({
  name: s.name,
  description: s.description,
  input_schema: {
    type: 'object' as const,
    properties: s.parameters.properties,
    required: s.parameters.required
  }
}))

// 调用时传入
const stream = await client.messages.create({
  model,
  messages: nonSystemMessages,
  tools: tools.length > 0 ? tools : undefined,
  stream: true
})
```

#### 2.2 OpenAI 兼容格式

```typescript
// app/api/chat/stream/route.ts:101-108
const tools = skills.map(s => ({
  type: 'function' as const,
  function: {
    name: s.name,
    description: s.description,
    parameters: s.parameters
  }
}))
```

### 3. LLM 决策调用 Tool

LLM 接收用户输入和 tools 定义后，**自主决定**是否调用：

| 用户输入 | LLM 决策 |
|---------|---------|
| "读取文件 example.txt" | 调用 `file_operation` tool |
| "搜索包含 hello 的文件" | 调用 `search` tool |
| "今天天气怎么样" | 调用 `weather` tool |
| "你好" | 不调用，直接回复 |

### 4. 接收 Tool Call 事件

#### 4.1 流式事件类型

Claude 返回的流中包含以下事件：

```typescript
// Tool 调用开始
{ type: 'content_block_start', content_block: { type: 'tool_use', name: 'file_operation', id: 'tool_xxx' }}

// Tool 调用结束（携带参数）
{ type: 'content_block_stop', content_block: { type: 'tool_use', name: 'file_operation', input: { operation: 'read', path: 'example.txt' }}}
```

#### 4.2 事件处理代码

```typescript
// app/api/chat/stream/route.ts:58-80
for await (const chunk of stream) {
  if (chunk.type === 'content_block_delta') {
    if (chunk.delta.type === 'text_delta') {
      yield { type: 'text', content: chunk.delta.text }
    }
  } else if (chunk.type === 'content_block_start') {
    if (chunk.content_block.type === 'tool_use') {
      yield {
        type: 'tool_start',
        name: chunk.content_block.name,
        id: chunk.content_block.id
      }
    }
  } else if (chunk.type === 'content_block_stop') {
    if (chunk.content_block?.type === 'tool_use') {
      yield {
        type: 'tool_stop',
        name: chunk.content_block.name,
        input: chunk.content_block.input
      }
    }
  }
}
```

### 5. 执行 Skill

#### 5.1 执行流程

```typescript
// app/api/chat/stream/route.ts:256-290
} else if (chunk.type === 'tool_stop') {
  const toolCall = pendingToolCalls.find(t => t.name === chunk.name)
  if (toolCall) {
    // 解析参数
    const args = typeof chunk.arguments === 'string'
      ? JSON.parse(chunk.arguments)
      : chunk.input || chunk.arguments
    
    // 执行 Skill
    const output = await executeSkill(chunk.name, args)
    
    // 发送结果给前端
    controller.enqueue(encoder.encode(sse({
      type: 'tool_result',
      name: chunk.name,
      input: args,
      output
    })))
  }
}
```

#### 5.2 executeSkill 实现

```typescript
// skills/index.ts:66-73
export async function executeSkill(name: string, input: any): Promise<any> {
  const skills = getSkills()
  const skill = skills.find(s => s.name === name)
  if (!skill) {
    throw new Error(`Unknown skill: ${name}`)
  }
  return skill.execute(input)
}
```

### 6. 二次调用获取最终回复

Tool 执行完成后，需要将结果再次传给 LLM：

```typescript
// app/api/chat/stream/route.ts:296-339
if (toolCalls.length > 0) {
  controller.enqueue(encoder.encode(sse({ type: 'thinking' })))

  // 构建包含工具结果的 follow-up 消息
  const toolResults = toolCalls.map(tc => ({
    role: 'tool' as const,
    content: JSON.stringify(tc.output)
  }))

  const followUpMessages: Message[] = [
    ...formattedMessages,
    { role: 'assistant', content: accumulatedText },
    { role: 'user', content: JSON.stringify(toolResults) }
  ]

  // 再次调用 LLM
  let followUpStream = await client.messages.create({
    model,
    messages: followUpMessages,
    stream: true
  })
  
  // 处理最终回复流
  for await (const chunk of followUpStream) {
    // ...
  }
}
```

## 完整流程图

```
┌─────────────────────────────────────────────────────────────────┐
│                         用户输入                                │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ [1] Skill 定义 → Tool 格式转换                                  │
│     (skills/index.ts → route.ts)                               │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ [2] 发送给 LLM API                                              │
│     POST /v1/messages { messages, tools }                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ [3] LLM 决策层                                                  │
│     分析用户意图 → 决定是否调用 Tool                           │
│     如果需要 → 生成 tool_use 块 + 参数                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ [4] 接收 Tool Call 事件                                         │
│     tool_start: { name: 'file_operation' }                     │
│     tool_stop:  { name, input: {...} }                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ [5] 查找并执行 Skill                                            │
│     executeSkill(name, input) → skill.execute(input)           │
│     返回: { success: true, content: "文件内容" }               │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ [6] 发送 tool_result 给前端                                     │
│     SSE: { type: 'tool_result', output }                       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ [7] 二次调用 LLM                                                │
│     将 tool 执行结果加入上下文                                 │
│     请求 LLM 基于结果生成自然语言回复                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ [8] 流式返回最终回复给前端                                      │
│     SSE: { type: 'delta', content: "根据文件内容..." }         │
└─────────────────────────────────────────────────────────────────┘
```

## Skill 开发指南

### 创建新 Skill 的步骤

1. **在 `skills/` 目录下创建文件夹**

```
skills/
  my-skill/
    index.ts
```

2. **实现 Skill 定义**

```typescript
import { SkillDefinition } from '../index'

export const mySkill: SkillDefinition = {
  name: 'my_skill',
  description: '清楚地描述这个 Skill 的功能，让 LLM 知道何时使用',
  parameters: {
    type: 'object',
    properties: {
      param1: {
        type: 'string',
        description: '参数描述'
      },
      param2: {
        type: 'number',
        description: '参数描述'
      }
    },
    required: ['param1']
  },
  execute: async (input: { param1: string; param2?: number }) => {
    // 实现业务逻辑
    return { success: true, result: '...' }
  }
}
```

3. **注册到 Skill 系统**

```typescript
// skills/index.ts
import { mySkill } from './my-skill'

const syncSkills: SkillDefinition[] = [
  // ... 其他 skills
  mySkill
]
```

### 最佳实践

1. **描述要清晰**: LLM 依赖 description 决策是否调用
2. **参数要明确**: 每个参数都需要详细的 description
3. **使用 enum 限制**: 对于固定选项，使用 enum 约束
4. **错误处理**: execute 中抛出的错误会被捕获并返回给 LLM
5. **安全考虑**: 对文件路径等敏感操作进行限制（如 `resolveSafePath`）

## 关键文件索引

| 文件路径 | 职责 |
|---------|------|
| `skills/index.ts` | Skill 管理、注册、执行入口 |
| `skills/file-operations/index.ts` | 文件操作 Skill |
| `skills/search/index.ts` | 文件搜索 Skill |
| `app/api/chat/stream/route.ts` | API 路由，处理 LLM 流和 Tool 调用 |

## 调试技巧

1. **查看已加载的 Skills**: 控制台会输出 `Skills loaded: file_operation, search, ...`
2. **监控 Tool 调用**: 前端会显示 tool_start/tool_result 事件
3. **检查参数**: tool_result 中可以看到 LLM 生成的参数
4. **查看执行结果**: execute 返回的结果会显示在聊天界面
