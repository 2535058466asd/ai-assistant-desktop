import { getTextContent, type ChatWithToolsRequest, type ModelMessage, type ModelResponse } from './types';
import { previewText } from '../utils/textUtils';

export function isVerboseModelLog(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  if (import.meta.env.VITE_VERBOSE_MODEL_LOGS === 'true') return true;
  try {
    return localStorage.getItem('nova.log.verboseModelPayload') === 'true';
  } catch {
    return false;
  }
}

export function summarizeMessages(messages: ChatWithToolsRequest['messages']) {
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

export function summarizeRequest(request: ChatWithToolsRequest, endpoint: string, provider: string) {
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

export function summarizeResponse(
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
