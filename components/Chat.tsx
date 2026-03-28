'use client'

import { useState, useRef, useEffect } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCall[]
}

interface ToolCall {
  name: string
  input: Record<string, any>
  output: any
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || loading) return

    const userMessage: Message = { role: 'user', content: input }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content
          }))
        })
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }

      const data = await res.json()
      console.log('API response:', data)

      if (data.error) {
        throw new Error(data.error)
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.content || '（无回复内容）',
        toolCalls: data.toolCalls
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error: any) {
      const errorMessage = error?.message || '未知错误'
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `抱歉，发生了错误：${errorMessage}`
      }])
    } finally {
      setLoading(false)
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

      <div style={styles.messages}>
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
              {msg.content}
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

        {loading && (
          <div style={styles.loading}>
            <span style={styles.dot}>●</span>
            <span style={styles.dot}>●</span>
            <span style={styles.dot}>●</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div style={styles.inputArea}>
        <textarea
          style={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息，按 Enter 发送..."
          rows={2}
          disabled={loading}
        />
        <button
          style={{
            ...styles.button,
            ...(loading ? styles.buttonDisabled : {})
          }}
          onClick={sendMessage}
          disabled={loading}
        >
          发送
        </button>
      </div>
    </div>
  )
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
  }
}
