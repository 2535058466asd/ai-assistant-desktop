import type { Message, SessionId } from '../../types';
import type { HistoryManager } from '../history';
import { createLogger } from '../../../shared/logger';

const logger = createLogger('agent');

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

export class ConversationRuntime {
  private sessionId: SessionId = generateId();

  constructor(private readonly historyManager: HistoryManager) {}

  initialize(): SessionId {
    this.historyManager.initialize(this.sessionId);
    return this.sessionId;
  }

  reset(history: Message[] = []): SessionId {
    this.sessionId = generateId();
    this.historyManager.initialize(this.sessionId);
    for (const msg of history) {
      this.historyManager.addMessage(this.sessionId, msg);
    }
    logger.info('对话上下文已重置', { sessionId: this.sessionId, historyCount: history.length });
    return this.sessionId;
  }

  getSessionId(): SessionId {
    return this.sessionId;
  }

  createMessageId(): string {
    return generateId();
  }

  addMessage(message: Message): void {
    this.historyManager.addMessage(this.sessionId, message);
  }

  getHistory(): Message[] {
    return this.historyManager.getHistory(this.sessionId);
  }

  getHistoryForLLM(): Array<{ role: string; content: string; reasoning_content?: string; tool_calls?: any[]; tool_call_id?: string }> {
    return this.historyManager.getHistoryForLLM(this.sessionId);
  }
}

