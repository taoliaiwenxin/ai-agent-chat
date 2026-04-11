# yield 关键字详解

## 概述

在流式处理中，`yield` 是实现实时数据传递的核心机制。本文档详细解释项目中 `yield` 的使用方式和原理。

## 什么是 yield

`yield` 用于**生成器函数 (Generator Function)** 中，配合 `async function*` 和 `for await...of` 实现异步流式数据处理。

```typescript
// 函数名后的 `*` 表示这是一个生成器函数
async function* streamClaude(messages, apiKey, model, skills) {
  const stream = await client.messages.create({ ... })

  for await (const chunk of stream) {
    // yield 会"产出"一个值，暂停执行，等待下次被消费
    yield { type: 'text', content: chunk.delta.text }
  }
}
```

## 为什么使用 yield

### 不使用 yield（普通数组，非流式）

```typescript
// 必须等所有数据收完，才能返回
async function fetchAll() {
  const results = []
  for await (const chunk of stream) {
    results.push(chunk)  // 先全部缓存到内存
  }
  return results  // 最后一次性返回
  // ❌ 用户要等很久才能看到第一个字
}
```

### 使用 yield（流式，实时）

```typescript
// 收到一个字，立即产出一个字
async function* streamData() {
  for await (const chunk of stream) {
    yield chunk  // 立即发送给前端，不等待
  }
  // ✅ 用户可以实时看到 AI 在打字
}
```

## 本项目中的 yield 使用

在 `app/api/chat/stream/route.ts` 中：

```typescript
async function* streamClaude(messages, apiKey, model, skills) {
  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta') {
      if (chunk.delta.type === 'text_delta') {
        // 产出文本片段
        yield { type: 'text', content: chunk.delta.text }
      }
    } else if (chunk.type === 'content_block_start') {
      if (chunk.content_block.type === 'tool_use') {
        // 产出工具调用开始事件
        yield {
          type: 'tool_start',
          name: chunk.content_block.name,
          id: chunk.content_block.id
        }
      }
    } else if (chunk.type === 'content_block_stop') {
      if (chunk.content_block?.type === 'tool_use') {
        // 产出工具调用结束事件
        yield {
          type: 'tool_stop',
          name: chunk.content_block.name,
          input: chunk.content_block.input
        }
      }
    }
  }
}
```

## 如何消费 yield 的值

使用 `for await...of` 逐条消费：

```typescript
// 创建生成器实例
const contentStream = streamClaude(messages, apiKey, model, skills)

// 逐条消费 yield 产出的值
for await (const chunk of contentStream) {
  // chunk 就是 yield 出来的对象
  switch (chunk.type) {
    case 'text':
      accumulatedContent += chunk.content
      // 发送给前端
      controller.enqueue(encoder.encode(sse({
        type: 'delta',
        content: chunk.content
      })))
      break

    case 'tool_start':
      pendingToolCalls.push({ name: chunk.name, id: chunk.id })
      break

    case 'tool_stop':
      // 执行 Skill
      const output = await executeSkill(chunk.name, chunk.input)
      break
  }
}
```

## yield 的执行流程

```
┌───────────────────────────────────────────────────────────────┐
│                      LLM API 流                               │
│  实时返回: "Hello" → "World" → "!" → tool_use                  │
└──────────────┬────────────────────────────────────────────────┘
               │
               ▼
┌───────────────────────────────────────────────────────────────┐
│  for await (const chunk of stream)                            │
│    │                                                          │
│    ├─ 收到 "Hello" ──► yield {type:'text', content:'Hello'}  │
│    │                    │                                     │
│    │                    ▼                                     │
│    │              暂停，等待消费                              │
│    │                    │                                     │
│    │                    ▼                                     │
│    ├─ 收到 "World" ──► yield {type:'text', content:'World'}  │
│    │                    │                                     │
│    │                    ▼                                     │
│    │              暂停，等待消费                              │
│    │                    │                                     │
│    │                    ▼                                     │
│    └─ 收到 tool_use ──► yield {type:'tool_start', ...}       │
└──────────────┬────────────────────────────────────────────────┘
               │
               ▼
┌───────────────────────────────────────────────────────────────┐
│              for await (const chunk of contentStream)         │
│                                                               │
│  chunk = {type:'text', content:'Hello'} ──► 前端显示          │
│  chunk = {type:'text', content:'World'} ──► 前端显示          │
│  chunk = {type:'tool_start', ...}       ──► 触发 Skill        │
└───────────────────────────────────────────────────────────────┘
```

## 关键要点

| 特性 | 说明 |
|-----|------|
| `function*` | 生成器函数声明，可包含多个 yield |
| `yield` | 产出值并暂停执行，下次从暂停处继续 |
| `for await...of` | 消费异步生成器的语法 |
| 流式优势 | 不占用大量内存，实时传递数据 |

## 总结

**yield 的作用**：把"实时接收 LLM 数据"转化为"实时发送给前端"的桥梁，实现流式响应效果。

在没有 yield 的情况下，必须等待 LLM 返回全部内容后才能响应给前端；使用 yield 后，LLM 每返回一个字，前端就能立即显示一个字，实现打字机效果。
