import { describe, it, expect } from 'vitest';
import { getTextContent, type ModelContentPart } from '../../renderer/core/model/types';

describe('模型类型工具', () => {
  describe('getTextContent', () => {
    it('应该返回字符串内容', () => {
      expect(getTextContent('hello')).toBe('hello');
    });

    it('应该返回空字符串', () => {
      expect(getTextContent('')).toBe('');
    });

    it('应该处理undefined', () => {
      expect(getTextContent(undefined)).toBe('');
    });

    it('应该处理null', () => {
      expect(getTextContent(null as any)).toBe('');
    });

    it('应该从ModelContentPart数组提取文本', () => {
      const content: ModelContentPart[] = [
        { type: 'text', text: '你好' },
        { type: 'text', text: '世界' },
      ];

      expect(getTextContent(content)).toBe('你好\n世界');
    });

    it('应该过滤非文本内容', () => {
      const content: ModelContentPart[] = [
        { type: 'text', text: '你好' },
        { type: 'image_url', image_url: { url: 'http://example.com/image.png' } },
        { type: 'text', text: '世界' },
      ];

      expect(getTextContent(content)).toBe('你好\n世界');
    });

    it('应该处理空数组', () => {
      expect(getTextContent([])).toBe('');
    });

    it('应该处理只有图片的数组', () => {
      const content: ModelContentPart[] = [
        { type: 'image_url', image_url: { url: 'http://example.com/image.png' } },
      ];

      expect(getTextContent(content)).toBe('');
    });

    it('应该处理单个文本部分', () => {
      const content: ModelContentPart[] = [
        { type: 'text', text: 'hello' },
      ];

      expect(getTextContent(content)).toBe('hello');
    });
  });
});
