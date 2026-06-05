import { createLogger } from '../../../shared/logger';
import { getTextContent, type ChatWithToolsRequest, type ModelMessage, type ModelProvider, type ModelResponse, type StreamChunk } from './types';
import { modelFetch, modelFetchStream } from './modelTransport';
import { normalizeError } from './modelErrorHandler';
import { createSSEAccumulator, handleSSEChunk } from './sseParser';
import { withRetry } from './modelRetry';

const logger = createLogger('model');

// 是否打印完整模型请求/响应。调试时很有用，但生产环境不要泄露 prompt、历史和工具参数。
function isVerboseModelLog(): boolean {
  return process.env.NODE_ENV !== 'production' && import.meta.env.VITE_VERBOSE_AGENT_LOGS !== 'false';
}

function summarizeRequest(request: ChatWithToolsRequest) {
  return {
    traceId: request.traceId,
    phase: 'model',
    model: request.model,
    stream: request.stream ?? false,
    roles: request.messages.map((message) => message.role),
    messageCount: request.messages.length,
    toolCount: request.tools?.length || 0,
  };
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
        const toolCalls = message.tool_calls || [];
        const hasToolCalls = toolCalls.length > 0;
        if (!hasToolCalls && !this.hasUsableContent(message)) {
          continue;
        }

        if (hasToolCalls) {
          for (const toolCall of toolCalls) {
            if (toolCall.id) pendingToolCallIds.add(toolCall.id);
          }
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

        logger.info(`${this.displayName} 即将发送 HTTP 请求摘要`, {
          ...summarizeRequest({ ...request, messages }),
          endpoint,
        });
        if (isVerboseModelLog()) {
          logger.info(`${this.displayName} 即将发送 HTTP 请求`, { traceId: request.traceId, phase: 'model', endpoint, body });
        }

        const response = await modelFetch({
          endpoint,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
        });

        logger.debug(`${this.displayName} HTTP 状态`, {
          traceId: request.traceId,
          phase: 'model',
          status: response.status,
          ok: response.ok,
          statusText: response.statusText,
          responseBodyLength: response.body?.length || 0,
        });

        if (!response.ok) {
          const errorText = response.body || '';
          throw new Error(`API请求失败 (${response.status}): ${errorText || response.statusText}`);
        }

        if (!response.body?.trim()) {
          throw new Error(`API请求失败 (${response.status}): 响应体为空`);
        }

        const json = JSON.parse(response.body);
        if (isVerboseModelLog()) {
          logger.info(`${this.displayName} 返回完整 JSON`, { traceId: request.traceId, phase: 'model', response: json });
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

      logger.info(`${this.displayName} 即将发送流式 HTTP 请求摘要`, {
        ...summarizeRequest({ ...request, messages, stream: true }),
        endpoint,
      });
      if (isVerboseModelLog()) {
        logger.info(`${this.displayName} 即将发送流式 HTTP 请求`, { traceId: request.traceId, phase: 'model', endpoint, body });
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

      logger.debug(`${this.displayName} 流式 HTTP 状态`, {
        traceId: request.traceId,
        phase: 'model',
        status: response.status,
        ok: response.ok,
        statusText: response.statusText,
        responseBodyLength: response.body?.length || 0,
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

      if (isVerboseModelLog()) {
        logger.info(`${this.displayName} 流式响应汇总`, { traceId: request.traceId, phase: 'model', response: result });
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
