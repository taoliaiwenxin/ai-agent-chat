'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Card,
  Button,
  Input,
  Avatar,
  Space,
  Tag,
  Typography,
  Empty,
  Spin,
  Tooltip,
  Badge,
  Flex,
  Divider,
  theme,
  Select
} from 'antd'
import {
  SendOutlined,
  StopOutlined,
  DownOutlined,
  UserOutlined,
  RobotOutlined,
  ToolOutlined,
  CopyOutlined,
  CodeOutlined
} from '@ant-design/icons'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

const { TextArea } = Input
const { Text, Title } = Typography

interface Message {
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCall[]
  isStreaming?: boolean
}

interface ToolCall {
  name: string
  input: Record<string, any>
  output: any
}

type ModelProvider = 'claude' | 'openai' | 'deepseek' | 'ollama'

interface ModelOption {
  value: ModelProvider
  label: string
  description: string
  color: string
}

const MODEL_OPTIONS: ModelOption[] = [
  { value: 'claude', label: 'Claude', description: 'Anthropic Claude 3', color: '#d4a574' },
  { value: 'openai', label: 'OpenAI', description: 'GPT-4 / GPT-3.5', color: '#10a37f' },
  { value: 'deepseek', label: 'DeepSeek', description: 'DeepSeek Chat', color: '#4f46e5' },
  { value: 'ollama', label: 'Ollama', description: '本地模型', color: '#ff6b35' }
]

// 代码块解析函数
function parseContent(content: string): Array<{ type: 'text' | 'code'; content: string; language?: string }> {
  const parts: Array<{ type: 'text' | 'code'; content: string; language?: string }> = []
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g
  let lastIndex = 0
  let match

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: content.slice(lastIndex, match.index)
      })
    }

    parts.push({
      type: 'code',
      language: match[1] || 'text',
      content: match[2].trim()
    })

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < content.length) {
    parts.push({
      type: 'text',
      content: content.slice(lastIndex)
    })
  }

  return parts.length > 0 ? parts : [{ type: 'text', content }]
}

// 渲染内容组件（支持代码高亮）
function MessageContent({ content }: { content: string }) {
  const parts = parseContent(content)

  return (
    <>
      {parts.map((part, index) => {
        if (part.type === 'code') {
          return (
            <Card
              key={index}
              size="small"
              style={{ margin: '12px 0', background: '#1e1e1e' }}
              styles={{
                body: { padding: 0 },
                header: { background: '#2d2d2d', padding: '8px 12px', borderBottom: '1px solid #3d3d3d' }
              }}
              title={
                <Flex justify="space-between" align="center">
                  <Space>
                    <CodeOutlined style={{ color: '#9cdcfe' }} />
                    <Text style={{ color: '#9cdcfe', fontSize: 12, textTransform: 'uppercase' }}>
                      {part.language}
                    </Text>
                  </Space>
                  <Tooltip title="复制代码">
                    <Button
                      type="text"
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={() => navigator.clipboard.writeText(part.content)}
                      style={{ color: '#fff' }}
                    />
                  </Tooltip>
                </Flex>
              }
            >
              <SyntaxHighlighter
                language={part.language}
                style={vscDarkPlus}
                customStyle={{
                  margin: 0,
                  borderRadius: '0 0 4px 4px',
                  fontSize: '13px',
                  lineHeight: '1.5'
                }}
              >
                {part.content}
              </SyntaxHighlighter>
            </Card>
          )
        }
        return (
          <Text key={index} style={{ whiteSpace: 'pre-wrap' }}>
            {part.content}
          </Text>
        )
      })}
    </>
  )
}

// 工具调用展示组件
function ToolCallCard({ tool }: { tool: ToolCall }) {
  return (
    <Card
      size="small"
      style={{ marginTop: 12, background: 'rgba(0,0,0,0.02)' }}
      title={
        <Space>
          <ToolOutlined style={{ color: '#1677ff' }} />
          <Text strong style={{ color: '#1677ff' }}>{tool.name}</Text>
        </Space>
      }
    >
      <Space orientation="vertical" size="small" style={{ width: '100%' }}>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>输入参数：</Text>
          <pre style={{ margin: '4px 0', fontSize: 12, background: '#f5f5f5', padding: 8, borderRadius: 4, overflow: 'auto' }}>
            {JSON.stringify(tool.input, null, 2)}
          </pre>
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>执行结果：</Text>
          <pre style={{ margin: '4px 0', fontSize: 12, background: '#f5f5f5', padding: 8, borderRadius: 4, overflow: 'auto' }}>
            {JSON.stringify(tool.output, null, 2).slice(0, 500)}
            {JSON.stringify(tool.output).length > 500 && '...'}
          </pre>
        </div>
      </Space>
    </Card>
  )
}

interface StreamEvent {
  type: 'start' | 'delta' | 'tool_start' | 'tool_result' | 'tool_error' | 'thinking' | 'done' | 'error'
  content?: string
  name?: string
  input?: any
  output?: any
  error?: string
  toolCalls?: ToolCall[]
}

export default function Chat() {
  const { token } = theme.useToken()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [provider, setProvider] = useState<ModelProvider>('deepseek')
  const abortControllerRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  const checkIsAtBottom = useCallback(() => {
    const container = messagesContainerRef.current
    if (!container) return true

    const threshold = 100
    const scrollBottom = container.scrollTop + container.clientHeight
    return container.scrollHeight - scrollBottom < threshold
  }, [])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior })
  }, [])

  const handleScroll = useCallback(() => {
    const atBottom = checkIsAtBottom()
    setIsAtBottom(atBottom)
  }, [checkIsAtBottom])

  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom('smooth')
    }
  }, [messages, streamingContent, isAtBottom, scrollToBottom])

  useEffect(() => {
    scrollToBottom('auto')
  }, [])

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setLoading(false)
  }, [])

  const sendMessage = async () => {
    if (!input.trim() || loading) return

    const userMessage: Message = { role: 'user', content: input }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)
    setStreamingContent('')

    abortControllerRef.current = new AbortController()

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content
          }))
        }),
        signal: abortControllerRef.current.signal
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }

      if (!res.body) {
        throw new Error('No response body')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulatedContent = ''
      const toolCalls: ToolCall[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue

            try {
              const event: StreamEvent = JSON.parse(data)

              switch (event.type) {
                case 'delta':
                  if (event.content) {
                    accumulatedContent += event.content
                    setStreamingContent(accumulatedContent)
                  }
                  break

                case 'tool_result':
                  if (event.name && event.input !== undefined) {
                    toolCalls.push({
                      name: event.name,
                      input: event.input,
                      output: event.output
                    })
                  }
                  break

                case 'tool_error':
                  if (event.name) {
                    toolCalls.push({
                      name: event.name,
                      input: {},
                      output: { error: event.error }
                    })
                  }
                  break

                case 'done':
                  setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: accumulatedContent || '（无回复内容）',
                    toolCalls: toolCalls.length > 0 ? toolCalls : undefined
                  }])
                  setStreamingContent('')
                  break

                case 'error':
                  throw new Error(event.error || 'Stream error')
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        if (streamingContent) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: streamingContent
          }])
          setStreamingContent('')
        }
      } else {
        const errorMessage = error?.message || '未知错误'
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `抱歉，发生了错误：${errorMessage}`
        }])
      }
    } finally {
      setLoading(false)
      abortControllerRef.current = null
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <Flex vertical style={{ height: '100vh', maxWidth: 1000, margin: '0 auto', background: token.colorBgLayout }}>
      {/* 头部 */}
      <Card style={{ borderRadius: 0, borderTop: 'none', borderLeft: 'none', borderRight: 'none' }}>
        <Flex justify="space-between" align="center">
          <div style={{ flex: 1 }} />
          <div style={{ textAlign: 'center' }}>
            <Title level={4} style={{ margin: 0 }}>🤖 AI Agent 助手</Title>
            <Text type="secondary" style={{ fontSize: 14 }}>支持文件操作、搜索等功能</Text>
          </div>
          <Flex justify="flex-end" align="center" style={{ flex: 1 }}>
            <Select
              value={provider}
              onChange={setProvider}
              options={MODEL_OPTIONS}
              disabled={loading}
              style={{ width: 140 }}
              optionRender={(option) => (
                <Tooltip title={option.data.description}>
                  <Flex align="center" gap={8}>
                    <Badge color={option.data.color} />
                    {option.data.label}
                  </Flex>
                </Tooltip>
              )}
              labelRender={(label) => (
                <Flex align="center" gap={8}>
                  <Badge color={MODEL_OPTIONS.find(m => m.value === provider)?.color} />
                  {label?.label}
                </Flex>
              )}
            />
          </Flex>
        </Flex>
      </Card>

      {/* 消息区域 */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
          background: token.colorBgLayout
        }}
      >
        {messages.length === 0 && (
          <Empty
            style={{ marginTop: 80 }}
            description={
              <Space orientation="vertical" size="small">
                <Text type="secondary">开始与 AI Agent 对话</Text>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  示例："读取文件 example.txt"、"搜索包含 hello 的文件"
                </Text>
              </Space>
            }
          />
        )}

        <Space orientation="vertical" size="large" style={{ width: '100%', display: 'flex' }}>
          {messages.map((msg, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                gap: 12
              }}
            >
              {msg.role === 'assistant' && (
                <Avatar icon={<RobotOutlined />} style={{ background: '#1677ff', flexShrink: 0 }} />
              )}

              <div style={{ maxWidth: '80%' }}>
                <Card
                  size="small"
                  style={{
                    background: msg.role === 'user' ? '#1677ff' : token.colorBgContainer,
                    border: msg.role === 'user' ? 'none' : `1px solid ${token.colorBorder}`,
                  }}
                  styles={{
                    body: {
                      color: msg.role === 'user' ? '#fff' : token.colorText,
                    }
                  }}
                >
                  <MessageContent content={msg.content} />

                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <>
                      <Divider style={{ margin: '12px 0', opacity: 0.3 }} />
                      <Space orientation="vertical" style={{ width: '100%' }}>
                        {msg.toolCalls.map((tool, i) => (
                          <ToolCallCard key={i} tool={tool} />
                        ))}
                      </Space>
                    </>
                  )}
                </Card>

                <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block', marginLeft: 4 }}>
                  {msg.role === 'user' ? '你' : 'AI'}
                </Text>
              </div>

              {msg.role === 'user' && (
                <Avatar icon={<UserOutlined />} style={{ background: '#52c41a', flexShrink: 0 }} />
              )}
            </div>
          ))}

          {/* 流式内容 */}
          {loading && streamingContent && (
            <div style={{ display: 'flex', gap: 12 }}>
              <Avatar icon={<RobotOutlined />} style={{ background: '#1677ff' }} />
              <div style={{ maxWidth: '80%' }}>
                <Card size="small">
                  <MessageContent content={streamingContent} />
                  <Badge color="blue" style={{ marginTop: 8 }} />
                </Card>
              </div>
            </div>
          )}

          {/* 加载动画 */}
          {loading && !streamingContent && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
              <Spin tip="AI 正在思考..." />
            </div>
          )}
        </Space>

        <div ref={messagesEndRef} />
      </div>

      {/* 滚动到底部按钮 */}
      {!isAtBottom && (
        <Button
          type="primary"
          shape="circle"
          icon={<DownOutlined />}
          onClick={() => scrollToBottom('smooth')}
          style={{
            position: 'fixed',
            bottom: 100,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 100,
            boxShadow: token.boxShadow
          }}
        />
      )}

      {/* 输入区域 */}
      <Card style={{ borderRadius: 0, borderBottom: 'none', borderLeft: 'none', borderRight: 'none' }}>
        <Space.Compact style={{ width: '100%' }}>
          <TextArea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={loading ? 'AI 正在思考...' : '输入消息，按 Enter 发送...'}
            disabled={loading}
            autoSize={{ minRows: 2, maxRows: 6 }}
            style={{ resize: 'none' }}
          />
          {loading ? (
            <Button
              danger
              icon={<StopOutlined />}
              onClick={stopStreaming}
              style={{ height: 'auto' }}
            >
              停止
            </Button>
          ) : (
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={sendMessage}
              disabled={!input.trim()}
              style={{ height: 'auto' }}
            >
              发送
            </Button>
          )}
        </Space.Compact>
      </Card>
    </Flex>
  )
}
