import { ipcMain } from 'electron';
import { createLogger } from '../../shared/logger';
import { deleteAttachmentsByChat, readAttachmentDataUrl, saveAttachment } from '../services/attachmentService';

const logger = createLogger('ipc');

export function registerAttachmentHandlers() {
  ipcMain.handle('attachment-save', async (_event, input: {
    chatId: string;
    name: string;
    mimeType: string;
    dataUrl: string;
  }) => {
    try {
      return { success: true, data: saveAttachment(input) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('attachment-read-data-url', async (_event, relativePath: string, mimeType: string) => {
    try {
      return { success: true, data: readAttachmentDataUrl(relativePath, mimeType) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('attachment-delete-by-chat', async (_event, chatId: string) => {
    try {
      deleteAttachmentsByChat(chatId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
