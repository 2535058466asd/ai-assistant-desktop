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
import { getModelProvider, type ModelMessage, type StreamChunk } from './model';
import { createLogger } from '../../shared/logger';
import apiConfig from '../config/apiConfig';

const logger = createLogger('agent');

function getDefaultModelId(): string {
  const providerId = import.meta.env.VITE_MODEL_PROVIDER || 'doubao';
  if (providerId === 'mimo' && import.meta.env.VITE_MIMO_MODEL) {
    return import.meta.env.VITE_MIMO_MODEL;
  }
  if (providerId === 'openai-compatible' && import.meta.env.VITE_OPENAI_COMPATIBLE_MODEL) {
    return import.meta.env.VITE_OPENAI_COMPATIBLE_MODEL;
  }
  return apiConfig.model || 'doubao-seed-2-0-pro-260215';
}

function summarizeModelMessage(message: any) {
  if (!message) return null;
  return {
    role: message.role,
    content: message.content || '',
    tool_calls: message.tool_calls?.map((toolCall: any) => ({
      id: toolCall.id,
      type: toolCall.type,
      name: toolCall.function?.name,
      arguments: toolCall.function?.arguments,
    })),
  };
}

function isVerboseAgentLog(): boolean {
  return process.env.NODE_ENV !== 'production' && import.meta.env.VITE_VERBOSE_AGENT_LOGS !== 'false';
}


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
  private modelProvider = getModelProvider();
  private sessionId: SessionId;
  private onMessageCallback: ((message: Message) => void) | null = null;
  private streamCallbacks: StreamCallbacks | null = null; // 流式回调
  private isVoiceMode: boolean = false;
  private conversationHistory: any[] = [];
  private static readonly MAX_HISTORY_MESSAGES = 20; // 最大保留20条消息（约10轮对话）
  private currentModelId: string = getDefaultModelId(); // 当前使用的模型
  
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
    logger.info('对话上下文已重置', { sessionId: this.sessionId });
  }

  /**
   * 初始化
   */
  private async initialize(): Promise<void> {
    logger.info('Agent 协调器启动中');
    
    this.voiceGateway.initialize(this.sessionId);
    this.brain.initialize(this.sessionId);

    // 设置语音消息回调
    this.voiceGateway.onMessage((text) => {
      this.isVoiceMode = true;
      this.processTextInput(text);
    });

    logger.info('Agent 协调器已就绪');
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

    logger.info('对话历史已压缩', { kept: Orchestrator.KEEP_RECENT_MESSAGES });
  }

  /**
   * 调用LLM压缩对话历史
   * @param messages 要压缩的消息
   * @returns 压缩后的摘要
   */
  private async callLLMForCompaction(messages: any[]): Promise<string> {
    try {
      return await this.modelProvider.compact(messages as ModelMessage[]);
    } catch (error) {
      logger.error('对话历史压缩失败', error);
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

    logger.info('Agent 收到用户输入', { textPreview: text.slice(0, 120) });

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

      // 4. 执行 Agent 循环（流式）
      const MAX_TOOL_ROUNDS = 5;
      let round = 0;
      let finalResponse = '';

      while (round < MAX_TOOL_ROUNDS) {
        round++;
        logger.info('Agent 循环轮次开始', {
          round,
          maxRounds: MAX_TOOL_ROUNDS,
          historyLength: this.conversationHistory.length,
        });

        // 流式调用模型，实时推送文字到 UI
        const previousContent = finalResponse;
        const { content, toolCalls, error } = await this.callDoubaoWithToolsStream(text, (accumulated) => {
          // 跨轮次累积：前面轮次的文字 + 当前轮次的流式文字
          if (this.streamCallbacks) {
            this.streamCallbacks.onStreamChunk(messageId, previousContent + accumulated);
          }
        });

        // 检查API是否返回错误
        if (error) {
          const errorMsg = error.message || '未知错误';
          const errorCode = error.code || '';
          logger.error('模型 API 返回错误', { errorCode, errorMsg });

          const userMessages: Record<string, string> = {
            'AccountOverdueError': '哎呀，API账号余额不足了，需要充值才能继续使用哦～',
            'RateLimitError': '请求太频繁了，稍等一下再试吧～',
            'InvalidApiKey': 'API密钥配置有误，请检查一下设置～',
          };
          finalResponse = userMessages[errorCode] || `出了点问题：${errorMsg}`;
          break;
        }

        // 把助手消息（含可能的工具调用）加入历史
        const assistantMsg: any = { role: 'assistant', content: content || null };
        if (toolCalls.length > 0) {
          assistantMsg.tool_calls = toolCalls;
        }
        this.conversationHistory.push(assistantMsg);

        // 累积文字内容（多轮工具调用时，每轮的文字都要拼接）
        if (content) finalResponse += content;

        if (toolCalls.length === 0) {
          // 没有工具调用 → 最终文本回复
          logger.info('Agent 循环结束：无需继续调用工具', { round, content: finalResponse });
          break;
        }

        logger.info('模型请求调用工具', {
          round,
          toolCalls: toolCalls.map((tc: any) => ({
            id: tc.id,
            name: tc.function?.name,
            arguments: tc.function?.arguments,
          })),
        });

        // 执行所有工具调用
        for (const toolCall of toolCalls) {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments);

          logger.info('开始执行工具', { toolName, toolArgs });

          const result = await executeTool(toolName, toolArgs);
          logger.info('工具执行结果', { toolName, success: result.success, result: result.data || result.error });

          const truncatedResult = {
            ...result,
            data: result.data ? this.truncateToolResult(result.data) : result.data
          };

          this.conversationHistory.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(truncatedResult)
          });

          logger.info('工具结果已回填到模型上下文', {
            toolName,
            toolCallId: toolCall.id,
            truncated: Boolean(result.data && truncatedResult.data !== result.data),
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
        logger.error('记忆提取失败', memoryError);
        // 提取记忆失败不影响聊天，所以不抛出错误
      }

    } catch (error) {
      logger.error('处理用户输入失败', error);
      await this.sendAssistantMessage('处理您的请求时出现错误，请稍后重试。');
    }
  }

  /**
   * 调用豆包 API（带 Function Calling）
   * @param userInput 用户输入，用于构建系统提示词
   */
  private async callDoubaoWithTools(userInput: string = ''): Promise<any> {
    const systemPrompt = await this.buildSystemPrompt(userInput);

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

    if (isVerboseAgentLog()) {
      logger.info('发送给模型的完整请求', requestBody);
    } else if (process.env.NODE_ENV !== 'production') {
      logger.debug('发送模型请求摘要', {
        model: requestBody.model,
        messageCount: requestBody.messages.length,
        toolCount: requestBody.tools.length,
      });
    }

    const responseJson = await this.modelProvider.chatWithTools(requestBody as any);
    if (isVerboseAgentLog()) {
      logger.info('模型完整响应', responseJson);
    } else if (process.env.NODE_ENV !== 'production') {
      logger.debug('收到模型响应摘要', {
        choices: responseJson.choices?.length || 0,
        hasError: Boolean(responseJson.error),
        id: (responseJson as any).id,
        model: (responseJson as any).model,
        usage: (responseJson as any).usage,
        message: summarizeModelMessage(responseJson.choices?.[0]?.message),
        error: responseJson.error,
      });
    }
    return responseJson;
  }

  /**
   * 流式调用模型（带 Function Calling）
   * 实时回调文字增量，流结束后返回累积的文本和工具调用
   */
  private async callDoubaoWithToolsStream(
    userInput: string,
    onTextDelta: (accumulated: string) => void
  ): Promise<{ content: string; toolCalls: any[]; error?: any }> {
    const systemPrompt = await this.buildSystemPrompt(userInput);
    const requestBody = {
      model: this.currentModelId,
      messages: [
        { role: 'system', content: systemPrompt },
        ...this.conversationHistory
      ],
      tools: toolDefinitions,
      stream: true,
    };

    if (isVerboseAgentLog()) {
      logger.info('发送给模型的流式请求', requestBody);
    }

    const provider = this.modelProvider;
    if (!provider.chatWithToolsStream) {
      // 降级：provider 不支持流式，回退到非流式
      logger.info('Provider 不支持流式，降级为非流式调用');
      const response = await provider.chatWithTools(requestBody as any);
      if (response.error) return { content: '', toolCalls: [], error: response.error };
      const msg = response.choices[0]?.message;
      const content = msg?.content || '';
      const toolCalls = msg?.tool_calls || [];
      if (content) onTextDelta(content);
      return { content, toolCalls };
    }

    let accumulated = '';
    const response = await provider.chatWithToolsStream(requestBody as any, (chunk: StreamChunk) => {
      if (chunk.type === 'text_delta' && chunk.textDelta) {
        accumulated += chunk.textDelta;
        onTextDelta(accumulated);
      }
    });

    if (response.error) return { content: '', toolCalls: [], error: response.error };

    const msg = response.choices[0]?.message;
    return {
      content: msg?.content || accumulated,
      toolCalls: msg?.tool_calls || [],
    };
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
- knowledge_search / knowledge_import_file：检索或导入本地知识库，回答需要引用本地文档时优先使用
- workspace_create_task / workspace_update_project：维护项目任务、下一步和阻塞点

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
