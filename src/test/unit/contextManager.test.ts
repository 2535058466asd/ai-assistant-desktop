import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContextManager } from '../../renderer/core/history/contextManager';
import type { Message, SessionId } from '../../renderer/types';

describe('上下文管理器', () => {
  let contextManager: ContextManager;
  const testSessionId: SessionId = 'test-session-123';

  beforeEach(() => {
    contextManager = new ContextManager();
  });

  describe('createContext', () => {
    it('应该创建新的上下文', () => {
      const context = contextManager.createContext(testSessionId);

      expect(context).toBeDefined();
      expect(context.sessionId).toBe(testSessionId);
      expect(context.history).toEqual([]);
      expect(context.lastActiveTime).toBeGreaterThan(0);
    });

    it('应该覆盖已存在的上下文', () => {
      const context1 = contextManager.createContext(testSessionId);
      const context2 = contextManager.createContext(testSessionId);

      expect(context2).toBeDefined();
      expect(context2.sessionId).toBe(testSessionId);
    });
  });

  describe('getContext', () => {
    it('应该返回存在的上下文', () => {
      contextManager.createContext(testSessionId);
      const context = contextManager.getContext(testSessionId);

      expect(context).toBeDefined();
      expect(context?.sessionId).toBe(testSessionId);
    });

    it('应该返回null如果不存在', () => {
      const context = contextManager.getContext('non-existent');

      expect(context).toBeNull();
    });
  });

  describe('getOrCreateContext', () => {
    it('应该返回已存在的上下文', () => {
      const created = contextManager.createContext(testSessionId);
      const retrieved = contextManager.getOrCreateContext(testSessionId);

      expect(retrieved).toBe(created);
    });

    it('应该创建新上下文如果不存在', () => {
      const context = contextManager.getOrCreateContext(testSessionId);

      expect(context).toBeDefined();
      expect(context.sessionId).toBe(testSessionId);
      expect(context.history).toEqual([]);
    });
  });

  describe('addMessage', () => {
    it('应该添加消息到上下文', () => {
      contextManager.createContext(testSessionId);
      const message: Message = {
        id: 'msg1',
        role: 'user',
        content: '你好',
        timestamp: Date.now(),
        sessionId: testSessionId,
      };

      contextManager.addMessage(testSessionId, message);
      const history = contextManager.getHistory(testSessionId);

      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(message);
    });

    it('应该自动创建上下文如果不存在', () => {
      const message: Message = {
        id: 'msg1',
        role: 'user',
        content: '你好',
        timestamp: Date.now(),
        sessionId: testSessionId,
      };

      contextManager.addMessage(testSessionId, message);
      const context = contextManager.getContext(testSessionId);

      expect(context).toBeDefined();
      expect(context?.history).toHaveLength(1);
    });

    it('应该更新最后活跃时间', () => {
      const context = contextManager.createContext(testSessionId);
      const originalTime = context.lastActiveTime;

      // 等待一小段时间
      const message: Message = {
        id: 'msg1',
        role: 'user',
        content: '你好',
        timestamp: Date.now(),
        sessionId: testSessionId,
      };

      contextManager.addMessage(testSessionId, message);
      const updatedContext = contextManager.getContext(testSessionId);

      expect(updatedContext?.lastActiveTime).toBeGreaterThanOrEqual(originalTime);
    });
  });

  describe('getHistory', () => {
    it('应该返回历史副本', () => {
      contextManager.createContext(testSessionId);
      const message: Message = {
        id: 'msg1',
        role: 'user',
        content: '你好',
        timestamp: Date.now(),
        sessionId: testSessionId,
      };

      contextManager.addMessage(testSessionId, message);
      const history1 = contextManager.getHistory(testSessionId);
      const history2 = contextManager.getHistory(testSessionId);

      expect(history1).toEqual(history2);
      expect(history1).not.toBe(history2); // 应该是不同的数组引用
    });

    it('应该返回空数组如果不存在', () => {
      const history = contextManager.getHistory('non-existent');

      expect(history).toEqual([]);
    });
  });

  describe('setHistory', () => {
    it('应该设置历史', () => {
      contextManager.createContext(testSessionId);
      const history: Message[] = [
        { id: 'msg1', role: 'user', content: '你好', timestamp: Date.now(), sessionId: testSessionId },
        { id: 'msg2', role: 'assistant', content: '你好呀', timestamp: Date.now(), sessionId: testSessionId },
      ];

      contextManager.setHistory(testSessionId, history);
      const retrievedHistory = contextManager.getHistory(testSessionId);

      expect(retrievedHistory).toHaveLength(2);
      expect(retrievedHistory).toEqual(history);
    });

    it('应该自动创建上下文如果不存在', () => {
      const history: Message[] = [
        { id: 'msg1', role: 'user', content: '你好', timestamp: Date.now(), sessionId: testSessionId },
      ];

      contextManager.setHistory(testSessionId, history);
      const context = contextManager.getContext(testSessionId);

      expect(context).toBeDefined();
      expect(context?.history).toHaveLength(1);
    });
  });

  describe('clearContext', () => {
    it('应该删除上下文', () => {
      contextManager.createContext(testSessionId);
      expect(contextManager.getContext(testSessionId)).toBeDefined();

      contextManager.clearContext(testSessionId);
      expect(contextManager.getContext(testSessionId)).toBeNull();
    });
  });

  describe('getAllSessions', () => {
    it('应该返回所有会话ID', () => {
      contextManager.createContext('session1');
      contextManager.createContext('session2');
      contextManager.createContext('session3');

      const sessions = contextManager.getAllSessions();

      expect(sessions).toHaveLength(3);
      expect(sessions).toContain('session1');
      expect(sessions).toContain('session2');
      expect(sessions).toContain('session3');
    });

    it('应该返回空数组如果没有会话', () => {
      const sessions = contextManager.getAllSessions();

      expect(sessions).toEqual([]);
    });
  });

  describe('cleanupInactiveSessions', () => {
    it('应该清理不活跃的会话', () => {
      // 创建一个会话并设置最后活跃时间为很久以前
      const context = contextManager.createContext(testSessionId);
      (context as any).lastActiveTime = Date.now() - 2 * 60 * 60 * 1000; // 2小时前

      const cleanedCount = contextManager.cleanupInactiveSessions(1); // 清理1小时前的会话

      expect(cleanedCount).toBe(1);
      expect(contextManager.getContext(testSessionId)).toBeNull();
    });

    it('应该保留活跃的会话', () => {
      contextManager.createContext(testSessionId);

      const cleanedCount = contextManager.cleanupInactiveSessions(1);

      expect(cleanedCount).toBe(0);
      expect(contextManager.getContext(testSessionId)).toBeDefined();
    });
  });

  describe('formatHistoryForLLM', () => {
    it('应该格式化历史为LLM格式', () => {
      contextManager.createContext(testSessionId);
      const message: Message = {
        id: 'msg1',
        role: 'user',
        content: '你好',
        timestamp: Date.now(),
        sessionId: testSessionId,
        reasoning_content: '思考过程',
        tool_calls: [{ id: 'call1', type: 'function', function: { name: 'test', arguments: '{}' } }],
      };

      contextManager.addMessage(testSessionId, message);
      const llmHistory = contextManager.formatHistoryForLLM(testSessionId);

      expect(llmHistory).toHaveLength(1);
      expect(llmHistory[0]).toEqual({
        role: 'user',
        content: '你好',
        reasoning_content: '思考过程',
        tool_calls: [{ id: 'call1', type: 'function', function: { name: 'test', arguments: '{}' } }],
      });
    });

    it('应该省略undefined字段', () => {
      contextManager.createContext(testSessionId);
      const message: Message = {
        id: 'msg1',
        role: 'user',
        content: '你好',
        timestamp: Date.now(),
        sessionId: testSessionId,
      };

      contextManager.addMessage(testSessionId, message);
      const llmHistory = contextManager.formatHistoryForLLM(testSessionId);

      expect(llmHistory[0]).not.toHaveProperty('reasoning_content');
      expect(llmHistory[0]).not.toHaveProperty('tool_calls');
    });
  });
});
