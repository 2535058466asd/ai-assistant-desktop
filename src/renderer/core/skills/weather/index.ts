/**
 * 技能：天气查询
 * 
 * 功能：使用 wttr.in API 查询天气（无需 API Key）
 * 模式：Tool Wrapper
 */

import {
  SkillDefinition,
  SkillResult,
  SkillExecutionStep
} from '../types';

import { callTool } from '../registry';

// ============================================================
// SKILL.md 文档（按 OpenClaw 规范）
// ============================================================

/**
 * ---
 * name: weather
 * description: |
 *   查询任意城市的天气和温度信息。
 *   Triggers: "天气", "温度", "天气预报", "今天冷吗", "下雨吗"
 *   Does NOT trigger:
 *   - 历史天气数据查询
 *   - 极端天气预警
 *   Output: 当前天气状况、温度、湿度等
 * version: 1.0.0
 * author: 启源 AI
 * tags: [weather, temperature, forecast]
 * user-invocable: true
 * allowed-tools: ["network.wttr-weather"]
 * metadata: {
 *   "emoji": "🌤️",
 *   "pattern": "tool-wrapper"
 * }
 * ---
 * 
 * # 天气查询
 * 
 * **Pattern: Tool Wrapper**
 * 
 * ## When to Use
 * - 用户询问某地的天气情况
 * - 需要了解当前温度或湿度
 * - 用户问"今天穿什么"
 * 
 * ## Prerequisites
 * - 网络连接正常（调用 wttr.in API）
 * - 无需任何 API Key
 * 
 * ## Instructions
 * 1. 接收用户输入的城市名
 *   - 如果未提供，默认使用"北京"
 * 2. 调用 wttr.in API 获取天气数据
 * 3. 解析并格式化返回结果
 * 4. 返回易读的天气信息
 * 
 * ## Examples
 * 
 * ### Example 1: 查询北京天气
 * **Input**: "北京的天气怎么样"
 * **Execute**: `wttr-weather(location="北京")`
 * **Output**: 北京当前天气：晴，温度 15°C，湿度 45%
 * 
 * ### Example 2: 查询上海天气
 * **Input**: "上海现在多少度"
 * **Execute**: `wttr-weather(location="上海")`
 * **Output**: 上海当前温度：22°C，多云
 * 
 * ### Edge Case
 * **Input**: "天气"（无城市名）
 * **Action**: 默认查询北京天气，或询问用户要查哪个城市
 * 
 * ## Output Format
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "location": "城市名",
 *     "weather": {
 *       "temperature": "15°C",
 *       "description": "晴",
 *       "humidity": "45%",
 *       "wind": "北风 3级"
 *     },
 *     "formatted": "北京当前天气：晴，温度 15°C..."
 *   }
 * }
 * ```
 * 
 * ## Error Handling
 * | Error | Cause | Fix |
 * |-------|-------|-----|
 * | 网络错误 | 无法连接 wttr.in | 检查网络连接 |
 * | 城市不存在 | 输入的城市名无效 | 提示用户确认城市名 |
 */

// ============================================================
// 技能实现
// ============================================================

export const weatherSkill: SkillDefinition = {
  metadata: {
    name: 'weather',
    description: '查询任意城市的天气和温度。Triggers: "天气", "温度", "预报"。Does NOT trigger: 历史天气、极端预警。Output: 当前天气状况和温度',
    version: '1.0.0',
    author: '启源 AI',
    tags: ['weather', 'temperature', 'forecast'],
    userInvocable: true,
    allowedTools: ['network.wttr-weather'],
    metadata: {
      emoji: '🌤️',
      pattern: 'tool-wrapper'
    }
  },
  
  params: [
    {
      name: 'location',
      type: 'string',
      required: false,
      description: '城市名或地点（不填则默认北京）',
      defaultValue: '北京',
      example: '上海'
    }
  ],
  
  whenToUse: [
    '用户询问天气情况',
    '需要知道当前温度',
    '用户问穿衣建议',
    '查询某个城市的天气'
  ],
  
  examples: [
    {
      id: 'beijing-weather',
      name: '北京天气',
      input: '北京的天气怎么样',
      expectedOutput: '返回北京当前的天气信息',
      params: { location: '北京' }
    },
    {
      id: 'shanghai-temp',
      name: '上海温度',
      input: '上海现在多少度',
      expectedOutput: '返回上海当前温度',
      params: { location: '上海' }
    },
    {
      id: 'default-location',
      name: '默认城市',
      input: '天气怎么样',
      expectedOutput: '返回北京天气（默认）'
    }
  ],
  
  errorHandling: [
    {
      errorType: 'NETWORK_ERROR',
      cause: '无法连接天气服务',
      solution: '检查网络连接后重试'
    },
    {
      errorType: 'INVALID_LOCATION',
      cause: '城市名无效或不支持',
      solution: '提示用户输入正确的城市名'
    }
  ],
  
  outputFormat: JSON.stringify({
    success: true,
    data: {
      location: '城市名',
      weather: {
        temperature: '15°C',
        description: '晴',
        humidity: '45%'
      },
      formatted: '城市名当前天气：...'
    }
  }, null, 2),
  
  pattern: 'tool-wrapper',
  
  async execute(
    params: Record<string, any>,
    steps?: SkillExecutionStep[]
  ): Promise<SkillResult> {
    
    try {
      const location = params.location || '北京';
      
      console.log(`🌤️ 开始执行"天气查询"技能`);
      console.log(`📍 城市: ${location}`);
      
      // 调用 wttr.in 天气工具
      const result = await callTool(
        'network.wttr-weather',
        {
          location,
          format: 'json'
        },
        steps || [],
        '查询天气',
        `获取${location}的天气信息`
      );
      
      if (result.success) {
        const weatherData = result.data.weather;
        
        // 格式化输出为可读文本
        const formatted = formatWeatherData(location, weatherData);
        
        return {
          success: true,
          data: {
            message: formatted,
            raw: weatherData,
            location
          },
          steps
        };
      } else {
        return {
          success: false,
          error: result.error || '天气查询失败',
          steps
        };
      }
      
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '天气查询执行失败',
        steps
      };
    }
  }
};

// 导出技能（支持默认导出和命名导出两种方式）
export default weatherSkill;

/**
 * 格式化天气数据为可读文本（辅助函数）
 */
function formatWeatherData(location: string, data: any): string {
  if (!data) {
    return `${location}：无法获取天气数据`;
  }
  
  try {
    // wttr.in JSON 格式解析
    const current = data.current_condition?.[0] || data;
    const temp = current.temp_C || current.temperature || '--';
    const desc = current.weatherDesc?.[0]?.value || current.description || '未知';
    const humidity = current.humidity || '--';
    const wind = current.windspeedKmph || '--';
    
    return `${location}当前天气：
🌡️ 温度：${temp}°C
☁️ 天气：${desc}
💧 湿度：${humidity}%
 风速：${wind} km/h
      
查询时间：${new Date().toLocaleString('zh-CN')}`;
    
  } catch (e) {
    // 如果解析失败，直接返回原始数据
    return `${location}天气数据：${JSON.stringify(data, null, 2)}`;
  }
}
