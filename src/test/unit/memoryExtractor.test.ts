import { describe, it, expect } from 'vitest';
import { shouldExtractMemory, extractMemoriesWithLLM } from '../../renderer/core/utils/memoryExtractor';

describe('记忆提取系统', () => {
  describe('shouldExtractMemory', () => {
    it('应该跳过短消息', () => {
      expect(shouldExtractMemory('你好', '你好呀')).toBe(false);
      expect(shouldExtractMemory('', 'hello')).toBe(false);
      expect(shouldExtractMemory('   ', 'hello')).toBe(false);
    });

    it('应该跳过问候语', () => {
      expect(shouldExtractMemory('你好啊大家好', '你好')).toBe(false);
      expect(shouldExtractMemory('hi hello', 'hello')).toBe(false);
      expect(shouldExtractMemory('早上好', '早上好')).toBe(false);
    });

    it('应该跳过短回复', () => {
      expect(shouldExtractMemory('这是一个很长的消息', '短')).toBe(false);
      expect(shouldExtractMemory('这是一个很长的消息', 'ok')).toBe(false);
    });

    it('应该提取有效消息', () => {
      expect(shouldExtractMemory('我叫李明，我是一名前端开发者', '你好李明，很高兴认识你')).toBe(true);
      expect(shouldExtractMemory('我喜欢暗色主题', '好的，我会记住你的偏好')).toBe(true);
    });

    it('应该处理边界情况', () => {
      // 正好5个字符（新阈值）
      expect(shouldExtractMemory('12345', '这是一个足够长的回复')).toBe(true);
      // 4个字符
      expect(shouldExtractMemory('1234', '这是一个足够长的回复')).toBe(false);
      // 正好10个字符的回复
      expect(shouldExtractMemory('这是一个足够长的消息', '1234567890')).toBe(true);
      // 9个字符的回复
      expect(shouldExtractMemory('这是一个足够长的消息', '123456789')).toBe(false);
    });
  });
});
