import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLogger, createTraceId } from '../../shared/logger';

describe('日志系统', () => {
  describe('createLogger', () => {
    it('应该创建日志记录器', () => {
      const logger = createLogger('test');

      expect(logger).toBeDefined();
      expect(logger.info).toBeDefined();
      expect(logger.error).toBeDefined();
      expect(logger.warn).toBeDefined();
      expect(logger.debug).toBeDefined();
    });

    it('应该能够记录信息日志', () => {
      const logger = createLogger('test');
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      logger.info('测试信息', { key: 'value' });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('应该能够记录错误日志', () => {
      const logger = createLogger('test');
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      logger.error('测试错误', new Error('test error'));

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('应该能够记录警告日志', () => {
      const logger = createLogger('test');
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      logger.warn('测试警告', { key: 'value' });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('应该能够记录调试日志', () => {
      const logger = createLogger('test');
      const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      logger.debug('测试调试', { key: 'value' });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('应该支持不同的模块名', () => {
      const logger1 = createLogger('module1');
      const logger2 = createLogger('module2');

      expect(logger1).toBeDefined();
      expect(logger2).toBeDefined();
    });
  });

  describe('createTraceId', () => {
    it('应该生成traceId', () => {
      const traceId = createTraceId();

      expect(traceId).toBeDefined();
      expect(typeof traceId).toBe('string');
      expect(traceId.length).toBeGreaterThan(0);
    });

    it('应该生成唯一的traceId', () => {
      const traceId1 = createTraceId();
      const traceId2 = createTraceId();

      expect(traceId1).not.toBe(traceId2);
    });

    it('应该以trc-开头', () => {
      const traceId = createTraceId();

      // traceId应该以trc-开头
      expect(traceId).toMatch(/^trc-/);
    });

    it('应该包含时间戳部分', () => {
      const traceId = createTraceId();

      // traceId应该包含时间戳部分（base36格式）
      expect(traceId).toMatch(/^trc-[a-z0-9]+-/);
    });
  });
});
