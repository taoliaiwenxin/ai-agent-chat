---
name: ui_design
description: 设计和实现现代化的 UI 界面，包括动画效果、渐变、玻璃态、暗黑模式等
parameters:
  task:
    type: string
    description: 设计任务类型
    enum: ["suggestion", "component", "animation", "theme", "layout"]
    required: true
  target:
    type: string
    description: 目标组件或页面，如 "Chat", "button", "全局主题"
    required: true
  style:
    type: string
    description: 设计风格
    enum: ["glassmorphism", "neumorphism", "minimalist", "cyberpunk", "gradient", "dark", "light"]
    required: false
  description:
    type: string
    description: 详细描述需求
    required: false
---

# UI 设计 Skill

## 功能

帮助用户设计和实现现代化的 Web UI：
- 提供设计建议和最佳实践
- 生成 React + CSS/Tailwind 组件代码
- 实现动画和过渡效果
- 创建主题系统（暗黑/亮色模式）
- 响应式布局设计

## 设计风格

- **Glassmorphism (玻璃态)**: 半透明背景 + 模糊效果
- **Neumorphism (新拟态)**: 柔和的阴影和凸起效果
- **Minimalist (极简)**: 简洁、大量留白
- **Cyberpunk (赛博朋克)**: 霓虹色、科技感
- **Gradient (渐变)**: 丰富的渐变色彩

## 使用示例

```json
{
  "task": "component",
  "target": "Chat",
  "style": "glassmorphism",
  "description": "将聊天界面改为玻璃态设计，添加消息进入动画"
}
```
