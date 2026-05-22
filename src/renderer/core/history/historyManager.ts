import type { Message, SessionId } from '../../types';
import { getContextManager } from './contextManager';
import { createLogger } from '../../../shared/logger';

const logger = createLogger('history');

export class HistoryManager {
  private contextManager = getContextManager();

  initialize(sessionId: SessionId): void {
    this.contextManager.getOrCreateContext(sessionId);
    logger.info('历史管理器已初始化', { sessionId });
  }

  addMessage(sessionId: SessionId, message: Message): void {
    this.contextManager.addMessage(sessionId, message);
  }

  getHistory(sessionId: SessionId): Message[] {
    return this.contextManager.getHistory(sessionId);
  }

  getHistoryForLLM(sessionId: SessionId): Array<{ role: string; content: string; reasoning_content?: string; tool_calls?: any[]; tool_call_id?: string }> {
    return this.contextManager.formatHistoryForLLM(sessionId);
  }

  setHistory(sessionId: SessionId, history: Message[]): void {
    this.contextManager.setHistory(sessionId, history);
  }

  resetSession(sessionId: SessionId): void {
    this.contextManager.resetContext(sessionId);
    logger.info('会话历史已重置', { sessionId });
  }

  clearSession(sessionId: SessionId): void {
    this.contextManager.clearContext(sessionId);
    logger.info('会话历史已清空', { sessionId });
  }
}

let historyManagerInstance: HistoryManager | null = null;

export function getHistoryManager(): HistoryManager {
  if (!historyManagerInstance) {
    historyManagerInstance = new HistoryManager();
  }
  return historyManagerInstance;
}
