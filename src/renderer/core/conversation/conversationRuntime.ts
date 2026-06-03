import type { Message, SessionId } from '../../types';
import type { HistoryManager } from '../history';
import { createLogger } from '../../../shared/logger';
import { normalizeArchivedHistory } from './messageVisibility';

const logger = createLogger('agent');

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

export class ConversationRuntime {
  private sessionId: SessionId = generateId();
  /** SQLite 存档真源：保留完整原始消息，不受模型上下文压缩影响。 */
  private archiveHistory: Message[] = [];

  constructor(private readonly historyManager: HistoryManager) {}

  initialize(): SessionId {
    this.historyManager.initialize(this.sessionId);
    return this.sessionId;
  }

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

  addMessage(message: Message): void {
    this.archiveHistory.push(message);
    this.historyManager.addMessage(this.sessionId, message);
  }

  /** 当前模型工作上下文，可能已经过摘要压缩。 */
  getHistory(): Message[] {
    return this.historyManager.getHistory(this.sessionId);
  }

  /** 完整原始历史，只用于 SQLite 存档和恢复。 */
  getArchiveHistory(): Message[] {
    return [...this.archiveHistory];
  }

  /** 构造发给模型的有限窗口，并尽量保留最近一次历史摘要。 */
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
