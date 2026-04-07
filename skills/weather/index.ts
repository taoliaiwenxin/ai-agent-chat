import { SkillDefinition } from '../index'
import { parseMarkdownSkill } from '../file-operations/markdown-parser'

/**
 * 从 wttr.in 获取真实天气数据
 * 这是一个免费的天气服务，无需 API Key
 */
async function fetchRealWeather(city: string): Promise<{
  temperature: number
  condition: string
  humidity: string
  windSpeed: string
  suggestion: string
} | null> {
  try {
    // 使用 wttr.in 获取天气数据
    const response = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, {
      headers: {
        'User-Agent': 'curl/7.68.0'  // wttr.in 需要 User-Agent
      }
    })

    if (!response.ok) {
      console.error('Weather API error:', response.status)
      return null
    }

    const data = await response.json()

    // 解析当前天气
    const current = data.current_condition[0]
    const tempC = parseInt(current.temp_C)
    const humidity = current.humidity
    const windKmph = current.windspeedKmph
    const condition = current.lang_zh?.[0]?.value || current.weatherDesc?.[0]?.value || '未知'

    // 根据温度生成穿衣建议
    let suggestion = ''
    if (tempC < 5) {
      suggestion = '天气寒冷，建议穿厚外套、羽绒服，注意保暖。'
    } else if (tempC < 15) {
      suggestion = '天气较凉，建议穿夹克、风衣或薄毛衣。'
    } else if (tempC < 25) {
      suggestion = '天气舒适，建议穿长袖衬衫、薄外套或 T 恤。'
    } else {
      suggestion = '天气炎热，建议穿短袖、短裤，注意防晒和补水。'
    }

    // 根据天气状况调整建议
    if (condition.includes('雨') || condition.includes('Rain')) {
      suggestion += ' 外面在下雨，记得带伞。'
    } else if (condition.includes('雪') || condition.includes('Snow')) {
      suggestion += ' 有雪，穿防滑鞋。'
    }

    return {
      temperature: tempC,
      condition,
      humidity: `${humidity}%`,
      windSpeed: `${Math.round(parseInt(windKmph) / 3.6)}级`,  // 转换为级
      suggestion
    }
  } catch (error) {
    console.error('Failed to fetch weather:', error)
    return null
  }
}

/**
 * 从 index.md 创建天气 skill
 * 元数据(name/description/parameters)从 Markdown 读取
 * 执行逻辑在代码中实现
 */
export async function createWeatherSkill(): Promise<SkillDefinition> {
  // 从 Markdown 文件读取元数据
  const meta = await parseMarkdownSkill('skills/weather/index.md')

  return {
    name: meta.name,
    description: meta.description,
    parameters: meta.parameters,
    execute: async (input: { city: string; units?: string }) => {
      const { city, units = 'celsius' } = input

      // 尝试获取真实天气数据
      const weatherData = await fetchRealWeather(city)

      if (weatherData) {
        // 转换温度单位
        let temperature = weatherData.temperature
        if (units === 'fahrenheit') {
          temperature = Math.round(temperature * 9 / 5 + 32)
        }

        return {
          success: true,
          city,
          temperature,
          units,
          condition: weatherData.condition,
          humidity: weatherData.humidity,
          windSpeed: weatherData.windSpeed,
          suggestion: weatherData.suggestion,
          updateTime: new Date().toLocaleString('zh-CN'),
          source: 'wttr.in'
        }
      }

      // 如果获取失败，返回错误信息
      return {
        success: false,
        error: `无法获取 ${city} 的天气信息，请检查城市名称是否正确`,
        city,
        updateTime: new Date().toLocaleString('zh-CN')
      }
    }
  }
}
