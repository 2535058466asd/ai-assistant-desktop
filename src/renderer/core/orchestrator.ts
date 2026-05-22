// ==========================================
// 核心协调器
// 实现 Function Calling 架构的 Agent 循环
// 支持流式输出（打字机效果）
// ==========================================

import type {
  Message,
  SessionId,
  AgentProcessEvent,
  ToolProcessEvent,
} from '../types';

import { getVoiceGatewayManager } from './voice';
import { getHistoryManager } from './history';
import { getQiyuanSystemPrompt, DEFAULT_QIYUAN_SETTINGS } from './qiyuanSettings';
import { getMemoryService } from '../services/memoryServiceClient';
import { tryExtractAndSaveMemory } from './utils/memoryExtractor';
import { toolDefinitions } from './tools/toolDefinitions';
import { executeTool, type ToolExecutionResult } from './tools/toolExecutor';
import { getModelProvider, type ModelMessage, type StreamChunk } from './model';
import { createLogger } from '../../shared/logger';
import { getActiveModelConfig } from '../config/modelConfig';

const logger = createLogger('agent');

// 默认模型来自统一配置；设置页切换 Provider 后会通过 getActiveRequestModel 重新同步。
function getDefaultModelId(): string {
  return getActiveModelConfig().model;
}

// 开发环境默认输出完整请求/响应，生产环境不打印，避免泄露 prompt 和上下文。
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
  /** 工具执行过程更新 */
  onToolEvent?: (messageId: string, event: ToolProcessEvent) => void;
  /** Agent 处理过程更新 */
  onProcessEvent?: (messageId: string, event: AgentProcessEvent) => void;
}

/**
 * 核心协调器类
 */
export class Orchestrator {
  private voiceGateway = getVoiceGatewayManager();
  private historyManager = getHistoryManager();
  private memoryService = getMemoryService();
  private sessionId: SessionId;
  private onMessageCallback: ((message: Message) => void) | null = null;
  private streamCallbacks: StreamCallbacks | null = null; // 流式回调
  private isVoiceMode: boolean = false;
  private currentModelId: string = getDefaultModelId(); // 当前使用的模型
  private currentProviderId: string = getModelProvider().id;
  
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
    this.currentProviderId = getModelProvider().id;
  }

  /**
   * 获取本次请求实际使用的模型。
   *
   * 顶部栏只切 modelId，设置页会切 Provider。这里负责兜底：
   * 如果 Provider 已经变化，就把 currentModelId 重置成新 Provider 的默认模型，
   * 避免出现“小米 Provider 还在请求豆包模型名”的错配。
   *
   * ✅ 增强：一致性检查，防止 Provider 和 Model 不匹配
   */
  private getActiveRequestModel(): string {
    const provider = getModelProvider();
    const activeConfig = getActiveModelConfig();

    // ✅ 检查 Provider 和 Model 是否匹配
    if (provider.id === 'mimo' && !this.currentModelId.startsWith('mimo-')) {
      logger.warn('⚠️ Provider 与模型名不匹配，MiMo Provider 但模型名不以 mimo- 开头', {
        provider: provider.id,
        currentModel: this.currentModelId,
        defaultModel: provider.defaultModel
      });
      this.currentModelId = provider.defaultModel || 'mimo-v2.5';
      this.currentProviderId = provider.id;
    } else if (provider.id === 'doubao' && !this.currentModelId.startsWith('doubao-')) {
      logger.warn('⚠️ Provider 与模型名不匹配，豆包 Provider 但模型名不以 doubao- 开头', {
        provider: provider.id,
        currentModel: this.currentModelId,
        defaultModel: provider.defaultModel
      });
      this.currentModelId = provider.defaultModel || 'doubao-seed-2-0-pro-260215';
      this.currentProviderId = provider.id;
    } else if (provider.id !== this.currentProviderId) {
      // Provider 发生变化，自动同步
      logger.info('Provider 切换，自动同步模型', {
        from: this.currentProviderId,
        to: provider.id,
        currentModel: this.currentModelId,
        defaultModel: provider.defaultModel
      });
      this.currentProviderId = provider.id;
      this.currentModelId = provider.defaultModel || activeConfig.model;
    }

    return this.currentModelId || provider.defaultModel || activeConfig.model;
  }

  /**
   * 重置对话上下文
   * 切换对话时调用，确保不同对话的上下文完全隔离
   * @param history - 新对话的历史消息（用于恢复上下文）
   */
  resetConversation(history: Message[] = []) {
    this.sessionId = this.generateSessionId();
    this.historyManager.initialize(this.sessionId);
    // 将历史消息写入 brain，使其成为唯一消息源
    for (const msg of history) {
      this.historyManager.addMessage(this.sessionId, msg);
    }
    logger.info('对话上下文已重置', { sessionId: this.sessionId, historyCount: history.length });
  }

  /**
   * 初始化
   */
  private async initialize(): Promise<void> {
    logger.info('智能体协调器启动中');
    
    this.voiceGateway.initialize(this.sessionId);
    this.historyManager.initialize(this.sessionId);

    // 设置语音消息回调
    this.voiceGateway.onMessage((text) => {
      this.isVoiceMode = true;
      this.processTextInput(text);
    });

    logger.info('智能体协调器已就绪');
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
   * 生成适合 UI 展示的短摘要，避免把完整文件、长网页或敏感请求体塞进聊天区。
   */
  private previewValue(value: unknown, maxLength: number = 180): string {
    let text: string;
    if (typeof value === 'string') {
      text = value;
    } else {
      try {
        text = JSON.stringify(value);
      } catch {
        text = String(value);
      }
    }

    if (!text) return '';
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  }

  private emitToolEvent(messageId: string, event: ToolProcessEvent): void {
    this.streamCallbacks?.onToolEvent?.(messageId, event);
    this.streamCallbacks?.onProcessEvent?.(messageId, event);
  }

  private emitProcessEvent(messageId: string, event: AgentProcessEvent): void {
    this.streamCallbacks?.onProcessEvent?.(messageId, event);
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
    const history = this.historyManager.getHistoryForLLM(this.sessionId);
    const estimatedTokens = this.estimateTokens(history);
    return estimatedTokens > Orchestrator.MAX_CONTEXT_TOKENS * Orchestrator.COMPACT_THRESHOLD;
  }

  /**
   * 压缩上下文历史
   */
  private async compactHistory(): Promise<void> {
    const fullHistory = this.historyManager.getHistoryForLLM(this.sessionId);

    // 1. 分离：需要压缩的消息 + 保留的消息
    const toCompact = fullHistory.slice(
      0, fullHistory.length - Orchestrator.KEEP_RECENT_MESSAGES
    );
    const toKeep = fullHistory.slice(
      -Orchestrator.KEEP_RECENT_MESSAGES
    );

    if (toCompact.length === 0) return;

    // 2. 调用LLM压缩
    const summary = await this.callLLMForCompaction(toCompact);

    // 3. 替换：用摘要消息替代被压缩的消息，写回 brain
    const now = Date.now();
    const compactedHistory: Message[] = [
      { id: `compact-${now}`, role: 'system', content: `[历史摘要] ${summary}`, timestamp: now, sessionId: this.sessionId },
      ...toKeep.map((msg, i) => ({
        id: `kept-${now}-${i}`,
        role: msg.role as Message['role'],
        content: msg.content,
        timestamp: now + i + 1,
        sessionId: this.sessionId,
        ...(msg.reasoning_content ? { reasoning_content: msg.reasoning_content } : {}),
        ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}),
        ...(msg.tool_call_id ? { tool_call_id: msg.tool_call_id } : {}),
      }))
    ];
    this.historyManager.setHistory(this.sessionId, compactedHistory);

    logger.info('对话历史已压缩', { kept: Orchestrator.KEEP_RECENT_MESSAGES });
  }

  /**
   * 调用LLM压缩对话历史
   * @param messages 要压缩的消息
   * @returns 压缩后的摘要
   */
  private async callLLMForCompaction(messages: any[]): Promise<string> {
    try {
      return await getModelProvider().compact(messages as ModelMessage[]);
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

    logger.info('智能体收到用户输入', { textPreview: text.slice(0, 120) });

    // 1. 创建用户消息并通知 UI
    const userMessage: Message = {
      id: this.generateMessageId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
      sessionId: this.sessionId
    };

    this.historyManager.addMessage(this.sessionId, userMessage);

    if (this.onMessageCallback) {
      this.onMessageCallback(userMessage);
    }

    try {
      // 2. 检查是否需要压缩上下文
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

      const inputEventCreatedAt = Date.now();
      this.emitProcessEvent(messageId, {
        id: `${messageId}-input`,
        kind: 'analysis',
        title: '理解用户输入',
        status: 'success',
        detail: this.previewValue(text, 120),
        createdAt: inputEventCreatedAt,
        updatedAt: inputEventCreatedAt,
      });

      // 4. 执行 Agent 循环（流式）
      const MAX_TOOL_ROUNDS = 5;
      let round = 0;
      let finalResponse = '';
      let finalReasoningContent = '';

      /**
       * Agent Loop 结构：
       * 1. 把系统提示词、历史消息、工具 schema 发给模型
       * 2. 模型要么直接返回 content，要么返回 tool_calls
       * 3. 如果有 tool_calls，就执行工具，把工具结果作为 tool 消息写回历史
       * 4. 再请求模型，让它基于工具结果整理最终回答
       * 5. 最多循环 MAX_TOOL_ROUNDS 次，避免模型无限调用工具
       */
      while (round < MAX_TOOL_ROUNDS) {
        round++;
        logger.info('智能体循环轮次开始', {
          round,
          maxRounds: MAX_TOOL_ROUNDS,
          historyLength: this.historyManager.getHistory(this.sessionId).length,
        });
        const modelEventId = `${messageId}-model-${round}`;
        const modelEventCreatedAt = Date.now();
        const modelStartedAt = performance.now();
        this.emitProcessEvent(messageId, {
          id: modelEventId,
          kind: 'model',
          title: round === 1 ? '请求模型判断下一步' : '带工具结果继续请求模型',
          status: 'running',
          detail: `第 ${round} 轮，历史消息 ${this.historyManager.getHistory(this.sessionId).length} 条`,
          createdAt: modelEventCreatedAt,
          updatedAt: modelEventCreatedAt,
        });

        // 流式调用模型，实时推送文字到 UI
        const previousContent = finalResponse;
        const { content, reasoningContent, toolCalls, error } = await this.callModelWithToolsStream(text, (accumulated) => {
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
            'AuthenticationError': 'API Key 格式不对或无效，请检查当前模型服务的密钥配置。',
          };
          finalResponse = userMessages[errorCode] || `出了点问题：${errorMsg}`;
          this.emitProcessEvent(messageId, {
            id: modelEventId,
            kind: 'model',
            title: '模型请求失败',
            status: 'error',
            detail: errorCode || '模型 API 返回错误',
            resultPreview: errorMsg,
            durationMs: Math.round(performance.now() - modelStartedAt),
            createdAt: modelEventCreatedAt,
            updatedAt: Date.now(),
          });
          break;
        }

        this.emitProcessEvent(messageId, {
          id: modelEventId,
          kind: 'model',
          title: toolCalls.length > 0 ? '模型决定调用工具' : '模型直接生成回复',
          status: 'success',
          detail: toolCalls.length > 0
            ? toolCalls.map((tc: any) => tc.function?.name).filter(Boolean).join('、')
            : this.previewValue(content || finalResponse, 120),
          durationMs: Math.round(performance.now() - modelStartedAt),
          createdAt: modelEventCreatedAt,
          updatedAt: Date.now(),
        });

        if (content) {
          const contentEventCreatedAt = Date.now();
          // 这里展示的是 API 返回的 content，不是模型隐藏的完整推理链。
          // 如果模型同轮还要调用工具，这段 content 只放进“思考过程”，避免和最终答案重复。
          this.emitProcessEvent(messageId, {
            id: `${modelEventId}-content`,
            kind: 'analysis',
            title: toolCalls.length > 0 ? '模型中间回复' : '模型返回内容',
            status: 'success',
            detail: toolCalls.length > 0
              ? '模型在调用工具前返回的 content，已放入思考过程，不直接作为最终回复。'
              : '模型 API 返回的 content。',
            resultPreview: content,
            createdAt: contentEventCreatedAt,
            updatedAt: contentEventCreatedAt,
          });
        }
        if (reasoningContent) {
          finalReasoningContent += reasoningContent;
          const reasoningEventCreatedAt = Date.now();
          this.emitProcessEvent(messageId, {
            id: `${modelEventId}-reasoning`,
            kind: 'analysis',
            title: toolCalls.length > 0 ? '模型思考并决定调用工具' : '模型思考过程',
            status: 'success',
            detail: `第 ${round} 轮模型返回的 reasoning_content`,
            resultPreview: reasoningContent,
            createdAt: reasoningEventCreatedAt,
            updatedAt: reasoningEventCreatedAt,
          });
        }

        // 把助手消息（含可能的工具调用）加入历史
        const assistantMsgForBrain: Message = {
          id: `${messageId}-round${round}`,
          role: 'assistant',
          content: content || '',
          timestamp: Date.now(),
          sessionId: this.sessionId,
          ...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        };
        this.historyManager.addMessage(this.sessionId, assistantMsgForBrain);

        // 如果同一轮还要调用工具，content 只作为过程展示；最终回答交给工具结果回填后的下一轮模型整理。
        if (content && toolCalls.length === 0) {
          finalResponse += content;
        } else if (content && toolCalls.length > 0 && this.streamCallbacks) {
          this.streamCallbacks.onStreamChunk(messageId, previousContent);
        }

        if (toolCalls.length === 0) {
          // 没有工具调用 → 最终文本回复
          logger.info('智能体循环结束：无需继续调用工具', { round, content: finalResponse });
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
          const toolEventId = toolCall.id || `${messageId}-${round}-${toolName}`;
          const toolCreatedAt = Date.now();
          const toolStartedAt = performance.now();
          let toolArgs: Record<string, any> = {};
          let argsPreview = this.previewValue(toolCall.function.arguments);
          let result: ToolExecutionResult | null = null;

          try {
            toolArgs = JSON.parse(toolCall.function.arguments || '{}');
            argsPreview = this.previewValue(toolArgs);
          } catch (parseError: any) {
            result = {
              success: false,
              error: `工具参数解析失败：${parseError?.message || '参数不是合法 JSON'}`,
            };
            logger.error('工具参数解析失败', {
              toolName,
              rawArguments: toolCall.function.arguments,
              error: parseError,
            });
            this.emitToolEvent(messageId, {
              id: toolEventId,
              kind: 'tool',
              title: `${toolName} 参数解析失败`,
              toolName,
              argsPreview,
              status: 'error',
              detail: argsPreview,
              resultPreview: result.error,
              durationMs: 0,
              createdAt: toolCreatedAt,
              updatedAt: Date.now(),
            });
          }

          if (!result) {
            logger.info('开始执行工具', { toolName, toolArgs });
            this.emitToolEvent(messageId, {
              id: toolEventId,
              kind: 'tool',
              title: `执行工具：${toolName}`,
              toolName,
              argsPreview,
              status: 'running',
              detail: argsPreview,
              createdAt: toolCreatedAt,
              updatedAt: Date.now(),
            });

            result = await executeTool(toolName, toolArgs);
          }

          logger.info('工具执行结果', { toolName, success: result.success, result: result.data || result.error });
          this.emitToolEvent(messageId, {
            id: toolEventId,
            kind: 'tool',
            title: result.success ? `工具完成：${toolName}` : `工具失败：${toolName}`,
            toolName,
            argsPreview,
            status: result.success ? 'success' : 'error',
            detail: argsPreview,
            resultPreview: this.previewValue(result.data || result.error || ''),
            durationMs: Math.round(performance.now() - toolStartedAt),
            createdAt: toolCreatedAt,
            updatedAt: Date.now(),
          });

          const truncatedResult = {
            ...result,
            data: result.data ? this.truncateToolResult(result.data) : result.data
          };

          // 工具结果必须以 role=tool 写回模型历史，否则模型不知道工具刚才执行出了什么结果。
          this.historyManager.addMessage(this.sessionId, {
            id: `${toolEventId}-result`,
            role: 'tool',
            content: JSON.stringify(truncatedResult),
            timestamp: Date.now(),
            sessionId: this.sessionId,
            tool_call_id: toolCall.id,
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
      const responseEventCreatedAt = Date.now();
      this.emitProcessEvent(messageId, {
        id: `${messageId}-response`,
        kind: 'response',
        title: '整理最终回复',
        status: 'success',
        detail: this.previewValue(accumulatedContent, 140),
        createdAt: responseEventCreatedAt,
        updatedAt: responseEventCreatedAt,
      });

      // 通知 UI：收到新的 token
      if (this.streamCallbacks) {
        this.streamCallbacks.onStreamChunk(messageId, accumulatedContent);
      }

      // 流式结束，保存完整消息
      assistantMessage.content = accumulatedContent;
      if (finalReasoningContent) {
        assistantMessage.reasoning_content = finalReasoningContent;
      }
      delete (assistantMessage as any).isStreaming; // 移除流式标记
      
      this.historyManager.addMessage(this.sessionId, {
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
   * 流式调用模型（带 Function Calling）
   * 实时回调文字增量，流结束后返回累积的文本和工具调用
   */
  private async callModelWithToolsStream(
    userInput: string,
    onTextDelta: (accumulated: string) => void
  ): Promise<{ content: string; reasoningContent: string; toolCalls: any[]; error?: any }> {
    const systemPrompt = await this.buildSystemPrompt(userInput);
    // 每次请求都重新构造 messages，确保包含最新记忆、历史、工具结果。
    const requestBody = {
      model: this.getActiveRequestModel(),
      messages: [
        { role: 'system', content: systemPrompt },
        ...this.historyManager.getHistoryForLLM(this.sessionId)
      ],
      tools: toolDefinitions,
      stream: true,
    };

    if (isVerboseAgentLog()) {
      logger.info('发送给模型的流式请求', requestBody);
    }

    const provider = getModelProvider();
    if (!provider.chatWithToolsStream) {
      // 降级：provider 不支持流式，回退到非流式
      logger.info('当前模型提供商不支持流式，降级为非流式调用');
      const response = await provider.chatWithTools(requestBody as any);
      if (response.error) return { content: '', reasoningContent: '', toolCalls: [], error: response.error };
      const msg = response.choices[0]?.message;
      const content = msg?.content || '';
      const reasoningContent = msg?.reasoning_content || '';
      const toolCalls = msg?.tool_calls || [];
      if (content) onTextDelta(content);
      return { content, reasoningContent, toolCalls };
    }

    let accumulated = '';
    const response = await provider.chatWithToolsStream(requestBody as any, (chunk: StreamChunk) => {
      if (chunk.type === 'text_delta' && chunk.textDelta) {
        accumulated += chunk.textDelta;
        onTextDelta(accumulated);
      }
    });

    if (response.error) return { content: '', reasoningContent: '', toolCalls: [], error: response.error };

    const msg = response.choices[0]?.message;
    return {
      content: msg?.content || accumulated,
      reasoningContent: msg?.reasoning_content || '',
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

    this.historyManager.addMessage(this.sessionId, assistantMessage);

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
    return this.historyManager.getHistory(this.sessionId);
  }


}

let orchestratorInstance: Orchestrator | null = null;

export function getOrchestrator(): Orchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new Orchestrator();
  }
  return orchestratorInstance;
}
