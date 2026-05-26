// ==========================================
// Agent 循环模块
// 实现 Function Calling 的核心循环逻辑
// ==========================================

import type {
  Message,
  AgentProcessEvent,
  ToolProcessEvent,
  ToolCallSummary,
} from '../../types';

import type { HistoryManager } from '../history';
import type { ConversationRuntime } from '../conversation/conversationRuntime';
import type { ContextCompactor } from '../context/contextCompactor';
import type { AgentEventBridge } from '../events/agentEventBridge';
import { toolDefinitions } from '../tools/toolDefinitions';
import { executeTool, type ToolExecutionResult } from '../tools/toolExecutor';
import { getModelProvider, type ModelMessage, type StreamChunk } from '../model';
import { getResolvedRuntimeModel } from '../model/modelRuntime';
import { getErrorMessage } from '../model/modelErrorHandler';
import { createLogger } from '../../../shared/logger';

const logger = createLogger('agent');

// 最大工具调用轮次
const MAX_TOOL_ROUNDS = 5;

/**
 * Agent 循环依赖接口
 */
export interface AgentLoopDependencies {
  historyManager: HistoryManager;
  conversationRuntime: ConversationRuntime;
  contextCompactor: ContextCompactor;
  eventBridge: AgentEventBridge;
  buildSystemPrompt: (userInput: string) => Promise<string>;
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
  constructor(private readonly deps: AgentLoopDependencies) {}

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
    streamCallbacks: AgentLoopStreamCallbacks
  ): Promise<AgentLoopResult> {
    let finalResponse = '';
    let finalReasoningContent = '';
    const allToolCallSummaries: ToolCallSummary[] = [];
    const reasoningSegments: Array<{ round: number; content: string; timestamp: number }> = [];
    let round = 0;
    let accumulatedUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    let usedModel = '';

    while (round < MAX_TOOL_ROUNDS) {
      round++;
      logger.info('智能体循环轮次开始', {
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
          // 跨轮次累积：前面轮次的文字 + 当前轮次的流式文字
          streamCallbacks.onStreamChunk(messageId, previousContent + accumulated);
        }
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
        logger.error('模型 API 返回错误', { errorCode, errorMsg });

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

      this.deps.eventBridge.emitProcessEvent(messageId, {
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

      // 处理 content 和 reasoningContent
      if (content) {
        const contentEventCreatedAt = Date.now();
        this.deps.eventBridge.emitProcessEvent(messageId, {
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
        reasoningSegments.push({ round, content: reasoningContent, timestamp: Date.now() });
        const reasoningEventCreatedAt = Date.now();
        this.deps.eventBridge.emitProcessEvent(messageId, {
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
        sessionId: this.deps.conversationRuntime.getSessionId(),
        ...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      };
      this.deps.conversationRuntime.addMessage(assistantMsgForBrain);

      // 处理 content 的累积
      if (content && toolCalls.length === 0) {
        finalResponse += content;
      } else if (content && toolCalls.length > 0) {
        streamCallbacks.onStreamChunk(messageId, previousContent);
      }

      // 没有工具调用 → 最终文本回复
      if (toolCalls.length === 0) {
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

      // 执行所有工具调用，收集摘要
      const roundSummaries = await this.executeToolCalls(messageId, round, toolCalls);
      allToolCallSummaries.push(...roundSummaries);
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

  /**
   * 执行所有工具调用，返回摘要列表
   */
  private async executeToolCalls(
    messageId: string,
    round: number,
    toolCalls: any[]
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
        logger.info('开始执行工具', { toolName, toolArgs });
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

        result = await executeTool(toolName, toolArgs);
      }

      logger.info('工具执行结果', { toolName, success: result.success, result: result.data || result.error });
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
        tool_call_id: toolCall.id,
      });

      logger.info('工具结果已回填到模型上下文', {
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
    onTextDelta: (accumulated: string) => void
  ): Promise<{ content: string; reasoningContent: string; toolCalls: any[]; error?: any; usage?: any; model?: string }> {
    const systemPrompt = await this.deps.buildSystemPrompt(userInput);

    const requestBody = {
      model: this.getActiveRequestModel(),
      messages: [
        { role: 'system', content: systemPrompt },
        ...this.deps.conversationRuntime.getHistoryForLLM()
      ],
      tools: toolDefinitions,
      stream: true,
    };

    if (isVerboseAgentLog()) {
      logger.info('发送给模型的流式请求', requestBody);
    }

    const provider = getModelProvider();
    if (!provider.chatWithToolsStream) {
      // 降级：provider 不支持流式
      logger.info('当前模型提供商不支持流式，降级为非流式调用');
      const response = await provider.chatWithTools(requestBody as any);
      if (response.error) return { content: '', reasoningContent: '', toolCalls: [], error: response.error };
      const msg = response.choices[0]?.message;
      const content = msg?.content || '';
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
    return {
      content: msg?.content || accumulated,
      reasoningContent: msg?.reasoning_content || '',
      toolCalls: msg?.tool_calls || [],
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
  return process.env.NODE_ENV !== 'production' && import.meta.env.VITE_VERBOSE_AGENT_LOGS !== 'false';
}
