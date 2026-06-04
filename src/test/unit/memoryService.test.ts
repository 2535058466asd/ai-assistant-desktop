import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getMemoryService } from '../../renderer/services/memoryServiceClient';

// Mock 依赖
vi.mock('../../renderer/services/memoryServiceClient', () => ({
  getMemoryService: vi.fn(() => ({
    addMemory: vi.fn(),
    getRelevantMemories: vi.fn(() => []),
    setPreference: vi.fn(),
    getPreference: vi.fn(),
    getAllMemories: vi.fn(() => []),
    deleteMemory: vi.fn(),
    updateMemory: vi.fn(),
  })),
}));

describe('记忆服务客户端', () => {
  let memoryService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    memoryService = getMemoryService();
  });

  describe('getMemoryService', () => {
    it('应该返回记忆服务实例', () => {
      expect(memoryService).toBeDefined();
      expect(memoryService.addMemory).toBeDefined();
      expect(memoryService.getRelevantMemories).toBeDefined();
      expect(memoryService.setPreference).toBeDefined();
      expect(memoryService.getPreference).toBeDefined();
      expect(memoryService.getAllMemories).toBeDefined();
      expect(memoryService.deleteMemory).toBeDefined();
      expect(memoryService.updateMemory).toBeDefined();
    });
  });

  describe('addMemory', () => {
    it('应该添加记忆', async () => {
      const mockResult = { success: true, id: 'memory-123' };
      memoryService.addMemory.mockResolvedValue(mockResult);

      const result = await memoryService.addMemory(
        '用户喜欢暗色主题',
        'preference',
        8,
        {
          confidence: 0.9,
          sourceKind: 'explicit',
        }
      );

      expect(result).toEqual(mockResult);
      expect(memoryService.addMemory).toHaveBeenCalledWith(
        '用户喜欢暗色主题',
        'preference',
        8,
        {
          confidence: 0.9,
          sourceKind: 'explicit',
        }
      );
    });

    it('应该处理添加失败', async () => {
      const mockResult = { success: false, error: '添加失败' };
      memoryService.addMemory.mockResolvedValue(mockResult);

      const result = await memoryService.addMemory(
        '测试记忆',
        'fact',
        5
      );

      expect(result).toEqual(mockResult);
    });
  });

  describe('getRelevantMemories', () => {
    it('应该返回相关记忆', async () => {
      const mockMemories = [
        { id: '1', content: '用户喜欢暗色主题', category: 'preference' },
        { id: '2', content: '用户是前端开发者', category: 'fact' },
      ];
      memoryService.getRelevantMemories.mockResolvedValue(mockMemories);

      const memories = await memoryService.getRelevantMemories('主题偏好');

      expect(memories).toEqual(mockMemories);
      expect(memories).toHaveLength(2);
    });

    it('应该返回空数组如果没有相关记忆', async () => {
      memoryService.getRelevantMemories.mockResolvedValue([]);

      const memories = await memoryService.getRelevantMemories('不存在的话题');

      expect(memories).toEqual([]);
    });
  });

  describe('setPreference', () => {
    it('应该设置偏好', async () => {
      memoryService.setPreference.mockResolvedValue({ success: true });

      const result = await memoryService.setPreference('theme', 'dark');

      expect(result).toEqual({ success: true });
      expect(memoryService.setPreference).toHaveBeenCalledWith('theme', 'dark');
    });
  });

  describe('getPreference', () => {
    it('应该获取偏好', async () => {
      memoryService.getPreference.mockResolvedValue('dark');

      const result = await memoryService.getPreference('theme');

      expect(result).toBe('dark');
    });

    it('应该返回null如果偏好不存在', async () => {
      memoryService.getPreference.mockResolvedValue(null);

      const result = await memoryService.getPreference('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getAllMemories', () => {
    it('应该返回所有记忆', async () => {
      const mockMemories = [
        { id: '1', content: '记忆1', category: 'fact' },
        { id: '2', content: '记忆2', category: 'preference' },
        { id: '3', content: '记忆3', category: 'project' },
      ];
      memoryService.getAllMemories.mockResolvedValue(mockMemories);

      const memories = await memoryService.getAllMemories();

      expect(memories).toEqual(mockMemories);
      expect(memories).toHaveLength(3);
    });
  });

  describe('deleteMemory', () => {
    it('应该删除记忆', async () => {
      memoryService.deleteMemory.mockResolvedValue({ success: true });

      const result = await memoryService.deleteMemory('memory-123');

      expect(result).toEqual({ success: true });
      expect(memoryService.deleteMemory).toHaveBeenCalledWith('memory-123');
    });

    it('应该处理删除失败', async () => {
      memoryService.deleteMemory.mockResolvedValue({ success: false, error: '删除失败' });

      const result = await memoryService.deleteMemory('nonexistent');

      expect(result).toEqual({ success: false, error: '删除失败' });
    });
  });

  describe('updateMemory', () => {
    it('应该更新记忆', async () => {
      memoryService.updateMemory.mockResolvedValue({ success: true });

      const result = await memoryService.updateMemory('memory-123', {
        content: '更新后的内容',
        importance: 9,
      });

      expect(result).toEqual({ success: true });
      expect(memoryService.updateMemory).toHaveBeenCalledWith('memory-123', {
        content: '更新后的内容',
        importance: 9,
      });
    });
  });
});
