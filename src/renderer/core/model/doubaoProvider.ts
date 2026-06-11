import apiConfig from '../../config/apiConfig';
import { createLogger } from '../../../shared/logger';
import { getTextContent, type ChatWithToolsRequest, type ModelError, type ModelProvider, type ModelResponse, type StreamChunk } from './types';
import { modelFetch, modelFetchStream } from './modelTransport';
import { normalizeError } from './modelErrorHandler';
import { createSSEAccumulator, getSSEDiagnostics, handleSSEChunk } from './sseParser';

const logger = createLogger('modelProvider');
const DEFAULT_ARK_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
type DoubaoProviderConfig = typeof apiConfig & { compactModel?: string };

// 开发时打印完整请求和响应，方便你在 Electron 控制台看 API 到底返回了什么。
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

function summarizeRequest(request: ChatWithToolsRequest, endpoint: string) {
  return {
    traceId: request.traceId,
    phase: 'model',
    provider: 'doubao',
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

function summarizeResponse(response: ModelResponse, request: ChatWithToolsRequest, status?: { status: number; ok: boolean; statusText: string }) {
  const message = response.choices[0]?.message;
  const content = getTextContent(message?.content);
  const reasoning = message?.reasoning_content || '';
  const toolCalls = message?.tool_calls || [];
  return {
    traceId: request.traceId,
    phase: 'model',
    provider: 'doubao',
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

      logger.info('豆包 HTTP 请求开始', summarizeRequest(request, endpoint));
      if (isVerboseModelLog()) {
        logger.debug('豆包 HTTP 完整请求', {
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

      if (!response.ok) {
        const errorText = response.body || '';
        throw new Error(`API请求失败 (${response.status}): ${errorText || response.statusText}`);
      }

      const responseJson = JSON.parse(response.body);
      logger.info('豆包 HTTP 响应完成', summarizeResponse(responseJson, request, response));
      if (isVerboseModelLog()) {
        logger.debug('豆包 HTTP 完整响应', { traceId: request.traceId, phase: 'model', response: responseJson });
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

      const streamRequest = { ...request, stream: true };
      logger.info('豆包流式请求开始', summarizeRequest(streamRequest, endpoint));
      if (isVerboseModelLog()) {
        logger.debug('豆包流式完整请求', { traceId: request.traceId, phase: 'model', endpoint, body: requestBody });
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

      const result = {
        id: acc.responseId,
        model: acc.responseModel,
        choices: [{ message, finish_reason: acc.finishReason }],
      };
      logger.info('豆包流式响应完成', {
        ...summarizeResponse(result, streamRequest, response),
        diagnostics: getSSEDiagnostics(acc),
      });
      if (isVerboseModelLog()) {
        logger.debug('豆包流式完整响应', { traceId: request.traceId, phase: 'model', response: result });
      }
      return result;
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
