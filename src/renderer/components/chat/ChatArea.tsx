/**
 * ChatArea 聊天区域组件
 * 核心功能：展示对话消息列表
 * 
 * 支持的消息类型：
 * - 用户消息：右对齐渐变气泡
 * - AI 消息：左对齐带头像 + 操作按钮（复制/收起）
 * - 时间分割线：按时间段分组显示
 * - 打字指示器：AI 思考中的动画效果
 * 
 * 性能优化：
 * - 虚拟滚动：只渲染可视区域内的消息，提高长列表性能
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import styles from './ChatArea.module.css';
import type { UIMessage } from '../../types/chat';
import { getTTSManager } from '../../core/tts/ttsManager';
import { DEFAULT_TTS_CONFIG } from '../../config/ttsConfig';
import DOMPurify from 'dompurify';

/**
 * PCM 音频数据转 WAV 格式
 * TTS 返回的是原始 PCM 数据，需要添加 WAV 头部才能在浏览器中播放
 * @param pcmData - 原始 PCM 音频数据（ArrayBuffer）
 * @param sampleRate - 采样率（默认 24000）
 * @param numChannels - 声道数（默认 1）
 * @param bitsPerSample - 位深度（默认 16）
 */
function pcmToWav(pcmData: ArrayBuffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): ArrayBuffer {
  const pcmBytes = new Uint8Array(pcmData)
  const wavBuffer = new ArrayBuffer(44 + pcmBytes.length)
  const view = new DataView(wavBuffer)

  // WAV 文件头部
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i))
    }
  }

  // RIFF header
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + pcmBytes.length, true)
  writeString(8, 'WAVE')

  // fmt chunk
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true) // chunk size
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numChannels * bitsPerSample / 8, true) // byte rate
  view.setUint16(32, numChannels * bitsPerSample / 8, true) // block align
  view.setUint16(34, bitsPerSample, true)

  // data chunk
  writeString(36, 'data')
  view.setUint32(40, pcmBytes.length, true)

  // 写入 PCM 数据
  const output = new Uint8Array(wavBuffer)
  output.set(pcmBytes, 44)

  return output.buffer
}

/* ==========================================
   组件 Props 类型定义
   ========================================== */
interface ChatAreaProps {
  /** 消息列表数据 */
  messages: UIMessage[];
  /** 是否正在加载（显示打字动画） */
  isLoading: boolean;
  /** 显示 Toast 提示回调 */
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

/* ==========================================
   工具函数：格式化时间戳为可读字符串
   ========================================== */

/**
 * 将时间戳格式化为 "HH:mm" 格式
 * @param timestamp - Unix 时间戳（毫秒）
 * @returns 格式化后的时间字符串，如 "00:08"
 */
const formatTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * 判断两条消息是否需要插入时间分割线
 * 规则：间隔超过 5 分钟或跨小时时显示分割线
 * @param current - 当前消息时间戳
 * @param previous - 前一条消息时间戳
 * @returns 是否需要显示时间分割线
 */
const shouldShowTimestamp = (current: number, previous: number): boolean => {
  if (!previous) return true; // 第一条消息总是显示
  const gap = Math.abs(current - previous);
  const FIVE_MINUTES = 5 * 60 * 1000; // 5 分钟阈值
  return gap > FIVE_MINUTES;
};

/**
 * ChatArea 聊天区域组件
 * @param props - 组件属性
 * @returns JSX 聊天区域元素
 */
const ChatArea: React.FC<ChatAreaProps> = ({ messages, isLoading, showToast }) => {
  /* 消息列表容器 ref，用于虚拟滚动 */
  const chatContainerRef = useRef<HTMLDivElement>(null);
  /* 消息列表底部的 ref，用于自动滚动 */
  const messagesEndRef = useRef<HTMLDivElement>(null);

  /** 收起状态：记录哪些消息被收起了 */
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  
  /** TTS 相关状态 */
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null); // 正在播放的消息 ID
  const ttsManagerRef = useRef(getTTSManager(DEFAULT_TTS_CONFIG)); // TTS 管理器实例
  const audioRef = useRef<HTMLAudioElement | null>(null); // 音频元素引用

  /** 虚拟滚动相关状态 */
  const [visibleStartIndex, setVisibleStartIndex] = useState(0);
  const [visibleEndIndex, setVisibleEndIndex] = useState(10); // 初始显示 10 条消息
  const [messageHeights, setMessageHeights] = useState<Map<string, number>>(new Map());
  
  /** 用于 ResizeObserver 的引用 */
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const observedHeights = useRef<Map<string, number>>(new Map());

  // 初始化 TTS
  useEffect(() => {
    ttsManagerRef.current.initialize(DEFAULT_TTS_CONFIG);
  }, []);

  /**
   * 自动滚动到最新消息底部
   */
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isLoading]);

  /**
   * 计算消息高度并更新
   */
  const updateMessageHeight = useCallback((messageId: string, height: number) => {
    setMessageHeights(prev => new Map(prev).set(messageId, height));
  }, []);

  /**
   * 处理滚动事件，更新可视区域消息索引
   */
  const handleScroll = useCallback(() => {
    if (!chatContainerRef.current) return;

    const container = chatContainerRef.current;
    const scrollTop = container.scrollTop;
    const containerHeight = container.clientHeight;

    // 计算可视区域开始和结束的消息索引
    let start = 0;
    let end = messages.length - 1;
    let currentHeight = 0;

    // 找到开始索引
    for (let i = 0; i < messages.length; i++) {
      const messageHeight = messageHeights.get(messages[i].id) || 100; // 默认高度 100px
      if (currentHeight + messageHeight > scrollTop) {
        start = Math.max(0, i - 2); // 多渲染 2 条消息作为缓冲
        break;
      }
      currentHeight += messageHeight;
    }

    // 找到结束索引
    currentHeight = 0;
    for (let i = 0; i < messages.length; i++) {
      const messageHeight = messageHeights.get(messages[i].id) || 100;
      currentHeight += messageHeight;
      if (currentHeight > scrollTop + containerHeight) {
        end = Math.min(messages.length - 1, i + 2); // 多渲染 2 条消息作为缓冲
        break;
      }
    }

    setVisibleStartIndex(start);
    setVisibleEndIndex(end);
  }, [messages, messageHeights]);

  // 监听滚动事件
  useEffect(() => {
    const container = chatContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  // 当消息变化时，重新计算可视区域
  useEffect(() => {
    setTimeout(handleScroll, 100); // 延迟执行，确保 DOM 已更新
  }, [messages, handleScroll]);

  // 使用 ResizeObserver 监听消息元素高度变化
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const messageId = entry.target.getAttribute('data-message-id');
        if (messageId) {
          const newHeight = entry.contentRect.height;
          const oldHeight = observedHeights.current.get(messageId);
          if (oldHeight !== newHeight) {
            observedHeights.current.set(messageId, newHeight);
            setMessageHeights(prev => new Map(prev).set(messageId, newHeight));
          }
        }
      }
    });

    // 观察所有已注册的消息元素
    messageRefs.current.forEach((el) => {
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, [messages.length]); // 只在消息数量变化时重新创建 observer

  /**
   * 复制 AI 回复内容到剪贴板
   */
  const handleCopy = async (content: string, messageId: string) => {
    try {
      /* 去除 HTML 标签后复制纯文本 */
      const textContent = content.replace(/<[^>]*>/g, '');
      await navigator.clipboard.writeText(textContent);
      showToast?.('已复制到剪贴板', 'success');
    } catch (err) {
      console.error('复制失败:', err);
      showToast?.('复制失败，请手动选择文本复制', 'error');
    }
  };

  /**
   * 切换消息收起/展开状态
   */
  const handleToggleCollapse = (messageId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  /* ==========================================
     TTS 语音播放功能
     ========================================== */

  /**
   * 播放 AI 回复的语音
   */
  const handlePlayTTS = async (message: UIMessage) => {
    // 如果正在播放这条消息，则停止
    if (playingMessageId === message.id) {
      console.log('⏸️ [ChatArea] 暂停播放');
      handleStopTTS();
      return;
    }

    // 如果正在播放其他消息，先停止
    if (playingMessageId) {
      console.log('⏸️ [ChatArea] 停止当前播放');
      handleStopTTS();
    }

    try {
      setPlayingMessageId(message.id);
      console.log('🎤 [ChatArea] 开始 TTS 合成...');

      // 调用 TTS 合成（使用 speak 方法）
      const result = await ttsManagerRef.current.speak({
        text: message.content,
        voice: DEFAULT_TTS_CONFIG.volcengine?.voice || 'zh_female_vv_uranus_bigtts'
      });

      if (result.success && result.audioData) {
        console.log('✅ [ChatArea] TTS 合成成功，音频大小:', result.audioData.byteLength, 'bytes');

        // PCM 转 WAV 格式（浏览器需要 WAV 头部才能播放 PCM）
        const wavBlob = new Blob([pcmToWav(result.audioData)], { type: 'audio/wav' });
        const url = URL.createObjectURL(wavBlob);

        const audio = new Audio(url);
        audioRef.current = audio;

        console.log('🔊 [ChatArea] 开始播放音频...');

        audio.onended = () => {
          console.log('✅ [ChatArea] 音频播放完成');
          setPlayingMessageId(null);
          URL.revokeObjectURL(url);
        };

        audio.onerror = (e) => {
          console.error('❌ [ChatArea] 音频播放失败:', e);
          setPlayingMessageId(null);
          showToast?.('语音播放失败', 'error');
          URL.revokeObjectURL(url);
        };

        await audio.play();
      } else {
        console.error('❌ [ChatArea] TTS 合成失败:', result.error);
        setPlayingMessageId(null);
        showToast?.(result.error || '语音合成失败', 'error');
      }

    } catch (error) {
      console.error('❌ [ChatArea] TTS 播放失败:', error);
      setPlayingMessageId(null);
      showToast?.('语音播放失败，请稍后重试', 'error');
    }
  };

  /**
   * 停止当前播放的语音
   */
  const handleStopTTS = () => {
    console.log('⏸️ [ChatArea] 停止 TTS 播放');
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setPlayingMessageId(null);
  };

  /**
   * 简单的 HTML 渲染（将文本中包含的 <kbd> 和 <code> 等 HTML 标签渲染出来）
   * 注意：生产环境建议使用 react-markdown 或 DOMPurify 进行安全渲染
   * 这里仅用于展示设计稿效果
   * @param content - 可能包含 HTML 的消息内容
   * @returns JSX 元素或纯文本
   */
  const renderMessageContent = (content: string) => {
    /* 检查内容是否包含 HTML 标签 */
    if (/<\/?[a-z][\s\S]*>/i.test(content)) {
      return (
        <span
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }}
        />
      );
    }
    /* 纯文本直接返回 */
    return content;
  };

  /* 如果没有消息且不在加载中，不渲染任何内容（由 WelcomeScreen 处理） */
  if (messages.length === 0 && !isLoading) {
    return null;
  }

  /**
   * 计算消息列表的总高度
   */
  const totalHeight = messages.reduce((height, message) => {
    return height + (messageHeights.get(message.id) || 100);
  }, 0);

  /**
   * 计算可视区域之前的消息总高度
   */
  const offsetTop = messages.slice(0, visibleStartIndex).reduce((height, message) => {
    return height + (messageHeights.get(message.id) || 100);
  }, 0);

  return (
    <div className={styles.chatArea} ref={chatContainerRef}>
      <div 
        className={styles.messageGroup}
        style={{
          height: totalHeight,
          position: 'relative'
        }}
      >
        {/* 可视区域内的消息 */}
        <div 
          style={{
            position: 'absolute',
            top: offsetTop,
            left: 0,
            right: 0
          }}
        >
          {/* ===== 遍历可视区域内的消息进行渲染 ===== */}
          {messages.slice(visibleStartIndex, visibleEndIndex + 1).map((message, index) => {
            const actualIndex = visibleStartIndex + index;
            /* 获取前一条消息的时间戳，用于判断是否需要时间分割线 */
            const prevTimestamp = actualIndex > 0 ? messages[actualIndex - 1].timestamp : null;

            return (
              <div 
                key={message.id}
                data-message-id={message.id}
                ref={(el) => {
                  if (el) {
                    messageRefs.current.set(message.id, el);
                  } else {
                    messageRefs.current.delete(message.id);
                  }
                }}
              >
                <React.Fragment>
                  {/* ===== 时间分割线（间隔 >5min 时显示）===== */}
                  {shouldShowTimestamp(message.timestamp, prevTimestamp || 0) && (
                    <div className={styles.timestampDivider}>
                      今天 {formatTime(message.timestamp)}
                    </div>
                  )}

                  {/* ===== 用户消息（右侧对齐）===== */}
                  {message.role === 'user' && (
                    <div className={styles.messageUser}>
                      <div className={styles.userBubbleWrapper}>
                        {/* 消息气泡 */}
                        <div className={styles.userBubble}>
                          {renderMessageContent(message.content)}
                        </div>
                        {/* 时间戳 */}
                        <div className={styles.userBubbleTime}>
                          {formatTime(message.timestamp)}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ===== AI 消息（左侧对齐 + 头像 + 操作按钮）===== */}
                  {message.role === 'assistant' && (
                    <div className={styles.messageAi}>
                      {/* AI 头像 */}
                      <div className={styles.aiAvatar} title="启源 AI">
                        <svg
                          className={styles.aiAvatarSvg}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                        </svg>
                      </div>

                      {/* 消息内容区 */}
                      <div className={styles.aiContent}>
                        {/* 消息气泡（支持收起/展开 + 流式光标） */}
                        <div 
                          className={`${styles.aiBubble} ${message.isStreaming ? styles.streamingBubble : ''}`}
                          style={collapsedIds.has(message.id) ? { maxHeight: '60px', overflow: 'hidden' } : undefined}
                        >
                          {renderMessageContent(message.content)}
                          {/* 流式输出时的闪烁光标 */}
                          {message.isStreaming && (
                            <span className={styles.streamingCursor}>|</span>
                          )}
                          {collapsedIds.has(message.id) && (
                            <span style={{ color: 'var(--text-muted)', fontSize: '12px', marginLeft: '8px' }}>...已收起</span>
                          )}
                        </div>

                        {/* 操作按钮（默认隐藏，悬停显示）*/}
                        <div className={styles.aiActions}>
                          {/* 语音播放按钮 */}
                          <button
                            className={`${styles.aiActionBtn} ${playingMessageId === message.id ? styles.playingBtn : ''}`}
                            onClick={() => handlePlayTTS(message)}
                            title={playingMessageId === message.id ? '停止播放' : '播放语音'}
                          >
                            {playingMessageId === message.id ? (
                              <>
                                {/* 停止图标 */}
                                <svg
                                  className={styles.aiActionBtnSvg}
                                  viewBox="0 0 24 24"
                                  fill="currentColor"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <rect x="6" y="4" width="4" height="16" rx="1" />
                                  <rect x="14" y="4" width="4" height="16" rx="1" />
                                </svg>
                                停止
                              </>
                            ) : (
                              <>
                                {/* 播放图标 */}
                                <svg
                                  className={styles.aiActionBtnSvg}
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <polygon points="11 5 6 9 2 9 2 15 6 19 11 15 19 20 8 15 5" />
                                </svg>
                                播放
                              </>
                            )}
                          </button>

                          {/* 复制按钮 */}
                          <button
                            className={styles.aiActionBtn}
                            onClick={() => handleCopy(message.content, message.id)}
                            title="复制回复内容"
                          >
                            <svg
                              className={styles.aiActionBtnSvg}
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                            {collapsedIds.has(message.id) ? '展开' : '复制'}
                          </button>

                          {/* 收起/展开按钮 */}
                          <button
                            className={styles.aiActionBtn}
                            onClick={() => handleToggleCollapse(message.id)}
                            title={collapsedIds.has(message.id) ? '展开消息' : '收起这条消息'}
                          >
                            <svg
                              className={styles.aiActionBtnSvg}
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              {collapsedIds.has(message.id) ? (
                                <>
                                  <path d="M7 14l5-5 5 5" /> {/* 向下箭头 = 展开 */}
                                </>
                              ) : (
                                <>
                                  <path d="M7 10l5-5 5 5" /> {/* 向上箭头 = 收起 */}
                                </>
                              )}
                            </svg>
                            {collapsedIds.has(message.id) ? '展开' : '收起'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              </div>
            );
          })}

          {/* ===== 打字指示器（AI 正在思考/生成回复时显示）===== */}
          {isLoading && (
            <div className={styles.typingIndicator}>
              {/* AI 头像 */}
              <div className={styles.aiAvatar} title="启源 AI">
                <svg
                  className={styles.aiAvatarSvg}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
              {/* 三个跳动的小圆点 */}
              <div className={styles.typingDots}>
                <div className={styles.typingDot}></div>
                <div className={styles.typingDot}></div>
                <div className={styles.typingDot}></div>
              </div>
            </div>
          )}

          {/* 滚动锚点元素 - 用于自动滚动到底部 */}
          <div ref={messagesEndRef} />
        </div>
      </div>
    </div>
  );
};

export default ChatArea;
