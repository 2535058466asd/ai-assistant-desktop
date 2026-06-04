import { describe, it, expect } from 'vitest';
import { validateToolArgs } from '../../renderer/core/tools/toolRegistry';
import type { ToolDefinition } from '../../renderer/core/model';

describe('工具参数验证', () => {
  const mockSchema: ToolDefinition = {
    type: 'function',
    function: {
      name: 'test_tool',
      description: '测试工具',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          content: { type: 'string', description: '文件内容' },
        },
        required: ['path', 'content'],
      },
    },
  };

  describe('validateToolArgs', () => {
    it('应该验证必填参数', () => {
      // 缺少必填参数
      expect(validateToolArgs(mockSchema, {})).toBe('缺少必要参数: path');
      expect(validateToolArgs(mockSchema, { path: '/test' })).toBe('缺少必要参数: content');
    });

    it('应该通过有效参数', () => {
      const validArgs = { path: '/test', content: 'hello' };
      expect(validateToolArgs(mockSchema, validArgs)).toBeNull();
    });

    it('应该拒绝空字符串参数', () => {
      const args = { path: '', content: 'hello' };
      expect(validateToolArgs(mockSchema, args)).toBe('缺少必要参数: path');
    });

    it('应该拒绝null参数', () => {
      const args = { path: null, content: 'hello' };
      expect(validateToolArgs(mockSchema, args)).toBe('缺少必要参数: path');
    });

    it('应该拒绝undefined参数', () => {
      const args = { path: undefined, content: 'hello' };
      expect(validateToolArgs(mockSchema, args)).toBe('缺少必要参数: path');
    });

    it('应该允许额外的参数', () => {
      const args = { path: '/test', content: 'hello', extra: 'data' };
      expect(validateToolArgs(mockSchema, args)).toBeNull();
    });

    it('应该处理没有required字段的schema', () => {
      const schemaWithoutRequired: ToolDefinition = {
        type: 'function',
        function: {
          name: 'test_tool',
          description: '测试工具',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: '文件路径' },
            },
          },
        },
      };

      expect(validateToolArgs(schemaWithoutRequired, {})).toBeNull();
    });

    it('应该处理空的required数组', () => {
      const schemaWithEmptyRequired: ToolDefinition = {
        type: 'function',
        function: {
          name: 'test_tool',
          description: '测试工具',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: '文件路径' },
            },
            required: [],
          },
        },
      };

      expect(validateToolArgs(schemaWithEmptyRequired, {})).toBeNull();
    });
  });
});
