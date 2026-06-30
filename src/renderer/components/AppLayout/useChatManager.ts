// ==========================================
// 对话列表管理 hook — CRUD + 搜索 + SQLite 恢复/持久化
// ==========================================

import { useState, useRef, useCallback, useEffect } from 'react';
import { createLogger, createTraceId, type LogMeta } from '../../../shared/logger';
import type { ChatItem, ChatGroup, ChatGroupLabel } from '../../types/chat';
import type { Message, Attachment, PendingAttachment } from '../../types';
import {
  deleteArchivedConversation,
  getArchivedMessages,
  listArchivedConversations,
  migrateLegacyConversationArchive,
  renameArchivedConversation,
  saveArchivedConversation,
  setArchivedConversationPinned,
} from '../../services/conversationArchiveClient';
import { buildDisplayMessages } from '../../core/conversation/conversationContext';

const logger = createLogger('ui');
const STORAGE_KEY_ACTIVE_CHAT = 'nova.chat.activeId';
const LEGACY_STORAGE_KEY_ACTIVE_CHAT = 'qiyuan_active_chat_id';

function getTimeGroupLabel(timestamp: number): ChatGroupLabel {
  const now = new Date();
  const date = new Date(timestamp);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  if (date >= todayStart) return 'today';
  if (date >= yesterdayStart) return 'yesterday';
  return 'earlier';
}

function groupChatsByTime(chatItems: ChatItem[]): ChatGroup[] {
  const groups: Record<string, ChatItem[]> = {};
  chatItems.forEach((chat) => {
    const label = getTimeGroupLabel(chat.updatedAt || chat.createdAt);
    if (!groups[label]) groups[label] = [];
    groups[label].push(chat);
  });
  const orderedLabels: ChatGroupLabel[] = ['today', 'yesterday', 'earlier'];
  return orderedLabels
    .filter((label) => groups[label] && groups[label].length > 0)
    .map((label) => ({
      label,
      items: groups[label].sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt)),
    }));
}

interface UseChatManagerOptions {
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onClearMessages: (meta?: LogMeta) => void;
  onSetMessages?: (messages: Message[], meta?: LogMeta) => void;
  onGetArchiveMessages?: () => Message[];
  isLoading: boolean;
}

export function useChatManager({ showToast, onClearMessages, onSetMessages, onGetArchiveMessages, isLoading }: UseChatManagerOptions) {
  const [activeChatId, setActiveChatId] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY_ACTIVE_CHAT) || localStorage.getItem(LEGACY_STORAGE_KEY_ACTIVE_CHAT) || null;
  });
  const [chatList, setChatList] = useState<ChatItem[]>([]);
  const [archiveReady, setArchiveReady] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');

  const hydratedChatIdRef = useRef<string | null>(null);
  const skipNextMessagePersistRef = useRef<string | null>(null);
  const lastPersistedMessagesRef = useRef<Record<string, string>>({});
  const lastScheduledMessagesRef = useRef<Record<string, string>>({});
  const hydrateRequestIdRef = useRef(0);

  const displayChatList = searchKeyword.trim()
    ? chatList.filter((chat) =>
        chat.title.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        chat.preview.toLowerCase().includes(searchKeyword.toLowerCase())
      )
    : chatList;
  const chatGroups: ChatGroup[] = groupChatsByTime(displayChatList);

  // 首次启动恢复存档
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        await migrateLegacyConversationArchive();
        const conversations = await listArchivedConversations();
        if (cancelled) return;
        setChatList(conversations);
        setActiveChatId((current) => current && conversations.some((c) => c.id === current) ? current : null);
        setArchiveReady(true);
      } catch (error) {
        logger.error('SQLite 聊天存档初始化失败', { error });
        showToast('聊天记录存档初始化失败，请检查日志。', 'error');
      }
    };
    void init();
    return () => { cancelled = true; };
  }, [showToast]);

  // localStorage 同步
  useEffect(() => {
    if (activeChatId) {
      localStorage.setItem(STORAGE_KEY_ACTIVE_CHAT, activeChatId);
      localStorage.removeItem(LEGACY_STORAGE_KEY_ACTIVE_CHAT);
    } else {
      localStorage.removeItem(STORAGE_KEY_ACTIVE_CHAT);
      localStorage.removeItem(LEGACY_STORAGE_KEY_ACTIVE_CHAT);
    }
  }, [activeChatId]);

  // 对话切换时恢复消息
  useEffect(() => {
    if (!archiveReady || !activeChatId) { hydratedChatIdRef.current = null; return; }
    if (hydratedChatIdRef.current === activeChatId) return;

    const reqId = ++hydrateRequestIdRef.current;
    const chatId = activeChatId;
    const hydrate = async () => {
      try {
        const chatMessages = await getArchivedMessages(chatId);
        if (hydrateRequestIdRef.current !== reqId) return;
        logger.info('恢复当前对话历史消息', { chatId, messageCount: chatMessages.length, phase: 'history' });
        skipNextMessagePersistRef.current = chatId;
        onSetMessages?.(chatMessages, { chatId, phase: 'history', reason: 'hydrate_active_chat' });
        hydratedChatIdRef.current = chatId;
      } catch (error) {
        logger.error('恢复 SQLite 对话消息失败', { chatId, error });
        showToast('读取聊天记录失败，请检查日志。', 'error');
      }
    };
    void hydrate();
  }, [activeChatId, archiveReady, onSetMessages, showToast]);

  // 消息持久化
  useEffect(() => {
    if (archiveReady && activeChatId && hydratedChatIdRef.current === activeChatId && onGetArchiveMessages) {
      if (skipNextMessagePersistRef.current === activeChatId) {
        skipNextMessagePersistRef.current = null;
        return;
      }
      // 由 AppLayout 的 messages 变化 effect 内部处理
    }
  }, [activeChatId, archiveReady, onGetArchiveMessages]);

  const handleNewChat = useCallback(() => {
    if (isLoading) { showToast('请先等待当前回复完成，再新建或切换对话。', 'info'); return; }
    setActiveChatId(null);
    hydratedChatIdRef.current = null;
    onClearMessages({ chatId: activeChatId, phase: 'history', reason: 'new_chat_button' });
  }, [isLoading, activeChatId, onClearMessages, showToast]);

  const handleSelectChat = useCallback((chatId: string) => {
    if (isLoading) { showToast('请先等待当前回复完成，再切换对话。', 'info'); return; }
    skipNextMessagePersistRef.current = chatId;
    setActiveChatId(chatId);
    hydratedChatIdRef.current = null;
  }, [isLoading, showToast]);

  const handleRenameChat = useCallback((chatId: string, newTitle: string) => {
    setChatList((prev) => prev.map((chat) => chat.id === chatId ? { ...chat, title: newTitle } : chat));
    void renameArchivedConversation(chatId, newTitle).catch((error) => {
      logger.error('重命名 SQLite 对话失败', { chatId, error });
      showToast('重命名对话失败，请重试。', 'error');
    });
  }, [showToast]);

  const handleDeleteChat = useCallback((chatId: string) => {
    void deleteArchivedConversation(chatId).then(() => {
      setChatList((prev) => prev.filter((chat) => chat.id !== chatId));
      delete lastPersistedMessagesRef.current[chatId];
      delete lastScheduledMessagesRef.current[chatId];
      void window.electronAPI?.attachmentDeleteByChat?.(chatId);
      if (activeChatId === chatId) {
        setActiveChatId(null);
        hydratedChatIdRef.current = null;
        onClearMessages?.({ chatId, phase: 'history', reason: 'delete_active_chat' });
      }
    }).catch((error) => {
      logger.error('删除 SQLite 对话失败', { chatId, error });
      showToast('删除对话失败，请重试。', 'error');
    });
  }, [activeChatId, onClearMessages, showToast]);

  const handlePinChat = useCallback((chatId: string) => {
    const target = chatList.find((chat) => chat.id === chatId);
    if (!target) return;
    const isPinned = !target.isPinned;
    void setArchivedConversationPinned(chatId, isPinned).then(() => {
      setChatList((prev) => prev.map((chat) => chat.id === chatId ? { ...chat, isPinned } : chat));
    }).catch((error) => {
      logger.error('置顶 SQLite 对话失败', { chatId, error });
      showToast('置顶操作失败，请重试。', 'error');
    });
  }, [chatList, showToast]);

  /** 创建新对话（由首条消息触发） */
  const ensureChatExists = useCallback(async (content: string, pendingAttachments: PendingAttachment[]): Promise<string> => {
    if (activeChatId) return activeChatId;

    const trimmedContent = content.trim();
    const hasImages = pendingAttachments.some(a => a.type === 'image');
    const hasDocuments = pendingAttachments.some(a => a.type === 'document');
    const attachmentLabel = hasImages ? '图片分析' : hasDocuments ? '文档分析' : '新对话';
    const chatTitle = trimmedContent.length >= 4
      ? trimmedContent.slice(0, 30)
      : pendingAttachments.length > 0
        ? `${attachmentLabel} ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
        : `新对话 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;

    const newChat: ChatItem = {
      id: `chat-${Date.now()}`,
      title: chatTitle,
      preview: trimmedContent.slice(0, 50) || '空消息',
      icon: '💬',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setChatList((prev) => [newChat, ...prev]);
    await saveArchivedConversation(newChat, []);
    hydratedChatIdRef.current = newChat.id;
    setActiveChatId(newChat.id);
    return newChat.id;
  }, [activeChatId]);

  /** 持久化消息到 SQLite */
  const persistMessages = useCallback((messages: Message[]) => {
    if (!archiveReady || !activeChatId || hydratedChatIdRef.current !== activeChatId) return;
    if (skipNextMessagePersistRef.current === activeChatId) {
      skipNextMessagePersistRef.current = null;
      return;
    }
    const stableMessages = (onGetArchiveMessages?.() || messages).filter((msg) => !msg.isStreaming);
    if (stableMessages.length === 0) return;

    const serialized = JSON.stringify(stableMessages);
    if (lastPersistedMessagesRef.current[activeChatId] === serialized || lastScheduledMessagesRef.current[activeChatId] === serialized) return;

    const chat = chatList.find((item) => item.id === activeChatId);
    if (!chat) return;
    const visibleMessages = buildDisplayMessages(messages);
    const lastVisibleMessage = visibleMessages[visibleMessages.length - 1];
    const updatedChat = { ...chat, preview: lastVisibleMessage?.content.slice(0, 50) || chat.preview, updatedAt: Date.now() };
    lastScheduledMessagesRef.current[activeChatId] = serialized;
    void saveArchivedConversation(updatedChat, stableMessages).then(() => {
      lastPersistedMessagesRef.current[activeChatId] = serialized;
      setChatList((prev) => prev.map((item) => item.id === activeChatId ? updatedChat : item));
    }).catch((error) => {
      if (lastScheduledMessagesRef.current[activeChatId] === serialized) {
        delete lastScheduledMessagesRef.current[activeChatId];
      }
      logger.error('保存 SQLite 对话消息失败', { chatId: activeChatId, error });
      showToast('聊天记录保存失败，请检查日志。', 'error');
    });
  }, [archiveReady, activeChatId, chatList, onGetArchiveMessages, showToast]);

  return {
    activeChatId,
    chatList,
    chatGroups,
    archiveReady,
    searchKeyword,
    setSearchKeyword,
    handleNewChat,
    handleSelectChat,
    handleRenameChat,
    handleDeleteChat,
    handlePinChat,
    ensureChatExists,
    persistMessages,
  };
}
