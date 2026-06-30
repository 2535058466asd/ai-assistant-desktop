import { ipcMain } from 'electron';
import { createLogger } from '../../shared/logger';
import { getRealtimeDialogService } from '../services/realtimeDialogService';

const logger = createLogger('ipc');

export function registerRealtimeDialogHandlers(getMainWindow: () => Electron.BrowserWindow | null) {
  ipcMain.handle('realtime-dialog-connect', async (_event, config: any) => {
    try {
      const mainWindow = getMainWindow();
      if (!mainWindow) throw new Error('mainWindow 不可用');
      const service = getRealtimeDialogService(mainWindow);
      await service.connect(config);
      return { success: true };
    } catch (error) {
      logger.error('Realtime dialog connect failed', error);
      return { success: false, error: error instanceof Error ? error.message : 'Realtime dialog connect failed' };
    }
  });

  ipcMain.handle('realtime-dialog-send-audio', async (_event, audioBase64: string) => {
    try {
      const mainWindow = getMainWindow();
      if (!mainWindow) throw new Error('mainWindow 不可用');
      const service = getRealtimeDialogService(mainWindow);
      await service.sendAudio(audioBase64);
      return { success: true };
    } catch (error) {
      logger.error('Realtime dialog send audio failed', error);
      return { success: false, error: error instanceof Error ? error.message : 'Realtime dialog send audio failed' };
    }
  });

  ipcMain.handle('realtime-dialog-disconnect', async () => {
    try {
      const mainWindow = getMainWindow();
      if (!mainWindow) throw new Error('mainWindow 不可用');
      const service = getRealtimeDialogService(mainWindow);
      await service.disconnect();
      return { success: true };
    } catch (error) {
      logger.error('Realtime dialog disconnect failed', error);
      return { success: false, error: error instanceof Error ? error.message : 'Realtime dialog disconnect failed' };
    }
  });
}
