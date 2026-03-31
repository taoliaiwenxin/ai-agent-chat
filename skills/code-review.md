---
name: code_review
parameters:
  filePath:
    type: string
    description: 要审查的文件路径
    required: true
  reviewType:
    type: string
    description: 审查类型
    enum: [style, security, performance, all]
    default: all
    required: false
description: 审查代码文件的质量、安全性和性能问题。内部引用 file_operation skill 读取文件内容
---

# 代码审查 Skill

## 功能

自动审查代码文件，检测：
- 代码风格问题
- 安全隐患（如 eval、innerHTML 等）
- 性能问题
- 最佳实践违规

## 引用的 Skills

此 skill 内部使用：
- **file_operation**: 读取目标文件内容

## 使用示例

```json
{
  "filePath": "src/utils/helper.ts",
  "reviewType": "security"
}
```

## 返回值示例

```json
{
  "success": true,
  "filePath": "src/utils/helper.ts",
  "issues": [
    {
      "type": "security",
      "line": 15,
      "message": "发现使用 eval()，存在代码注入风险"
    }
  ],
  "skillsUsed": ["file_operation"]
}
```
