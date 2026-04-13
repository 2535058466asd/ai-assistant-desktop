import { ipcMain, desktopCapturer } from 'electron'

// screenshot — 屏幕截图
export function registerScreenshot() {
  ipcMain.handle('screenshot', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1280, height: 720 }
      });
      const image = sources[0].thumbnail.toDataURL();
      return { success: true, data: image };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}
