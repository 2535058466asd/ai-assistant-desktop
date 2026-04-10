/**
 * ==========================================
 * 启源 AI - 应用根组件（App.tsx）
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
import type { Message } from './types';
import type { StreamCallbacks } from './core/orchestrator';

function AppContent() {
  const toast = useToast();

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [voiceChatState, setVoiceChatState] = useState<VoiceChatState>('idle');
  const [isVoiceChatEnabled, setIsVoiceChatEnabled] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('qiyuan_theme');
    return (saved as 'dark' | 'light') || 'dark';
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
        console.log('🎤 [App] 用户正在说:', text);
      },
      onAIText: (text) => {
        console.log('🎤 [App] AI 回复:', text.substring(0, 50) + '...');
      },
      onSendMessage: async (text) => {
        const userMessage: Message = {
          id: Date.now().toString(36) + Math.random().toString(36).substr(2),
          role: 'user',
          content: text,
          timestamp: Date.now(),
          sessionId: 'voice-chat'
        };
        
        setMessages((prev) => [...prev, userMessage]);
        await orchestratorRef.current.processTextInput(text);
      },
      onError: (error) => {
        showToast(error, 'error');
      }
    });

    // 设置普通消息回调（用于用户消息等）
    orchestrator.onMessage((message: Message) => {
      if (message.isStreaming) return;
      setMessages((prev) => [...prev, message]);
    });

    // 设置流式回调
    const streamCallbacks: StreamCallbacks = {
      onStreamStart: (message: Message) => {
        console.log('📝 [App] 流式开始:', message.id);
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
        console.log('✅ [App] 流式结束:', messageId);

        // 只做状态更新（纯函数），不在这里触发 TTS 等副作用
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId ? { ...msg, isStreaming: false } : msg
          )
        );

        // 副作用：触发 TTS 播放（放在 updater 外面，且用 Set 防重复）
        if (isVoiceChatEnabledRef.current && !spokenMessageIds.current.has(messageId)) {
          spokenMessageIds.current.add(messageId);
          const content = streamContentMap.current.get(messageId);
          if (content) {
            console.log('🎤 [App] 触发 TTS 播放:', content.substring(0, 50) + '...');
            voiceChatMode.speakResponse(content);
            streamContentMap.current.delete(messageId);
          }
        }
      }
    };
    
    orchestrator.onStream(streamCallbacks);

    // 加载历史消息
    const history = orchestrator.getHistory();
    if (history.length > 0) {
      setMessages(history);
    } else {
      const welcomeMessage: Message = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
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
      const enabled = await voiceChatModeRef.current.toggle();
      setIsVoiceChatEnabled(enabled);
      isVoiceChatEnabledRef.current = enabled;
      showToast(enabled ? '语音对话模式已开启' : '语音对话模式已关闭', 'info');
    } catch (error) {
      console.error('❌ 切换语音对话模式失败:', error);
      showToast('切换语音对话模式失败', 'error');
    }
  }, [showToast]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('qiyuan_theme', theme);
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleSendMessage = async (content: string) => {
    if (!content.trim()) return;
    setIsLoading(true); // 显示加载动画
    await orchestratorRef.current.processTextInput(content);
  };

  const handleClearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return (
    <AppLayout
      messages={messages}
      isLoading={isLoading}
      onSendMessage={handleSendMessage}
      onClearMessages={handleClearMessages}
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
