/**
 * AppLayout 主布局组件
 * 整合所有子组件的核心容器
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
import SettingsDrawer from '../Settings/SettingsDrawer';
import { createLogger } from '../../../shared/logger';

/* 导入类型定义 */
import type {
  ChatItem,
  ChatGroup,
  ChatGroupLabel,
  UIMessage,
  UserInfo,
  ModelOption,
  SendMessageHandler,
} from '../../types/chat';

/* 导入基础 Message 类型 */
import type { Message } from '../../types';

/* 导入语音对话模式类型 */
import type { VoiceChatState } from '../../core/voiceChat/VoiceChatMode';

/* ==========================================
   组件 Props 类型定义
   ========================================== */
interface AppLayoutProps {
  /** 来自 Orchestrator 的消息列表 */
  messages: Message[];
  /** 是否正在加载（显示打字动画）*/
  isLoading: boolean;
  /** 发送消息回调（调用 Orchestrator）*/
  onSendMessage: SendMessageHandler;
  /** 清空消息列表回调（新建对话时调用）*/
  onClearMessages: () => void;
  /** 设置消息列表回调（切换对话时调用）*/
  onSetMessages?: (messages: Message[]) => void;
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
  /** 切换模型回调 */
  onModelChange?: (modelId: string) => void;
}

/* ==========================================
   localStorage 键名常量
   用于持久化保存对话列表和消息
   ========================================== */
const STORAGE_KEY_CHAT_LIST = 'qiyuan_chat_list';
const STORAGE_KEY_ACTIVE_CHAT = 'qiyuan_active_chat_id';
const STORAGE_KEY_MESSAGES = 'qiyuan_messages_'; // 前缀 + chatId

/**
 * 获取某个对话的消息列表
 */
const getMessagesForChat = (chatId: string): Message[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_MESSAGES + chatId);
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    logger.error('Load chat messages failed', { chatId, error });
    return [];
  }
};

/**
 * 保存某个对话的消息列表
 */
const saveMessagesForChat = (chatId: string, messages: Message[]) => {
  try {
    localStorage.setItem(STORAGE_KEY_MESSAGES + chatId, JSON.stringify(messages));
  } catch (error) {
    logger.error('Save chat messages failed', { chatId, error });
  }
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
   默认模型配置
   ========================================== */
const defaultModels: ModelOption[] = [
  { id: 'doubao-seed-2-0-pro-260215', name: '豆包2.0 Pro', isOnline: true },
  { id: 'doubao-seed-2-0-lite-260215', name: '豆包2.0 Lite', isOnline: true },
  { id: 'doubao-seed-2-0-mini-260215', name: '豆包2.0 Mini', isOnline: true },
];
const defaultCurrentModel: ModelOption = defaultModels[0];
const logger = createLogger('ui');

/**
 * AppLayout 主布局组件
 * @param props - 组件属性
 * @returns JSX 应用根元素
 */
const AppLayout: React.FC<AppLayoutProps> = ({
  messages,
  isLoading,
  onSendMessage,
  onClearMessages,
  onSetMessages,
  showToast,
  theme,
  onToggleTheme,
  voiceChatState = 'idle',
  isVoiceChatEnabled = false,
  onToggleVoiceChat,
  onModelChange,
}) => {
  /* ===== 状态管理 ===== */

  /** 当前选中的对话 ID */
  const [activeChatId, setActiveChatId] = useState<string | null>(() => {
    /* 从 localStorage 恢复上次选中的对话 */
    return localStorage.getItem(STORAGE_KEY_ACTIVE_CHAT) || null;
  });

  /** 侧边栏是否展开（移动端使用）*/
  const [sidebarOpen, setSidebarOpen] = useState(true);

  /** 设置抽屉是否打开 */
  const [settingsDrawerOpen, setSettingsDrawerOpen] = useState(false);

  /** 是否正在加载（AI 回复中）- 使用父组件传来的值 */
  // const [isLoading, setIsLoading] = useState(false);

  /** 对话列表（扁平数组，用于搜索和过滤）*/
  const [chatList, setChatList] = useState<ChatItem[]>(() => {
    /* 从 localStorage 加载保存的对话列表 */
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CHAT_LIST);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (error) {
      logger.error('Load chat list failed', error);
    }
    return [];
  });

  /** 搜索关键词（搜索只影响展示，不修改原始 chatList）*/
  const [searchKeyword, setSearchKeyword] = useState('');

  /** 当前使用的 AI 模型 */
  const [currentModel, setCurrentModel] = useState<ModelOption>(defaultCurrentModel);

  /** 输入框内容的 ref（用于快捷建议填入）*/
  const inputRef = useRef<InputAreaHandle | null>(null);

  /* ===== 派生状态：将 chatList 按时间分组（搜索时过滤） ===== */
  const displayChatList = searchKeyword.trim()
    ? chatList.filter((chat) =>
        chat.title.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        chat.preview.toLowerCase().includes(searchKeyword.toLowerCase())
      )
    : chatList;
  const chatGroups: ChatGroup[] = groupChatsByTime(displayChatList);

  /* ===== localStorage 持久化副作用 ===== */

  /**
   * 当对话列表变化时自动保存到 localStorage
   * 确保刷新页面后不丢失数据
   */
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CHAT_LIST, JSON.stringify(chatList));
    } catch (error) {
      logger.error('Save chat list failed', error);
    }
  }, [chatList]);

  /**
   * 当选中对话变化时保存到 localStorage
   */
  useEffect(() => {
    if (activeChatId) {
      localStorage.setItem(STORAGE_KEY_ACTIVE_CHAT, activeChatId);
    } else {
      localStorage.removeItem(STORAGE_KEY_ACTIVE_CHAT);
    }
  }, [activeChatId]);

  /**
   * 监听消息变化，保存到当前对话的 localStorage
   */
  useEffect(() => {
    if (activeChatId && messages.length > 0) {
      saveMessagesForChat(activeChatId, messages);
    }
  }, [activeChatId, messages]);

  /* ===== 事件处理函数 ===== */

  /**
   * 处理发送消息
   * 包装父组件回调，添加加载状态控制和自动创建/更新对话
   * @param content - 用户输入的消息文本
   */
  const handleSendMessage = async (content: string) => {
    /* 防止发送空消息 */
    if (!content.trim()) return;

    let currentChatId = activeChatId;
    logger.info('布局层接收到输入消息', {
      activeChatId,
      textPreview: content.slice(0, 120),
      length: content.length,
    });

    /* 如果没有当前对话，自动创建一个新对话 */
    if (!currentChatId) {
      /* 生成友好的标题：如果首条消息太短（<4 字）则用默认标题 */
      const trimmedContent = content.trim();
      const chatTitle = trimmedContent.length >= 4
        ? trimmedContent.slice(0, 30)
        : `新对话 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;

      const newChat: ChatItem = {
        id: `chat-${Date.now()}`,
        title: chatTitle,
        preview: trimmedContent.slice(0, 50) || '空消息',
        icon: '\uD83D\uDCAC', // 💬
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setChatList((prev) => [newChat, ...prev]);
      setActiveChatId(newChat.id);
      currentChatId = newChat.id;
      logger.info('首条消息自动创建新对话', {
        chatId: newChat.id,
        title: newChat.title,
      });

    }

    await onSendMessage(content);
  };

  /**
   * 切换侧边栏展开/收起
   */
  const handleSidebarToggle = () => {
    logger.info('侧边栏展开状态切换', { from: sidebarOpen, to: !sidebarOpen });
    setSidebarOpen((prev) => !prev);
  };

  /**
   * 打开设置抽屉
   */
  const handleOpenSettings = () => {
    logger.info('设置抽屉已打开');
    setSettingsDrawerOpen(true);
  };

  /**
   * 关闭设置抽屉
   */
  const handleCloseSettings = () => {
    logger.info('设置抽屉已关闭');
    setSettingsDrawerOpen(false);
  };

  /**
   * 新建对话
   * 清空当前选中状态 + 清空消息列表 → 显示欢迎页
   * 用户发送第一条消息时会自动创建新对话
   */
  const handleNewChat = () => {
    logger.info('点击新建对话', { previousChatId: activeChatId });
    setActiveChatId(null);
    onClearMessages(); /* 通知 App.tsx 清空消息，显示欢迎页 */
  };

  /**
   * 选择某个对话
   * 切换到该对话并加载对应的历史消息
   * @param chatId - 要切换到的对话 ID
   */
  const handleSelectChat = (chatId: string) => {
    logger.info('选择对话', { from: activeChatId, to: chatId });
    setActiveChatId(chatId);
    /* 加载该对话的历史消息并通知App.tsx */
    const chatMessages = getMessagesForChat(chatId);
    onSetMessages?.(chatMessages);
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
    setChatList((prev) => {
      const updated = prev.map((chat) =>
        chat.id === chatId ? { ...chat, title: newTitle } : chat
      );
      try {
        localStorage.setItem(STORAGE_KEY_CHAT_LIST, JSON.stringify(updated));
      } catch (e) {
        logger.error('Save chat list failed after rename', e);
      }
      return updated;
    });
  }, []);

  /**
   * 删除对话
   */
  const handleDeleteChat = useCallback((chatId: string) => {
    logger.warn('请求删除对话', { chatId, isActive: activeChatId === chatId });
    setChatList((prev) => {
      const updated = prev.filter((chat) => chat.id !== chatId);
      try {
        localStorage.setItem(STORAGE_KEY_CHAT_LIST, JSON.stringify(updated));
        // 清理该对话的消息存储
        localStorage.removeItem(`qiyuan_messages_${chatId}`);
      } catch (e) {
        logger.error('Delete chat persistence failed', e);
      }
      // 如果删除的是当前激活的对话，清空消息
      if (activeChatId === chatId) {
        onClearMessages?.();
      }
      return updated;
    });
  }, [activeChatId, onClearMessages]);

  /**
   * 置顶/取消置顶对话
   */
  const handlePinChat = useCallback((chatId: string) => {
    logger.info('切换对话置顶状态', { chatId });
    setChatList((prev) => {
      const updated = prev.map((chat) =>
        chat.id === chatId ? { ...chat, isPinned: !chat.isPinned } : chat
      );
      // 置顶的排前面，然后按更新时间排序
      updated.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return b.updatedAt - a.updatedAt;
      });
      try {
        localStorage.setItem(STORAGE_KEY_CHAT_LIST, JSON.stringify(updated));
      } catch (e) {
        logger.error('Save chat list failed after pin toggle', e);
      }
      return updated;
    });
  }, []);

  /** 模型切换 */
  const handleModelChange = (modelId: string) => {
    const model = defaultModels.find((m) => m.id === modelId);
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
  });

  /** 是否显示欢迎页（无消息时显示）*/
  const showWelcome = messages.length === 0 && !isLoading;

  return (
    <div className={styles.app}>
      {/* ===== 背景装饰光晕（固定定位，不影响布局）===== */}
      <div className="bg-glow bg-glow-1"></div>
      <div className="bg-glow bg-glow-2"></div>

      {/* ===== 左侧：侧边栏 ===== */}
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

      {/* ===== 设置抽屉 ===== */}
      <SettingsDrawer
        isOpen={settingsDrawerOpen}
        onClose={handleCloseSettings}
      />

      {/* ===== 右侧：主内容区 ===== */}
      <main className={styles.main}>
        {/* 1. 顶栏 */}
        <Header
        currentModel={currentModel}
        models={defaultModels}
        onModelChange={handleModelChange}
        onSidebarToggle={handleSidebarToggle}
        showToast={showToast}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onOpenSettings={handleOpenSettings}
      />

        {/* 2. 聊天区域 或 欢迎页（二选一显示）*/}
        {showWelcome ? (
          /* 无对话时显示项目驾驶舱 */
          <WorkspaceDashboard messages={messages} onSuggestionClick={handleSuggestionClick} />
        ) : (
          /* 有对话时显示聊天区（使用props.messages）*/
          <ChatArea
            messages={messages.map(convertToUIMessage)}
            isLoading={isLoading}
            showToast={showToast}
          />
        )}

        {/* 3. 输入区域（始终显示在底部）*/}
        <InputArea
          ref={inputRef}
          isLoading={isLoading}
          showSuggestions={showWelcome}
          onSendMessage={handleSendMessage}
          onSuggestionClick={handleSuggestionClick}
          voiceChatState={voiceChatState}
          isVoiceChatEnabled={isVoiceChatEnabled}
          onToggleVoiceChat={onToggleVoiceChat}
        />
      </main>
    </div>
  );
};

export default AppLayout;
