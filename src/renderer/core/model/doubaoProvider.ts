import apiConfig from '../../config/apiConfig';
import { createLogger } from '../../../shared/logger';
import type { ChatWithToolsRequest, ModelError, ModelProvider, ModelResponse, StreamChunk } from './types';

const logger = createLogger('model');
const DEFAULT_ARK_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';

function isVerboseModelLog(): boolean {
  return process.env.NODE_ENV !== 'production' && import.meta.env.VITE_VERBOSE_MODEL_LOGS !== 'false';
}

function normalizeError(error: any): ModelError {
  const code = error?.code || error?.error?.code || error?.response?.data?.error?.code || 'ModelProviderError';
  const message =
    error?.message ||
    error?.error?.message ||
    error?.response?.data?.error?.message ||
    '模型请求失败';
  return {
    code,
    message,
    retryable: /timeout|rate|429|5\d\d/i.test(`${code} ${message}`),
  };
}

export class DoubaoProvider implements ModelProvider {
  id = 'doubao';
  displayName = '豆包';

  async chatWithTools(request: ChatWithToolsRequest): Promise<ModelResponse> {
    try {
      const endpoint = apiConfig.apiUrl && !apiConfig.apiUrl.startsWith('/api')
        ? apiConfig.apiUrl
        : DEFAULT_ARK_API_URL;
      const requestBody = {
        model: request.model,
        messages: request.messages,
        tools: request.tools,
        stream: request.stream ?? false,
      };

      if (isVerboseModelLog()) {
        logger.info('即将向豆包发送 HTTP 请求', {
          endpoint,
          body: requestBody,
        });
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiConfig.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      logger.debug('豆包 HTTP 响应状态', {
        status: response.status,
        ok: response.ok,
        statusText: response.statusText,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`API请求失败 (${response.status}): ${errorText || response.statusText}`);
      }

      const responseJson = await response.json();
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
    const endpoint = apiConfig.apiUrl && !apiConfig.apiUrl.startsWith('/api')
      ? apiConfig.apiUrl
      : DEFAULT_ARK_API_URL;
    const requestBody = {
      model: request.model,
      messages: request.messages,
      tools: request.tools,
      stream: true,
    };

    if (isVerboseModelLog()) {
      logger.info('即将向豆包发送流式请求', { endpoint });
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiConfig.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`API请求失败 (${response.status}): ${errorText || response.statusText}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // 累积状态
    let accumulatedContent = '';
    const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];
    let finishReason: string | null = null;
    let responseId = '';
    let responseModel = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
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

          // 工具调用增量
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
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
    }

    // 构建完整响应
    const message: any = { role: 'assistant', content: accumulatedContent || null };
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
  }

  async compact(messages: ChatWithToolsRequest['messages']): Promise<string> {
    const prompt = `你是一个对话摘要助手。请将以下对话历史压缩为简洁摘要，保留用户需求、已完成结果、关键决策和未完成待办。\n\n${messages
      .map((msg) => `${msg.role}: ${msg.content || ''}`)
      .join('\n')}`;
    const response = await this.chatWithTools({
      model: 'doubao-1-5-lite-32k-250115',
      messages: [
        { role: 'system', content: '你只负责压缩对话历史，不做其他回答。' },
        { role: 'user', content: prompt },
      ],
      stream: false,
    });
    return response.choices[0]?.message?.content || '无重要信息';
  }
}
