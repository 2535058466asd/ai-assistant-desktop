import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationRuntime } from '../../renderer/core/conversation/conversationRuntime';
import type { Message } from '../../renderer/types';

// Mock HistoryManager
const mockHistoryManager = {
  initialize: vi.fn(),
  setHistory: vi.fn(),
  getHistory: vi.fn(),
  addMessage: vi.fn(),
  getHistoryForLLM: vi.fn(),
};

describe('对话运行时', () => {
  let runtime: ConversationRuntime;

  beforeEach(() => {
    runtime = new ConversationRuntime(mockHistoryManager as any);
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('应该生成sessionId并初始化', () => {
      const sessionId = runtime.initialize();

      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');
      expect(sessionId.length).toBeGreaterThan(0);
      expect(mockHistoryManager.initialize).toHaveBeenCalledWith(sessionId);
    });
  });

  describe('reset', () => {
    it('应该重置对话并返回新sessionId', () => {
      const history: Message[] = [
        { id: '1', role: 'user', content: '你好', timestamp: Date.now(), sessionId: 'old' },
        { id: '2', role: 'assistant', content: '你好呀', timestamp: Date.now(), sessionId: 'old' },
      ];

      const newSessionId = runtime.reset(history);

      expect(newSessionId).toBeDefined();
      expect(newSessionId).not.toBe('old');
      expect(mockHistoryManager.initialize).toHaveBeenCalledWith(newSessionId);
      expect(mockHistoryManager.setHistory).toHaveBeenCalled();
    });

    it('应该处理空历史', () => {
      const newSessionId = runtime.reset([]);

      expect(newSessionId).toBeDefined();
      expect(mockHistoryManager.setHistory).toHaveBeenCalledWith(newSessionId, []);
    });

    it('应该归档历史消息', () => {
      const history: Message[] = [
        { id: '1', role: 'user', content: '你好', timestamp: Date.now(), sessionId: 'old' },
      ];

      runtime.reset(history);
      const archiveHistory = runtime.getArchiveHistory();

      expect(archiveHistory).toHaveLength(1);
      expect(archiveHistory[0].content).toBe('你好');
    });
  });

  describe('getSessionId', () => {
    it('应该返回当前sessionId', () => {
      const sessionId = runtime.initialize();
      expect(runtime.getSessionId()).toBe(sessionId);
    });
  });

  describe('createMessageId', () => {
    it('应该生成唯一的消息ID', () => {
      const id1 = runtime.createMessageId();
      const id2 = runtime.createMessageId();

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
    });
  });

  describe('addMessage', () => {
    it('应该添加消息到归档历史和历史管理器', () => {
      runtime.initialize();
      const message: Message = {
        id: 'test',
        role: 'user',
        content: '测试消息',
        timestamp: Date.now(),
        sessionId: runtime.getSessionId(),
      };

      runtime.addMessage(message);

      expect(runtime.getArchiveHistory()).toContain(message);
      expect(mockHistoryManager.addMessage).toHaveBeenCalledWith(runtime.getSessionId(), message);
    });
  });

  describe('getHistory', () => {
    it('应该返回历史管理器的历史', () => {
      const mockHistory = [{ id: '1', content: 'test' }];
      mockHistoryManager.getHistory.mockReturnValue(mockHistory);

      runtime.initialize();
      const history = runtime.getHistory();

      expect(history).toBe(mockHistory);
      expect(mockHistoryManager.getHistory).toHaveBeenCalledWith(runtime.getSessionId());
    });
  });

  describe('getModelHistory', () => {
    it('应该返回最近的消息', () => {
      const longHistory = Array.from({ length: 100 }, (_, i) => ({
        id: `${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `消息${i}`,
        timestamp: Date.now() + i,
        sessionId: 'test',
      }));

      mockHistoryManager.getHistory.mockReturnValue(longHistory);
      runtime.initialize();

      const modelHistory = runtime.getModelHistory(10);

      expect(modelHistory).toHaveLength(10);
      expect(modelHistory[0].content).toBe('消息90');
    });

    it('应该包含历史摘要', () => {
      const historyWithSummary = [
        { id: 'summary', role: 'system', content: '[历史摘要] 之前的对话', timestamp: 1, sessionId: 'test' },
        ...Array.from({ length: 5 }, (_, i) => ({
          id: `${i}`,
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `消息${i}`,
          timestamp: Date.now() + i,
          sessionId: 'test',
        })),
      ];

      mockHistoryManager.getHistory.mockReturnValue(historyWithSummary);
      runtime.initialize();

      const modelHistory = runtime.getModelHistory(3);

      expect(modelHistory).toHaveLength(4); // 摘要 + 3条消息
      expect(modelHistory[0].content).toBe('[历史摘要] 之前的对话');
    });
  });
});
