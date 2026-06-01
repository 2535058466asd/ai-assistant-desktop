import type { Message } from '../types';
import type { ChatItem } from '../types/chat';
import { createLogger } from '../../shared/logger';

const logger = createLogger('history');
const STORAGE_KEY_CHAT_LIST = 'nova.chat.list';
const LEGACY_STORAGE_KEY_CHAT_LIST = 'qiyuan_chat_list';
const STORAGE_KEY_MESSAGES = 'nova.messages.';
const LEGACY_STORAGE_KEY_MESSAGES = 'qiyuan_messages_';
const STORAGE_KEY_MIGRATED = 'nova.chat.sqliteMigrated';

function readArray<T>(key: string): T[] {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return [];
    const value = JSON.parse(saved);
    return Array.isArray(value) ? value : [];
  } catch (error) {
    logger.error('读取旧版聊天存储失败', { key, error });
    return [];
  }
}

export async function migrateLegacyConversationArchive(): Promise<void> {
  if (localStorage.getItem(STORAGE_KEY_MIGRATED) === 'true') {
    const archived = await window.electronAPI.conversationList();
    if (!archived.success) throw new Error(archived.error || '检查聊天存档失败');
    // 数据库存在记录时无需重复迁移；数据库为空时允许用保留的 localStorage 备份恢复。
    if ((archived.data || []).length > 0) return;
  }

  const chats = readArray<ChatItem>(STORAGE_KEY_CHAT_LIST).length > 0
    ? readArray<ChatItem>(STORAGE_KEY_CHAT_LIST)
    : readArray<ChatItem>(LEGACY_STORAGE_KEY_CHAT_LIST);

  const entries = chats.map((conversation) => {
    const messages = readArray<Message>(STORAGE_KEY_MESSAGES + conversation.id).length > 0
      ? readArray<Message>(STORAGE_KEY_MESSAGES + conversation.id)
      : readArray<Message>(LEGACY_STORAGE_KEY_MESSAGES + conversation.id);
    return {
      conversation,
      messages: messages.filter((message) => message.sessionId !== 'welcome'),
    };
  });

  const result = await window.electronAPI.conversationImportLegacy(entries);
  if (!result.success) throw new Error(result.error || '迁移旧版聊天记录失败');
  localStorage.setItem(STORAGE_KEY_MIGRATED, 'true');
  logger.info('旧版聊天记录迁移完成', {
    phase: 'persist',
    sourceChatCount: entries.length,
    importedChatCount: result.data?.conversations || 0,
    importedMessageCount: result.data?.messages || 0,
  });
}

export async function listArchivedConversations(): Promise<ChatItem[]> {
  const result = await window.electronAPI.conversationList();
  if (!result.success) throw new Error(result.error || '读取聊天列表失败');
  return (result.data || []) as ChatItem[];
}

export async function getArchivedMessages(chatId: string): Promise<Message[]> {
  const result = await window.electronAPI.conversationGetMessages(chatId);
  if (!result.success) throw new Error(result.error || '读取聊天记录失败');
  return ((result.data || []) as Message[]).filter((message) => message.sessionId !== 'welcome');
}

export async function saveArchivedConversation(chat: ChatItem, messages: Message[]): Promise<void> {
  const result = await window.electronAPI.conversationSave(chat, messages.filter((message) => !message.isStreaming && message.sessionId !== 'welcome'));
  if (!result.success) throw new Error(result.error || '保存聊天记录失败');
}

export async function deleteArchivedConversation(chatId: string): Promise<void> {
  const result = await window.electronAPI.conversationDelete(chatId);
  if (!result.success) throw new Error(result.error || '删除聊天记录失败');
}

export async function renameArchivedConversation(chatId: string, title: string): Promise<void> {
  const result = await window.electronAPI.conversationRename(chatId, title);
  if (!result.success) throw new Error(result.error || '重命名聊天记录失败');
}

export async function setArchivedConversationPinned(chatId: string, isPinned: boolean): Promise<void> {
  const result = await window.electronAPI.conversationSetPinned(chatId, isPinned);
  if (!result.success) throw new Error(result.error || '更新对话置顶状态失败');
}
