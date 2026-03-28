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

## 使用示例

```json
{
  "city": "北京",
  "units": "celsius"
}
```

## 实现说明

由于这是一个演示项目，此 skill 返回模拟数据。
在生产环境中，应该接入真实的天气 API，如：
- OpenWeatherMap API
- 和风天气 API
- 高德天气 API

## 返回值示例

```json
{
  "city": "北京",
  "temperature": 22,
  "units": "celsius",
  "condition": "多云",
  "humidity": "45%",
  "windSpeed": "3级",
  "updateTime": "2024-01-15 14:30"
}
```
