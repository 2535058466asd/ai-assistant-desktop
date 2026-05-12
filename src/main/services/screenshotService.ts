// ==========================================
// 屏幕截图服务（主进程）
// 负责截取屏幕，为VLM视觉理解做准备
// ==========================================

import { desktopCapturer } from 'electron';
import { createLogger } from '../../shared/logger';

const logger = createLogger('tool');

/**
 * 屏幕截图服务类
 */
export class ScreenshotService {
  constructor() {
    logger.info('Screenshot service initialized');
  }

  /**
   * 截取屏幕
   */
  async takeScreenshot(): Promise<{ success: boolean; imageData?: string; error?: string }> {
    try {
      logger.info('Screenshot capture started');
      
      // 获取屏幕源
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1920, height: 1080 }
      });

      if (sources.length === 0) {
        return { success: false, error: '未找到屏幕源' };
      }

      // 获取第一个屏幕的缩略图（通常是主屏幕）
      const screenSource = sources[0];
      const imageData = screenSource.thumbnail.toDataURL();
      
      logger.info('Screenshot capture succeeded');
      
      return { 
        success: true, 
        imageData 
      };
      
    } catch (error) {
      logger.error('Screenshot capture failed', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }
}

// 创建单例
let screenshotServiceInstance: ScreenshotService | null = null;

export function getScreenshotService(): ScreenshotService {
  if (!screenshotServiceInstance) {
    screenshotServiceInstance = new ScreenshotService();
  }
  return screenshotServiceInstance;
}
