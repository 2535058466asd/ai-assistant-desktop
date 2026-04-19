// ==========================================
// 核心协调器
// 实现 Function Calling 架构的 Agent 循环
// 支持流式输出（打字机效果）
// ==========================================

import type {
  Message,
  SessionId
} from '../types';

import { getVoiceGatewayManager } from './layer1-gateway';
import { getBrainManager } from './layer2-brain';
import { getQiyuanSystemPrompt, DEFAULT_QIYUAN_SETTINGS } from './qiyuanSettings';
import { getMemoryService } from '../services/memoryServiceClient';
import { tryExtractAndSaveMemory } from './utils/memoryExtractor';
import { toolDefinitions } from './tools/toolDefinitions';
import { executeTool } from './tools/toolExecutor';
import apiConfig from '../config/apiConfig';


/**
 * 流式回调接口
 * 用于实现打字机效果
 */
export interface StreamCallbacks {
  /** 流式开始时调用，返回空的消息对象 */
  onStreamStart: (message: Message) => void;
  /** 每收到一个 token 时调用，传入当前累积的完整文本 */
  onStreamChunk: (messageId: string, content: string) => void;
  /** 流式结束时调用 */
  onStreamEnd: (messageId: string) => void;
}

/**
 * 核心协调器类
 */
export class Orchestrator {
  private voiceGateway = getVoiceGatewayManager();
  private brain = getBrainManager();
  private memoryService = getMemoryService();
  private sessionId: SessionId;
  private onMessageCallback: ((message: Message) => void) | null = null;
  private streamCallbacks: StreamCallbacks | null = null; // 流式回调
  private isVoiceMode: boolean = false;
  private conversationHistory: any[] = [];
  private static readonly MAX_HISTORY_MESSAGES = 20; // 最大保留20条消息（约10轮对话）
  private currentModelId: string = 'doubao-seed-2-0-pro-260215'; // 当前使用的模型
  
  // 工具结果截断和上下文压缩相关常量
  private static readonly MAX_TOOL_RESULT_TOKENS = 500; // 工具返回结果最大token数
  private static readonly MAX_CONTEXT_TOKENS = 80000; // 模型窗口的70%
  private static readonly KEEP_RECENT_MESSAGES = 6;   // 保留最近6条不压缩
  private static readonly COMPACT_THRESHOLD = 0.8;     // 使用80%时触发压缩

  constructor() {
    this.sessionId = this.generateSessionId();
    this.initialize();
  }

  /** 切换模型 */
  setModel(modelId: string) {
    this.currentModelId = modelId;
  }

  /**
   * 重置对话上下文
   * 切换对话时调用，确保不同对话的上下文完全隔离
   * @param history - 新对话的历史消息（用于恢复上下文）
   */
  resetConversation(history: Message[] = []) {
    this.conversationHistory = history.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
    this.sessionId = this.generateSessionId();
    console.log('🔄 [Orchestrator] 对话上下文已重置，新 sessionId:', this.sessionId);
  }

  /**
   * 初始化
   */
  private async initialize(): Promise<void> {
    console.log('🚀 启源 AI 助手启动中...');
    
    this.voiceGateway.initialize(this.sessionId);
    this.brain.initialize(this.sessionId);

    // 设置语音消息回调
    this.voiceGateway.onMessage((text) => {
      this.isVoiceMode = true;
      this.processTextInput(text);
    });

    console.log('✅ 启源 AI 助手启动完成！');
  }

  /**
   * 生成会话 ID
   */
  private generateSessionId(): SessionId {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  /**
   * 生成消息 ID
   */
  private generateMessageId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  /**
   * 工具结果截断
   * @param result 工具返回结果
   * @returns 截断后的结果
   */
  private truncateToolResult(result: string): string {
    const estimatedTokens = Math.ceil(result.length / 4); // 粗略估算
    if (estimatedTokens <= Orchestrator.MAX_TOOL_RESULT_TOKENS) return result;
    const maxChars = Orchestrator.MAX_TOOL_RESULT_TOKENS * 4;
    const truncated = result.slice(0, maxChars);
    return truncated + `\n\n[结果已截断，原文共 ${result.length} 字]`;
  }

  /**
   * 估算当前上下文的token数
   * @param messages 消息数组
   * @returns 估算的token数
   */
  private estimateTokens(messages: any[]): number {
    let totalTokens = 0;
    for (const message of messages) {
      if (message.content) {
        // 粗略估算：中文1字≈2token，英文1词≈1.3token
        const content = message.content.toString();
        const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
        const englishWords = (content.match(/\b\w+\b/g) || []).length;
        const otherChars = content.length - chineseChars - englishWords;
        totalTokens += chineseChars * 2 + englishWords * 1.3 + otherChars;
      }
    }
    return totalTokens;
  }

  /**
   * 检查是否需要压缩上下文
   * @returns 是否需要压缩
   */
  private async shouldCompact(): Promise<boolean> {
    const estimatedTokens = this.estimateTokens(this.conversationHistory);
    return estimatedTokens > Orchestrator.MAX_CONTEXT_TOKENS * Orchestrator.COMPACT_THRESHOLD;
  }

  /**
   * 压缩上下文历史
   */
  private async compactHistory(): Promise<void> {
    // 1. 分离：需要压缩的消息 + 保留的消息
    const toCompact = this.conversationHistory.slice(
      0, this.conversationHistory.length - Orchestrator.KEEP_RECENT_MESSAGES
    );
    const toKeep = this.conversationHistory.slice(
      -Orchestrator.KEEP_RECENT_MESSAGES
    );

    if (toCompact.length === 0) return;

    // 2. 调用LLM压缩
    const summary = await this.callLLMForCompaction(toCompact);

    // 3. 替换：用摘要消息替代被压缩的消息
    this.conversationHistory = [
      { role: 'system', content: `[历史摘要] ${summary}` },
      ...toKeep
    ];

    console.log(`📝 上下文压缩完成，保留了 ${Orchestrator.KEEP_RECENT_MESSAGES} 条消息 + 1条摘要`);
  }

  /**
   * 调用LLM压缩对话历史
   * @param messages 要压缩的消息
   * @returns 压缩后的摘要
   */
  private async callLLMForCompaction(messages: any[]): Promise<string> {
    const prompt = `你是一个对话摘要助手。请将以下对话历史压缩为简洁的摘要，保留：
1. 用户的核心需求和意图
2. 已完成的关键操作和结果
3. 重要的决策和结论
4. 未完成的待办事项

忽略：闲聊、重复确认、中间错误

摘要格式：用简洁的要点列出，每条不超过50字。

对话历史：
${messages.map(msg => `${msg.role}: ${msg.content || ''}`).join('\n')}`;

    try {
      const ARK_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
      const requestBody = {
        model: 'doubao-1-5-lite-32k-250115', // 使用 lite 模型压缩，成本低
        messages: [
          { role: 'system', content: '你是一个专业的对话摘要助手，只负责压缩对话历史，不做其他回答。' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 500,
        stream: false
      };

      const response = await fetch(ARK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiConfig.apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        console.error('❌ 压缩API请求失败:', response.status, response.statusText);
        return '无重要信息';
      }

      const responseJson = await response.json();
      return responseJson.choices?.[0]?.message?.content || '无重要信息';
    } catch (error) {
      console.error('❌ 压缩对话历史失败:', error);
      return '无重要信息';
    }
  }

  /**
   * 处理文本输入（使用 Function Calling 架构）
   * @param text 用户输入的文本
   * @param isTextInput 是否是文字输入（默认为true）
   */
  async processTextInput(text: string, isTextInput: boolean = true): Promise<void> {
    if (!text.trim()) return;

    if (isTextInput) {
      this.isVoiceMode = false;
    }

    console.log('💬 收到用户输入:', text);

    // 1. 创建用户消息并通知 UI
    const userMessage: Message = {
      id: this.generateMessageId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
      sessionId: this.sessionId
    };

    this.brain.addMessage(this.sessionId, userMessage);

    if (this.onMessageCallback) {
      this.onMessageCallback(userMessage);
    }

    try {
      // 2. 构建消息历史
      this.conversationHistory.push({ role: 'user', content: text });

      // 检查是否需要压缩上下文
      if (await this.shouldCompact()) {
        await this.compactHistory();
      }

      // 3. Agent 循环（Function Calling）
      const messageId = this.generateMessageId();
      let accumulatedContent = '';

      const assistantMessage: Message = {
        id: messageId,
        role: 'assistant',
        content: '', // 初始为空
        timestamp: Date.now(),
        sessionId: this.sessionId,
        isTTS: true,
        isStreaming: true // 标记为流式消息
      };

      // 通知 UI：流式开始
      if (this.streamCallbacks) {
        this.streamCallbacks.onStreamStart(assistantMessage);
      } else if (this.onMessageCallback) {
        // 如果没有设置流式回退到普通回调
        this.onMessageCallback(assistantMessage);
      }

      // 4. 执行 Agent 循环
      const MAX_TOOL_ROUNDS = 5;
      let round = 0;
      let finalResponse = '';

      while (round < MAX_TOOL_ROUNDS) {
        round++;

        // 调用豆包 API（带工具定义）
        const response = await this.callDoubaoWithTools(text);

        // 检查API是否返回错误
        if (response.error) {
          const errorMsg = response.error.message || '未知错误';
          const errorCode = response.error.code || '';
          console.error('❌ 豆包API错误:', errorCode, errorMsg);
          
          // 账号欠费等严重错误，直接返回友好提示
          const userMessages: Record<string, string> = {
            'AccountOverdueError': '哎呀，API账号余额不足了，需要充值才能继续使用哦～',
            'RateLimitError': '请求太频繁了，稍等一下再试吧～',
            'InvalidApiKey': 'API密钥配置有误，请检查一下设置～',
          };
          const userMsg = userMessages[errorCode] || `出了点问题：${errorMsg}`;
          finalResponse = userMsg;
          break;
        }

        // 检查是否有工具调用
        const message = response.choices[0].message;
        this.conversationHistory.push(message);

        if (!message.tool_calls) {
          // 没有工具调用 → 返回最终文本回复
          finalResponse = message.content || '';
          break;
        }

        // 执行所有工具调用
        for (const toolCall of message.tool_calls) {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments);

          console.log(`🔧 执行工具: ${toolName}(${JSON.stringify(toolArgs)})`);

          const result = await executeTool(toolName, toolArgs);
          console.log(`🔧 工具结果: ${result.success ? '成功' : '失败'} - ${result.data || result.error}`);

          // 截断工具结果，防止撑爆上下文
          const truncatedResult = {
            ...result,
            data: result.data ? this.truncateToolResult(result.data) : result.data
          };
          
          // 将工具结果回传
          this.conversationHistory.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(truncatedResult)
          });
        }
      }

      // 流式输出最终回复
      accumulatedContent = finalResponse || '抱歉，处理超时了，请再试一次。';

      // 通知 UI：收到新的 token
      if (this.streamCallbacks) {
        this.streamCallbacks.onStreamChunk(messageId, accumulatedContent);
      }

      // 流式结束，保存完整消息
      assistantMessage.content = accumulatedContent;
      delete (assistantMessage as any).isStreaming; // 移除流式标记
      
      this.brain.addMessage(this.sessionId, {
        ...assistantMessage,
        content: accumulatedContent
      });

      // 通知 UI：流式结束
      if (this.streamCallbacks) {
        this.streamCallbacks.onStreamEnd(messageId);
      }

      // 尝试从对话中提取重要信息并存入记忆
      try {
        await tryExtractAndSaveMemory(text, accumulatedContent);
      } catch (memoryError) {
        console.error('❌ 提取记忆失败:', memoryError);
        // 提取记忆失败不影响聊天，所以不抛出错误
      }

    } catch (error) {
      console.error('❌ 处理输入失败:', error);
      await this.sendAssistantMessage('处理您的请求时出现错误，请稍后重试。');
    }
  }

  /**
   * 调用豆包 API（带 Function Calling）
   * @param userInput 用户输入，用于构建系统提示词
   */
  private async callDoubaoWithTools(userInput: string = ''): Promise<any> {
    const systemPrompt = await this.buildSystemPrompt(userInput);

    // 豆包 API 地址（Function Calling）
    const ARK_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';

    // 获取 API Key 和 Model ID（从配置或环境变量）
    const getApiKey = () => {
      return apiConfig.apiKey;
    };

    const getModelId = () => {
      return this.currentModelId;
    };

    const requestBody = {
      model: getModelId(),
      messages: [
        { role: 'system', content: systemPrompt },
        ...this.conversationHistory
      ],
      tools: toolDefinitions,
      stream: false
    };

    if (process.env.NODE_ENV !== 'production') {
      console.log('📤 发送给豆包的请求:', JSON.stringify(requestBody, null, 2));
    }

    const response = await fetch(ARK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getApiKey()}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`API请求失败 (${response.status}): ${errorText || response.statusText}`);
    }

    const responseJson = await response.json();
    if (process.env.NODE_ENV !== 'production') {
      console.log('📥 豆包返回的响应:', JSON.stringify(responseJson, null, 2));
    }
    return responseJson;
  }

  /**
   * 构建系统提示词（技能描述 + 用户记忆）
   * @param userInput 用户输入，用于记忆检索
   */
  private async buildSystemPrompt(userInput: string = ''): Promise<string> {
    const memoryPrompt = await this.memoryService.getMemoryPrompt(userInput);

    return `${getQiyuanSystemPrompt()}

${memoryPrompt || ''}

【工具使用指引】
你可以使用以下工具来帮助用户：
- exec_command：执行系统命令（打开/关闭应用、查看进程、系统信息等）
- read_file / write_file：读写文件
- web_search：搜索互联网
- clipboard_read / clipboard_write：读写剪贴板
- screenshot：截取屏幕
- open_app：打开应用或网页

根据用户需求选择合适的工具。不需要工具时直接回复。工具执行失败时友好地告诉用户。`;
  }

  /**
   * 发送助手消息（非流式，用于追问等场景）
   */
  private async sendAssistantMessage(content: string): Promise<void> {
    const assistantMessage: Message = {
      id: this.generateMessageId(),
      role: 'assistant',
      content,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      isTTS: true
    };

    this.brain.addMessage(this.sessionId, assistantMessage);

    if (this.onMessageCallback) {
      this.onMessageCallback(assistantMessage);
    }
  }

  /**
   * 设置普通消息回调（兼容旧版）
   */
  onMessage(callback: (message: Message) => void): void {
    this.onMessageCallback = callback;
  }

  /**
   * 设置流式回调（用于打字机效果）
   */
  onStream(callbacks: StreamCallbacks): void {
    this.streamCallbacks = callbacks;
  }

  /**
   * 开始语音监听
   */
  async startVoiceListening(): Promise<boolean> {
    return this.voiceGateway.startListening();
  }

  /**
   * 停止语音监听
   */
  stopVoiceListening(): void {
    this.voiceGateway.stopListening();
  }

  /**
   * 手动唤醒
   */
  wakeUp(): void {
    this.voiceGateway.wakeUp();
  }

  /**
   * 获取欢迎消息
   */
  getWelcomeMessage(): string {
    return DEFAULT_QIYUAN_SETTINGS.welcomeMessage;
  }

  /**
   * 获取历史消息
   */
  getHistory(): Message[] {
    return this.brain.getHistory(this.sessionId);
  }


}

let orchestratorInstance: Orchestrator | null = null;

export function getOrchestrator(): Orchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new Orchestrator();
  }
  return orchestratorInstance;
}
