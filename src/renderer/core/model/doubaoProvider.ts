import apiConfig from '../../config/apiConfig';
import { createLogger } from '../../../shared/logger';
import type { ChatWithToolsRequest, ModelError, ModelProvider, ModelResponse, StreamChunk } from './types';
import { modelFetch, modelFetchStream } from './modelTransport';

const logger = createLogger('model');
const DEFAULT_ARK_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
type DoubaoProviderConfig = typeof apiConfig & { compactModel?: string };

// 开发时打印完整请求和响应，方便你在 Electron 控制台看 API 到底返回了什么。
function isVerboseModelLog(): boolean {
  return process.env.NODE_ENV !== 'production' && import.meta.env.VITE_VERBOSE_MODEL_LOGS !== 'false';
}

// 把不同来源的错误整理成统一格式，Orchestrator 才能用同一套逻辑展示给用户。
function normalizeError(error: any): ModelError {
  const rawMessage = error?.message || '';
  const jsonMatch = typeof rawMessage === 'string' ? rawMessage.match(/\{.*\}$/s) : null;
  let parsedError: any = null;
  if (jsonMatch) {
    try {
      parsedError = JSON.parse(jsonMatch[0]);
    } catch {
      parsedError = null;
    }
  }

  const code =
    error?.code ||
    error?.error?.code ||
    error?.response?.data?.error?.code ||
    parsedError?.error?.code ||
    'ModelProviderError';
  const message =
    parsedError?.error?.message ||
    error?.error?.message ||
    error?.response?.data?.error?.message ||
    error?.message ||
    '模型请求失败';
  const isAuthError = /auth|unauthorized|invalid.?api.?key|401|403/i.test(`${code} ${message}`);
  return {
    code,
    message,
    retryable: !isAuthError && /timeout|rate|429|5\d\d/i.test(`${code} ${message}`),
  };
}

export class DoubaoProvider implements ModelProvider {
  id = 'doubao';
  displayName = '豆包';
  defaultModel: string;
  compactModel: string;
  private apiKey: string;
  private apiUrl: string;
  private temperature?: number;
  private maxTokens?: number;

  constructor(config: DoubaoProviderConfig = apiConfig) {
    this.apiKey = config.apiKey;
    this.apiUrl = config.apiUrl;
    this.defaultModel = config.model;
    this.compactModel = config.compactModel || 'doubao-1-5-lite-32k-250115';
    this.temperature = config.temperature;
    this.maxTokens = config.maxTokens;
  }

  async chatWithTools(request: ChatWithToolsRequest): Promise<ModelResponse> {
    try {
      // 兼容旧配置：如果 apiUrl 还是本地代理路径，就回退到默认 ARK 地址。
      const endpoint = this.apiUrl && !this.apiUrl.startsWith('/api')
        ? this.apiUrl
        : DEFAULT_ARK_API_URL;
      const requestBody = {
        model: request.model,
        messages: request.messages,
        tools: request.tools,
        stream: request.stream ?? false,
        temperature: request.temperature ?? this.temperature,
        max_tokens: request.maxTokens ?? this.maxTokens,
      };

      if (isVerboseModelLog()) {
        logger.info('即将向豆包发送 HTTP 请求', {
          endpoint,
          body: requestBody,
        });
      }

      const response = await modelFetch({
        endpoint,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      logger.debug('豆包 HTTP 响应状态', {
        status: response.status,
        ok: response.ok,
        statusText: response.statusText,
      });

      if (!response.ok) {
        const errorText = response.body || '';
        throw new Error(`API请求失败 (${response.status}): ${errorText || response.statusText}`);
      }

      const responseJson = JSON.parse(response.body);
      if (isVerboseModelLog()) {
        logger.info('豆包返回完整 JSON', responseJson);
      }

      return responseJson;
    } catch (error) {
      const normalized = normalizeError(error);
      logger.error('豆包请求失败', normalized);
      return {
        choices: [],
        error: normalized,
      };
    }
  }

  async chatWithToolsStream(
    request: ChatWithToolsRequest,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<ModelResponse> {
    try {
      const endpoint = this.apiUrl && !this.apiUrl.startsWith('/api')
        ? this.apiUrl
        : DEFAULT_ARK_API_URL;
      const requestBody = {
        model: request.model,
        messages: request.messages,
        tools: request.tools,
        stream: true,
        temperature: request.temperature ?? this.temperature,
        max_tokens: request.maxTokens ?? this.maxTokens,
      };

      if (isVerboseModelLog()) {
        logger.info('即将向豆包发送流式请求', { endpoint, body: requestBody });
      }

      // 豆包流式返回也是 SSE，需要把分片 content 和 tool_calls 重新组装。
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
        body: JSON.stringify(requestBody),
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

            // 文字增量
            if (delta.content) {
              accumulatedContent += delta.content;
              onChunk({ type: 'text_delta', textDelta: delta.content });
            }
            if (delta.reasoning_content) {
              accumulatedReasoningContent += delta.reasoning_content;
            }

            // 工具调用增量
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                // arguments 通常会被拆成多段 JSON 字符串片段，所以必须持续追加。
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

      logger.debug('豆包流式 HTTP 响应状态', {
        status: response.status,
        ok: response.ok,
        statusText: response.statusText,
      });

      if (!response.ok) {
        const errorText = response.body || '';
        throw new Error(`API请求失败 (${response.status}): ${errorText || response.statusText}`);
      }

      // 构建完整响应，保持和非流式 chatWithTools 的返回结构一致。
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

      return {
        id: responseId,
        model: responseModel,
        choices: [{ message, finish_reason: finishReason }],
      };
    } catch (error) {
      const normalized = normalizeError(error);
      logger.error('豆包流式请求失败', normalized);
      return {
        choices: [],
        error: normalized,
      };
    }
  }

  async compact(messages: ChatWithToolsRequest['messages']): Promise<string> {
    const prompt = `你是一个对话摘要助手。请将以下对话历史压缩为简洁摘要，保留用户需求、已完成结果、关键决策和未完成待办。\n\n${messages
      .map((msg) => `${msg.role}: ${msg.content || ''}`)
      .join('\n')}`;
    const response = await this.chatWithTools({
      model: this.compactModel,
      messages: [
        { role: 'system', content: '你只负责压缩对话历史，不做其他回答。' },
        { role: 'user', content: prompt },
      ],
      stream: false,
    });
    return response.choices[0]?.message?.content || '无重要信息';
  }
}
