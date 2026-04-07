---
name: get_weather
description: 查询指定城市的当前天气信息
parameters:
  city:
    type: string
    description: 城市名称，如 "北京"、"上海"、"New York"
    required: true
  units:
    type: string
    description: 温度单位
    enum: ["celsius", "fahrenheit"]
    default: "celsius"
    required: false
---

# 天气查询 Skill

## 功能

查询指定城市的实时天气，包括：
- 当前温度
- 天气状况（晴、多云、雨等）
- 湿度
- 风速
- 提供穿衣的建议

## 使用示例

```json
{
  "city": "北京",
  "units": "celsius"
}
```

## 实现说明

此 skill 使用 **wttr.in** 免费天气服务获取真实天气数据，无需 API Key。

数据来源：https://wttr.in

## 返回值示例

```json
{
  "city": "北京",
  "temperature": 22,
  "units": "celsius",
  "condition": "多云",
  "humidity": "45%",
  "windSpeed": "3级",
  "suggestion": "天气舒适，建议穿长袖衬衫、薄外套或 T 恤。",
  "updateTime": "2024-01-15 14:30",
  "source": "wttr.in"
}
```
