import { SkillDefinition } from './index'
import { parseMarkdownSkill } from './markdown-parser'

interface DesignSuggestion {
  title: string
  description: string
  code?: string
}

/**
 * UI 设计建议库
 */
const designSuggestions: Record<string, DesignSuggestion[]> = {
  glassmorphism: [
    {
      title: '玻璃态效果',
      description: '使用 backdrop-filter 创建半透明毛玻璃效果',
      code: `background: 'rgba(255, 255, 255, 0.1)',
backdropFilter: 'blur(10px)',
border: '1px solid rgba(255, 255, 255, 0.2)',
borderRadius: '16px'`
    },
    {
      title: '渐变背景',
      description: '添加动态渐变背景增强视觉效果',
      code: `background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'`
    }
  ],
  animation: [
    {
      title: '消息进入动画',
      description: '消息滑入 + 淡入效果',
      code: `@keyframes messageSlideIn {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

animation: 'messageSlideIn 0.3s ease-out'`
    },
    {
      title: '打字指示器',
      description: '更炫酷的加载动画',
      code: `.typing-dot {
  width: 8px;
  height: 8px;
  background: #007bff;
  border-radius: 50%;
  animation: typing 1.4s infinite;
}

@keyframes typing {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-10px); }
}`
    }
  ],
  dark: [
    {
      title: '暗黑主题配色',
      description: '护眼暗黑模式配色方案',
      code: `// 主背景
bg: '#0f172a'
// 卡片背景
surface: '#1e293b'
// 主要文字
text: '#f8fafc'
// 次要文字
textSecondary: '#94a3b8'
// 强调色
accent: '#3b82f6'`
    }
  ]
}

/**
 * 生成现代化 Chat 组件代码
 */
function generateModernChatComponent(style: string): string {
  const styles: Record<string, string> = {
    glassmorphism: `const styles = {
  container: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  },
  message: {
    background: 'rgba(255, 255, 255, 0.1)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
  }
}`,
    dark: `const styles = {
  container: {
    background: '#0f172a',
    color: '#f8fafc'
  },
  message: {
    background: '#1e293b',
    border: '1px solid #334155'
  }
}`,
    gradient: `const styles = {
  userMessage: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
  },
  assistantMessage: {
    background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'
  }
}`,
    cyberpunk: `const styles = {
  container: {
    background: '#000',
    fontFamily: 'monospace'
  },
  message: {
    border: '1px solid #0ff',
    boxShadow: '0 0 10px #0ff',
    textShadow: '0 0 5px #0ff'
  }
}`
  }

  return styles[style] || styles.glassmorphism
}

export async function createUIDesignSkill(): Promise<SkillDefinition> {
  const meta = await parseMarkdownSkill('skills/ui-design.md')

  return {
    name: meta.name,
    description: meta.description,
    parameters: meta.parameters,
    execute: async (input: {
      task: string
      target: string
      style?: string
      description?: string
    }) => {
      const { task, target, style = 'glassmorphism', description } = input

      switch (task) {
        case 'suggestion':
          // 提供设计建议
          const suggestions: DesignSuggestion[] = []

          if (style && designSuggestions[style]) {
            suggestions.push(...designSuggestions[style])
          }
          suggestions.push(...designSuggestions.animation)

          return {
            success: true,
            task,
            target,
            suggestions,
            message: `为 ${target} 提供了 ${suggestions.length} 条 ${style} 风格的设计建议`
          }

        case 'component':
          // 生成组件代码
          const componentCode = generateModernChatComponent(style)

          return {
            success: true,
            task,
            target,
            style,
            code: componentCode,
            message: `已生成 ${style} 风格的 ${target} 组件样式代码`,
            tips: [
              '将样式代码添加到组件的 styles 对象中',
              '考虑添加 CSS transition 实现平滑过渡',
              '使用 CSS 变量便于主题切换'
            ]
          }

        case 'animation':
          return {
            success: true,
            task,
            target,
            animations: [
              {
                name: 'messageSlideIn',
                description: '消息滑入动画',
                css: `@keyframes messageSlideIn {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}`
              },
              {
                name: 'fadeIn',
                description: '淡入动画',
                css: `@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}`
              },
              {
                name: 'pulse',
                description: '脉冲动画（用于加载）',
                css: `@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}`
              }
            ],
            message: `为 ${target} 提供了 3 个动画效果`
          }

        case 'theme':
          const themes: Record<string, any> = {
            dark: {
              background: '#0f172a',
              surface: '#1e293b',
              primary: '#3b82f6',
              text: '#f8fafc',
              textSecondary: '#94a3b8'
            },
            light: {
              background: '#f8fafc',
              surface: '#ffffff',
              primary: '#007bff',
              text: '#1e293b',
              textSecondary: '#64748b'
            }
          }

          return {
            success: true,
            task,
            themes,
            message: '提供了暗黑和亮色主题配色方案',
            usage: '将颜色值保存到 CSS 变量或主题配置中'
          }

        case 'layout':
          return {
            success: true,
            task,
            target,
            layouts: [
              {
                name: 'sidebar',
                description: '侧边栏布局',
                structure: 'Sidebar + Main Content'
              },
              {
                name: 'fullscreen',
                description: '全屏沉浸式',
                structure: 'Full viewport chat'
              }
            ],
            message: `为 ${target} 提供了布局建议`
          }

        default:
          return {
            success: false,
            error: `未知的任务类型: ${task}`
          }
      }
    }
  }
}
