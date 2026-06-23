import type { StreamChunk } from './types';

export interface SSEAccumulator {
  buffer: string;
  accumulatedContent: string;
  accumulatedReasoningContent: string;
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
  finishReason: string | null;
  responseId: string;
  responseModel: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  receivedDone: boolean;
  chunkCount: number;
  dataLineCount: number;
  parseErrorCount: number;
  ignoredLineCount: number;
  lastParseError?: string;
}

export function createSSEAccumulator(): SSEAccumulator {
  return {
    buffer: '',
    accumulatedContent: '',
    accumulatedReasoningContent: '',
    toolCalls: [],
    finishReason: null,
    responseId: '',
    responseModel: '',
    receivedDone: false,
    chunkCount: 0,
    dataLineCount: 0,
    parseErrorCount: 0,
    ignoredLineCount: 0,
  };
}

export function handleSSEChunk(
  acc: SSEAccumulator,
  chunkText: string,
  onChunk: (chunk: StreamChunk) => void,
): void {
  acc.chunkCount++;
  acc.buffer += chunkText;
  const lines = acc.buffer.split('\n');
  acc.buffer = lines.pop() || '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!trimmed.startsWith('data: ')) {
      acc.ignoredLineCount++;
      continue;
    }
    acc.dataLineCount++;
    const data = trimmed.slice(6);
    if (data === '[DONE]') {
      acc.receivedDone = true;
      onChunk({ type: 'done' });
      continue;
    }

    try {
      const parsed = JSON.parse(data);
      if (parsed.id) acc.responseId = parsed.id;
      if (parsed.model) acc.responseModel = parsed.model;
      if (parsed.usage) acc.usage = parsed.usage;

      const choice = parsed.choices?.[0];
      if (!choice) continue;
      if (choice.finish_reason) acc.finishReason = choice.finish_reason;

      const delta = choice.delta;
      if (!delta) continue;

      if (delta.content) {
        acc.accumulatedContent += delta.content;
        onChunk({ type: 'text_delta', textDelta: delta.content });
      }
      if (delta.reasoning_content) {
        acc.accumulatedReasoningContent += delta.reasoning_content;
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          while (acc.toolCalls.length <= idx) {
            acc.toolCalls.push({ id: '', name: '', arguments: '' });
          }
          if (tc.id) acc.toolCalls[idx].id = tc.id;
          if (tc.function?.name) acc.toolCalls[idx].name = tc.function.name;
          if (tc.function?.arguments) acc.toolCalls[idx].arguments += tc.function.arguments;
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
    } catch (error: any) {
      acc.parseErrorCount++;
      acc.lastParseError = error?.message || String(error);
    }
  }
}

export function getSSEDiagnostics(acc: SSEAccumulator) {
  return {
    contentLength: acc.accumulatedContent.length,
    reasoningLength: acc.accumulatedReasoningContent.length,
    toolCallCount: acc.toolCalls.length,
    finishReason: acc.finishReason,
    receivedDone: acc.receivedDone,
    chunkCount: acc.chunkCount,
    dataLineCount: acc.dataLineCount,
    parseErrorCount: acc.parseErrorCount,
    ignoredLineCount: acc.ignoredLineCount,
    leftoverBufferLength: acc.buffer.length,
    hasLeftoverBuffer: acc.buffer.trim().length > 0,
    lastParseError: acc.lastParseError,
    responseId: acc.responseId,
    responseModel: acc.responseModel,
  };
}
