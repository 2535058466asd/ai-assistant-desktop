// ==========================================
// Agent 循环模块
// 实现 Function Calling 的核心循环逻辑
// ==========================================

import type {
  Message,
  AgentProcessEvent,
  ToolProcessEvent,
  ToolCallSummary,
  Attachment,
} from '../../types';

import type { HistoryManager } from '../history';
import type { ConversationRuntime } from '../conversation/conversationRuntime';
import type { ContextCompactor } from '../context/contextCompactor';
import type { AgentEventBridge } from '../events/agentEventBridge';
import { getToolDefinitionsForActiveSkills, getSkillInstructionsForActive, SKILLS } from '../tools/toolRegistry';
import { executeTool, type ToolExecutionResult } from '../tools/toolExecutor';
import { getModelProvider, type StreamChunk, type ToolCall, type ToolDefinition } from '../model';
import { getTextContent } from '../model/types';
import { getResolvedRuntimeModel, resolveModelForRequest } from '../model/modelRuntime';
import { getErrorMessage } from '../model/modelErrorHandler';
import { DEFAULT_MODEL_CONTEXT_MESSAGES, buildModelContextWithDiagnostics, hasValidToolCallArguments } from '../conversation/conversationContext';
import { createLogger, type LogMeta } from '../../../shared/logger';

const logger = createLogger('mainAgent');

const MAX_TOOL_ROUNDS = Number(import.meta.env.VITE_MAX_TOOL_ROUNDS) || 10;

/**
 * Agent 循环依赖接口
 */
export interface AgentLoopDependencies {
  historyManager: HistoryManager;
  conversationRuntime: ConversationRuntime;
  contextCompactor: ContextCompactor;
  eventBridge: AgentEventBridge;
  buildSystemPrompt: (userInput: string, skillInstructions?: string, toolDefinitions?: ToolDefinition[]) => Promise<string>;
}

/**
 * Agent 循环结果
 */
export interface AgentLoopResult {
  /** 最终回复内容 */
  content: string;
  /** 推理内容（thinking mode） */
  reasoningContent: string;
  /** 工具调用摘要列表 */
  toolCallSummary: ToolCallSummary[];
  /** 分段的推理内容 */
  reasoningSegments?: Array<{ round: number; content: string; timestamp: number }>;
  /** Token 用量 */
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  /** 使用的模型 */
  model?: string;
}

/**
 * 流式回调接口（用于 Agent 循环内部）
 */
export interface AgentLoopStreamCallbacks {
  /** 流式 token 回调 */
  onStreamChunk: (messageId: string, content: string) => void;
}

/**
 * Agent 循环类
 * 负责执行 Function Calling 的核心循环逻辑
 */
export class AgentLoop {
  constructor(private deps: AgentLoopDependencies) {}

  updateContextCompactor(contextCompactor: ContextCompactor) {
    this.deps.contextCompactor = contextCompactor;
  }

  /**
   * 执行 Agent 循环
   * @param messageId 消息 ID
   * @param userInput 用户输入
   * @param streamCallbacks 流式回调
   * @returns 循环结果
   */
  async run(
    messageId: string,
    userInput: string,
    streamCallbacks: AgentLoopStreamCallbacks,
    meta: LogMeta = {}
  ): Promise<AgentLoopResult> {
    let finalResponse = '';
    let finalReasoningContent = '';
    const allToolCallSummaries: ToolCallSummary[] = [];
    const reasoningSegments: Array<{ round: number; content: string; timestamp: number }> = [];
    let round = 0;
    let accumulatedUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    let usedModel = '';
    const activatedSkills = new Set<string>();

    while (round < MAX_TOOL_ROUNDS) {
      round++;
      logger.info('智能体循环轮次开始', {
        ...meta,
        phase: 'model',
        messageId,
        round,
        maxRounds: MAX_TOOL_ROUNDS,
        historyLength: this.deps.conversationRuntime.getHistory().length,
      });

      const modelEventId = `${messageId}-model-${round}`;
      const modelEventCreatedAt = Date.now();
      const modelStartedAt = performance.now();

      this.deps.eventBridge.emitProcessEvent(messageId, {
        id: modelEventId,
        kind: 'model',
        title: round === 1 ? '请求模型判断下一步' : '带工具结果继续请求模型',
        status: 'running',
        detail: `第 ${round} 轮，历史消息 ${this.deps.conversationRuntime.getHistory().length} 条`,
        createdAt: modelEventCreatedAt,
        updatedAt: modelEventCreatedAt,
      });

      // 流式调用模型，实时推送文字到 UI
      const previousContent = finalResponse;
      const { content, reasoningContent, toolCalls, error, usage, model } = await this.callModelWithToolsStream(
        userInput,
        (accumulated) => {
          streamCallbacks.onStreamChunk(messageId, previousContent + accumulated);
        },
        meta,
        activatedSkills
      );

      // 累积 usage
      if (usage) {
        accumulatedUsage.prompt_tokens += usage.prompt_tokens || 0;
        accumulatedUsage.completion_tokens += usage.completion_tokens || 0;
        accumulatedUsage.total_tokens += usage.total_tokens || 0;
      }
      if (model) {
        usedModel = model;
      }

      // 检查 API 是否返回错误
      if (error) {
        const errorMsg = error.message || '未知错误';
        const errorCode = error.code || '';
        logger.error('模型 API 返回错误', { ...meta, phase: 'model', messageId, round, errorCode, errorMsg });

        finalResponse = getErrorMessage(error);

        this.deps.eventBridge.emitProcessEvent(messageId, {
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

      const { validToolCalls, invalidSummaries } = this.validateToolCallsBeforeHistoryWrite(
        messageId,
        round,
        toolCalls,
        meta
      );
      allToolCallSummaries.push(...invalidSummaries);
      const activeToolCalls = validToolCalls;

      this.deps.eventBridge.emitProcessEvent(messageId, {
        id: modelEventId,
        kind: 'model',
        title: activeToolCalls.length > 0 ? '模型决定调用工具' : '模型直接生成回复',
        status: 'success',
        detail: activeToolCalls.length > 0
          ? activeToolCalls.map((tc: any) => tc.function?.name).filter(Boolean).join('、')
          : this.previewValue(content || finalResponse, 120),
        durationMs: Math.round(performance.now() - modelStartedAt),
        createdAt: modelEventCreatedAt,
        updatedAt: Date.now(),
      });

      logger.info('智能体循环轮次结束', {
        ...meta,
        phase: 'model',
        messageId,
        round,
        hasToolCalls: activeToolCalls.length > 0,
        toolNames: activeToolCalls.map((tc: any) => tc.function?.name).filter(Boolean),
        invalidToolCallCount: invalidSummaries.length,
        durationMs: Math.round(performance.now() - modelStartedAt),
        model,
      });

      // 处理 content 和 reasoningContent
      if (content) {
        const contentEventCreatedAt = Date.now();
        this.deps.eventBridge.emitProcessEvent(messageId, {
          id: `${modelEventId}-content`,
          kind: 'analysis',
          title: activeToolCalls.length > 0 ? '模型中间回复' : '模型返回内容',
          status: 'success',
          detail: activeToolCalls.length > 0
            ? '模型在调用工具前返回的 content，已放入思考过程，不直接作为最终回复。'
            : '模型 API 返回的 content。',
          resultPreview: content,
          createdAt: contentEventCreatedAt,
          updatedAt: contentEventCreatedAt,
        });
      }

      if (reasoningContent) {
        finalReasoningContent += reasoningContent;
        reasoningSegments.push({ round, content: reasoningContent, timestamp: Date.now() });
        const reasoningEventCreatedAt = Date.now();
        this.deps.eventBridge.emitProcessEvent(messageId, {
          id: `${modelEventId}-reasoning`,
          kind: 'analysis',
          title: activeToolCalls.length > 0 ? '模型思考并决定调用工具' : '模型思考过程',
          status: 'success',
          detail: `第 ${round} 轮模型返回的 reasoning_content`,
          resultPreview: reasoningContent,
          createdAt: reasoningEventCreatedAt,
          updatedAt: reasoningEventCreatedAt,
        });
      }

      // 只有带工具调用的中间轮次需要回填模型上下文。
      // 最终回复由 Orchestrator 在循环结束后统一写入，避免同一回答保存两次。
      if (activeToolCalls.length > 0) {
        this.deps.conversationRuntime.addMessage({
          id: `${messageId}-round${round}`,
          role: 'assistant',
          content: content || '',
          timestamp: Date.now(),
          sessionId: this.deps.conversationRuntime.getSessionId(),
          isInternal: true,
          ...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
          tool_calls: activeToolCalls,
        });
      }

      // 处理 content 的累积
      if (content && activeToolCalls.length === 0) {
        finalResponse += content;
      } else if (content && activeToolCalls.length > 0) {
        streamCallbacks.onStreamChunk(messageId, previousContent);
      }

      // 没有工具调用 → 最终文本回复
      if (activeToolCalls.length === 0) {
        if (!content && invalidSummaries.length > 0) {
          finalResponse += '工具调用参数不是合法 JSON，已停止本轮工具执行。';
        }
        logger.info('智能体循环结束：无需继续调用工具', {
          ...meta,
          phase: 'output',
          messageId,
          round,
          responseLength: finalResponse.length,
        });
        break;
      }

      logger.info('模型请求调用工具', {
        ...meta,
        phase: 'tool',
        messageId,
        round,
        toolCalls: activeToolCalls.map((tc: any) => ({
          id: tc.id,
          name: tc.function?.name,
          arguments: tc.function?.arguments,
        })),
      });

      // 执行所有工具调用，收集摘要
      const roundSummaries = await this.executeToolCalls(messageId, round, activeToolCalls, meta);
      allToolCallSummaries.push(...roundSummaries);

      // 检测技能入口工具调用，激活对应技能
      for (const tc of activeToolCalls) {
        const name = tc.function?.name;
        if (name && name.startsWith('open_')) {
          const skillName = name.replace('open_', '');
          if (SKILLS[skillName] && !activatedSkills.has(skillName)) {
            activatedSkills.add(skillName);
            logger.info('技能已激活', { ...meta, phase: 'skill', skillName });
          }
        }
      }
    }

    if (round >= MAX_TOOL_ROUNDS) {
      logger.warn('智能体循环达到最大轮次限制', {
        ...meta,
        phase: 'output',
        messageId,
        round,
        maxRounds: MAX_TOOL_ROUNDS,
      });
    }

    return {
      content: finalResponse,
      reasoningContent: finalReasoningContent,
      toolCallSummary: allToolCallSummaries,
      reasoningSegments: reasoningSegments.length > 0 ? reasoningSegments : undefined,
      usage: accumulatedUsage.total_tokens > 0 ? accumulatedUsage : undefined,
      model: usedModel || undefined,
    };
  }

  private validateToolCallsBeforeHistoryWrite(
    messageId: string,
    round: number,
    toolCalls: ToolCall[],
    meta: LogMeta = {}
  ): { validToolCalls: ToolCall[]; invalidSummaries: ToolCallSummary[] } {
    const validToolCalls: ToolCall[] = [];
    const invalidSummaries: ToolCallSummary[] = [];

    for (const toolCall of toolCalls) {
      if (hasValidToolCallArguments(toolCall)) {
        validToolCalls.push(toolCall);
        continue;
      }

      const toolName = toolCall.function?.name || 'unknown_tool';
      const rawArguments = toolCall.function?.arguments || '';
      let error = '参数不是合法 JSON';
      try {
        JSON.parse(rawArguments);
      } catch (parseError: any) {
        error = parseError?.message || error;
      }

      logger.error('模型返回非法工具调用，已阻止写入历史', {
        ...meta,
        phase: 'tool',
        messageId,
        round,
        toolCallId: toolCall.id,
        toolName,
        rawArguments,
        error,
      });

      this.deps.eventBridge.emitToolEvent(messageId, {
        id: toolCall.id || `${messageId}-${round}-${toolName}-invalid`,
        kind: 'tool',
        title: `${toolName} 参数解析失败`,
        toolName,
        argsPreview: this.previewValue(rawArguments),
        status: 'error',
        detail: rawArguments,
        resultPreview: `工具参数解析失败：${error}`,
        durationMs: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      invalidSummaries.push({
        name: toolName,
        argsPreview: this.previewValue(rawArguments, 100),
        resultPreview: `工具参数解析失败：${error}`,
        durationMs: 0,
        status: 'error',
      });
    }

    return { validToolCalls, invalidSummaries };
  }

  /**
   * 执行所有工具调用，返回摘要列表
   */
  private async executeToolCalls(
    messageId: string,
    round: number,
    toolCalls: any[],
    meta: LogMeta = {}
  ): Promise<ToolCallSummary[]> {
    const summaries: ToolCallSummary[] = [];

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
          ...meta,
          phase: 'tool',
          messageId,
          round,
          toolName,
          rawArguments: toolCall.function.arguments,
          error: parseError,
        });
        this.deps.eventBridge.emitToolEvent(messageId, {
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
        logger.info('开始执行工具', { ...meta, phase: 'tool', messageId, round, toolName, toolArgs });
        this.deps.eventBridge.emitToolEvent(messageId, {
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

        result = await executeTool(toolName, toolArgs, meta);
      }

      logger.info('工具执行结果', {
        ...meta,
        phase: 'tool',
        messageId,
        round,
        toolName,
        success: result.success,
        durationMs: Math.round(performance.now() - toolStartedAt),
        result: result.data || result.error,
      });
      this.deps.eventBridge.emitToolEvent(messageId, {
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

      // 截断过长的工具结果
      const truncatedResult = {
        ...result,
        data: result.data ? this.deps.contextCompactor.truncateToolResult(result.data) : result.data
      };

      // 工具结果必须以 role=tool 写回模型历史
      this.deps.conversationRuntime.addMessage({
        id: `${toolEventId}-result`,
        role: 'tool',
        content: JSON.stringify(truncatedResult),
        timestamp: Date.now(),
        sessionId: this.deps.conversationRuntime.getSessionId(),
        isInternal: true,
        tool_call_id: toolCall.id,
      });

      logger.info('工具结果已回填到模型上下文', {
        ...meta,
        phase: 'tool',
        messageId,
        round,
        toolName,
        toolCallId: toolCall.id,
        truncated: Boolean(result.data && truncatedResult.data !== result.data),
      });

      // 收集工具调用摘要
      summaries.push({
        name: toolName,
        argsPreview: this.previewValue(toolArgs, 100),
        resultPreview: this.previewValue(result.data || result.error || '', 100),
        durationMs: Math.round(performance.now() - toolStartedAt),
        status: result.success ? 'success' : 'error',
      });
    }

    return summaries;
  }

  /**
   * 流式调用模型（带 Function Calling）
   */
  private async callModelWithToolsStream(
    userInput: string,
    onTextDelta: (accumulated: string) => void,
    meta: LogMeta = {},
    activatedSkills: Set<string> = new Set()
  ): Promise<{ content: string; reasoningContent: string; toolCalls: any[]; error?: any; usage?: any; model?: string }> {
    const skillInstructions = getSkillInstructionsForActive(activatedSkills);
    const runtime = getResolvedRuntimeModel();
    const currentToolDefs = this.shouldAttachTools(userInput, runtime.provider)
      ? getToolDefinitionsForActiveSkills(activatedSkills)
      : [];
    const systemPrompt = await this.deps.buildSystemPrompt(userInput, skillInstructions, currentToolDefs);
    const history = this.deps.conversationRuntime.getHistory();
    const latestUserMessage = [...history].reverse().find((message) => message.role === 'user');
    const hasImageAttachment = history.some((message) => message.role === 'user' && message.attachments?.some((attachment) => attachment.type === 'image'));
    const requestModel = resolveModelForRequest(runtime, hasImageAttachment);
    if (requestModel !== runtime.modelId) {
      logger.info('图片任务自动路由', {
        ...meta,
        phase: 'model',
        provider: runtime.provider,
        selectedModel: runtime.modelId,
        resolvedModel: requestModel,
        latestUserAttachmentCount: latestUserMessage?.attachments?.length || 0,
      });
    }

    if (currentToolDefs.length === 0) {
      logger.info('本轮未附带工具定义', {
        ...meta,
        phase: 'model',
        provider: runtime.provider,
        reason: 'no_tool_intent',
        textPreview: userInput.slice(0, 40),
      });
    }

    const context = await buildModelContextWithDiagnostics(history, {
      provider: runtime.provider,
      maxMessages: DEFAULT_MODEL_CONTEXT_MESSAGES,
      includeRecentTools: true,
      summarizeOldTools: true,
      readAttachmentDataUrl: this.readAttachmentDataUrl.bind(this),
    });
    const droppedReasonCounts = context.diagnostics.dropped.reduce<Record<string, number>>((counts, item) => {
      counts[item.reason] = (counts[item.reason] || 0) + 1;
      return counts;
    }, {});

    const requestBody = {
      model: requestModel,
      messages: [
        { role: 'system', content: systemPrompt },
        ...context.messages
      ],
      tools: currentToolDefs,
      stream: true,
      traceId: meta.traceId,
      caller: 'mainAgent',
    };

    logger.info('模型上下文构建完成', {
      ...meta,
      phase: 'model',
      provider: runtime.provider,
      rawCount: context.diagnostics.rawCount,
      normalizedCount: context.diagnostics.normalizedCount,
      sanitizedCount: context.diagnostics.sanitizedCount,
      roles: context.diagnostics.roles,
      hasToolCalls: context.diagnostics.hasToolCalls,
      hasToolMessages: context.diagnostics.hasToolMessages,
      droppedCount: context.diagnostics.dropped.length,
      droppedReasonCounts,
    });

    if (isVerboseAgentLog()) {
      logger.debug('模型上下文清洗详情', {
        ...meta,
        phase: 'model',
        dropped: context.diagnostics.dropped.map((item) => ({
          id: item.id,
          role: item.role,
          reason: item.reason,
        })),
      });
      logger.debug('主Agent 流式请求完整载荷', {
        ...meta,
        phase: 'model',
        requestBody,
      });
    }

    const provider = getModelProvider();
    if (!provider.chatWithToolsStream) {
      // 降级：provider 不支持流式
      logger.info('当前模型提供商不支持流式，降级为非流式调用', { ...meta, phase: 'model' });
      const response = await provider.chatWithTools(requestBody as any);
      if (response.error) return { content: '', reasoningContent: '', toolCalls: [], error: response.error };
      const msg = response.choices[0]?.message;
      const content = getTextContent(msg?.content);
      const reasoningContent = msg?.reasoning_content || '';
      const toolCalls = msg?.tool_calls || [];
      if (content) onTextDelta(content);
      return { content, reasoningContent, toolCalls, usage: response.usage, model: response.model };
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
    const content = getTextContent(msg?.content) || accumulated;
    const reasoningContent = msg?.reasoning_content || '';
    const toolCalls = msg?.tool_calls || [];
    logger.info('本轮模型响应完成', {
      ...meta,
      phase: 'model',
      model: response.model,
      finishReason: response.choices[0]?.finish_reason ?? null,
      contentLength: content.length,
      accumulatedTextLength: accumulated.length,
      reasoningContentLength: reasoningContent.length,
      toolCallCount: toolCalls.length,
      hasContentMismatch: content.length !== accumulated.length,
    });
    return {
      content,
      reasoningContent,
      toolCalls,
      usage: response.usage,
      model: response.model,
    };
  }

  /**
   * 获取当前活跃的模型 ID
   * 从 modelRuntime 获取，而不是 Orchestrator 维护
   */
  private getActiveRequestModel(): string {
    return getResolvedRuntimeModel().modelId;
  }

  private async readAttachmentDataUrl(attachment: Attachment): Promise<string | null> {
    const result = await window.electronAPI?.attachmentReadDataUrl?.(attachment.relativePath, attachment.mimeType);
    if (!result?.success || !result.data) {
      logger.warn('读取聊天附件失败，跳过', {
        attachmentId: attachment.id,
        name: attachment.name,
        type: attachment.type,
        error: result?.error,
      });
      return null;
    }
    return result.data;
  }

  private shouldAttachTools(userInput: string, provider: string): boolean {
    const trimmed = userInput.trim();
    if (!trimmed) return false;

    // MiMo 对工具 prefill 校验更严格。纯数字/纯符号短消息没有工具意图，避免无意义工具列表参与 prefill。
    if (provider === 'mimo' && trimmed.length <= 12 && !/[A-Za-z\u4e00-\u9fa5]/.test(trimmed)) {
      return false;
    }

    return true;
  }

  /**
   * 生成适合 UI 展示的短摘要
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
}

/**
 * 开发环境是否输出完整请求/响应
 */
function isVerboseAgentLog(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  if (import.meta.env.VITE_VERBOSE_AGENT_LOGS === 'true') return true;
  try {
    return localStorage.getItem('nova.log.verboseAgentPayload') === 'true';
  } catch {
    return false;
  }
}
