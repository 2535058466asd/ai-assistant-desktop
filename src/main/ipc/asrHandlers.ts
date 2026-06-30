import { ipcMain, BrowserWindow } from 'electron';
import { createLogger } from '../../shared/logger';
import { getASRService } from '../services/asr/volcengineASRWebSocketService';

const logger = createLogger('ipc');

export function registerASRHandlers() {
  ipcMain.handle('asr-v3-connect', async (_event, config: any) => {
    try {
      const window = BrowserWindow.getAllWindows()[0];
      if (!window) {
        return { success: false, error: '没有找到主窗口' };
      }
      const asrService = getASRService(config, window);
      await asrService.connect();
      return { success: true };
    } catch (error) {
      logger.error('ASR connect failed', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('asr-v3-start-recognition', async (_event, config: any) => {
    try {
      const window = BrowserWindow.getAllWindows()[0];
      if (!window) {
        return { success: false, error: '没有找到主窗口' };
      }
      const asrService = getASRService(config, window);
      await asrService.startRecognition();
      return { success: true };
    } catch (error) {
      logger.error('ASR start recognition failed', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('asr-v3-send-audio', async (_event, config: any, audioBase64: string, isLast: boolean) => {
    try {
      const window = BrowserWindow.getAllWindows()[0];
      if (!window) {
        return { success: false, error: '没有找到主窗口' };
      }
      const asrService = getASRService(config, window);
      await asrService.sendAudioChunk(audioBase64, isLast);
      return { success: true };
    } catch (error) {
      logger.error('ASR send audio failed', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('asr-v3-stop-recognition', async (_event, config: any) => {
    try {
      const window = BrowserWindow.getAllWindows()[0];
      if (!window) {
        return { success: true };
      }
      const asrService = getASRService(config, window);
      asrService.stopRecognition();
      return { success: true };
    } catch (error) {
      logger.error('ASR stop recognition failed', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
