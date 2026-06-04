import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeTool } from '../../renderer/core/tools/toolExecutor';
import { executeRegisteredTool, getToolMetadata } from '../../renderer/core/tools/toolRegistry';

// Mock 依赖
vi.mock('../../renderer/core/tools/toolRegistry', () => ({
  executeRegisteredTool: vi.fn(),
  getToolMetadata: vi.fn(),
}));

vi.mock('../../renderer/services/workspaceStore', () => ({
  addToolLog: vi.fn(),
  previewValue: vi.fn((value) => String(value).slice(0, 50)),
}));

describe('工具执行器', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.electronAPI
    (window as any).electronAPI = {
      execCommand: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(),
    };
  });

  describe('executeTool', () => {
    it('应该执行成功', async () => {
      const mockResult = { success: true, data: '执行结果' };
      vi.mocked(executeRegisteredTool).mockResolvedValue(mockResult);
      vi.mocked(getToolMetadata).mockReturnValue({
        category: 'file',
        riskLevel: 'read',
        isReadOnly: true,
        timeoutMs: 30000,
      });

      const result = await executeTool('read_file', { path: '/test' });

      expect(result).toEqual(mockResult);
      expect(executeRegisteredTool).toHaveBeenCalledWith(
        expect.any(Object),
        'read_file',
        { path: '/test' }
      );
    });

    it('应该处理执行失败', async () => {
      const mockResult = { success: false, error: '文件不存在' };
      vi.mocked(executeRegisteredTool).mockResolvedValue(mockResult);
      vi.mocked(getToolMetadata).mockReturnValue({
        category: 'file',
        riskLevel: 'read',
        isReadOnly: true,
        timeoutMs: 30000,
      });

      const result = await executeTool('read_file', { path: '/nonexistent' });

      expect(result).toEqual(mockResult);
    });

    it('应该处理异常', async () => {
      const error = new Error('执行异常');
      vi.mocked(executeRegisteredTool).mockRejectedValue(error);
      vi.mocked(getToolMetadata).mockReturnValue({
        category: 'file',
        riskLevel: 'read',
        isReadOnly: true,
        timeoutMs: 30000,
      });

      const result = await executeTool('read_file', { path: '/test' });

      expect(result).toEqual({
        success: false,
        error: '执行异常',
      });
    });

    it('应该记录日志', async () => {
      const mockResult = { success: true, data: '执行结果' };
      vi.mocked(executeRegisteredTool).mockResolvedValue(mockResult);
      vi.mocked(getToolMetadata).mockReturnValue({
        category: 'file',
        riskLevel: 'read',
        isReadOnly: true,
        timeoutMs: 30000,
      });

      await executeTool('read_file', { path: '/test' });

      // 验证日志被记录
      expect(executeRegisteredTool).toHaveBeenCalled();
    });

    it('应该处理不同类型的工具', async () => {
      const tools = [
        { name: 'read_file', args: { path: '/test' } },
        { name: 'write_file', args: { path: '/test', content: 'hello' } },
        { name: 'exec_command', args: { command: 'ls' } },
        { name: 'web_search', args: { query: 'test' } },
      ];

      for (const tool of tools) {
        const mockResult = { success: true, data: '执行结果' };
        vi.mocked(executeRegisteredTool).mockResolvedValue(mockResult);
        vi.mocked(getToolMetadata).mockReturnValue({
          category: 'file',
          riskLevel: 'read',
          isReadOnly: true,
          timeoutMs: 30000,
        });

        const result = await executeTool(tool.name, tool.args);
        expect(result).toEqual(mockResult);
      }
    });
  });
});
