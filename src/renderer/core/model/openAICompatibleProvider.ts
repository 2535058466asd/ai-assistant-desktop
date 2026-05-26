import { createLogger } from '../../../shared/logger';
import type { ChatWithToolsRequest, ModelProvider, ModelResponse, StreamChunk } from './types';
import { modelFetch, modelFetchStream } from './modelTransport';
import { normalizeError } from './modelErrorHandler';
import { withRetry } from './modelRetry';

const logger = createLogger('model');

// 是否打印完整模型请求/响应。调试时很有用，但生产环境不要泄露 prompt、历史和工具参数。
function isVerboseModelLog(): boolean {
  return process.env.NODE_ENV !== 'production' && import.meta.env.VITE_VERBOSE_AGENT_LOGS !== 'false';
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
  private requiresReasoningContentRoundTrip: boolean;

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
    this.requiresReasoningContentRoundTrip =
      config.id === 'mimo' ||
      this.baseUrl.includes('xiaomimimo.com');
  }

  private normalizeMessages(request: ChatWithToolsRequest): ChatWithToolsRequest['messages'] {
    if (!this.requiresReasoningContentRoundTrip) return request.messages;
    return request.messages.map((message) => {
      if (message.role !== 'assistant') return message;
      return {
        ...message,
        reasoning_content: message.reasoning_content ?? '',
      };
    });
  }

  async chatWithTools(request: ChatWithToolsRequest): Promise<ModelResponse> {
    return withRetry(async () => {
      try {
        const endpoint = `${this.baseUrl}/chat/completions`;
        const body = {
          model: request.model,
          messages: this.normalizeMessages(request),
          tools: request.tools,
          stream: request.stream ?? false,
          temperature: request.temperature ?? this.temperature,
          max_tokens: request.maxTokens ?? this.maxTokens,
        };

        if (isVerboseModelLog()) {
          logger.info(`${this.displayName} 即将发送 HTTP 请求`, { endpoint, body });
        }

        const response = await modelFetch({
          endpoint,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
        });

        logger.debug(`${this.displayName} HTTP 状态`, { status: response.status, ok: response.ok, statusText: response.statusText });

        if (!response.ok) {
          const errorText = response.body || '';
          throw new Error(`API请求失败 (${response.status}): ${errorText || response.statusText}`);
        }

        const json = JSON.parse(response.body);
        if (isVerboseModelLog()) {
          logger.info(`${this.displayName} 返回完整 JSON`, json);
        }
        return json;
      } catch (error: any) {
        const normalized = normalizeError(error, this.displayName);
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
      const body = {
        model: request.model,
        messages: this.normalizeMessages(request),
        tools: request.tools,
        stream: true,
        temperature: request.temperature ?? this.temperature,
        max_tokens: request.maxTokens ?? this.maxTokens,
      };

      if (isVerboseModelLog()) {
        logger.info(`${this.displayName} 即将发送流式 HTTP 请求`, { endpoint, body });
      }

      // 流式接口不是一次返回完整 JSON，而是一行行 SSE：data: {...}
      // 这里把 text delta 和 tool_calls delta 重新拼成一个完整的 ModelResponse。
      let buffer = '';
      let accumulatedContent = '';
      let accumulatedReasoningContent = '';
      const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];
      let finishReason: string | null = null;
      let responseId = '';
      let responseModel = '';

      const response = await modelFetchStream({
        endpoint,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      }, (chunkText) => {
        buffer += chunkText;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            onChunk({ type: 'done' });
            continue;
          }

          try {
            const parsed = JSON.parse(data);
            if (parsed.id) responseId = parsed.id;
            if (parsed.model) responseModel = parsed.model;

            const choice = parsed.choices?.[0];
            if (!choice) continue;
            if (choice.finish_reason) finishReason = choice.finish_reason;

            const delta = choice.delta;
            if (!delta) continue;

            if (delta.content) {
              accumulatedContent += delta.content;
              onChunk({ type: 'text_delta', textDelta: delta.content });
            }
            if (delta.reasoning_content) {
              accumulatedReasoningContent += delta.reasoning_content;
            }

            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                // 同一个工具调用的 name / arguments 可能被拆成多段 delta，需要按 index 累积。
                while (toolCalls.length <= idx) {
                  toolCalls.push({ id: '', name: '', arguments: '' });
                }
                if (tc.id) toolCalls[idx].id = tc.id;
                if (tc.function?.name) toolCalls[idx].name = tc.function.name;
                if (tc.function?.arguments) toolCalls[idx].arguments += tc.function.arguments;
                onChunk({
                  type: 'tool_call_delta',
                  toolCallIndex: idx,
                  toolCallDelta: {
                    id: tc.id,
                    name: tc.function?.name,
                    argumentsDelta: tc.function?.arguments,
                  },
                });
              }
            }
          } catch {
            // 忽略解析错误的行
          }
        }
      });

      logger.debug(`${this.displayName} 流式 HTTP 状态`, { status: response.status, ok: response.ok, statusText: response.statusText });

      if (!response.ok) {
        const errorText = response.body || '';
        throw new Error(`API请求失败 (${response.status}): ${errorText || response.statusText}`);
      }

      // Orchestrator 期望拿到一个类似非流式接口的完整响应，所以这里做一次汇总。
      const message: any = { role: 'assistant', content: accumulatedContent || null };
      if (accumulatedReasoningContent) {
        message.reasoning_content = accumulatedReasoningContent;
      }
      if (toolCalls.length > 0 && toolCalls.some(tc => tc.name)) {
        message.tool_calls = toolCalls
          .filter(tc => tc.name)
          .map((tc, i) => ({
            id: tc.id || `call_${i}`,
            type: 'function' as const,
            function: { name: tc.name, arguments: tc.arguments },
          }));
      }

      const result = {
        id: responseId,
        model: responseModel,
        choices: [{ message, finish_reason: finishReason }],
      };

      if (isVerboseModelLog()) {
        logger.info(`${this.displayName} 流式响应汇总`, result);
      }

      return result;
    } catch (error: any) {
      const normalized = normalizeError(error, this.displayName);
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
    return response.choices[0]?.message?.content || '无重要信息';
  }
}
