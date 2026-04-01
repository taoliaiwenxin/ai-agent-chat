'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

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

// 代码块解析函数
function parseContent(content: string): Array<{ type: 'text' | 'code'; content: string; language?: string }> {
  const parts: Array<{ type: 'text' | 'code'; content: string; language?: string }> = []
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g
  let lastIndex = 0
  let match

  while ((match = codeBlockRegex.exec(content)) !== null) {
    // 添加代码块前的文本
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: content.slice(lastIndex, match.index)
      })
    }

    // 添加代码块
    parts.push({
      type: 'code',
      language: match[1] || 'text',
      content: match[2].trim()
    })

    lastIndex = match.index + match[0].length
  }

  // 添加剩余的文本
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
            <div key={index} style={styles.codeBlock}>
              <div style={styles.codeHeader}>
                <span style={styles.codeLanguage}>{part.language}</span>
                <button
                  style={styles.copyButton}
                  onClick={() => navigator.clipboard.writeText(part.content)}
                >
                  复制
                </button>
              </div>
              <SyntaxHighlighter
                language={part.language}
                style={vscDarkPlus}
                customStyle={{
                  margin: 0,
                  borderRadius: '0 0 8px 8px',
                  fontSize: '13px',
                  lineHeight: '1.5'
                }}
              >
                {part.content}
              </SyntaxHighlighter>
            </div>
          )
        }
        return (
          <span key={index} style={{ whiteSpace: 'pre-wrap' }}>
            {part.content}
          </span>
        )
      })}
    </>
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
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [isAtBottom, setIsAtBottom] = useState(true)
  const abortControllerRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // 检查是否在底部（阈值 100px）
  const checkIsAtBottom = useCallback(() => {
    const container = messagesContainerRef.current
    if (!container) return true

    const threshold = 100
    const scrollBottom = container.scrollTop + container.clientHeight
    return container.scrollHeight - scrollBottom < threshold
  }, [])

  // 滚动到底部
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior })
  }, [])

  // 处理滚动事件
  const handleScroll = useCallback(() => {
    const atBottom = checkIsAtBottom()
    setIsAtBottom(atBottom)
  }, [checkIsAtBottom])

  // 智能滚动：只有在用户在底部时才自动滚动
  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom('smooth')
    }
  }, [messages, streamingContent, isAtBottom, scrollToBottom])

  // 初始滚动到底部
  useEffect(() => {
    scrollToBottom('auto')
  }, [])

  // 停止流式生成
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

    // 创建 abort controller 用于取消请求
    abortControllerRef.current = new AbortController()

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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

      // 读取 SSE 流
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
                case 'start':
                  // 流开始
                  break

                case 'delta':
                  if (event.content) {
                    accumulatedContent += event.content
                    setStreamingContent(accumulatedContent)
                  }
                  break

                case 'tool_start':
                  // 工具调用开始
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

                case 'thinking':
                  // 模型正在思考（有工具调用后的二次调用）
                  break

                case 'done':
                  // 流完成，保存最终消息
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
        // 用户主动取消，保存已生成的内容
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
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>AI Agent 助手</h1>
        <p style={styles.subtitle}>支持文件操作、搜索等功能</p>
      </div>

      <div
        ref={messagesContainerRef}
        style={styles.messages}
        onScroll={handleScroll}
      >
        {messages.length === 0 && (
          <div style={styles.empty}>
            <p>开始与 AI Agent 对话</p>
            <p style={styles.hint}>示例："读取文件 example.txt"、"搜索包含 hello 的文件"</p>
          </div>
        )}

        {messages.map((msg, index) => (
          <div key={index} style={{
            ...styles.message,
            ...(msg.role === 'user' ? styles.userMessage : styles.assistantMessage)
          }}>
            <div style={styles.messageHeader}>
              {msg.role === 'user' ? '👤 你' : '🤖 AI'}
            </div>
            <div style={styles.messageContent}>
              <MessageContent content={msg.content} />
            </div>
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <div style={styles.toolCalls}>
                {msg.toolCalls.map((tool, i) => (
                  <div key={i} style={styles.toolCall}>
                    <div style={styles.toolName}>🔧 {tool.name}</div>
                    <div style={styles.toolDetails}>
                      <div>输入: {JSON.stringify(tool.input)}</div>
                      <div>结果: {JSON.stringify(tool.output).slice(0, 200)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* 流式内容显示 */}
        {loading && streamingContent && (
          <div style={{...styles.message, ...styles.assistantMessage}}>
            <div style={styles.messageHeader}>🤖 AI</div>
            <div style={styles.messageContent}>
              <MessageContent content={streamingContent} />
            </div>
            <div style={styles.streamingIndicator}>
              <span style={styles.cursor}>▊</span>
            </div>
          </div>
        )}

        {/* 加载动画 */}
        {loading && !streamingContent && (
          <div style={styles.loading}>
            <span style={styles.dot}>●</span>
            <span style={styles.dot}>●</span>
            <span style={styles.dot}>●</span>
          </div>
        )}
        <div ref={messagesEndRef} />

        {/* 滚动到底部按钮 */}
        {!isAtBottom && (
          <button
            style={styles.scrollToBottomButton}
            onClick={() => scrollToBottom('smooth')}
          >
            ↓ 滚动到底部
          </button>
        )}
      </div>

      <div style={styles.inputArea}>
        <textarea
          style={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={loading ? "AI 正在思考..." : "输入消息，按 Enter 发送..."}
          rows={2}
          disabled={loading}
        />
        {loading ? (
          <button
            style={{...styles.button, ...styles.stopButton}}
            onClick={stopStreaming}
          >
            停止
          </button>
        ) : (
          <button
            style={styles.button}
            onClick={sendMessage}
          >
            发送
          </button>
        )}
      </div>
    </div>
  )
}

// 添加全局动画样式
if (typeof document !== 'undefined') {
  const styleId = 'chat-animations'
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = `
      @keyframes blink {
        0%, 50% { opacity: 1; }
        51%, 100% { opacity: 0; }
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }
    `
    document.head.appendChild(style)
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    maxWidth: '900px',
    margin: '0 auto',
    backgroundColor: '#f5f5f5'
  },
  header: {
    padding: '16px 24px',
    backgroundColor: '#fff',
    borderBottom: '1px solid #e0e0e0',
    textAlign: 'center'
  },
  title: {
    margin: 0,
    fontSize: '20px',
    color: '#333'
  },
  subtitle: {
    margin: '4px 0 0',
    fontSize: '14px',
    color: '#666'
  },
  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  empty: {
    textAlign: 'center',
    color: '#999',
    marginTop: '40px'
  },
  hint: {
    fontSize: '13px',
    marginTop: '8px'
  },
  message: {
    padding: '14px 18px',
    borderRadius: '12px',
    maxWidth: '85%'
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#007bff',
    color: '#fff'
  },
  assistantMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    border: '1px solid #e0e0e0',
    color: '#333'
  },
  messageHeader: {
    fontSize: '12px',
    fontWeight: 'bold',
    marginBottom: '6px',
    opacity: 0.8
  },
  messageContent: {
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap'
  },
  toolCalls: {
    marginTop: '10px',
    paddingTop: '10px',
    borderTop: '1px solid rgba(0,0,0,0.1)'
  },
  toolCall: {
    backgroundColor: 'rgba(0,0,0,0.03)',
    padding: '8px 12px',
    borderRadius: '8px',
    marginTop: '8px',
    fontSize: '13px'
  },
  toolName: {
    fontWeight: 'bold',
    color: '#007bff',
    marginBottom: '4px'
  },
  toolDetails: {
    color: '#666',
    fontFamily: 'monospace',
    fontSize: '12px'
  },
  loading: {
    alignSelf: 'center',
    padding: '10px',
    color: '#999'
  },
  dot: {
    animation: 'blink 1.4s infinite',
    margin: '0 2px'
  },
  inputArea: {
    display: 'flex',
    gap: '10px',
    padding: '16px 20px',
    backgroundColor: '#fff',
    borderTop: '1px solid #e0e0e0'
  },
  input: {
    flex: 1,
    padding: '12px 16px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    fontSize: '15px',
    resize: 'none',
    fontFamily: 'inherit'
  },
  button: {
    padding: '12px 24px',
    backgroundColor: '#007bff',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    cursor: 'pointer',
    fontWeight: 'bold'
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
    cursor: 'not-allowed'
  },
  stopButton: {
    backgroundColor: '#dc3545',
    animation: 'pulse 1.5s infinite'
  },
  streamingIndicator: {
    marginTop: '8px',
    opacity: 0.6
  },
  cursor: {
    animation: 'blink 1s infinite',
    color: '#007bff'
  },
  codeBlock: {
    margin: '12px 0',
    borderRadius: '8px',
    overflow: 'hidden',
    backgroundColor: '#1e1e1e'
  },
  codeHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    backgroundColor: '#2d2d2d',
    borderBottom: '1px solid #3d3d3d'
  },
  codeLanguage: {
    fontSize: '12px',
    color: '#9cdcfe',
    textTransform: 'uppercase' as const,
    fontWeight: 'bold'
  },
  copyButton: {
    padding: '4px 12px',
    fontSize: '12px',
    backgroundColor: '#3d3d3d',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'background-color 0.2s'
  },
  scrollToBottomButton: {
    position: 'fixed',
    bottom: '100px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '8px 16px',
    backgroundColor: '#007bff',
    color: '#fff',
    border: 'none',
    borderRadius: '20px',
    fontSize: '14px',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    zIndex: 100,
    transition: 'all 0.2s ease'
  }
}
