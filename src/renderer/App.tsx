/**
 * ==========================================
 * Nova AI - 应用根组件（App.tsx）
 * 已升级为模块化架构，使用 AppLayout 整合所有组件
 *
 * 架构说明：
 * - 旧版：直接使用 Chat 组件（单文件）
 * - 新版：使用 AppLayout 组件（模块化拆分）
 *   ├── Sidebar      （侧边栏：对话列表、搜索、用户信息）
 *   ├── Header       （顶栏：Logo、模型选择、操作按钮）
 *   ├── ChatArea     （聊天区：消息展示、打字动画）
 *   ├── InputArea    （输入区：文本输入、发送、快捷建议）
 *   └── WelcomeScreen（欢迎页：品牌展示、快捷入口）
 * ==========================================
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import AppLayout from './components/AppLayout/AppLayout';
import { ToastProvider, useToast } from './components/Toast';
import { getOrchestrator } from './core/orchestrator';
import { getVoiceChatMode } from './core/voiceChat/VoiceChatMode';
import type { VoiceChatState } from './core/voiceChat/VoiceChatMode';
import type { AgentProcessEvent, Message } from './types';
import type { StreamCallbacks } from './core/orchestrator';
import { createLogger } from '../shared/logger';
import { createModelProvider, setModelProvider } from './core/model';
import { syncProviderConfigForModel } from './core/model/modelRuntime';
import { upsertById } from './utils/storage';

const logger = createLogger('ui');
const THEME_KEY = 'nova.theme';
const LEGACY_THEME_KEY = 'qiyuan_theme';
function AppContent() {
  const toast = useToast();

  const [messages, setMessages] = useState<Message[]>([]);
  const [processEventsByMessageId, setProcessEventsByMessageId] = useState<Record<string, AgentProcessEvent[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [voiceChatState, setVoiceChatState] = useState<VoiceChatState>('idle');
  const [isVoiceChatEnabled, setIsVoiceChatEnabled] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY) || localStorage.getItem(LEGACY_THEME_KEY);
      return (saved as 'dark' | 'light') || 'dark';
    } catch {
      return 'dark';
    }
  });
  
  const orchestratorRef = useRef(getOrchestrator());
  const voiceChatModeRef = useRef(getVoiceChatMode());
  const isVoiceChatEnabledRef = useRef(false);

  // 流式内容缓存：onStreamChunk 存，onStreamEnd 读，避免在 setMessages updater 里触发副作用
  const streamContentMap = useRef<Map<string, string>>(new Map());
  // 防重复触发 TTS：记录已经播放过的 messageId
  const spokenMessageIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const orchestrator = orchestratorRef.current;
    const voiceChatMode = voiceChatModeRef.current;

    // 设置语音对话模式回调
    voiceChatMode.setCallbacks({
      onStateChange: (state) => {
        setVoiceChatState(state);
      },
      onUserText: (text) => {
        logger.info('语音识别到用户说话', { text });
      },
      onAIText: (text) => {
        logger.info('语音模式收到 AI 回复', { textPreview: text.substring(0, 80) });
      },
      onSendMessage: async (text) => {
        // 不手动 setMessages，由 processTextInput 内部的 onMessageCallback 统一添加
        // 之前这里手动添加了一次，processTextInput 内部又添加了一次，导致语音消息显示两条
        await orchestratorRef.current.processTextInput(text);
      },
      onError: (error) => {
        showToast(error, 'error');
      }
    });

    // 设置普通消息回调（用于用户消息等）
    orchestrator.onMessage((message: Message) => {
      if (message.isStreaming) return;
      setMessages((prev) => upsertById(prev, message));
    });

    // 设置流式回调
    const streamCallbacks: StreamCallbacks = {
      onStreamStart: (message: Message) => {
        logger.info('助手回复开始输出', { messageId: message.id });
        setIsLoading(false);
        setMessages((prev) => [...prev, message]);
      },
      onStreamChunk: (messageId: string, content: string) => {
        // 缓存流式内容，供 onStreamEnd 读取
        streamContentMap.current.set(messageId, content);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId ? { ...msg, content } : msg
          )
        );
      },
      onStreamEnd: (messageId: string) => {
        logger.info('助手回复输出结束', { messageId });

        // 只做状态更新（纯函数），不在这里触发 TTS 等副作用
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId ? { ...msg, isStreaming: false } : msg
          )
        );

        // 获取内容并删除，无论是否触发 TTS
        const content = streamContentMap.current.get(messageId);
        streamContentMap.current.delete(messageId);

        // 副作用：触发 TTS 播放（放在 updater 外面，且用 Set 防重复）
        if (isVoiceChatEnabledRef.current && content && !spokenMessageIds.current.has(messageId)) {
          spokenMessageIds.current.add(messageId);
          logger.info('触发语音播放', { messageId, textPreview: content.substring(0, 80) });
          voiceChatMode.speakResponse(content);
        }
      },
      onProcessEvent: (messageId: string, event: AgentProcessEvent) => {
        setProcessEventsByMessageId((prev) => {
          const currentEvents = prev[messageId] || [];
          const existingIndex = currentEvents.findIndex((item) => item.id === event.id);
          const nextEvents =
            existingIndex >= 0
              ? currentEvents.map((item) => (item.id === event.id ? { ...item, ...event } : item))
              : [...currentEvents, event];

          return {
            ...prev,
            [messageId]: nextEvents.slice(-8),
          };
        });
      }
    };
    
    orchestrator.onStream(streamCallbacks);

    // 加载历史消息
    const history = orchestrator.getHistory();
    if (history.length > 0) {
      setMessages(history);
    } else {
      const welcomeMessage: Message = {
        id: Date.now().toString(36) + Math.random().toString(36).substring(2),
        role: 'assistant',
        content: orchestrator.getWelcomeMessage(),
        timestamp: Date.now(),
        sessionId: 'welcome',
      };
      setMessages([welcomeMessage]);
    }
  }, []);
  
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    toast.showToast(message, type);
  }, [toast]);

  // 切换语音对话模式
  const handleToggleVoiceChat = useCallback(async () => {
    try {
      logger.info('用户切换语音对话模式');
      const enabled = await voiceChatModeRef.current.toggle();
      setIsVoiceChatEnabled(enabled);
      isVoiceChatEnabledRef.current = enabled;
      showToast(enabled ? '语音对话模式已开启' : '语音对话模式已关闭', 'info');
    } catch (error) {
      logger.error('切换语音对话模式失败', error);
      showToast('切换语音对话模式失败', 'error');
    }
  }, [showToast]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
      localStorage.removeItem(LEGACY_THEME_KEY);
    } catch (e) {
      logger.error('保存主题设置失败', e);
    }
  }, [theme]);

  const handleToggleTheme = () => {
    logger.info('用户切换主题', { from: theme, to: theme === 'dark' ? 'light' : 'dark' });
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleSendMessage = async (content: string) => {
    if (!content.trim()) return;
    logger.info('用户提交消息', { textPreview: content.slice(0, 120), length: content.length });
    setIsLoading(true); // 显示加载动画
    try {
      await orchestratorRef.current.processTextInput(content);
    } catch (error) {
      logger.error('发送消息失败', error);
      showToast?.('发送消息失败，请重试', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleModelChange = (modelId: string) => {
    const runtime = syncProviderConfigForModel(modelId);
    logger.info('用户切换模型', { modelId: runtime.modelId, provider: runtime.provider });
    setModelProvider(createModelProvider(runtime.config));

    orchestratorRef.current.setModel(runtime.modelId);
  };

  const handleClearMessages = useCallback(() => {
    logger.info('用户清空当前对话');
    setMessages([]);
    setProcessEventsByMessageId({});
    // 清理 spokenMessageIds，避免内存泄漏
    spokenMessageIds.current.clear();
    // 新建对话时重置 Orchestrator 上下文
    orchestratorRef.current.resetConversation([]);
    logger.info('应用已重置对话状态');
  }, []);

  const handleSetMessages = useCallback((newMessages: Message[]) => {
    logger.info('用户切换对话消息', { messageCount: newMessages.length });
    setMessages(newMessages);
    setProcessEventsByMessageId({});
    // 清理 spokenMessageIds，避免内存泄漏
    spokenMessageIds.current.clear();
    // 重置 Orchestrator 的对话上下文，确保不同对话的 session 隔离
    orchestratorRef.current.resetConversation(newMessages);
    logger.info('应用已恢复对话上下文', { messageCount: newMessages.length });
  }, []);

  return (
    <AppLayout
      messages={messages}
      processEventsByMessageId={processEventsByMessageId}
      isLoading={isLoading}
      onSendMessage={handleSendMessage}
      onClearMessages={handleClearMessages}
      onSetMessages={handleSetMessages}
      onModelChange={handleModelChange}
      showToast={showToast}
      theme={theme}
      onToggleTheme={handleToggleTheme}
      voiceChatState={voiceChatState}
      isVoiceChatEnabled={isVoiceChatEnabled}
      onToggleVoiceChat={handleToggleVoiceChat}
    />
  );
}

function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}

export default App;
