import type { Message, SessionId } from '../../types';
import type { ModelMessage } from '../model';
import { getModelProvider } from '../model';
import { getTextContent } from '../model/types';
import type { HistoryManager } from '../history';
import { buildModelContextWithDiagnostics } from '../conversation/conversationContext';
import { createLogger } from '../../../shared/logger';

const logger = createLogger('mainAgent');

/**
 * 运行时上下文摘要压缩器。
 *
 * 只在运行时历史过长时生成 [历史摘要]，不修改 SQLite 原始存档。
 * 最近 50 条窗口裁剪由 conversationContext.ts 在每轮模型请求前处理。
 */
export class ContextCompactor {
  private static readonly MAX_TOOL_RESULT_TOKENS = 1500;
  private static readonly MAX_CONTEXT_TOKENS = 80000;
  private static readonly KEEP_RECENT_MESSAGES = 6;
  private static readonly COMPACT_THRESHOLD = 0.8;

  constructor(
    private readonly historyManager: HistoryManager,
    private readonly sessionId: SessionId
  ) {}

  /**
   * 截断过长工具结果，避免网页、文件或命令输出长期污染运行时历史。
   */
  truncateToolResult(result: string): string {
    const estimatedTokens = Math.ceil(result.length / 4);
    if (estimatedTokens < ContextCompactor.MAX_TOOL_RESULT_TOKENS) return result;
    const maxChars = ContextCompactor.MAX_TOOL_RESULT_TOKENS * 4;
    const truncated = result.slice(0, maxChars);
    return `${truncated}\n\n[结果已截断，原文共 ${result.length} 字]`;
  }

  /**
   * 每次用户发消息前检查是否需要摘要压缩。
   */
  async compactIfNeeded(): Promise<void> {
    if (!(await this.shouldCompact())) return;
    await this.compactHistory();
  }

  /**
   * 轻量 token 估算，不追求和模型 tokenizer 完全一致。
   * 仅用于触发阈值判断。
   */
  private estimateTokens(messages: Array<{ content?: ModelMessage['content'] }>): number {
    let totalTokens = 0;
    for (const message of messages) {
      if (!message.content) continue;
      const content = getTextContent(message.content);
      const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
      const otherChars = content.length - chineseChars;
      totalTokens += chineseChars * 2 + otherChars * 0.4;
    }
    return totalTokens;
  }

  /**
   * 判断运行时历史是否需要摘要压缩。
   */
  private async shouldCompact(): Promise<boolean> {
    const history = await this.getCleanHistoryForCompaction();
    const estimatedTokens = this.estimateTokens(history);
    const thresholdTokens = ContextCompactor.MAX_CONTEXT_TOKENS * ContextCompactor.COMPACT_THRESHOLD;
    const willCompact = estimatedTokens > thresholdTokens;
    logger.debug('上下文压缩检查完成', {
      estimatedTokens,
      thresholdTokens,
      willCompact,
    });
    return willCompact;
  }

  /**
   * 真正执行摘要压缩。
   *
   * 结果形态为 [历史摘要] 加最近 KEEP_RECENT_MESSAGES 条真实消息。
   * 只替换运行时历史，不改 SQLite 原始聊天记录。
   */
  private async compactHistory(): Promise<void> {
    const fullHistory = await this.getCleanHistoryForCompaction();
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
        content: getTextContent(msg.content),
        timestamp: now + i + 1,
        sessionId: this.sessionId,
        ...(msg.reasoning_content ? { reasoning_content: msg.reasoning_content } : {}),
        ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}),
        ...(msg.tool_call_id ? { tool_call_id: msg.tool_call_id } : {}),
      })),
    ];

    this.historyManager.setHistory(this.sessionId, compactedHistory);
    logger.info('运行时上下文已摘要压缩', {
      compactedCount: toCompact.length,
      kept: ContextCompactor.KEEP_RECENT_MESSAGES,
    });
  }

  /**
   * 为摘要压缩准备一份干净历史。
   *
   * 复用模型上下文清洗规则，但不套用最近 50 条窗口。
   */
  private async getCleanHistoryForCompaction(): Promise<ModelMessage[]> {
    const provider = getModelProvider();
    const result = await buildModelContextWithDiagnostics(this.historyManager.getHistory(this.sessionId), {
      provider: provider.id,
      maxMessages: Number.MAX_SAFE_INTEGER,
      includeRecentTools: true,
      summarizeOldTools: true,
    });

    logger.debug('上下文压缩检查：历史已清洗', {
      provider: provider.id,
      rawCount: result.diagnostics.rawCount,
      sanitizedCount: result.diagnostics.sanitizedCount,
      dropped: result.diagnostics.dropped.map((item) => ({
        id: item.id,
        role: item.role,
        reason: item.reason,
      })),
    });

    return result.messages;
  }

  /**
   * 调用当前 Provider 的 compact 模型生成历史摘要。
   * 失败时返回兜底摘要，避免压缩失败阻断正常聊天。
   */
  private async callLLMForCompaction(messages: ModelMessage[]): Promise<string> {
    try {
      return await getModelProvider().compact(messages);
    } catch (error) {
      logger.error('对话历史压缩失败', error);
      return '无重要信息';
    }
  }
}
