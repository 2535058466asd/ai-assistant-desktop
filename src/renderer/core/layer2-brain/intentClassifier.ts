// ==========================================
// 第 2 层：大脑层 - 意图分类器（LLM版）
// 完全使用大模型来理解用户意图，支持单意图和多意图
// ==========================================

import type { Intent, StructuredIntent, Slots, SessionId, SingleIntent } from '../../types';
import { sendMessageToDoubao } from '../../services/doubaoApi';
import { getMemoryService } from '../../services/memoryService';

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
    // 获取用户记忆
    const memoryPrompt = await this.memoryService.getMemoryPrompt();
    
    let prompt = `你是一个专业的意图识别助手。请分析用户输入的文本，判断用户的意图，并提取关键信息（槽位）。

【重要！】如果用户的一句话里包含多个动作或请求（比如"打开记事本，然后告诉我现在几点"、"打开QQ音乐，再把音量调大"），这就是多个意图，必须设置isMultiIntent为true，并按顺序识别所有意图！

`;

    // 如果有用户记忆，加进去
    if (memoryPrompt) {
      prompt += `${memoryPrompt}\n\n`;
    }

    prompt += `可用的意图类型：
- CHAT：闲聊、聊天、情感交流、打招呼、问问题等
- OPEN_APP：打开某个应用程序（如浏览器、计算器、记事本等）
- OPEN_FOLDER：打开某个文件夹（如桌面、文档、下载、图片、音乐、视频、我的电脑等）
- LOCK_SCREEN：锁定屏幕/锁屏
// 暂时禁用：- ADJUST_VOLUME：调节音量（调大、调小、设置具体值）
// 暂时禁用：- MUTE_VOLUME：静音或取消静音
- CHECK_TIME：查询时间、日期、星期几
- SEARCH_WEB：搜索网页、百度一下、查资料
- SHUTDOWN_COMPUTER：关机、关闭电脑
- RESTART_COMPUTER：重启电脑、重新启动
- CANCEL_SHUTDOWN：取消关机、取消重启
- SLEEP_COMPUTER：休眠电脑
- EMPTY_RECYCLE_BIN：清空回收站

请严格按照以下JSON格式返回结果，不要有其他文字：

如果是单个意图：
{
  "isMultiIntent": false,
  "intent": "意图类型",
  "slots": {
    "appName": "应用名（如果是OPEN_APP）",
    "folderName": "文件夹名（如果是OPEN_FOLDER，可选值：desktop/documents/downloads/pictures/music/videos/mycomputer/explorer）",
    "volume": 数字（音量值0-100，如果是ADJUST_VOLUME）,
    "volumeDirection": "up或down（音量方向，如果是ADJUST_VOLUME）",
    "muteAction": "mute或unmute（静音动作，如果是MUTE_VOLUME）",
    "query": "搜索关键词（如果是SEARCH_WEB）"
  },
  "confidence": 0.95
}

如果是多个意图（按执行顺序排列，非常重要！）：
{
  "isMultiIntent": true,
  "intent": "主意图类型（第一个意图）",
  "slots": {第一个意图的槽位},
  "confidence": 0.95,
  "intents": [
    {
      "intent": "第一个意图",
      "slots": {第一个意图的槽位},
      "confidence": 0.95,
      "order": 1
    },
    {
      "intent": "第二个意图",
      "slots": {第二个意图的槽位},
      "confidence": 0.95,
      "order": 2
    }
  ]
}

【多意图识别示例】
输入："打开记事本，然后告诉我现在几点"
输出：isMultiIntent=true, intents包含OPEN_APP和CHECK_TIME

输入："打开QQ音乐，再把音量调大"
输出：isMultiIntent=true, intents包含OPEN_APP和ADJUST_VOLUME(volumeDirection="up")

输入："打开浏览器，搜索B站"
输出：isMultiIntent=true, intents包含OPEN_APP和SEARCH_WEB

注意：
1. 如果不确定具体的槽位值，可以留空或不包含该字段
2. confidence范围0-1，越接近1表示越确定
3. 只返回JSON，不要有其他说明文字
4. 如果用户有多个意图，必须设置isMultiIntent=true，并按顺序识别，order从1开始
5. 只要用户的话里有多个动作或请求，就是多意图！

现在分析用户输入："${userText}"`;

    return prompt;
  }

  /**
   * 解析LLM返回的JSON（支持多意图）
   */
  private parseLLMResponse(response: string): { 
    intent: Intent; 
    slots: Slots; 
    confidence: number;
    intents?: SingleIntent[];
    isMultiIntent: boolean;
  } {
    try {
      // 尝试提取JSON部分
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('无法找到JSON');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      // 验证意图是否有效
      const validIntents: Intent[] = [
        'CHAT', 'OPEN_APP', 'OPEN_FOLDER', 'LOCK_SCREEN', 
        // 暂时禁用：'ADJUST_VOLUME', 'MUTE_VOLUME', 
        'CHECK_TIME', 
        'SEARCH_WEB', 'SHUTDOWN_COMPUTER', 'RESTART_COMPUTER', 
        'CANCEL_SHUTDOWN', 'SLEEP_COMPUTER', 'EMPTY_RECYCLE_BIN', 'UNKNOWN'
      ];
      
      // 检查是否为多意图
      let isMultiIntent = parsed.isMultiIntent === true;
      
      // 验证主意图
      if (!validIntents.includes(parsed.intent)) {
        parsed.intent = 'CHAT'; // 无效意图当闲聊处理
      }
      
      // 暂时禁用音量控制功能，把音量控制意图改成闲聊
      if (parsed.intent === 'ADJUST_VOLUME' || parsed.intent === 'MUTE_VOLUME') {
        parsed.intent = 'CHAT';
      }
      
      // 如果是多意图，验证每个子意图
      if (isMultiIntent && parsed.intents && Array.isArray(parsed.intents)) {
        parsed.intents = parsed.intents.filter((item: any) => {
          if (!validIntents.includes(item.intent)) {
            return false;
          }
          // 暂时禁用音量控制功能
          if (item.intent === 'ADJUST_VOLUME' || item.intent === 'MUTE_VOLUME') {
            return false;
          }
          return true;
        });
        
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
      console.error('❌ 解析LLM响应失败:', error);
      return {
        intent: 'CHAT',
        slots: {},
        confidence: 0.5,
        isMultiIntent: false
      };
    }
  }

  /**
   * 降级方案：关键词匹配（当LLM失败时使用）
   */
  private fallbackToKeywordMatching(text: string): { intent: Intent; slots: Slots; confidence: number } {
    const normalizedText = text.toLowerCase();
    
    // 简单的关键词匹配
    if (normalizedText.includes('关机') || normalizedText.includes('关闭电脑')) {
      return { intent: 'SHUTDOWN_COMPUTER', slots: {}, confidence: 0.8 };
    }
    if (normalizedText.includes('重启') || normalizedText.includes('重新启动')) {
      return { intent: 'RESTART_COMPUTER', slots: {}, confidence: 0.8 };
    }
    if (normalizedText.includes('取消关机') || normalizedText.includes('取消重启')) {
      return { intent: 'CANCEL_SHUTDOWN', slots: {}, confidence: 0.8 };
    }
    if (normalizedText.includes('休眠')) {
      return { intent: 'SLEEP_COMPUTER', slots: {}, confidence: 0.8 };
    }
    if (normalizedText.includes('清空回收站') || normalizedText.includes('清理回收站')) {
      return { intent: 'EMPTY_RECYCLE_BIN', slots: {}, confidence: 0.8 };
    }
    if (normalizedText.includes('搜索') || normalizedText.includes('百度') || normalizedText.includes('查一下')) {
      return { intent: 'SEARCH_WEB', slots: { query: text }, confidence: 0.7 };
    }
    if (normalizedText.includes('几点') || normalizedText.includes('时间') || normalizedText.includes('日期') || normalizedText.includes('星期')) {
      return { intent: 'CHECK_TIME', slots: {}, confidence: 0.8 };
    }
    if (normalizedText.includes('锁屏') || normalizedText.includes('锁定屏幕')) {
      return { intent: 'LOCK_SCREEN', slots: {}, confidence: 0.8 };
    }
    if (normalizedText.includes('打开') && (normalizedText.includes('桌面') || normalizedText.includes('文档') || normalizedText.includes('下载'))) {
      const folderMap: Record<string, string> = {
        '桌面': 'desktop', '文档': 'documents', '下载': 'downloads',
        '图片': 'pictures', '音乐': 'music', '视频': 'videos'
      };
      for (const [key, value] of Object.entries(folderMap)) {
        if (normalizedText.includes(key)) {
          return { intent: 'OPEN_FOLDER', slots: { folderName: value }, confidence: 0.8 };
        }
      }
    }
    if (normalizedText.includes('打开')) {
      const appMatch = text.match(/打开(.+)/);
      return { 
        intent: 'OPEN_APP', 
        slots: { appName: appMatch ? appMatch[1].trim() : '' }, 
        confidence: 0.7 
      };
    }
    
    // 默认当作闲聊
    return { intent: 'CHAT', slots: {}, confidence: 0.6 };
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
      case 'OPEN_APP':
        return !slots.appName;
      case 'OPEN_FOLDER':
        return !slots.folderName;
      // 暂时禁用：case 'ADJUST_VOLUME':
      // 暂时禁用：  return !slots.volume && !slots.volumeDirection;
      case 'SEARCH_WEB':
        return !slots.query;
      default:
        return false;
    }
  }

  /**
   * 生成追问问题
   */
  private generateAskQuestion(intent: Intent, slots: Slots): string {
    switch (intent) {
      case 'OPEN_APP':
        return '你想打开哪个应用呢？';
      case 'OPEN_FOLDER':
        return '你想打开哪个文件夹呢？（桌面/文档/下载/图片/音乐/视频）';
      // 暂时禁用：case 'ADJUST_VOLUME':
      // 暂时禁用：  return '你想把音量调到多少呢？（例如：音量调到50%）';
      case 'SEARCH_WEB':
        return '你想搜索什么呢？';
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
