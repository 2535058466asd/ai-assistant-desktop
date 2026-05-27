// ==========================================
// 核心协调器
// 实现 Function Calling 架构的 Agent 循环
// 支持流式输出（打字机效果）
// ==========================================

import type {
  Message,
  AgentProcessEvent,
  ToolProcessEvent,
} from '../types';

import { getVoiceGatewayManager } from './voice';
import { getHistoryManager } from './history';
import { ConversationRuntime } from './conversation/conversationRuntime';
import { ContextCompactor } from './context/contextCompactor';
import { AgentEventBridge } from './events/agentEventBridge';
import { AgentLoop } from './agent';
import { getNovaSystemPrompt, DEFAULT_NOVA_SETTINGS } from './novaSettings';
import { getMemoryService } from '../services/memoryServiceClient';
import { tryExtractAndSaveMemory } from './utils/memoryExtractor';
import { createLogger, createTraceId, type LogMeta } from '../../shared/logger';
import { getResolvedRuntimeModel } from './model/modelRuntime';
import { getToolPromptSummary } from './tools/toolRegistry';

const logger = createLogger('agent');

// 默认模型来自统一运行时配置。
function getDefaultModelId(): string {
  return getResolvedRuntimeModel().modelId;
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
  private eventBridge = new AgentEventBridge();
  private conversationRuntime = new ConversationRuntime(this.historyManager);
  private isVoiceMode: boolean = false;
  private currentModelId: string = getDefaultModelId(); // 当前使用的模型
  private contextCompactor: ContextCompactor;
  private agentLoop: AgentLoop;

  constructor() {
    const sessionId = this.conversationRuntime.getSessionId();
    this.contextCompactor = new ContextCompactor(this.historyManager, sessionId);
    this.agentLoop = new AgentLoop({
      historyManager: this.historyManager,
      conversationRuntime: this.conversationRuntime,
      contextCompactor: this.contextCompactor,
      eventBridge: this.eventBridge,
      buildSystemPrompt: this.buildSystemPrompt.bind(this),
    });
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
  resetConversation(history: Message[] = [], meta: LogMeta = {}) {
    const sessionId = this.conversationRuntime.reset(history);
    this.contextCompactor = new ContextCompactor(this.historyManager, sessionId);
    logger.info('智能体对话上下文已重置', {
      ...meta,
      sessionId,
      messageCount: history.length,
      phase: 'history',
    });
  }

  /**
   * 初始化
   */
  private async initialize(): Promise<void> {
    logger.info('智能体协调器启动中');
    
    const sessionId = this.conversationRuntime.initialize();
    this.voiceGateway.initialize(sessionId);

    // 设置语音消息回调
    this.voiceGateway.onMessage((text) => {
      this.isVoiceMode = true;
      this.processTextInput(text, false);
    });

    logger.info('智能体协调器已就绪');
  }

  /**
   * 生成消息 ID
   */
  private generateMessageId(): string {
    return this.conversationRuntime.createMessageId();
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

  /**
   * 处理文本输入（使用 Function Calling 架构）
   * @param text 用户输入的文本
   * @param isTextInput 是否是文字输入（默认为true）
   */
  async processTextInput(text: string, isTextInput: boolean = true, meta: LogMeta = {}): Promise<void> {
    if (!text.trim()) return;
    const traceId = meta.traceId || createTraceId();
    const traceMeta: LogMeta = {
      ...meta,
      traceId,
      phase: 'input',
    };

    if (isTextInput) {
      this.isVoiceMode = false;
    }

    logger.info('智能体收到用户输入', {
      ...traceMeta,
      sessionId: this.conversationRuntime.getSessionId(),
      textPreview: text.slice(0, 120),
    });

    // 1. 创建用户消息并通知 UI
    const userMessage: Message = {
      id: this.generateMessageId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
      sessionId: this.conversationRuntime.getSessionId(),
      traceId,
    };

    this.conversationRuntime.addMessage(userMessage);
    logger.info('用户消息已写入对话历史', {
      ...traceMeta,
      sessionId: userMessage.sessionId,
      messageId: userMessage.id,
      messageCount: this.conversationRuntime.getHistory().length,
      phase: 'history',
    });

    this.eventBridge.emitMessage(userMessage);

    try {
      // 2. 检查是否需要压缩上下文
      await this.contextCompactor.compactIfNeeded();

      // 3. Agent 循环（Function Calling）
      const messageId = this.generateMessageId();

      const assistantMessage: Message = {
        id: messageId,
        role: 'assistant',
        content: '', // 初始为空
        timestamp: Date.now(),
        sessionId: this.conversationRuntime.getSessionId(),
        isTTS: true,
        isStreaming: true, // 标记为流式消息
        traceId,
      };

      // 通知 UI：流式开始
      this.eventBridge.emitStreamStart(assistantMessage);

      const inputEventCreatedAt = Date.now();
      this.eventBridge.emitProcessEvent(messageId, {
        id: `${messageId}-input`,
        kind: 'analysis',
        title: '理解用户输入',
        status: 'success',
        detail: this.previewValue(text, 120),
        createdAt: inputEventCreatedAt,
        updatedAt: inputEventCreatedAt,
        traceId,
      });

      // 4. 执行 Agent 循环（流式）
      const { content: finalResponse, reasoningContent: finalReasoningContent, toolCallSummary, reasoningSegments, usage, model } = await this.agentLoop.run(
        messageId,
        text,
        {
          onStreamChunk: (msgId, content) => {
            this.eventBridge.emitStreamChunk(msgId, content);
          }
        },
        traceMeta
      );

      // 流式输出最终回复
      const accumulatedContent = finalResponse || '抱歉，处理超时了，请再试一次。';
      const responseEventCreatedAt = Date.now();
      this.eventBridge.emitProcessEvent(messageId, {
        id: `${messageId}-response`,
        kind: 'response',
        title: '整理最终回复',
        status: 'success',
        detail: this.previewValue(accumulatedContent, 140),
        createdAt: responseEventCreatedAt,
        updatedAt: responseEventCreatedAt,
        traceId,
      });

      // 通知 UI：收到新的 token
      this.eventBridge.emitStreamChunk(messageId, accumulatedContent);

      // 流式结束，保存完整消息
      assistantMessage.content = accumulatedContent;
      if (finalReasoningContent) {
        assistantMessage.reasoning_content = finalReasoningContent;
        assistantMessage.reasoningContent = finalReasoningContent;
      }
      if (reasoningSegments && reasoningSegments.length > 0) {
        assistantMessage.reasoningSegments = reasoningSegments;
      }
      if (toolCallSummary && toolCallSummary.length > 0) {
        assistantMessage.toolCallSummary = toolCallSummary;
      }
      if (usage) {
        assistantMessage.usage = usage;
        // 记录用量统计（异步，不阻塞主流程）
        try {
          const { recordUsage } = await import('./cost/costTracker');
          recordUsage(assistantMessage.sessionId, model || 'unknown', usage);
        } catch (e) {
          logger.error('记录用量失败', { ...traceMeta, phase: 'persist', error: e });
        }
      }
      if (model) {
        assistantMessage.model = model;
      }
      delete (assistantMessage as any).isStreaming; // 移除流式标记

      this.conversationRuntime.addMessage({
        ...assistantMessage,
        content: accumulatedContent
      });
      logger.info('助手消息已写入对话历史', {
        ...traceMeta,
        phase: 'history',
        sessionId: assistantMessage.sessionId,
        messageId,
        messageCount: this.conversationRuntime.getHistory().length,
      });

      // 流式阶段前端只实时更新 content；这里把最终完整消息再次发给 UI，
      // 让 reasoningContent / toolCallSummary 能合并回同一条助手气泡。
      this.eventBridge.emitMessage(assistantMessage);

      // 通知 UI：流式结束
      this.eventBridge.emitStreamEnd(messageId);

      // 尝试从对话中提取重要信息并存入记忆
      try {
        await tryExtractAndSaveMemory(text, accumulatedContent);
      } catch (memoryError) {
        logger.error('记忆提取失败', { ...traceMeta, phase: 'persist', error: memoryError });
        // 提取记忆失败不影响聊天，所以不抛出错误
      }

    } catch (error) {
      logger.error('处理用户输入失败', { ...traceMeta, phase: 'output', error });
      await this.sendAssistantMessage('处理您的请求时出现错误，请稍后重试。');
    }
  }

  /**
   * 构建系统提示词（技能描述 + 用户记忆）
   * @param userInput 用户输入，用于记忆检索
   */
  private async buildSystemPrompt(userInput: string = ''): Promise<string> {
    const memoryPrompt = await this.memoryService.getMemoryPrompt(userInput);

    return `${getNovaSystemPrompt()}

${memoryPrompt || ''}

【工具使用指引】
你可以使用以下工具来帮助用户。工具的 JSON Schema 会随请求发送，请优先根据工具描述、参数和风险等级选择：
${getToolPromptSummary()}

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
      sessionId: this.conversationRuntime.getSessionId(),
      isTTS: true
    };

    this.conversationRuntime.addMessage(assistantMessage);

    this.eventBridge.emitMessage(assistantMessage);
  }

  /**
   * 设置普通消息回调（兼容旧版）
   */
  onMessage(callback: (message: Message) => void): void {
    this.eventBridge.setMessageCallback(callback);
  }

  /**
   * 设置流式回调（用于打字机效果）
   */
  onStream(callbacks: StreamCallbacks): void {
    this.eventBridge.setStreamCallbacks(callbacks);
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
    return DEFAULT_NOVA_SETTINGS.welcomeMessage;
  }

  /**
   * 获取历史消息
   */
  getHistory(): Message[] {
    return this.conversationRuntime.getHistory();
  }


}

let orchestratorInstance: Orchestrator | null = null;

export function getOrchestrator(): Orchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new Orchestrator();
  }
  return orchestratorInstance;
}
