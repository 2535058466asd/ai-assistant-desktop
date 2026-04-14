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

  constructor() {
    this.sessionId = this.generateSessionId();
    this.initialize();
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
        const response = await this.callDoubaoWithTools();

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
          // 豆包内置工具（如 web_search）没有 function 字段，由豆包服务端自行处理
          // 不需要我们执行，直接跳过，豆包会在下一轮响应中返回搜索结果
          if (toolCall.type === 'web_search' || !toolCall.function) {
            console.log(`🔧 内置工具调用: ${toolCall.type}，由豆包服务端处理`);
            continue;
          }

          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments);

          console.log(`🔧 执行工具: ${toolName}(${JSON.stringify(toolArgs)})`);

          const result = await executeTool(toolName, toolArgs);
          console.log(`🔧 工具结果: ${result.success ? '成功' : '失败'} - ${result.data || result.error}`);

          // 将工具结果回传
          this.conversationHistory.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result)
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
   */
  private async callDoubaoWithTools(): Promise<any> {
    const systemPrompt = await this.buildSystemPrompt();

    // 豆包 API 地址（Function Calling）
    const ARK_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';

    // 获取 API Key 和 Model ID（从配置或环境变量）
    const getApiKey = () => {
      return apiConfig.apiKey;
    };

    const getModelId = () => {
      return 'doubao-seed-2-0-pro-260215';
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

    console.log('📤 发送给豆包的请求:', JSON.stringify(requestBody, null, 2));

    const response = await fetch(ARK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getApiKey()}`
      },
      body: JSON.stringify(requestBody)
    });

    const responseJson = await response.json();
    console.log('📥 豆包返回的响应:', JSON.stringify(responseJson, null, 2));
    return responseJson;
  }

  /**
   * 构建系统提示词（技能描述 + 用户记忆）
   */
  private async buildSystemPrompt(): Promise<string> {
    const memoryPrompt = await this.memoryService.getMemoryPrompt();

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
