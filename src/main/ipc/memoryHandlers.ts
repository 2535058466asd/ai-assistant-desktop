import { ipcMain } from 'electron';
import { createLogger } from '../../shared/logger';
import { getMemoryService } from '../services/memory/memoryServiceBackend';

const logger = createLogger('ipc');
const memoryService = getMemoryService();

export function registerMemoryHandlers() {
  ipcMain.handle('memory-set-preference', async (_event, key: string, value: any) => {
    try {
      memoryService.setPreference(key, value);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('memory-get-preference', async (_event, key: string) => {
    return memoryService.getPreference(key);
  });

  ipcMain.handle('memory-get-all-preferences', async () => {
    return memoryService.getAllPreferences();
  });

  ipcMain.handle('memory-add-memory', async (_event, content: string, category: string = 'fact', importance: number = 5, options: any = {}) => {
    try {
      const result = await memoryService.addMemory(content, category as any, importance, options);
      return { success: true, ...result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('memory-get-all-memories', async () => {
    return memoryService.getAllMemories();
  });

  ipcMain.handle('memory-get-prompt', async (_event, userInput: string = '') => {
    return await memoryService.getMemoryPrompt(userInput);
  });

  ipcMain.handle('memory-search-memories', async (_event, keyword: string, limit: number = 10) => {
    return memoryService.searchMemories(keyword, limit);
  });

  ipcMain.handle('memory-delete-memory', async (_event, id: string) => {
    try {
      await memoryService.deleteMemory(id);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('memory-set-status', async (_event, id: string, status: 'active' | 'archived') => {
    try {
      await memoryService.setMemoryStatus(id, status);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('memory-clear-all-memories', async () => {
    try {
      await memoryService.clearAllMemories();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}
