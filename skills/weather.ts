import { SkillDefinition } from './index'
import { parseMarkdownSkill } from './markdown-parser'

// 模拟天气数据（实际项目中应调用真实天气 API）
const MOCK_WEATHER_DATA: Record<string, any> = {
  '北京': {
    temperature: 22,
    condition: '多云',
    humidity: '45%',
    windSpeed: '3级'
  },
  '上海': {
    temperature: 25,
    condition: '小雨',
    humidity: '78%',
    windSpeed: '4级'
  },
  '广州': {
    temperature: 30,
    condition: '晴',
    humidity: '65%',
    windSpeed: '2级'
  },
  '深圳': {
    temperature: 29,
    condition: '晴',
    humidity: '60%',
    windSpeed: '2级'
  },
  '杭州': {
    temperature: 24,
    condition: '多云',
    humidity: '55%',
    windSpeed: '3级'
  }
}

/**
 * 从 weather.md 创建天气 skill
 * 元数据(name/description/parameters)从 Markdown 读取
 * 执行逻辑在代码中实现
 */
export async function createWeatherSkill(): Promise<SkillDefinition> {
  // 从 Markdown 文件读取元数据
  const meta = await parseMarkdownSkill('skills/weather.md')

  return {
    name: meta.name,
    description: meta.description,
    parameters: meta.parameters,
    execute: async (input: { city: string; units?: string }) => {
      const { city, units = 'celsius' } = input

      // 获取天气数据（实际项目中这里应该调用天气 API）
      const data = MOCK_WEATHER_DATA[city]

      if (!data) {
        // 如果城市不在模拟数据中，生成随机数据
        const randomTemp = Math.floor(Math.random() * 20) + 10 // 10-30度
        const conditions = ['晴', '多云', '小雨', '阴']
        const randomCondition = conditions[Math.floor(Math.random() * conditions.length)]

        let temperature = randomTemp
        if (units === 'fahrenheit') {
          temperature = Math.round(randomTemp * 9 / 5 + 32)
        }

        return {
          success: true,
          city,
          temperature,
          units,
          condition: randomCondition,
          humidity: `${Math.floor(Math.random() * 40) + 40}%`,
          windSpeed: `${Math.floor(Math.random() * 5) + 1}级`,
          updateTime: new Date().toLocaleString('zh-CN'),
          note: '此为模拟数据，请接入真实天气 API 获取准确信息'
        }
      }

      // 转换温度单位
      let temperature = data.temperature
      if (units === 'fahrenheit') {
        temperature = Math.round(temperature * 9 / 5 + 32)
      }

      return {
        success: true,
        city,
        temperature,
        units,
        condition: data.condition,
        humidity: data.humidity,
        windSpeed: data.windSpeed,
        updateTime: new Date().toLocaleString('zh-CN')
      }
    }
  }
}
