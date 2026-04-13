import { ipcMain, clipboard } from 'electron'

// clipboard_read — 读取剪贴板
export function registerClipboardRead() {
  ipcMain.handle('clipboard-read', async () => {
    try {
      const text = clipboard.readText();
      return { success: true, data: text || '剪贴板为空' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}

// clipboard_write — 写入剪贴板
export function registerClipboardWrite() {
  ipcMain.handle('clipboard-write', async (_event, text: string) => {
    try {
      clipboard.writeText(text);
      return { success: true, data: '已复制到剪贴板' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}
