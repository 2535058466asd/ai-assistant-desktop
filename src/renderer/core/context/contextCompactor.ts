import type { Message, SessionId } from '../../types';
import type { ModelMessage } from '../model';
import { getModelProvider } from '../model';
import type { HistoryManager } from '../history';
import { createLogger } from '../../../shared/logger';

const logger = createLogger('agent');

export class ContextCompactor {
  private static readonly MAX_TOOL_RESULT_TOKENS = 1500;
  private static readonly MAX_CONTEXT_TOKENS = 80000;
  private static readonly KEEP_RECENT_MESSAGES = 6;
  private static readonly COMPACT_THRESHOLD = 0.8;

  constructor(
    private readonly historyManager: HistoryManager,
    private readonly sessionId: SessionId
  ) {}

  truncateToolResult(result: string): string {
    const estimatedTokens = Math.ceil(result.length / 4);
    if (estimatedTokens < ContextCompactor.MAX_TOOL_RESULT_TOKENS) return result;
    const maxChars = ContextCompactor.MAX_TOOL_RESULT_TOKENS * 4;
    const truncated = result.slice(0, maxChars);
    return `${truncated}\n\n[结果已截断，原文共 ${result.length} 字]`;
  }

  async compactIfNeeded(): Promise<void> {
    if (!(await this.shouldCompact())) return;
    await this.compactHistory();
  }

  private estimateTokens(messages: Array<{ content?: string }>): number {
    let totalTokens = 0;
    for (const message of messages) {
      if (!message.content) continue;
      const content = message.content.toString();
      const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
      const otherChars = content.length - chineseChars;
      totalTokens += chineseChars * 2 + otherChars * 0.4;
    }
    return totalTokens;
  }

  private async shouldCompact(): Promise<boolean> {
    const history = this.historyManager.getHistoryForLLM(this.sessionId);
    const estimatedTokens = this.estimateTokens(history);
    return estimatedTokens > ContextCompactor.MAX_CONTEXT_TOKENS * ContextCompactor.COMPACT_THRESHOLD;
  }

  private async compactHistory(): Promise<void> {
    const fullHistory = this.historyManager.getHistoryForLLM(this.sessionId);
    const toCompact = fullHistory.slice(0, fullHistory.length - ContextCompactor.KEEP_RECENT_MESSAGES);
    const toKeep = fullHistory.slice(-ContextCompactor.KEEP_RECENT_MESSAGES);

    if (toCompact.length === 0) return;

    const summary = await this.callLLMForCompaction(toCompact);
    const now = Date.now();
    const compactedHistory: Message[] = [
      { id: `compact-${now}`, role: 'system', content: `[历史摘要] ${summary}`, timestamp: now, sessionId: this.sessionId },
      ...toKeep.map((msg, i) => ({
        id: `kept-${now}-${i}`,
        role: msg.role as Message['role'],
        content: msg.content,
        timestamp: now + i + 1,
        sessionId: this.sessionId,
        ...(msg.reasoning_content ? { reasoning_content: msg.reasoning_content } : {}),
        ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}),
        ...(msg.tool_call_id ? { tool_call_id: msg.tool_call_id } : {}),
      })),
    ];

    this.historyManager.setHistory(this.sessionId, compactedHistory);
    logger.info('对话历史已压缩', { kept: ContextCompactor.KEEP_RECENT_MESSAGES });
  }

  private async callLLMForCompaction(messages: Array<{ role: string; content: string; reasoning_content?: string; tool_calls?: any[]; tool_call_id?: string }>): Promise<string> {
    try {
      return await getModelProvider().compact(messages as ModelMessage[]);
    } catch (error) {
      logger.error('对话历史压缩失败', error);
      return '无重要信息';
    }
  }
}

