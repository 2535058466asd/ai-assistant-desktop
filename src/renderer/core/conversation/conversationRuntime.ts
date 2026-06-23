import type { Message, SessionId } from '../../types';
import type { HistoryManager } from '../history';
import { createLogger } from '../../../shared/logger';
import { normalizeArchivedHistory } from './messageVisibility';

const logger = createLogger('mainAgent');

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

/**
 * 当前对话运行时。
 *
 * archiveHistory 保存原始存档副本；historyManager 保存 Agent 工作用的运行时历史。
 * 模型请求会在每轮调用前从运行时历史构建 ModelContext。
 */
export class ConversationRuntime {
  private sessionId: SessionId = generateId();
  /**
   * SQLite 存档的内存副本，用于 UI 恢复和持久化写回。
   * 不参与模型上下文裁剪或摘要压缩。
   */
  private archiveHistory: Message[] = [];

  constructor(private readonly historyManager: HistoryManager) {}

  initialize(): SessionId {
    this.historyManager.initialize(this.sessionId);
    return this.sessionId;
  }

  /**
   * 切换/恢复一个会话。
   *
   * 传入的 history 通常来自 SQLite；恢复后同时初始化存档副本和运行时历史。
   */
  reset(history: Message[] = []): SessionId {
    this.sessionId = generateId();
    this.historyManager.initialize(this.sessionId);
    const normalizedHistory = normalizeArchivedHistory(history);
    this.archiveHistory = [...normalizedHistory];
    this.historyManager.setHistory(this.sessionId, normalizedHistory);
    logger.info('对话上下文已重置', {
      sessionId: this.sessionId,
      historyCount: normalizedHistory.length,
      removedLegacyInternalMessages: history.length - normalizedHistory.length,
    });
    return this.sessionId;
  }

  getSessionId(): SessionId {
    return this.sessionId;
  }

  createMessageId(): string {
    return generateId();
  }

  /**
   * 写入一条新消息。
   *
   * 同步写入原始存档副本和 Agent 运行时历史。
   */
  addMessage(message: Message): void {
    this.archiveHistory.push(message);
    this.historyManager.addMessage(this.sessionId, message);
  }

  /**
   * 当前 Agent 的运行时历史。
   * 每次请求前还会被清洗、裁剪成 ModelContext。
   */
  getHistory(): Message[] {
    return this.historyManager.getHistory(this.sessionId);
  }

  /** 完整原始历史，只用于 SQLite 存档和恢复。 */
  getArchiveHistory(): Message[] {
    return [...this.archiveHistory];
  }

  /**
   * 兼容旧链路的有限窗口工具。
   * 主模型链路使用 buildModelContextWithDiagnostics。
   */
  getModelHistory(maxRecentMessages: number = 50): Message[] {
    const history = this.getHistory();
    if (history.length <= maxRecentMessages) return history;

    const recent = history.slice(-maxRecentMessages);
    const latestSummary = [...history]
      .reverse()
      .find((message) => message.role === 'system' && message.content.startsWith('[历史摘要]'));

    if (!latestSummary || recent.some((message) => message.id === latestSummary.id)) {
      return recent;
    }
    return [latestSummary, ...recent];
  }

  getHistoryForLLM(): Array<{ role: string; content: string; reasoning_content?: string; tool_calls?: any[]; tool_call_id?: string }> {
    return this.historyManager.getHistoryForLLM(this.sessionId);
  }
}
