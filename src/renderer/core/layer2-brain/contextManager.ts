// ==========================================
// 第 2 层：大脑层 - 上下文管理器
// 负责管理对话历史和上下文状态
// ==========================================

import type { Message, ConversationContext, SessionId } from '../../types';

/**
 * 上下文管理器类
 */
export class ContextManager {
  private contexts: Map<SessionId, ConversationContext> = new Map();
  private maxHistoryLength: number = 50; // 最多保留 50 条消息

  /**
   * 创建新的会话上下文
   */
  createContext(sessionId: SessionId): ConversationContext {
    const context: ConversationContext = {
      sessionId,
      history: [],
      lastActiveTime: Date.now()
    };

    this.contexts.set(sessionId, context);
    return context;
  }

  /**
   * 获取会话上下文
   */
  getContext(sessionId: SessionId): ConversationContext | null {
    return this.contexts.get(sessionId) || null;
  }

  /**
   * 获取或创建会话上下文
   */
  getOrCreateContext(sessionId: SessionId): ConversationContext {
    let context = this.getContext(sessionId);
    if (!context) {
      context = this.createContext(sessionId);
    }
    return context;
  }

  /**
   * 添加消息到历史
   */
  addMessage(sessionId: SessionId, message: Message): void {
    const context = this.getOrCreateContext(sessionId);
    context.history.push(message);
    context.lastActiveTime = Date.now();

    // 限制历史长度
    if (context.history.length > this.maxHistoryLength) {
      context.history = context.history.slice(-this.maxHistoryLength);
    }
  }

  /**
   * 获取对话历史
   */
  getHistory(sessionId: SessionId): Message[] {
    const context = this.getContext(sessionId);
    return context ? [...context.history] : [];
  }

  /**
   * 清除会话上下文
   */
  clearContext(sessionId: SessionId): void {
    this.contexts.delete(sessionId);
  }

  /**
   * 重置会话（保留历史）
   */
  resetContext(sessionId: SessionId): void {
    const context = this.getContext(sessionId);
    if (context) {
      context.lastActiveTime = Date.now();
    }
  }

  /**
   * 获取所有活跃会话
   */
  getAllSessions(): SessionId[] {
    return Array.from(this.contexts.keys());
  }

  /**
   * 清理长时间不活跃的会话
   */
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

  /**
   * 设置最大历史长度
   */
  setMaxHistoryLength(length: number): void {
    this.maxHistoryLength = Math.max(10, length);
  }

  /**
   * 生成用于 LLM 的历史消息格式
   */
  formatHistoryForLLM(sessionId: SessionId): Array<{ role: string; content: string }> {
    const history = this.getHistory(sessionId);
    return history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content
    }));
  }

}

// 创建单例
let contextManagerInstance: ContextManager | null = null;

export function getContextManager(): ContextManager {
  if (!contextManagerInstance) {
    contextManagerInstance = new ContextManager();
  }
  return contextManagerInstance;
}
