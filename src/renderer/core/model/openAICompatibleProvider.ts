import { createLogger } from '../../../shared/logger';
import type { ChatWithToolsRequest, ModelProvider, ModelResponse, StreamChunk } from './types';

const logger = createLogger('model');

export interface OpenAICompatibleProviderConfig {
  id: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
}

export class OpenAICompatibleProvider implements ModelProvider {
  id: string;
  displayName: string;
  private baseUrl: string;
  private apiKey: string;

  constructor(config: OpenAICompatibleProviderConfig) {
    this.id = config.id;
    this.displayName = config.displayName;
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
  }

  async chatWithTools(request: ChatWithToolsRequest): Promise<ModelResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          tools: request.tools,
          stream: request.stream ?? false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`API请求失败 (${response.status}): ${errorText || response.statusText}`);
      }

      return await response.json();
    } catch (error: any) {
      logger.error(`${this.displayName} 请求失败`, { message: error.message });
      return {
        choices: [],
        error: {
          code: 'OpenAICompatibleProviderError',
          message: error.message || '模型请求失败',
          retryable: /timeout|rate|429|5\d\d/i.test(error.message || ''),
        },
      };
    }
  }

  async chatWithToolsStream(
    request: ChatWithToolsRequest,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<ModelResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        tools: request.tools,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`API请求失败 (${response.status}): ${errorText || response.statusText}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

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

          if (delta.content) {
            accumulatedContent += delta.content;
            onChunk({ type: 'text_delta', textDelta: delta.content });
          }

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
    const response = await this.chatWithTools({
      model: 'default',
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
