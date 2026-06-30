import { ipcMain } from 'electron';
import { createLogger } from '../../shared/logger';
import { getConversationArchiveService } from '../services/conversationArchiveService';

const logger = createLogger('ipc');
const conversationArchiveService = getConversationArchiveService();

export function registerConversationHandlers() {
  ipcMain.handle('conversation-list', async () => {
    try {
      return { success: true, data: await conversationArchiveService.listConversations() };
    } catch (error) {
      logger.error('List conversations failed', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('conversation-get-messages', async (_event, chatId: string) => {
    try {
      return { success: true, data: await conversationArchiveService.getMessages(chatId) };
    } catch (error) {
      logger.error('Get conversation messages failed', { chatId, error });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('conversation-save', async (_event, conversation: any, messages: any[]) => {
    try {
      await conversationArchiveService.saveConversation(conversation, messages);
      return { success: true };
    } catch (error) {
      logger.error('Save conversation failed', { chatId: conversation?.id, error });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('conversation-delete', async (_event, chatId: string) => {
    try {
      await conversationArchiveService.deleteConversation(chatId);
      return { success: true };
    } catch (error) {
      logger.error('Delete conversation failed', { chatId, error });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('conversation-rename', async (_event, chatId: string, title: string) => {
    try {
      await conversationArchiveService.renameConversation(chatId, title);
      return { success: true };
    } catch (error) {
      logger.error('Rename conversation failed', { chatId, error });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('conversation-set-pinned', async (_event, chatId: string, isPinned: boolean) => {
    try {
      await conversationArchiveService.setPinned(chatId, isPinned);
      return { success: true };
    } catch (error) {
      logger.error('Set conversation pinned failed', { chatId, error });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('conversation-import-legacy', async (_event, entries: any[]) => {
    try {
      return { success: true, data: await conversationArchiveService.importLegacy(entries) };
    } catch (error) {
      logger.error('Import legacy conversations failed', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
