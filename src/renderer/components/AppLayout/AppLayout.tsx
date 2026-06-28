/**
 * AppLayout 主布局组件
 * 整合所有子组件的核心容器。
 * 当前版本把应用拆成“一级导航 + 可选侧栏 + 主内容区”，避免所有能力都挤在聊天页或设置抽屉里。
 *
 * 布局结构：
 * ┌─────────────────────────────────────┐
 * │  Sidebar  │    Header（顶栏）        │
 * │  （侧边栏）│────────────────────────│
 * │           │                        │
 * │  - 新建   │  ChatArea / WelcomeScreen│
 * │  - 搜索   │  (聊天区/欢迎页)         │
 * │  - 对话   │                        │
 * │  - 列表   │                        │
 * │           │────────────────────────│
 * │  - 用户   │  InputArea（输入区）     │
 * └───────────┴────────────────────────┘
 *
 * 状态管理：
 * - 对话列表和当前选中对话（支持 localStorage 持久化）
 * - 消息列表和加载状态
 * - 侧边栏展开/收起状态
 * - 所有交互逻辑已完整实现
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import styles from './AppLayout.module.css';

/* 导入所有子组件 */
import Sidebar from '../sidebar/Sidebar';
import Header from '../header/Header';
import ChatArea from '../chat/ChatArea';
import InputArea from '../input/InputArea';
import type { InputAreaHandle } from '../input/InputArea';
import WorkspaceDashboard from '../Workspace/WorkspaceDashboard';
import KnowledgePanel from '../Knowledge/KnowledgePanel';
import MemoryPanel from '../Memory/MemoryPanel';
import DebugPanel from '../Debug/DebugPanel';
import ModelApiPanel from '../Settings/ModelApiPanel';
import VoicePanel from '../Settings/VoicePanel';
import SearchPanel from '../Settings/SearchPanel';
import ShortcutsPanel from '../Settings/ShortcutsPanel';
import { createLogger, createTraceId, type LogMeta } from '../../../shared/logger';
import { getActiveModelConfig } from '../../config/modelConfig';
import { normalizeModelSelection } from '../../core/model/modelRuntime';
import { getModelsForProvider } from '../../config/modelCatalog';
import { buildDisplayMessages } from '../../core/conversation/conversationContext';
import {
  deleteArchivedConversation,
  getArchivedMessages,
  listArchivedConversations,
  migrateLegacyConversationArchive,
  renameArchivedConversation,
  saveArchivedConversation,
  setArchivedConversationPinned,
} from '../../services/conversationArchiveClient';

/* 导入类型定义 */
import type {
  ChatItem,
  ChatGroup,
  ChatGroupLabel,
  UIMessage,
  UserInfo,
  ModelOption,
} from '../../types/chat';

/* 导入基础 Message 类型 */
import type { AgentProcessEvent, Attachment, PendingAttachment, Message } from '../../types';

/* 导入语音对话模式类型 */
import type { VoiceChatState } from '../../core/voiceChat/VoiceChatMode';
import type { RealtimeCallState } from '../../core/realtimeCall/RealtimeCallMode';

/* ==========================================
   组件 Props 类型定义
   ========================================== */
interface AppLayoutProps {
  /** 来自 Orchestrator 的消息列表 */
  messages: Message[];
  /** 每条助手消息关联的 Agent 处理过程 */
  processEventsByMessageId?: Record<string, AgentProcessEvent[]>;
  /** 是否正在加载（显示打字动画）*/
  isLoading: boolean;
  /** 发送消息回调（调用 Orchestrator）*/
  onSendMessage: (content: string, meta?: LogMeta, attachments?: Attachment[]) => Promise<void>;
  /** 清空消息列表回调（新建对话时调用）*/
  onClearMessages: (meta?: LogMeta) => void;
  /** 设置消息列表回调（切换对话时调用）*/
  onSetMessages?: (messages: Message[], meta?: LogMeta) => void;
  /** 获取当前 Agent 完整上下文，用于持久化工具调用和压缩摘要 */
  onGetArchiveMessages?: () => Message[];
  /** 显示 Toast 提示回调 */
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  /** 当前主题 */
  theme: 'dark' | 'light';
  /** 切换主题回调 */
  onToggleTheme: () => void;
  /** 语音对话模式状态 */
  voiceChatState?: VoiceChatState;
  /** 语音对话模式是否开启 */
  isVoiceChatEnabled?: boolean;
  /** 切换语音对话模式回调 */
  onToggleVoiceChat?: () => void;
  realtimeCallState?: RealtimeCallState;
  isRealtimeCallEnabled?: boolean;
  onToggleRealtimeCall?: () => void;
  /** 切换模型回调 */
  onModelChange?: (modelId: string) => void;
}

/* ==========================================
   localStorage 键名常量
   用于持久化保存对话列表和消息
   ========================================== */
const STORAGE_KEY_ACTIVE_CHAT = 'nova.chat.activeId';
const LEGACY_STORAGE_KEY_ACTIVE_CHAT = 'qiyuan_active_chat_id';
const STORAGE_KEY_ACTIVE_VIEW = 'nova.activeView';
const LEGACY_STORAGE_KEY_ACTIVE_VIEW = 'qiyuan_active_view';

type AppView = 'chat' | 'workspace' | 'knowledge' | 'memory' | 'settings';
type SettingsPageTab = 'model-api' | 'voice' | 'search' | 'shortcuts' | 'diagnostics';

const navIcons: Record<string, JSX.Element> = {
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  workspace: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  knowledge: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ),
  memory: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

const appViews: { id: AppView; label: string; description: string }[] = [
  { id: 'chat', label: '聊天', description: '和 Nova 对话、调用工具、处理日常任务' },
  { id: 'workspace', label: '工作台', description: '查看知识库、记忆、工具日志和评估概览' },
  { id: 'knowledge', label: '知识库', description: '导入、检索和管理本地知识片段' },
  { id: 'memory', label: '记忆库', description: '查看和管理 Nova 记住的长期信息' },
  { id: 'settings', label: '设置', description: '配置模型、语音、搜索和快捷键' },
];

const settingsTabs: { id: SettingsPageTab; label: string; description: string }[] = [
  { id: 'model-api', label: '模型与 API', description: '配置当前模型、Provider 和密钥来源' },
  { id: 'voice', label: '语音', description: '配置 ASR、TTS 和语音交互体验' },
  { id: 'search', label: '搜索', description: '配置联网搜索和结果处理方式' },
  { id: 'diagnostics', label: '诊断', description: '工具调用统计、模型上下文快照、运行日志' },
  { id: 'shortcuts', label: '快捷键', description: '查看常用快捷操作' },
];

const getInitialAppView = (): AppView => {
  const saved = (localStorage.getItem(STORAGE_KEY_ACTIVE_VIEW) || localStorage.getItem(LEGACY_STORAGE_KEY_ACTIVE_VIEW)) as AppView | null;
  return appViews.some((view) => view.id === saved) ? (saved as AppView) : 'chat';
};

/* ==========================================
   工具函数：按时间戳将对话分组
   今天 / 昨天 / 更早
   ========================================== */

/**
 * 根据时间戳判断属于哪个时间组
 * @param timestamp - Unix 时间戳（毫秒）
 * @returns 组标签：'today' | 'yesterday' | 'earlier'
 */
const getTimeGroupLabel = (timestamp: number): string => {
  const now = new Date();
  const date = new Date(timestamp);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);

  if (date >= todayStart) return 'today';
  if (date >= yesterdayStart) return 'yesterday';
  return 'earlier';
};

/**
 * 将对话列表按时间分组
 * @param chatItems - 未分组的对话项数组
 * @returns 分组后的数组（包含 label + items）
 */
const groupChatsByTime = (chatItems: ChatItem[]): ChatGroup[] => {
  const groups: Record<string, ChatItem[]> = {};

  /* 遍历每个对话，根据更新时间分配到对应组 */
  chatItems.forEach((chat) => {
    const label = getTimeGroupLabel(chat.updatedAt || chat.createdAt);
    if (!groups[label]) groups[label] = [];
    groups[label].push(chat);
  });

  /* 转换为数组格式，并按固定顺序排列 */
  const orderedLabels: ChatGroupLabel[] = ['today', 'yesterday', 'earlier'];
  return orderedLabels
    .filter((label) => groups[label] && groups[label].length > 0)
    .map((label) => ({
      label,
      items: groups[label].sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt)),
    }));
};

/* ==========================================
   默认用户信息
   ========================================== */
const defaultUserInfo: UserInfo = {
  name: 'lzh',
  avatar: 'L',
  plan: '免费版',
};

/* ==========================================
   动态模型配置
   根据用户在设置页的配置动态生成模型列表
   ========================================== */

const logger = createLogger('ui');

/**
 * 获取初始选中的模型
 * 优先使用用户在设置页配置的模型
 */
function getInitialModelOption(): ModelOption {
  const activeConfig = getActiveModelConfig();
  return normalizeModelSelection(activeConfig.provider, activeConfig.model).option;
}

/**
 * AppLayout 主布局组件
 * @param props - 组件属性
 * @returns JSX 应用根元素
 */
const AppLayout: React.FC<AppLayoutProps> = ({
  messages,
  processEventsByMessageId = {},
  isLoading,
  onSendMessage,
  onClearMessages,
  onSetMessages,
  onGetArchiveMessages,
  showToast,
  theme,
  onToggleTheme,
  voiceChatState = 'idle',
  isVoiceChatEnabled = false,
  onToggleVoiceChat,
  realtimeCallState = 'idle',
  isRealtimeCallEnabled = false,
  onToggleRealtimeCall,
  onModelChange,
}) => {
  /* ===== 状态管理 ===== */

  /** 当前选中的对话 ID */
  const [activeChatId, setActiveChatId] = useState<string | null>(() => {
    /* 从 localStorage 恢复上次选中的对话 */
    return localStorage.getItem(STORAGE_KEY_ACTIVE_CHAT) || localStorage.getItem(LEGACY_STORAGE_KEY_ACTIVE_CHAT) || null;
  });

  /** 侧边栏是否展开（移动端使用）*/
  const [sidebarOpen, setSidebarOpen] = useState(true);

  /** 当前一级页面：聊天 / 工作台 / 知识库 / 记忆库 / 设置 */
  const [activeView, setActiveView] = useState<AppView>(getInitialAppView);

  /** 设置页内部标签，只管理配置项，不再承载知识库/记忆库等业务页面 */
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsPageTab>('model-api');

  /** 是否正在加载（AI 回复中）- 使用父组件传来的值 */
  // const [isLoading, setIsLoading] = useState(false);

  /** 对话列表（扁平数组，用于搜索和过滤）*/
  const [chatList, setChatList] = useState<ChatItem[]>([]);
  /** SQLite 存档初始化完成后才允许恢复和写入，避免启动阶段空状态覆盖历史 */
  const [archiveReady, setArchiveReady] = useState(false);

  /** 搜索关键词（搜索只影响展示，不修改原始 chatList）*/
  const [searchKeyword, setSearchKeyword] = useState('');

  /** 当前使用的 AI 模型 */
  const [currentModel, setCurrentModel] = useState<ModelOption>(getInitialModelOption);

  useEffect(() => {
    const handleModelConfigSaved = () => {
      const nextModel = getInitialModelOption();
      setCurrentModel(nextModel);
      onModelChange?.(nextModel.id);
    };
    window.addEventListener('nova-model-config-saved', handleModelConfigSaved);
    return () => window.removeEventListener('nova-model-config-saved', handleModelConfigSaved);
  }, [onModelChange]);

  /** 输入框内容的 ref（用于快捷建议填入）*/
  const inputRef = useRef<InputAreaHandle | null>(null);
  /** 当前已从持久化层恢复到内存的对话 ID，防止启动阶段把欢迎消息覆盖真实历史 */
  const hydratedChatIdRef = useRef<string | null>(null);
  /** 恢复、切换或创建对话后，跳过一次仍携带旧 UI 消息的持久化写入 */
  const skipNextMessagePersistRef = useRef<string | null>(null);
  /** 避免流式输出期间重复写入内容完全相同的稳定消息 */
  const lastPersistedMessagesRef = useRef<Record<string, string>>({});
  /** 保存尚未结束时也要拦截相同快照，避免重复事务并发排队 */
  const lastScheduledMessagesRef = useRef<Record<string, string>>({});
  /** 标识最近一次历史恢复请求，避免较早的异步读取晚返回后覆盖当前对话。 */
  const hydrateRequestIdRef = useRef(0);

  /* ===== 派生状态：将 chatList 按时间分组（搜索时过滤） ===== */
  const displayChatList = searchKeyword.trim()
    ? chatList.filter((chat) =>
        chat.title.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        chat.preview.toLowerCase().includes(searchKeyword.toLowerCase())
      )
    : chatList;
  const chatGroups: ChatGroup[] = groupChatsByTime(displayChatList);

  /* ===== SQLite 聊天存档副作用 ===== */

  /** 首次启动先导入旧 localStorage，再从 SQLite 恢复侧栏列表。 */
  useEffect(() => {
    let cancelled = false;
    const initializeArchive = async () => {
      try {
        await migrateLegacyConversationArchive();
        const conversations = await listArchivedConversations();
        if (cancelled) return;
        setChatList(conversations);
        setActiveChatId((current) => current && conversations.some((chat) => chat.id === current) ? current : null);
        setArchiveReady(true);
        logger.info('SQLite 聊天存档已恢复', { phase: 'history', chatCount: conversations.length });
      } catch (error) {
        logger.error('SQLite 聊天存档初始化失败', { phase: 'history', error });
        showToast('聊天记录存档初始化失败，请检查日志。', 'error');
      }
    };
    void initializeArchive();
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  /**
   * 当选中对话变化时保存到 localStorage
   */
  useEffect(() => {
    if (activeChatId) {
      localStorage.setItem(STORAGE_KEY_ACTIVE_CHAT, activeChatId);
      localStorage.removeItem(LEGACY_STORAGE_KEY_ACTIVE_CHAT);
    } else {
      localStorage.removeItem(STORAGE_KEY_ACTIVE_CHAT);
      localStorage.removeItem(LEGACY_STORAGE_KEY_ACTIVE_CHAT);
    }
  }, [activeChatId]);

  /**
   * 应用启动后如果 localStorage 恢复了 activeChatId，需要先把该对话历史加载回内存，
   * 否则 App.tsx 里的欢迎消息会被当成当前对话内容再写回去，覆盖真实聊天记录。
   */
  useEffect(() => {
    if (!archiveReady || !activeChatId) {
      hydratedChatIdRef.current = null;
      return;
    }
    if (hydratedChatIdRef.current === activeChatId) return;

    const hydrateRequestId = ++hydrateRequestIdRef.current;
    const requestedChatId = activeChatId;
    const hydrate = async () => {
      try {
        const chatMessages = await getArchivedMessages(requestedChatId);
        if (hydrateRequestIdRef.current !== hydrateRequestId) {
          logger.debug('忽略过期的对话恢复结果', {
            chatId: requestedChatId,
            phase: 'history',
            reason: 'stale_hydration_result',
          });
          return;
        }
        logger.info('恢复当前对话历史消息', {
          chatId: requestedChatId,
          messageCount: chatMessages.length,
          phase: 'history',
          reason: 'hydrate_active_chat',
        });
        skipNextMessagePersistRef.current = requestedChatId;
        onSetMessages?.(chatMessages, { chatId: requestedChatId, phase: 'history', reason: 'hydrate_active_chat' });
        hydratedChatIdRef.current = requestedChatId;
      } catch (error) {
        logger.error('恢复 SQLite 对话消息失败', { chatId: requestedChatId, phase: 'history', error });
        showToast('读取聊天记录失败，请检查日志。', 'error');
      }
    };
    void hydrate();
  }, [activeChatId, archiveReady, onSetMessages, showToast]);

  /**
   * 记住用户上次打开的一级页面。
   * 这样桌面工作台更像一个真实应用，而不是每次都回到单一聊天页。
   */
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ACTIVE_VIEW, activeView);
    localStorage.removeItem(LEGACY_STORAGE_KEY_ACTIVE_VIEW);
  }, [activeView]);

  /**
   * 监听消息变化，保存到当前对话的 localStorage
   * 流式输出期间只保存稳定消息，避免每个 token 都触发写入。
   * 这样用户输入会立即落盘，应用被直接关闭时也不会随流式回复一起丢失。
   */
  useEffect(() => {
    if (archiveReady && activeChatId && hydratedChatIdRef.current === activeChatId && messages.length > 0) {
      if (skipNextMessagePersistRef.current === activeChatId) {
        logger.debug('跳过对话恢复后的旧 UI 消息写入', {
          chatId: activeChatId,
          messageCount: messages.length,
          phase: 'history',
          reason: 'skip_stale_messages_after_hydration',
        });
        skipNextMessagePersistRef.current = null;
        return;
      }

      const stableMessages = (onGetArchiveMessages?.() || messages).filter((msg) => !msg.isStreaming);
      if (stableMessages.length === 0) return;

      const serialized = JSON.stringify(stableMessages);
      if (
        lastPersistedMessagesRef.current[activeChatId] !== serialized
        && lastScheduledMessagesRef.current[activeChatId] !== serialized
      ) {
        const chat = chatList.find((item) => item.id === activeChatId);
        if (!chat) return;
        const visibleMessages = buildDisplayMessages(messages);
        const lastVisibleMessage = visibleMessages[visibleMessages.length - 1];
        const updatedChat = {
          ...chat,
          preview: lastVisibleMessage?.content.slice(0, 50) || chat.preview,
          updatedAt: Date.now(),
        };
        lastScheduledMessagesRef.current[activeChatId] = serialized;
        void saveArchivedConversation(updatedChat, stableMessages).then(() => {
          lastPersistedMessagesRef.current[activeChatId] = serialized;
          setChatList((prev) => prev.map((item) => item.id === activeChatId ? updatedChat : item));
        }).catch((error) => {
          if (lastScheduledMessagesRef.current[activeChatId] === serialized) {
            delete lastScheduledMessagesRef.current[activeChatId];
          }
          logger.error('保存 SQLite 对话消息失败', { chatId: activeChatId, phase: 'persist', error });
          showToast('聊天记录保存失败，请检查日志。', 'error');
        });
      }
    }
  }, [activeChatId, archiveReady, chatList, messages, onGetArchiveMessages, showToast]);

  /* ===== 事件处理函数 ===== */

  /**
   * 处理发送消息
   * 包装父组件回调，添加加载状态控制和自动创建/更新对话
   * @param content - 用户输入的消息文本
   */
  const handleSendMessage = async (content: string, _meta?: LogMeta, pendingAttachments: PendingAttachment[] = []) => {
    /* 防止发送空消息 */
    if (!content.trim() && pendingAttachments.length === 0) return;

    let currentChatId = activeChatId;
    const traceId = createTraceId();
    logger.info('布局层接收到输入消息', {
      traceId,
      phase: 'input',
      activeChatId,
      textPreview: content.slice(0, 120),
      length: content.length,
    });

    /* 如果没有当前对话，自动创建一个新对话 */
    if (!currentChatId) {
      /* 生成友好的标题：如果首条消息太短（<4 字）则用默认标题 */
      const trimmedContent = content.trim();
      const hasImages = pendingAttachments.some(a => a.type === 'image');
      const hasDocuments = pendingAttachments.some(a => a.type === 'document');
      const attachmentLabel = hasImages ? '图片分析' : hasDocuments ? '文档分析' : '新对话';
      const attachmentPreview = pendingAttachments.map((attachment) => attachment.name).join('、');
      const chatTitle = trimmedContent.length >= 4
        ? trimmedContent.slice(0, 30)
        : pendingAttachments.length > 0
          ? `${attachmentLabel} ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
          : `新对话 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;

      const newChat: ChatItem = {
        id: `chat-${Date.now()}`,
        title: chatTitle,
        preview: trimmedContent.slice(0, 50) || attachmentPreview || '空消息',
        icon: '\uD83D\uDCAC', // 💬
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setChatList((prev) => [newChat, ...prev]);
      await saveArchivedConversation(newChat, []);
      // 新对话是由当前首条消息即时创建的，持久化层里暂时还没有历史。
      // 先标记为已激活，避免 activeChatId 变化后的恢复逻辑读取空历史并重置正在发送的消息。
      hydratedChatIdRef.current = newChat.id;
      setActiveChatId(newChat.id);
      currentChatId = newChat.id;
      logger.info('首条消息自动创建新对话', {
        traceId,
        phase: 'ui',
        chatId: newChat.id,
        title: newChat.title,
      });

    }

    const savedAttachments: Attachment[] = [];
    for (const attachment of pendingAttachments) {
      if (attachment.type === 'document') {
        savedAttachments.push(attachment);
        continue;
      }

      const result = await window.electronAPI?.attachmentSave?.({
        chatId: currentChatId,
        name: attachment.name,
        mimeType: attachment.mimeType,
        dataUrl: attachment.dataUrl,
      });
      if (!result?.success || !result.data) {
        logger.error('保存聊天附件失败', { traceId, chatId: currentChatId, name: attachment.name, error: result?.error });
        showToast(result?.error || '附件保存失败，请重试。', 'error');
        throw new Error(result?.error || '附件保存失败');
      }
      savedAttachments.push(result.data as Attachment);
    }

    await onSendMessage(content, {
      traceId,
      chatId: currentChatId,
      phase: 'input',
    }, savedAttachments);
  };

  /**
   * 切换侧边栏展开/收起
   */
  const handleSidebarToggle = () => {
    logger.info('侧边栏展开状态切换', { from: sidebarOpen, to: !sidebarOpen });
    setSidebarOpen((prev) => !prev);
  };

  /**
   * 打开设置主页面。
   * 设置不再使用右侧抽屉，避免配置项过窄、层级混乱。
   */
  const handleOpenSettings = () => {
    logger.info('切换到设置页面');
    setActiveView('settings');
  };

  /**
   * 新建对话
   * 清空当前选中状态 + 清空消息列表 → 显示欢迎页
   * 用户发送第一条消息时会自动创建新对话
   */
  const handleNewChat = () => {
    if (isLoading) {
      showToast('请先等待当前回复完成，再新建或切换对话。', 'info');
      return;
    }
    logger.info('点击新建对话', { chatId: activeChatId, reason: 'new_chat_button', phase: 'ui' });
    setActiveView('chat');
    setActiveChatId(null);
    hydratedChatIdRef.current = null;
    onClearMessages({ chatId: activeChatId, phase: 'history', reason: 'new_chat_button' }); /* 通知 App.tsx 清空消息，显示欢迎页 */
  };

  /**
   * 选择某个对话
   * 切换到该对话并加载对应的历史消息
   * @param chatId - 要切换到的对话 ID
   */
  const handleSelectChat = (chatId: string) => {
    if (isLoading) {
      showToast('请先等待当前回复完成，再切换对话。', 'info');
      return;
    }
    logger.info('选择对话', { from: activeChatId, chatId, reason: 'select_chat', phase: 'ui' });
    setActiveView('chat');
    skipNextMessagePersistRef.current = chatId;
    setActiveChatId(chatId);
    hydratedChatIdRef.current = null;
  };

  /**
   * 搜索对话
   * 只更新搜索关键词，通过派生状态 displayChatList 过滤展示
   * 不修改原始 chatList，避免搜索结果被写回 localStorage 导致数据丢失
   * @param keyword - 搜索关键词
   */
  const handleSearch = (keyword: string) => {
    logger.debug('对话搜索关键词变化', { keyword, length: keyword.length });
    setSearchKeyword(keyword);
  };

  /**
   * 重命名对话
   */
  const handleRenameChat = useCallback((chatId: string, newTitle: string) => {
    logger.info('请求重命名对话', { chatId, newTitle });
    setChatList((prev) => prev.map((chat) => chat.id === chatId ? { ...chat, title: newTitle } : chat));
    void renameArchivedConversation(chatId, newTitle).catch((error) => {
      logger.error('重命名 SQLite 对话失败', { chatId, error });
      showToast('重命名对话失败，请重试。', 'error');
    });
  }, [showToast]);

  /**
   * 删除对话
   */
  const handleDeleteChat = useCallback((chatId: string) => {
    logger.warn('请求删除对话', { chatId, isActive: activeChatId === chatId, reason: 'delete_chat', phase: 'ui' });
    void deleteArchivedConversation(chatId).then(() => {
      setChatList((prev) => prev.filter((chat) => chat.id !== chatId));
      delete lastPersistedMessagesRef.current[chatId];
      delete lastScheduledMessagesRef.current[chatId];
      void window.electronAPI?.attachmentDeleteByChat?.(chatId);
      // 如果删除的是当前激活的对话，清空消息
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

  /**
   * 置顶/取消置顶对话
   */
  const handlePinChat = useCallback((chatId: string) => {
    logger.info('切换对话置顶状态', { chatId });
    const target = chatList.find((chat) => chat.id === chatId);
    if (!target) return;
    const isPinned = !target.isPinned;
    void setArchivedConversationPinned(chatId, isPinned).then(() => {
      setChatList((prev) => {
      const updated = prev.map((chat) =>
          chat.id === chatId ? { ...chat, isPinned } : chat
      );
      // 置顶的排前面，然后按更新时间排序
      updated.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return b.updatedAt - a.updatedAt;
      });
      return updated;
      });
    }).catch((error) => {
      logger.error('更新 SQLite 对话置顶状态失败', { chatId, error });
      showToast('更新对话置顶状态失败，请重试。', 'error');
    });
  }, [chatList, showToast]);

  /** 模型切换 */
  const handleModelChange = (modelId: string) => {
    const activeConfig = getActiveModelConfig();
    const model = getModelsForProvider(activeConfig.provider, currentModel.id).find((m) => m.id === modelId);
    if (model) {
      logger.info('在顶部栏选择模型', { from: currentModel.id, to: modelId, name: model.name });
      setCurrentModel(model);
      onModelChange?.(modelId);
    }
  };

  /**
   * 快捷建议点击 → 填入输入框
   * 通过 ref 直接操作 InputArea 的内部状态
   * @param prompt - 建议文本（不含 emoji）
   */
  const handleSuggestionClick = (prompt: string) => {
    logger.info('点击快捷建议', { prompt });
    setActiveView('chat');
    if (inputRef.current) {
      inputRef.current.setText(prompt);
    }
  };

  /**
   * 将后端 Message 格式转换为 UI 所需的 UIMessage 格式
   * @param msg - 后端原始消息
   * @returns UI 展示用的消息对象
   */
  const convertToUIMessage = (msg: Message): UIMessage => ({
    id: msg.id,
    role: msg.role as 'user' | 'assistant' | 'system',
    content: msg.content,
    timestamp: msg.timestamp,
    isStreaming: msg.isStreaming,
    processEvents: processEventsByMessageId[msg.id] || [],
    reasoningContent: msg.reasoningContent,
    reasoningSegments: msg.reasoningSegments,
    toolCallSummary: msg.toolCallSummary,
    usage: msg.usage,
    model: msg.model,
    durationMs: msg.durationMs,
    traceId: msg.traceId,
    attachments: msg.attachments,
  });

  /** 是否显示欢迎页（无消息时显示）*/
  const showWelcome = messages.length === 0 && !isLoading;
  const handleSelectView = (view: AppView) => {
    logger.info('切换一级页面', { from: activeView, to: view });
    setActiveView(view);
  };

  const renderSettingsContent = () => {
    switch (activeSettingsTab) {
      case 'model-api':
        return <ModelApiPanel />;
      case 'voice':
        return <VoicePanel />;
      case 'search':
        return <SearchPanel />;
      case 'diagnostics':
        return (
          <DebugPanel
            messages={messages}
            currentModel={currentModel}
            voiceChatState={voiceChatState}
            isVoiceChatEnabled={isVoiceChatEnabled}
            realtimeCallState={realtimeCallState}
            isRealtimeCallEnabled={isRealtimeCallEnabled}
          />
        );
      case 'shortcuts':
        return <ShortcutsPanel />;
      default:
        return null;
    }
  };

  const renderPrimaryPage = () => {
    switch (activeView) {
      case 'workspace':
        return <WorkspaceDashboard messages={messages} />;
      case 'knowledge':
        return <KnowledgePanel />;
      case 'memory':
        return <MemoryPanel />;
      case 'settings':
        return (
          <div className={styles.settingsPage}>
            <aside className={styles.settingsNav} aria-label="设置分类">
              {settingsTabs.map((tab) => (
                <button
                  key={tab.id}
                  className={`${styles.settingsNavItem} ${activeSettingsTab === tab.id ? styles.settingsNavItemActive : ''}`}
                  onClick={() => setActiveSettingsTab(tab.id)}
                  type="button"
                >
                  <span className={styles.settingsNavLabel}>{tab.label}</span>
                  <span className={styles.settingsNavDesc}>{tab.description}</span>
                </button>
              ))}
            </aside>
            <section className={styles.settingsContent}>
              {renderSettingsContent()}
            </section>
          </div>
        );
      case 'chat':
      default:
        return showWelcome ? (
          <section className={styles.chatWelcome}>
            <div className={styles.chatWelcomeIcon}>✦</div>
            <h2>开始和 Nova 对话</h2>
            <p>这里专注聊天和工具调用；工作台、知识库、记忆库和设置已经放到左侧一级导航里。</p>
            <div className={styles.quickPrompts}>
              {['总结一下今天要做什么', '帮我分析当前项目下一步', '搜索一个技术问题'].map((prompt) => (
                <button key={prompt} type="button" onClick={() => handleSuggestionClick(prompt)}>
                  {prompt}
                </button>
              ))}
            </div>
          </section>
        ) : (
          <ChatArea
            messages={buildDisplayMessages(messages).map(convertToUIMessage)}
            isLoading={isLoading}
            showToast={showToast}
          />
        );
    }
  };

  return (
    <div className={`${styles.app} ${activeView === 'chat' && sidebarOpen ? styles.chatSidebarOpen : ''}`}>
      {/* ===== 背景装饰光晕（固定定位，不影响布局）===== */}
      <div className="bg-glow bg-glow-1"></div>
      <div className="bg-glow bg-glow-2"></div>

      {/* ===== 一级导航：应用级页面入口 ===== */}
      <nav className={styles.primaryNav} aria-label="主导航">
        <div className={styles.primaryBrand}>
          <span className={styles.primaryBrandIcon}>N</span>
          <span className={styles.primaryBrandText}>Nova</span>
        </div>
        <div className={styles.primaryNavItems}>
          {appViews.map((view) => (
            <button
              key={view.id}
              type="button"
              className={`${styles.primaryNavItem} ${activeView === view.id ? styles.primaryNavItemActive : ''}`}
              onClick={() => handleSelectView(view.id)}
              title={view.description}
            >
              <span className={styles.primaryNavIcon}>{navIcons[view.id]}</span>
              <span className={styles.primaryNavLabel}>{view.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* ===== 聊天页专属二级栏：对话列表 ===== */}
      {activeView === 'chat' && (
        <Sidebar
          chatGroups={chatGroups}
          activeChatId={activeChatId}
          userInfo={defaultUserInfo}
          isOpen={sidebarOpen}
          onNewChat={handleNewChat}
          onSelectChat={handleSelectChat}
          onSearch={handleSearch}
          onRenameChat={handleRenameChat}
          onDeleteChat={handleDeleteChat}
          onPinChat={handlePinChat}
        />
      )}

      {/* ===== 右侧：主内容区 ===== */}
      <main className={styles.main}>
        {/* 1. 顶栏 */}
        <Header
        currentModel={currentModel}
        models={getModelsForProvider(getActiveModelConfig().provider, currentModel.id)}
        onModelChange={handleModelChange}
        onSidebarToggle={handleSidebarToggle}
        showToast={showToast}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onOpenSettings={handleOpenSettings}
        showChatControls={activeView === 'chat'}
        showSidebarToggle={activeView === 'chat'}
      />

        {/* 2. 当前一级页面内容。各业务页自己承担标题，避免重复的大页头挤占空间。 */}
        <section className={`${styles.pageContent} ${activeView === 'chat' ? styles.chatContent : ''}`}>
          {renderPrimaryPage()}
        </section>

        {/* 4. 输入区域只在聊天页显示 */}
        {activeView === 'chat' && (
          <InputArea
            ref={inputRef}
            isLoading={isLoading}
            showSuggestions={showWelcome}
            onSendMessage={handleSendMessage}
            onSuggestionClick={handleSuggestionClick}
            voiceChatState={voiceChatState}
            isVoiceChatEnabled={isVoiceChatEnabled}
            onToggleVoiceChat={onToggleVoiceChat}
            realtimeCallState={realtimeCallState}
            isRealtimeCallEnabled={isRealtimeCallEnabled}
            onToggleRealtimeCall={onToggleRealtimeCall}
            showToast={showToast}
          />
        )}
      </main>
    </div>
  );
};

export default AppLayout;
