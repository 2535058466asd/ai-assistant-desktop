import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContextCompactor } from '../../renderer/core/context/contextCompactor';

// Mock HistoryManager
const mockHistoryManager = {
  getHistoryForLLM: vi.fn(),
  setHistory: vi.fn(),
};

describe('上下文压缩系统', () => {
  let compactor: ContextCompactor;

  beforeEach(() => {
    compactor = new ContextCompactor(mockHistoryManager as any, 'test-session');
    vi.clearAllMocks();
  });

  describe('truncateToolResult', () => {
    it('应该截断过长的工具结果', () => {
      const longResult = 'a'.repeat(10000);
      const truncated = compactor.truncateToolResult(longResult);

      expect(truncated.length).toBeLessThan(longResult.length);
      expect(truncated).toContain('[结果已截断');
    });

    it('应该保留短工具结果', () => {
      const shortResult = '短结果';
      const result = compactor.truncateToolResult(shortResult);

      expect(result).toBe(shortResult);
    });

    it('应该正确计算截断长度', () => {
      const result = 'a'.repeat(6000); // 6000字符，约1500 tokens
      const truncated = compactor.truncateToolResult(result);

      // 应该被截断，因为超过1500 tokens
      expect(truncated).toContain('[结果已截断');
    });
  });

  describe('estimateTokens', () => {
    it('应该正确估算中文字符的token数', () => {
      // 中文字符约占2个tokens
      const messages = [{ content: '你好世界' }]; // 4个中文字符
      const tokens = (compactor as any).estimateTokens(messages);

      expect(tokens).toBe(8); // 4 * 2 = 8
    });

    it('应该正确估算英文字符的token数', () => {
      // 英文字符约占0.4个tokens
      const messages = [{ content: 'hello' }]; // 5个英文字符
      const tokens = (compactor as any).estimateTokens(messages);

      expect(tokens).toBe(2); // 5 * 0.4 = 2
    });

    it('应该正确估算混合内容', () => {
      const messages = [{ content: '你好hello' }]; // 2中文 + 5英文
      const tokens = (compactor as any).estimateTokens(messages);

      expect(tokens).toBe(6); // 2*2 + 5*0.4 = 4 + 2 = 6
    });

    it('应该处理空内容', () => {
      const messages = [{ content: '' }];
      const tokens = (compactor as any).estimateTokens(messages);

      expect(tokens).toBe(0);
    });

    it('应该处理无content的消息', () => {
      const messages = [{ role: 'system' }];
      const tokens = (compactor as any).estimateTokens(messages);

      expect(tokens).toBe(0);
    });
  });
});
