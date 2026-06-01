import type { Message, ConversationContext, SessionId } from '../../types';

export class ContextManager {
  private contexts: Map<SessionId, ConversationContext> = new Map();
  private maxHistoryLength: number = 50;
  private lastCleanupTime: number = Date.now();

  createContext(sessionId: SessionId): ConversationContext {
    this.maybeCleanup();
    const context: ConversationContext = {
      sessionId,
      history: [],
      lastActiveTime: Date.now()
    };

    this.contexts.set(sessionId, context);
    return context;
  }

  getContext(sessionId: SessionId): ConversationContext | null {
    return this.contexts.get(sessionId) || null;
  }

  getOrCreateContext(sessionId: SessionId): ConversationContext {
    let context = this.getContext(sessionId);
    if (!context) {
      context = this.createContext(sessionId);
    }
    return context;
  }

  addMessage(sessionId: SessionId, message: Message): void {
    const context = this.getOrCreateContext(sessionId);
    context.history.push(message);
    context.lastActiveTime = Date.now();
  }

  getHistory(sessionId: SessionId): Message[] {
    const context = this.getContext(sessionId);
    return context ? [...context.history] : [];
  }

  setHistory(sessionId: SessionId, history: Message[]): void {
    const context = this.getOrCreateContext(sessionId);
    context.history = [...history];
    context.lastActiveTime = Date.now();
  }

  clearContext(sessionId: SessionId): void {
    this.contexts.delete(sessionId);
  }

  resetContext(sessionId: SessionId): void {
    const context = this.getContext(sessionId);
    if (context) {
      context.lastActiveTime = Date.now();
    }
  }

  getAllSessions(): SessionId[] {
    return Array.from(this.contexts.keys());
  }

  cleanupInactiveSessions(maxInactiveMinutes: number = 60): number {
    const now = Date.now();
    const maxInactiveTime = maxInactiveMinutes * 60 * 1000;
    let cleanedCount = 0;

    for (const [sessionId, context] of this.contexts.entries()) {
      if (now - context.lastActiveTime > maxInactiveTime) {
        this.contexts.delete(sessionId);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  private maybeCleanup(): void {
    const now = Date.now();
    if (now - this.lastCleanupTime > 5 * 60 * 1000) {
      this.lastCleanupTime = now;
      this.cleanupInactiveSessions();
    }
  }

  setMaxHistoryLength(length: number): void {
    this.maxHistoryLength = Math.max(10, length);
  }

  formatHistoryForLLM(sessionId: SessionId): Array<{ role: string; content: string; reasoning_content?: string; tool_calls?: any[]; tool_call_id?: string }> {
    const history = this.getHistory(sessionId);
    return history.map(msg => {
      const llmMsg: any = { role: msg.role, content: msg.content };
      if (msg.reasoning_content) llmMsg.reasoning_content = msg.reasoning_content;
      if (msg.tool_calls) llmMsg.tool_calls = msg.tool_calls;
      if (msg.tool_call_id) llmMsg.tool_call_id = msg.tool_call_id;
      return llmMsg;
    });
  }

}

let contextManagerInstance: ContextManager | null = null;

export function getContextManager(): ContextManager {
  if (!contextManagerInstance) {
    contextManagerInstance = new ContextManager();
  }
  return contextManagerInstance;
}
