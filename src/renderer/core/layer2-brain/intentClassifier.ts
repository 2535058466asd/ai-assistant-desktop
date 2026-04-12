// ==========================================
// 第 2 层：大脑层 - 意图分类器（LLM版）
// 完全使用大模型来理解用户意图，支持单意图和多意图
// ==========================================

import type { Intent, StructuredIntent, Slots, SessionId, SingleIntent } from '../../types';
import { sendMessageToDoubao } from '../../services/doubaoApiClient';
import { getMemoryService } from '../../services/memoryServiceClient';

/**
 * 意图分类器类（LLM智能版，支持多意图）
 */
export class IntentClassifier {
  private memoryService = getMemoryService();

  constructor() {
    console.log('🧠 LLM意图识别器初始化成功（支持多意图）');
  }

  /**
   * 使用LLM进行意图分类（智能版，支持多意图）
   */
  async classifyIntentWithLLM(text: string): Promise<{ 
    intent: Intent; 
    slots: Slots; 
    confidence: number;
    intents?: SingleIntent[];
    isMultiIntent: boolean;
  }> {
    try {
      console.log('🧠 正在用LLM分析意图（支持多意图）:', text);

      // 构建LLM提示词（包含用户记忆）
      const prompt = await this.buildIntentClassificationPrompt(text);
      
      // 调用LLM
      const llmResponse = await sendMessageToDoubao(prompt, [], '');
      
      console.log('🧠 LLM返回结果:', llmResponse);
      
      // 解析LLM返回的JSON
      const result = this.parseLLMResponse(llmResponse);
      
      return result;
      
    } catch (error) {
      console.error('❌ LLM意图识别失败，降级到关键词匹配:', error);
      // 如果LLM失败，降级到简单的关键词匹配
      const fallback = this.fallbackToKeywordMatching(text);
      return {
        ...fallback,
        isMultiIntent: false
      };
    }
  }

  /**
   * 构建意图分类的提示词（包含用户记忆，支持多意图）
   */
  private async buildIntentClassificationPrompt(userText: string): Promise<string> {
    const memoryPrompt = await this.memoryService.getMemoryPrompt();
    
    let prompt = `你是一个专业的意图识别助手。请分析用户输入的文本，判断用户的意图，并提取关键信息（槽位）。

【多意图识别】如果用户的一句话里包含多个动作或请求（如"打开记事本，然后告诉我现在几点"），设置isMultiIntent为true，并按顺序识别所有意图！

`;

    if (memoryPrompt) {
      prompt += `${memoryPrompt}\n\n`;
    }

    prompt += `可用意图类型：
- OPEN_APP：打开应用程序
- OPEN_FOLDER：打开文件夹
- LOCK_SCREEN：锁定屏幕
- SHUTDOWN_COMPUTER：关机
- RESTART_COMPUTER：重启
- CANCEL_SHUTDOWN：取消关机
- SLEEP_COMPUTER：休眠
- EMPTY_RECYCLE_BIN：清空回收站
- CHECK_TIME：查询时间/日期
- SEARCH_WEB：搜索网页
- CHECK_WEATHER：查询天气
- CHAT：闲聊

请严格按照以下JSON格式返回：
{
  "isMultiIntent": false,
  "intent": "意图类型",
  "slots": {
    "appName": "应用名（OPEN_APP）",
    "folderName": "文件夹名（OPEN_FOLDER）",
    "query": "搜索关键词（SEARCH_WEB）",
    "location": "城市名（CHECK_WEATHER）"
  },
  "confidence": 0.95,
  "intents": [
    {"intent": "意图", "slots": {}, "confidence": 0.95, "order": 1}
  ]
}

示例：输入"打开浏览器，搜索B站" → isMultiIntent=true, intents包含OPEN_APP和SEARCH_WEB

注意：
1. 不确定的槽位留空
2. confidence范围0-1
3. 只返回JSON
4. 多意图时order从1开始

现在分析："${userText}"`;

    return prompt;
  }

  /**
   * 将豆包返回的大写意图转为小写（适配 TypeScript 类型定义）
   */
  private convertIntentToLowercase(intent: string): Intent {
    const intentMap: Record<string, Intent> = {
      'CHAT': 'chat',
      'OPEN_APP': 'open_app',
      'OPEN_FOLDER': 'open_folder',
      'LOCK_SCREEN': 'lock_screen',
      'CHECK_TIME': 'check_time',
      'CHECK_WEATHER': 'check_weather',
      'SEARCH_WEB': 'search_web',
      'SHUTDOWN_COMPUTER': 'shutdown_computer',
      'RESTART_COMPUTER': 'restart_computer',
      'CANCEL_SHUTDOWN': 'cancel_shutdown',
      'SLEEP_COMPUTER': 'sleep_computer',
      'EMPTY_RECYCLE_BIN': 'empty_recycle_bin',
      'UNKNOWN': 'unknown'
    };
    
    return intentMap[intent.toUpperCase()] || 'chat';
  }

  /**
   * 解析 LLM 返回的 JSON（支持多意图，自动转换大小写）
   */
  private parseLLMResponse(response: string): { 
    intent: Intent; 
    slots: Slots; 
    confidence: number;
    intents?: SingleIntent[];
    isMultiIntent: boolean;
  } {
    try {
      // 尝试提取 JSON 部分
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('无法找到 JSON');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      // 验证意图是否有效（支持大写和小写）
      const validIntentsUpper = [
        'CHAT', 'OPEN_APP', 'OPEN_FOLDER', 'LOCK_SCREEN', 
        'CHECK_TIME', 'CHECK_WEATHER', 'SEARCH_WEB', 'SHUTDOWN_COMPUTER', 'RESTART_COMPUTER', 
        'CANCEL_SHUTDOWN', 'SLEEP_COMPUTER', 'EMPTY_RECYCLE_BIN', 'UNKNOWN'
      ];
      
      // 检查是否为多意图
      let isMultiIntent = parsed.isMultiIntent === true;
      
      // 验证主意图（转为大写后验证）
      const upperIntent = parsed.intent.toUpperCase();
      if (!validIntentsUpper.includes(upperIntent)) {
        parsed.intent = 'chat'; // 无效意图当闲聊处理
      } else {
        // 转换为小写（适配 TypeScript 类型）
        parsed.intent = this.convertIntentToLowercase(upperIntent);
      }
      
      // 如果是多意图，验证每个子意图
      if (isMultiIntent && parsed.intents && Array.isArray(parsed.intents)) {
        parsed.intents = parsed.intents.map((item: any) => {
          const upperItemIntent = item.intent.toUpperCase();
          // 验证并转换
          if (!validIntentsUpper.includes(upperItemIntent)) {
            return null; // 无效意图过滤掉
          }
          return {
            ...item,
            intent: this.convertIntentToLowercase(upperItemIntent)
          };
        }).filter((item: any) => item !== null);
        
        // 如果过滤后没有意图了，改为单意图
        if (parsed.intents.length === 0) {
          isMultiIntent = false;
        }
      }
      
      return {
        intent: parsed.intent,
        slots: parsed.slots || {},
        confidence: parsed.confidence || 0.8,
        intents: isMultiIntent ? parsed.intents : undefined,
        isMultiIntent: isMultiIntent
      };
      
    } catch (error) {
      console.error('❌ 解析 LLM 响应失败:', error);
      return {
        intent: 'chat',
        slots: {},
        confidence: 0.5,
        isMultiIntent: false
      };
    }
  }

  /**
   * 降级方案：关键词匹配（当 LLM 失败时使用）
   */
  private fallbackToKeywordMatching(text: string): { intent: Intent; slots: Slots; confidence: number } {
    const normalizedText = text.toLowerCase();
    
    // 简单的关键词匹配（使用小写意图）
    if (normalizedText.includes('关机') || normalizedText.includes('关闭电脑')) {
      return { intent: 'shutdown_computer', slots: {}, confidence: 0.8 };
    }
    if (normalizedText.includes('重启') || normalizedText.includes('重新启动')) {
      return { intent: 'restart_computer', slots: {}, confidence: 0.8 };
    }
    if (normalizedText.includes('取消关机') || normalizedText.includes('取消重启')) {
      return { intent: 'cancel_shutdown', slots: {}, confidence: 0.8 };
    }
    if (normalizedText.includes('休眠')) {
      return { intent: 'sleep_computer', slots: {}, confidence: 0.8 };
    }
    if (normalizedText.includes('清空回收站') || normalizedText.includes('清理回收站')) {
      return { intent: 'empty_recycle_bin', slots: {}, confidence: 0.8 };
    }
    if (normalizedText.includes('搜索') || normalizedText.includes('百度') || normalizedText.includes('查一下')) {
      return { intent: 'search_web', slots: { query: text }, confidence: 0.7 };
    }
    if (normalizedText.includes('几点') || normalizedText.includes('时间') || normalizedText.includes('日期') || normalizedText.includes('星期')) {
      return { intent: 'check_time', slots: {}, confidence: 0.8 };
    }
    if (normalizedText.includes('天气') || normalizedText.includes('温度') || normalizedText.includes('预报')) {
      const locationMatch = text.match(/(.+?)的天气|(.+?)的温度|(.+?)预报/);
      const location = locationMatch ? (locationMatch[1] || locationMatch[2] || locationMatch[3]).trim() : '';
      return { 
        intent: 'check_weather', 
        slots: { location: location }, 
        confidence: 0.8 
      };
    }
    if (normalizedText.includes('锁屏') || normalizedText.includes('锁定屏幕')) {
      return { intent: 'lock_screen', slots: {}, confidence: 0.8 };
    }
    if (normalizedText.includes('打开') && (normalizedText.includes('桌面') || normalizedText.includes('文档') || normalizedText.includes('下载'))) {
      const folderMap: Record<string, string> = {
        '桌面': 'desktop', '文档': 'documents', '下载': 'downloads',
        '图片': 'pictures', '音乐': 'music', '视频': 'videos'
      };
      for (const [key, value] of Object.entries(folderMap)) {
        if (normalizedText.includes(key)) {
          return { intent: 'open_folder', slots: { folderName: value }, confidence: 0.8 };
        }
      }
    }
    if (normalizedText.includes('打开')) {
      const appMatch = text.match(/打开(.+)/);
      return { 
        intent: 'open_app', 
        slots: { appName: appMatch ? appMatch[1].trim() : '' }, 
        confidence: 0.7 
      };
    }
    
    // 默认当作闲聊
    return { intent: 'chat', slots: {}, confidence: 0.6 };
  }

  /**
   * 分析文本，返回结构化意图（使用LLM，支持多意图）
   */
  async analyze(text: string, sessionId: SessionId): Promise<StructuredIntent> {
    // 使用LLM进行意图识别
    const { intent, slots, confidence, intents, isMultiIntent } = await this.classifyIntentWithLLM(text);

    // 检查是否需要追问（对于多意图，只检查第一个意图）
    const needAsk = this.checkNeedAsk(intent, slots);

    return {
      intent,
      slots,
      intents: intents,
      sessionId,
      needAsk,
      askQuestion: needAsk ? this.generateAskQuestion(intent, slots) : undefined,
      confidence,
      rawText: text,
      isMultiIntent: isMultiIntent
    };
  }

  /**
   * 检查是否需要追问
   */
  private checkNeedAsk(intent: Intent, slots: Slots): boolean {
    switch (intent) {
      case 'open_app':
        return !slots.appName;
      case 'open_folder':
        return !slots.folderName;
      case 'search_web':
        return !slots.query;
      case 'check_weather':
        return !slots.location;
      default:
        return false;
    }
  }

  /**
   * 生成追问问题
   */
  private generateAskQuestion(intent: Intent, slots: Slots): string {
    switch (intent) {
      case 'open_app':
        return '你想打开哪个应用呢？';
      case 'open_folder':
        return '你想打开哪个文件夹呢？（桌面/文档/下载/图片/音乐/视频）';
      case 'search_web':
        return '你想搜索什么呢？';
      case 'check_weather':
        return '你想查询哪个城市的天气呢？（例如：北京、上海）';
      default:
        return '我需要更多信息才能帮到你~';
    }
  }
}

// 创建单例
let intentClassifierInstance: IntentClassifier | null = null;

export function getIntentClassifier(): IntentClassifier {
  if (!intentClassifierInstance) {
    intentClassifierInstance = new IntentClassifier();
  }
  return intentClassifierInstance;
}
