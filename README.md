# AI Agent Chat

基于 Next.js 的多模型 AI Agent 聊天应用，支持 Claude、OpenAI、DeepSeek 和本地 Ollama。

## 功能特点

- 💬 聊天界面：简洁的对话式 UI
- ⚡ **流式输出**：基于 SSE 实时显示 AI 回复，支持随时停止生成
- 🔧 Skill 系统：支持文件操作和搜索功能
- 🤖 多模型支持：Claude / OpenAI / DeepSeek / Ollama
- 🏠 本地运行：数据安全，API Key 仅在服务端使用

## 支持的 Skills

### file_operation - 文件操作
- `read` - 读取文件内容
- `write` - 写入文件
- `list` - 列出目录内容
- `delete` - 删除文件/目录
- `exists` - 检查文件是否存在

### search - 搜索功能
- `filename` - 按文件名搜索
- `content` - 按文件内容搜索
- `both` - 同时搜索文件名和内容

## 支持的模型

| 提供商 | 模型 | 获取方式 |
|--------|------|----------|
| **Claude** | claude-3-sonnet, claude-3-opus | [Anthropic Console](https://console.anthropic.com/) |
| **OpenAI** | gpt-4o, gpt-4o-mini, gpt-3.5-turbo | [OpenAI Platform](https://platform.openai.com/) |
| **DeepSeek** | deepseek-chat, deepseek-coder | [DeepSeek Platform](https://platform.deepseek.com/) |
| **Ollama** | llama3, qwen2.5, mistral 等 | [本地安装](https://ollama.com/) |

## 快速开始

1. **安装依赖**
```bash
cd ai-agent-chat
npm install
```

2. **配置模型**

复制配置文件：
```bash
cp .env.example .env.local
```

编辑 `.env.local`，选择你要使用的模型：

**使用 Claude（默认）**
```env
AI_MODEL=claude
ANTHROPIC_API_KEY=your_key_here
```

**使用 OpenAI**
```env
AI_MODEL=openai
OPENAI_API_KEY=your_key_here
```

**使用 DeepSeek**
```env
AI_MODEL=deepseek
DEEPSEEK_API_KEY=your_key_here
```

**使用本地 Ollama（无需 API Key）**
```bash
# 1. 安装 Ollama: https://ollama.com/
# 2. 拉取模型
ollama pull llama3.1
```

```env
AI_MODEL=ollama
OLLAMA_MODEL=llama3.1
OLLAMA_BASE_URL=http://localhost:11434

1. 下载安装：https://ollama.com/download
2. 运行 ollama run llama3.1 下载并启动模型
3. 保持 Ollama 在后台运行
```

3. **启动开发服务器**
```bash
npm run dev
```

4. **访问应用**
浏览器打开 http://localhost:3000

## 使用示例

- "读取 package.json 文件"
- "列出当前目录的所有文件"
- "搜索包含 'export' 的 TypeScript 文件"
- "创建一个名为 notes.txt 的文件，内容为今天的待办事项"

## 切换模型

只需修改 `.env.local` 中的 `AI_MODEL` 变量：

```env
AI_MODEL=openai    # 切换到 OpenAI
AI_MODEL=deepseek  # 切换到 DeepSeek
AI_MODEL=ollama    # 切换到本地 Ollama
AI_MODEL=claude    # 切换到 Claude（默认）
```

修改后重启服务器即可生效。

## 安全说明

- 文件操作仅限于项目目录内
- API Key 仅在服务器端使用，不会暴露到浏览器
- 建议不要将敏感文件放在项目目录中

## 流式渲染实现

### 后端 SSE 接口 (`app/api/chat/stream/route.ts`)

- 使用 Server-Sent Events (SSE) 协议推送实时数据
- 支持多模型流式输出：Claude、OpenAI、DeepSeek、Ollama
- 流式事件类型：
  - `start` - 流开始
  - `delta` - 文本片段（逐字/逐句返回）
  - `tool_start` - 工具调用开始
  - `tool_result` - 工具执行结果
  - `tool_error` - 工具执行错误
  - `thinking` - 有工具调用时的二次调用提示
  - `done` - 流结束
  - `error` - 错误信息

### 前端流式接收 (`components/Chat.tsx`)

- 使用 `fetch` + `ReadableStream` 读取 SSE 数据
- 实时渲染 AI 回复内容，带闪烁光标效果
- 支持**停止生成**功能（AbortController 中断请求）
- 工具调用结果在流完成后统一显示

### 使用体验

- AI 回复内容逐字显示，无需等待完整响应
- 生成过程中可随时点击"停止"按钮中断
- 网络中断或错误时自动保存已生成内容

## 技术栈

- Next.js 14
- React 18
- TypeScript
- Anthropic / OpenAI SDK
- Server-Sent Events (SSE)
