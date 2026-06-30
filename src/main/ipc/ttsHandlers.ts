import { ipcMain, BrowserWindow } from 'electron';
import { createLogger } from '../../shared/logger';
import { getTTSService } from '../services/tts/volcengineTTSWebSocketService';
import { getVolcengineTTSVoiceCatalogService } from '../services/volcengineTTSVoiceCatalogService';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import crypto from 'crypto';

const logger = createLogger('ipc');

const getTTSCacheDir = () => {
  const cacheDir = path.join(app.getPath('userData'), 'tts-cache');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  return cacheDir;
};

const getCacheFileName = (text: string, voice: string): string => {
  const hash = crypto.createHash('md5').update(`${text}_${voice}`).digest('hex');
  return `${hash}.wav`;
};

export function registerTTSHandlers() {
  ipcMain.handle('tts-v3-connect', async (_event, config: any) => {
    try {
      const window = BrowserWindow.getAllWindows()[0];
      if (!window) {
        return { success: false, error: '没有找到主窗口' };
      }
      const ttsService = getTTSService(config, window);
      await ttsService.connect();
      return { success: true };
    } catch (error) {
      logger.error('TTS connect failed', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('tts-v3-synthesize', async (_event, config: any, text: string, options?: { sessionId?: string }) => {
    try {
      const window = BrowserWindow.getAllWindows()[0];
      if (!window) {
        return { success: false, error: '没有找到主窗口' };
      }
      const ttsService = getTTSService(config, window);
      const sessionId = await ttsService.synthesize(text, options?.sessionId);
      return { success: true, sessionId };
    } catch (error) {
      logger.error('TTS synthesize failed', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('tts-v3-disconnect', async () => {
    try {
      return { success: true };
    } catch (error) {
      logger.error('TTS disconnect failed', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('volcengine-tts-list-speakers', async (_event, options?: { resourceId?: string; forceRefresh?: boolean }) => {
    try {
      const service = getVolcengineTTSVoiceCatalogService();
      const result = await service.listSpeakers(options?.resourceId, options?.forceRefresh);
      return { success: true, data: result.data, raw: result.raw };
    } catch (error) {
      logger.error('List speakers failed', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('tts-cache-check', async (_event, text: string, voice: string) => {
    try {
      const cacheDir = getTTSCacheDir();
      const fileName = getCacheFileName(text, voice);
      const filePath = path.join(cacheDir, fileName);

      if (fs.existsSync(filePath)) {
        logger.debug('TTS cache hit', { fileName });
        const audioData = fs.readFileSync(filePath);
        return { exists: true, audioData: audioData.toString('base64') };
      }

      logger.debug('TTS cache miss');
      return { exists: false };
    } catch (error) {
      logger.error('TTS cache check failed', error);
      return { exists: false };
    }
  });

  ipcMain.handle('tts-cache-save', async (_event, text: string, voice: string, audioBase64: string) => {
    try {
      const cacheDir = getTTSCacheDir();
      const fileName = getCacheFileName(text, voice);
      const filePath = path.join(cacheDir, fileName);

      const audioBuffer = Buffer.from(audioBase64, 'base64');
      fs.writeFileSync(filePath, audioBuffer);

      logger.info('TTS cache saved', { fileName, sizeBytes: audioBuffer.length });
      return { success: true, filePath };
    } catch (error) {
      logger.error('TTS cache save failed', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
