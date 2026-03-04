// ==========================================
// 屏幕截图服务（主进程）
// 负责截取屏幕，为VLM视觉理解做准备
// ==========================================

import { desktopCapturer } from 'electron';

/**
 * 屏幕截图服务类
 */
export class ScreenshotService {
  constructor() {
    console.log('📸 屏幕截图服务初始化成功');
  }

  /**
   * 截取屏幕
   */
  async takeScreenshot(): Promise<{ success: boolean; imageData?: string; error?: string }> {
    try {
      console.log('📸 开始截取屏幕...');
      
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
      
      console.log('📸 屏幕截图成功');
      
      return { 
        success: true, 
        imageData 
      };
      
    } catch (error) {
      console.error('❌ 屏幕截图失败:', error);
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
