import { createLogger } from '../../../shared/logger';
import { getTextContent, type ChatWithToolsRequest, type ModelMessage, type ModelProvider, type ModelResponse, type StreamChunk } from './types';
import { modelFetch, modelFetchStream } from './modelTransport';
import { normalizeError } from './modelErrorHandler';
import { createSSEAccumulator, getSSEDiagnostics, handleSSEChunk } from './sseParser';
import { withRetry } from './modelRetry';

const logger = createLogger('modelProvider');

// 是否打印完整模型请求/响应。调试时很有用，但生产环境不要泄露 prompt、历史和工具参数。
function isVerboseModelLog(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  if (import.meta.env.VITE_VERBOSE_MODEL_LOGS === 'true') return true;
  try {
    return localStorage.getItem('nova.log.verboseModelPayload') === 'true';
  } catch {
    return false;
  }
}

function previewText(value: unknown, maxLength = 300): string {
  const text = getTextContent(value as any) || (typeof value === 'string' ? value : '');
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function summarizeMessages(messages: ChatWithToolsRequest['messages']) {
  return messages.map((message, index) => ({
    index,
    role: message.role,
    contentType: Array.isArray(message.content) ? 'array' : typeof message.content,
    contentLength: typeof message.content === 'string'
      ? message.content.length
      : Array.isArray(message.content)
        ? message.content.length
        : 0,
    contentPreview: previewText(message.content),
    hasToolCalls: Boolean(message.tool_calls?.length),
    toolCallCount: message.tool_calls?.length || 0,
    hasReasoningContent: Boolean(message.reasoning_content?.trim()),
    reasoningPreview: previewText(message.reasoning_content),
    toolCallId: message.tool_call_id,
  }));
}

function summarizeRequest(request: ChatWithToolsRequest, endpoint: string, provider: string) {
  return {
    traceId: request.traceId,
    phase: 'model',
    provider,
    caller: request.caller,
    model: request.model,
    endpoint,
    stream: request.stream ?? false,
    roles: request.messages.map((message) => message.role),
    messageCount: request.messages.length,
    toolCount: request.tools?.length || 0,
    request: {
      messages: summarizeMessages(request.messages),
      tools: (request.tools || []).map((tool) => tool.function.name),
      temperature: request.temperature,
      maxTokens: request.maxTokens,
    },
  };
}

function summarizeResponse(
  response: ModelResponse,
  request: ChatWithToolsRequest,
  provider: string,
  status?: { status: number; ok: boolean; statusText: string }
) {
  const message = response.choices[0]?.message;
  const content = getTextContent(message?.content);
  const reasoning = message?.reasoning_content || '';
  const toolCalls = message?.tool_calls || [];
  return {
    traceId: request.traceId,
    phase: 'model',
    provider,
    caller: request.caller,
    model: response.model || request.model,
    status: status?.status,
    ok: status?.ok,
    statusText: status?.statusText,
    finishReason: response.choices[0]?.finish_reason ?? null,
    response: {
      contentPreview: previewText(content),
      contentLength: content.length,
      reasoningPreview: previewText(reasoning),
      reasoningLength: reasoning.length,
      toolCallCount: toolCalls.length,
      toolCalls: toolCalls.map((toolCall) => ({
        id: toolCall.id,
        name: toolCall.function?.name,
        argumentsPreview: previewText(toolCall.function?.arguments, 180),
      })),
    },
  };
}

function hasValidToolCallArguments(toolCall: NonNullable<ModelMessage['tool_calls']>[number]): boolean {
  const rawArguments = toolCall.function?.arguments;
  if (typeof rawArguments !== 'string' || rawArguments.trim().length === 0) return false;
  try {
    JSON.parse(rawArguments);
    return true;
  } catch {
    return false;
  }
}

export interface OpenAICompatibleProviderConfig {
  id: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  compactModel?: string;
  temperature?: number;
  maxTokens?: number;
}

export class OpenAICompatibleProvider implements ModelProvider {
  id: string;
  displayName: string;
  defaultModel: string;
  compactModel: string;
  private baseUrl: string;
  private apiKey: string;
  private temperature?: number;
  private maxTokens?: number;

  constructor(config: OpenAICompatibleProviderConfig) {
    this.id = config.id;
    this.displayName = config.displayName;
    // 统一把 baseUrl 规范成 /v1 这种基础地址，避免用户误填 /v1/chat/completions 后重复拼路径。
    this.baseUrl = config.baseUrl
      .replace(/\/$/, '')
      .replace(/\/chat\/completions$/, '');
    this.apiKey = config.apiKey;
    this.defaultModel = config.defaultModel;
    this.compactModel = config.compactModel || config.defaultModel;
    this.temperature = config.temperature;
    this.maxTokens = config.maxTokens;
  }

  private normalizeMessages(request: ChatWithToolsRequest): ChatWithToolsRequest['messages'] {
    const normalized = request.messages.map((message) => {
      if (message.role !== 'assistant') return message;
      if (message.reasoning_content && message.reasoning_content.trim()) return message;

      const { reasoning_content: _emptyReasoningContent, ...rest } = message;
      return rest;
    });

    return this.pruneInvalidOpenAIMessages(normalized);
  }

  private hasUsableContent(message: ModelMessage): boolean {
    if (typeof message.content === 'string') return message.content.trim().length > 0;
    if (Array.isArray(message.content)) return message.content.length > 0;
    return false;
  }

  private pruneInvalidOpenAIMessages(messages: ModelMessage[]): ModelMessage[] {
    const result: ModelMessage[] = [];
    const pendingToolCallIds = new Set<string>();

    for (const message of messages) {
      if (message.role === 'tool') {
        if (message.tool_call_id && pendingToolCallIds.has(message.tool_call_id)) {
          result.push(message);
          pendingToolCallIds.delete(message.tool_call_id);
        }
        continue;
      }

      if (message.role === 'assistant') {
        const toolCalls = (message.tool_calls || []).filter(hasValidToolCallArguments);
        const hasToolCalls = toolCalls.length > 0;
        if (!hasToolCalls && !this.hasUsableContent(message)) {
          continue;
        }

        if (hasToolCalls) {
          message.tool_calls = toolCalls;
          for (const toolCall of toolCalls) {
            if (toolCall.id) pendingToolCallIds.add(toolCall.id);
          }
        } else {
          delete message.tool_calls;
        }
      }

      if (message.role === 'user' && !this.hasUsableContent(message)) {
        continue;
      }

      result.push(message);
    }

    return result;
  }

  async chatWithTools(request: ChatWithToolsRequest): Promise<ModelResponse> {
    return withRetry(async () => {
      try {
        const endpoint = `${this.baseUrl}/chat/completions`;
        const messages = this.normalizeMessages(request);
        const body = {
          model: request.model,
          messages,
          tools: request.tools,
          stream: request.stream ?? false,
          temperature: request.temperature ?? this.temperature,
          max_tokens: request.maxTokens ?? this.maxTokens,
        };

        const normalizedRequest = { ...request, messages };
        logger.info(`${this.displayName} HTTP 请求开始`, summarizeRequest(normalizedRequest, endpoint, this.id));
        if (isVerboseModelLog()) {
          logger.debug(`${this.displayName} HTTP 完整请求`, { traceId: request.traceId, phase: 'model', endpoint, body });
        }

        const response = await modelFetch({
          endpoint,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = response.body || '';
          throw new Error(`API请求失败 (${response.status}): ${errorText || response.statusText}`);
        }

        if (!response.body?.trim()) {
          throw new Error(`API请求失败 (${response.status}): 响应体为空`);
        }

        const json = JSON.parse(response.body);
        logger.info(`${this.displayName} HTTP 响应完成`, summarizeResponse(json, normalizedRequest, this.id, response));
        if (isVerboseModelLog()) {
          logger.debug(`${this.displayName} HTTP 完整响应`, { traceId: request.traceId, phase: 'model', response: json });
        }
        return json;
      } catch (error: any) {
        const normalized = normalizeError(error, this.displayName, { traceId: request.traceId, phase: 'model' });
        if (normalized.retryable) {
          throw normalized;
        }
        return {
          choices: [],
          error: normalized,
        };
      }
    }, {
      retryableCheck: (error) => error?.retryable === true,
    });
  }

  async chatWithToolsStream(
    request: ChatWithToolsRequest,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<ModelResponse> {
    try {
      const endpoint = `${this.baseUrl}/chat/completions`;
      const messages = this.normalizeMessages(request);
      const body = {
        model: request.model,
        messages,
        tools: request.tools,
        stream: true,
        temperature: request.temperature ?? this.temperature,
        max_tokens: request.maxTokens ?? this.maxTokens,
      };

      const normalizedRequest = { ...request, messages, stream: true };
      logger.info(`${this.displayName} 流式请求开始`, summarizeRequest(normalizedRequest, endpoint, this.id));
      if (isVerboseModelLog()) {
        logger.debug(`${this.displayName} 流式完整请求`, { traceId: request.traceId, phase: 'model', endpoint, body });
      }

      // 流式接口不是一次返回完整 JSON，而是一行行 SSE：data: {...}
      // 这里把 text delta 和 tool_calls delta 重新拼成一个完整的 ModelResponse。
      const acc = createSSEAccumulator();

      const response = await modelFetchStream({
        endpoint,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      }, (chunkText) => {
        handleSSEChunk(acc, chunkText, onChunk);
      });

      if (!response.ok) {
        const errorText = response.body || '';
        throw new Error(`API请求失败 (${response.status}): ${errorText || response.statusText}`);
      }

      // Orchestrator 期望拿到一个类似非流式接口的完整响应，所以这里做一次汇总。
      const message: any = { role: 'assistant', content: acc.accumulatedContent || null };
      if (acc.accumulatedReasoningContent) {
        message.reasoning_content = acc.accumulatedReasoningContent;
      }
      if (acc.toolCalls.length > 0 && acc.toolCalls.some(tc => tc.name)) {
        message.tool_calls = acc.toolCalls
          .filter(tc => tc.name)
          .map((tc, i) => ({
            id: tc.id || `call_${i}`,
            type: 'function' as const,
            function: { name: tc.name, arguments: tc.arguments },
          }));
      }

      const result = {
        id: acc.responseId,
        model: acc.responseModel,
        choices: [{ message, finish_reason: acc.finishReason }],
      };

      logger.info(`${this.displayName} 流式响应完成`, {
        ...summarizeResponse(result, normalizedRequest, this.id, response),
        diagnostics: getSSEDiagnostics(acc),
      });
      if (isVerboseModelLog()) {
        logger.debug(`${this.displayName} 流式完整响应`, { traceId: request.traceId, phase: 'model', response: result });
      }

      return result;
    } catch (error: any) {
      const normalized = normalizeError(error, this.displayName, { traceId: request.traceId, phase: 'model' });
      return {
        choices: [],
        error: normalized,
      };
    }
  }

  async compact(messages: ChatWithToolsRequest['messages']): Promise<string> {
    const response = await this.chatWithTools({
      model: this.compactModel,
      messages: [
        { role: 'system', content: '你只负责压缩对话历史，不做其他回答。' },
        {
          role: 'user',
          content: messages.map((msg) => `${msg.role}: ${msg.content || ''}`).join('\n'),
        },
      ],
    });
    return getTextContent(response.choices[0]?.message?.content) || '无重要信息';
  }
}
