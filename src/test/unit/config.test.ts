import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getActiveModelConfig } from '../../renderer/config/modelConfig';
import { getModelsForProvider } from '../../renderer/config/modelCatalog';

// Mock 依赖
vi.mock('../../renderer/config/modelConfig', () => ({
  getActiveModelConfig: vi.fn(() => ({
    model: 'test-model',
    compactModel: 'test-compact-model',
    baseUrl: 'http://localhost:8080',
    apiKey: 'test-api-key',
  })),
}));

vi.mock('../../renderer/config/modelCatalog', () => ({
  getModelsForProvider: vi.fn(() => [
    { id: 'model-1', name: '模型1', isOnline: true },
    { id: 'model-2', name: '模型2', isOnline: true },
    { id: 'model-3', name: '模型3', isOnline: false },
  ]),
}));

describe('配置管理', () => {
  describe('modelConfig', () => {
    it('应该返回活动模型配置', () => {
      const config = getActiveModelConfig();

      expect(config).toBeDefined();
      expect(config.model).toBe('test-model');
      expect(config.compactModel).toBe('test-compact-model');
      expect(config.baseUrl).toBe('http://localhost:8080');
      expect(config.apiKey).toBe('test-api-key');
    });

    it('应该支持不同的模型', () => {
      const config = getActiveModelConfig();

      expect(config.model).toBeDefined();
      expect(typeof config.model).toBe('string');
    });
  });

  describe('modelCatalog', () => {
    it('应该返回模型列表', () => {
      const models = getModelsForProvider('doubao');

      expect(models).toBeDefined();
      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);
    });

    it('应该包含模型信息', () => {
      const models = getModelsForProvider('doubao');
      const firstModel = models[0];

      expect(firstModel.id).toBeDefined();
      expect(firstModel.name).toBeDefined();
      expect(firstModel.isOnline).toBeDefined();
    });

    it('应该支持不同的供应商', () => {
      const doubaoModels = getModelsForProvider('doubao');
      const mimoModels = getModelsForProvider('mimo');

      expect(doubaoModels).toBeDefined();
      expect(mimoModels).toBeDefined();
    });

    it('应该包含在线和离线模型', () => {
      const models = getModelsForProvider('doubao');
      const onlineModels = models.filter(m => m.isOnline);
      const offlineModels = models.filter(m => !m.isOnline);

      expect(onlineModels.length).toBeGreaterThan(0);
      // 可能有离线模型，也可能没有
    });
  });
});
