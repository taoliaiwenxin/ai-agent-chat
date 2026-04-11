# 本地知识库集成方案

## 概述

在 ai-agent-chat 项目中集成本地知识库，实现 RAG (Retrieval-Augmented Generation) 功能：
- 用户提问时优先查询本地知识库
- 知识库命中时，将检索结果作为上下文传入大模型
- 知识库未命中时，直接调用大模型回答

## 架构关系

```
┌─────────────────┐      HTTP/REST       ┌──────────────────┐
│  ai-agent-chat  │ ◄──────────────────► │   知识库服务      │
│   (Next.js)     │   /api/search        │  (Python/FastAPI)│
└─────────────────┘                      └──────────────────┘
                                                  │
                                                  ▼
                                           ┌──────────────┐
                                           │  向量数据库   │
                                           │   (Chroma)   │
                                           └──────────────┘
```

## 文件变更

### 1. 新增文件

#### `lib/knowledge-base.ts`
知识库客户端，提供查询和 Prompt 组装功能。

核心接口：
- `searchKnowledgeBase(query, topK, threshold)` - 查询知识库
- `buildPromptWithContext(userQuery, searchResults)` - 组装带上下文的 Prompt

#### `.env.local` 新增配置
```bash
KB_API_URL=http://localhost:8000
```

### 2. 修改文件

#### `app/api/chat/route.ts`
在原有逻辑前插入知识库查询：

```typescript
// 1. 获取最后一条用户消息
const lastUserMessage = messages[messages.length - 1]
let userQuery = lastUserMessage?.content || ''

// 2. 查询知识库
const kbResult = await searchKnowledgeBase(userQuery, 3, 0.7)

// 3. 组装带上下文的 prompt
const enhancedPrompt = buildPromptWithContext(userQuery, kbResult)

// 4. 替换消息并继续原有流程
const enhancedMessages = [
  ...messages.slice(0, -1),
  { ...lastUserMessage, content: enhancedPrompt }
]
```

## 响应格式扩展

Chat API 响应新增字段：

```json
{
  "content": "...",
  "toolCalls": [],
  "fromKnowledgeBase": true,
  "sources": ["docs/rag-intro.md"]
}
```

## 依赖要求

- 知识库服务需独立运行：`python main.py` (默认端口 8000)
- 无额外 npm 依赖，使用原生 fetch 调用

## 故障处理

- 知识库服务未启动：3 秒超时后自动降级，直接使用原问题调用大模型
- 查询无结果：相似度低于阈值时，不注入上下文

## 相关文档

- 知识库服务实现：[../knowledge-base/knowledge-base-service-plan.md](./knowledge-base-service-plan.md)
