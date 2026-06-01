import apiConfig from '../../config/apiConfig';
import { createLogger } from '../../../shared/logger';
import { getTextContent, type ChatWithToolsRequest, type ModelError, type ModelProvider, type ModelResponse, type StreamChunk } from './types';
import { modelFetch, modelFetchStream } from './modelTransport';
import { normalizeError } from './modelErrorHandler';
import { createSSEAccumulator, handleSSEChunk } from './sseParser';

const logger = createLogger('model');
const DEFAULT_ARK_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
type DoubaoProviderConfig = typeof apiConfig & { compactModel?: string };

// 开发时打印完整请求和响应，方便你在 Electron 控制台看 API 到底返回了什么。
function isVerboseModelLog(): boolean {
  return process.env.NODE_ENV !== 'production' && import.meta.env.VITE_VERBOSE_MODEL_LOGS !== 'false';
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

      logger.info('即将向豆包发送 HTTP 请求摘要', {
        ...summarizeRequest(request),
        endpoint,
      });
      if (isVerboseModelLog()) {
        logger.info('即将向豆包发送 HTTP 请求', {
          traceId: request.traceId,
          phase: 'model',
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
        traceId: request.traceId,
        phase: 'model',
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
        logger.info('豆包返回完整 JSON', { traceId: request.traceId, phase: 'model', response: responseJson });
      }

      return responseJson;
    } catch (error) {
      const normalized = normalizeError(error, '豆包', { traceId: request.traceId, phase: 'model' });
      logger.error('豆包请求失败', { traceId: request.traceId, phase: 'model', ...normalized });
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

      logger.info('即将向豆包发送流式请求摘要', {
        ...summarizeRequest({ ...request, stream: true }),
        endpoint,
      });
      if (isVerboseModelLog()) {
        logger.info('即将向豆包发送流式请求', { traceId: request.traceId, phase: 'model', endpoint, body: requestBody });
      }

      // 豆包流式返回也是 SSE，需要把分片 content 和 tool_calls 重新组装。
      const acc = createSSEAccumulator();

      const response = await modelFetchStream({
        endpoint,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      }, (chunkText) => {
        handleSSEChunk(acc, chunkText, onChunk);
      });

      logger.debug('豆包流式 HTTP 响应状态', {
        traceId: request.traceId,
        phase: 'model',
        status: response.status,
        ok: response.ok,
        statusText: response.statusText,
      });

      if (!response.ok) {
        const errorText = response.body || '';
        throw new Error(`API请求失败 (${response.status}): ${errorText || response.statusText}`);
      }

      // 构建完整响应，保持和非流式 chatWithTools 的返回结构一致。
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

      return {
        id: acc.responseId,
        model: acc.responseModel,
        choices: [{ message, finish_reason: acc.finishReason }],
      };
    } catch (error) {
      const normalized = normalizeError(error, '豆包', { traceId: request.traceId, phase: 'model' });
      logger.error('豆包流式请求失败', { traceId: request.traceId, phase: 'model', ...normalized });
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
    return getTextContent(response.choices[0]?.message?.content) || '无重要信息';
  }
}
