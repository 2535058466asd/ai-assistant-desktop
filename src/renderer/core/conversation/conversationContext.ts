import type { Attachment, DisplayMessage, Message, ToolCallSummary } from '../../types';
import type { ModelContentPart, ModelMessage, ToolCall } from '../model';
import { isInternalAgentMessage, isVisibleChatMessage, normalizeArchivedHistory } from './messageVisibility';

export const DEFAULT_MODEL_CONTEXT_MESSAGES = 50;

export type ModelContextMessage = ModelMessage;

export interface ContextBuildOptions {
  provider?: string;
  maxMessages?: number;
  includeRecentTools?: boolean;
  summarizeOldTools?: boolean;
  readAttachmentDataUrl?: (attachment: Attachment) => Promise<string | null>;
}

export interface ContextDropInfo {
  id?: string;
  role?: string;
  reason: string;
}

export interface ContextBuildDiagnostics {
  rawCount: number;
  normalizedCount: number;
  sanitizedCount: number;
  roles: string[];
  hasToolCalls: boolean;
  hasToolMessages: boolean;
  dropped: ContextDropInfo[];
}

export interface ContextBuildResult {
  messages: ModelContextMessage[];
  diagnostics: ContextBuildDiagnostics;
}

interface ToolTrace {
  toolCalls: ToolCall[];
  toolResults: Message[];
}

function isMimoProvider(provider?: string): boolean {
  const normalized = (provider || '').toLowerCase();
  return normalized.includes('mimo') || normalized.includes('xiaomi');
}

function previewValue(value: unknown, maxLength: number = 160): string {
  let text = '';
  if (typeof value === 'string') {
    text = value;
  } else {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  }
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function hasUsableContent(message: ModelMessage): boolean {
  if (typeof message.content === 'string') return message.content.trim().length > 0;
  if (Array.isArray(message.content)) return message.content.length > 0;
  return false;
}

function hasUserAttachment(message: Message): boolean {
  return Boolean(message.role === 'user' && message.attachments?.length);
}

function getAttachmentFallbackText(attachments?: Attachment[]): string {
  if (attachments?.some((attachment) => attachment.type === 'audio')) return '请分析这段音频。';
  if (attachments?.some((attachment) => attachment.type === 'video')) return '请分析这个视频。';
  return '请分析这些图片。';
}

function getToolCallIds(toolCalls?: ToolCall[]): string[] {
  return (toolCalls || []).map((toolCall) => toolCall.id).filter(Boolean);
}

function hasReasoningContent(message: Message | ModelContextMessage): boolean {
  return typeof message.reasoning_content === 'string' && message.reasoning_content.trim().length > 0;
}

function collectLatestValidToolTrace(history: Message[]): ToolTrace | null {
  let latest: ToolTrace | null = null;

  for (let index = 0; index < history.length; index++) {
    const message = history[index];
    if (message.role !== 'assistant' || !message.tool_calls?.length) continue;

    const ids = new Set(getToolCallIds(message.tool_calls as ToolCall[]));
    if (ids.size === 0) continue;

    const toolResults: Message[] = [];
    for (let nextIndex = index + 1; nextIndex < history.length; nextIndex++) {
      const candidate = history[nextIndex];
      if (candidate.role !== 'tool') {
        if (isVisibleChatMessage(candidate) || (candidate.role === 'assistant' && candidate.tool_calls?.length)) break;
        continue;
      }
      if (candidate.tool_call_id && ids.has(candidate.tool_call_id)) {
        toolResults.push(candidate);
      }
    }

    if (toolResults.length > 0) {
      latest = {
        toolCalls: message.tool_calls as ToolCall[],
        toolResults,
      };
    }
  }

  return latest;
}

function isLatestToolAssistant(message: Message, latestTrace: ToolTrace | null): boolean {
  if (!latestTrace || !message.tool_calls?.length) return false;
  const messageIds = getToolCallIds(message.tool_calls as ToolCall[]);
  const latestIds = new Set(getToolCallIds(latestTrace.toolCalls));
  return messageIds.length > 0 && messageIds.every((id) => latestIds.has(id));
}

function deriveToolSummaries(messages: Message[]): ToolCallSummary[] {
  const calls = messages.flatMap((message) => message.tool_calls || []);
  const resultsById = new Map(
    messages
      .filter((message) => message.role === 'tool' && message.tool_call_id)
      .map((message) => [message.tool_call_id as string, message])
  );

  return calls.map((toolCall) => {
    const result = resultsById.get(toolCall.id);
    let status: ToolCallSummary['status'] = 'success';
    let resultPreview = result?.content || '';

    try {
      const parsed = resultPreview ? JSON.parse(resultPreview) : null;
      if (parsed && typeof parsed === 'object') {
        if (parsed.success === false) status = 'error';
        resultPreview = previewValue(parsed.data || parsed.error || parsed);
      }
    } catch {
      resultPreview = previewValue(resultPreview);
    }

    return {
      name: toolCall.function?.name || 'unknown_tool',
      argsPreview: previewValue(toolCall.function?.arguments || '{}', 100),
      resultPreview: previewValue(resultPreview, 100),
      durationMs: 0,
      status,
    };
  });
}

export function summarizeToolTrace(toolMessages: Message[]): string {
  const summaries = deriveToolSummaries(toolMessages);
  if (summaries.length === 0) return '';
  return `调用了 ${summaries.length} 个工具：${summaries.map((item) => item.name).join('、')}`;
}

function summarizeToolTraceForModel(toolMessages: Message[]): string {
  const summaries = deriveToolSummaries(toolMessages);
  if (summaries.length === 0) return '';
  return [
    '此前工具调用摘要：',
    ...summaries.map((item) =>
      `- ${item.name}：参数 ${item.argsPreview || '{}'}；结果 ${item.resultPreview || '无返回内容'}`
    ),
  ].join('\n');
}

export function buildDisplayMessages(rawMessages: Message[]): DisplayMessage[] {
  const normalized = normalizeArchivedHistory(rawMessages);
  const visible: DisplayMessage[] = [];
  let pendingInternalTrace: Message[] = [];

  for (const message of normalized) {
    if (isVisibleChatMessage(message)) {
      if (message.role === 'user') {
        pendingInternalTrace = [];
        visible.push(message);
        continue;
      }

      if (message.role === 'assistant' && !message.toolCallSummary?.length && pendingInternalTrace.length > 0) {
        const toolCallSummary = deriveToolSummaries(pendingInternalTrace);
        visible.push(toolCallSummary.length > 0 ? { ...message, toolCallSummary } : message);
        pendingInternalTrace = [];
        continue;
      }

      visible.push(message);
      pendingInternalTrace = [];
      continue;
    }

    if (isInternalAgentMessage(message)) {
      pendingInternalTrace.push(message);
    }
  }

  return visible;
}

export function sanitizeModelMessages(
  messages: ModelContextMessage[],
  provider: string = 'default'
): ModelContextMessage[] {
  const dropped: ContextDropInfo[] = [];
  return sanitizeModelMessagesWithDiagnostics(messages, provider, dropped);
}

function sanitizeModelMessagesWithDiagnostics(
  messages: ModelContextMessage[],
  provider: string,
  dropped: ContextDropInfo[]
): ModelContextMessage[] {
  const availableToolResults = new Set(
    messages
      .filter((message) => message.role === 'tool' && message.tool_call_id && hasUsableContent(message))
      .map((message) => message.tool_call_id as string)
  );
  const allowedToolResultIds = new Set<string>();
  const sanitized: ModelContextMessage[] = [];

  for (const message of messages) {
    const next: ModelContextMessage = { ...message };
    if (typeof next.reasoning_content === 'string' && next.reasoning_content.trim().length === 0) {
      delete next.reasoning_content;
      dropped.push({ role: next.role, reason: 'empty_reasoning_content' });
    }

    if (next.role === 'assistant' && next.tool_calls?.length) {
      const toolCalls = next.tool_calls.filter((toolCall) => toolCall.id && availableToolResults.has(toolCall.id));
      if (toolCalls.length !== next.tool_calls.length) {
        dropped.push({ role: next.role, reason: 'unmatched_tool_calls' });
      }
      next.tool_calls = toolCalls;
      for (const toolCall of toolCalls) {
        allowedToolResultIds.add(toolCall.id);
      }
      if (next.tool_calls.length === 0) {
        delete next.tool_calls;
      }
    }

    if (next.role === 'tool') {
      if (next.tool_call_id && allowedToolResultIds.has(next.tool_call_id) && hasUsableContent(next)) {
        sanitized.push(next);
      } else {
        dropped.push({ role: next.role, reason: 'orphan_tool_message' });
      }
      continue;
    }

    if ((next.role === 'user' || next.role === 'assistant' || next.role === 'system') && !hasUsableContent(next) && !next.tool_calls?.length) {
      dropped.push({ role: next.role, reason: `empty_${next.role}_message` });
      continue;
    }

    sanitized.push(next);
  }

  return sanitized;
}

async function toModelMessage(message: Message, options: ContextBuildOptions): Promise<ModelContextMessage | null> {
  const base: ModelContextMessage = {
    role: message.role,
    content: message.content,
    ...(message.reasoning_content?.trim() ? { reasoning_content: message.reasoning_content } : {}),
    ...(message.tool_calls?.length ? { tool_calls: message.tool_calls as ToolCall[] } : {}),
    ...(message.tool_call_id ? { tool_call_id: message.tool_call_id } : {}),
  };

  if (message.role !== 'user' || !message.attachments?.length || !options.readAttachmentDataUrl) {
    return base;
  }

  const supportedAttachments = message.attachments.filter((attachment) =>
    attachment.type === 'image' || attachment.type === 'audio' || attachment.type === 'video'
  );
  if (supportedAttachments.length === 0) return base;

  const parts: ModelContentPart[] = [{ type: 'text', text: message.content || getAttachmentFallbackText(message.attachments) }];
  for (const attachment of supportedAttachments) {
    const dataUrl = await options.readAttachmentDataUrl(attachment);
    if (dataUrl) {
      if (attachment.type === 'image') {
        parts.push({ type: 'image_url', image_url: { url: dataUrl } });
      } else if (attachment.type === 'audio') {
        const base64 = dataUrl.split(',')[1] || '';
        const format = attachment.mimeType.split('/')[1];
        parts.push({ type: 'input_audio', input_audio: { data: base64, format } });
      } else if (attachment.type === 'video') {
        parts.push({ type: 'video_url', video_url: { url: dataUrl } });
      }
    }
  }

  return { ...base, content: parts };
}

export async function buildModelContextWithDiagnostics(
  rawMessages: Message[],
  options: ContextBuildOptions = {}
): Promise<ContextBuildResult> {
  const provider = options.provider || 'default';
  const maxMessages = options.maxMessages ?? DEFAULT_MODEL_CONTEXT_MESSAGES;
  const includeRecentTools = options.includeRecentTools ?? true;
  const normalized = normalizeArchivedHistory(rawMessages);
  const requiresReasoningToolReplay = isMimoProvider(provider);
  const latestTrace = includeRecentTools ? collectLatestValidToolTrace(normalized) : null;
  const toolIdsMissingReasoning = new Set<string>();
  if (requiresReasoningToolReplay) {
    for (const message of normalized) {
      if (message.role === 'assistant' && message.tool_calls?.length && !hasReasoningContent(message)) {
        for (const id of getToolCallIds(message.tool_calls as ToolCall[])) {
          toolIdsMissingReasoning.add(id);
        }
      }
    }
  }
  const dropped: ContextDropInfo[] = [];
  const candidates: ModelContextMessage[] = [];

  for (const message of normalized) {
    if (message.role === 'tool') {
      if (message.tool_call_id && toolIdsMissingReasoning.has(message.tool_call_id)) {
        dropped.push({ id: message.id, role: message.role, reason: 'mimo_tool_result_without_reasoning_replay' });
        continue;
      }

      const latestToolIds = new Set(latestTrace?.toolResults.map((item) => item.tool_call_id).filter(Boolean));
      if (message.tool_call_id && latestToolIds.has(message.tool_call_id)) {
        const modelMessage = await toModelMessage(message, options);
        if (modelMessage) candidates.push(modelMessage);
      } else {
        dropped.push({ id: message.id, role: message.role, reason: 'old_tool_result' });
      }
      continue;
    }

    if (message.role === 'assistant' && message.tool_calls?.length) {
      const isLatest = isLatestToolAssistant(message, latestTrace);

      if (requiresReasoningToolReplay && !hasReasoningContent(message)) {
        if (isLatest && latestTrace) {
          const summary = summarizeToolTraceForModel([message, ...latestTrace.toolResults]);
          if (summary) {
            candidates.push({ role: 'assistant', content: summary });
          }
        }
        dropped.push({ id: message.id, role: message.role, reason: 'mimo_tool_call_without_reasoning_summarized' });
        continue;
      }

      if (!isLatest) {
        dropped.push({ id: message.id, role: message.role, reason: 'old_tool_call_round' });
        continue;
      }
    }

    if (message.role === 'user' && !message.content.trim() && !hasUserAttachment(message)) {
      dropped.push({ id: message.id, role: message.role, reason: 'empty_user_message' });
      continue;
    }

    const modelMessage = await toModelMessage(message, options);
    if (modelMessage) candidates.push(modelMessage);
  }

  const sanitized = sanitizeModelMessagesWithDiagnostics(candidates, provider, dropped);
  const latestSummary = [...sanitized]
    .reverse()
    .find((message) => message.role === 'system' && typeof message.content === 'string' && message.content.startsWith('[历史摘要]'));

  let windowed = sanitized;
  if (sanitized.length > maxMessages) {
    const recent = sanitized.slice(-maxMessages);
    if (latestSummary && !recent.includes(latestSummary)) {
      windowed = [latestSummary, ...recent.slice(-(maxMessages - 1))];
    } else {
      windowed = recent;
    }
  }

  const diagnostics: ContextBuildDiagnostics = {
    rawCount: rawMessages.length,
    normalizedCount: normalized.length,
    sanitizedCount: windowed.length,
    roles: windowed.map((message) => message.role),
    hasToolCalls: windowed.some((message) => Boolean(message.tool_calls?.length)),
    hasToolMessages: windowed.some((message) => message.role === 'tool'),
    dropped,
  };

  return { messages: windowed, diagnostics };
}

export async function buildModelContext(
  rawMessages: Message[],
  options: ContextBuildOptions = {}
): Promise<ModelContextMessage[]> {
  const result = await buildModelContextWithDiagnostics(rawMessages, options);
  return result.messages;
}
