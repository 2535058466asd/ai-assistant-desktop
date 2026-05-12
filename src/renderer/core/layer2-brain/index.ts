// ==========================================
// 第 2 层：大脑层整合入口
// 当前 Function Calling Agent Loop 已接管意图理解。
// BrainManager 只保留消息历史管理，避免与工具调用主流程形成两套意图系统。
// ==========================================

export { ContextManager, getContextManager } from './contextManager';

import type { Message, SessionId } from '../../types';
import { getContextManager } from './contextManager';
import { createLogger } from '../../../shared/logger';

const logger = createLogger('agent');

/**
 * 大脑层管理器
 * 当前只负责对话历史管理。
 */
export class BrainManager {
  private contextManager = getContextManager();

  /**
   * 初始化大脑层
   */
  initialize(sessionId: SessionId): void {
    this.contextManager.getOrCreateContext(sessionId);
    logger.info('Brain message store initialized', { sessionId });
  }

  /**
   * 添加消息到历史
   */
  addMessage(sessionId: SessionId, message: Message): void {
    this.contextManager.addMessage(sessionId, message);
  }

  /**
   * 获取对话历史
   */
  getHistory(sessionId: SessionId): Message[] {
    return this.contextManager.getHistory(sessionId);
  }

  /**
   * 获取用于 LLM 的历史格式
   */
  getHistoryForLLM(sessionId: SessionId): Array<{ role: string; content: string }> {
    return this.contextManager.formatHistoryForLLM(sessionId);
  }

  /**
   * 重置会话
   */
  resetSession(sessionId: SessionId): void {
    this.contextManager.resetContext(sessionId);
    logger.info('Session reset', { sessionId });
  }

  /**
   * 清除会话
   */
  clearSession(sessionId: SessionId): void {
    this.contextManager.clearContext(sessionId);
    logger.info('Session cleared', { sessionId });
  }
}

// 创建单例
let brainManagerInstance: BrainManager | null = null;

export function getBrainManager(): BrainManager {
  if (!brainManagerInstance) {
    brainManagerInstance = new BrainManager();
  }
  return brainManagerInstance;
}
