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
 * 当前直接渲染完整消息列表，优先保证流式输出、思考面板和滚动行为稳定。
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import styles from './ChatArea.module.css';
import type { UIMessage } from '../../types/chat';
import type { DocumentAttachment, ImageAttachment } from '../../types';
import { getTTSManager } from '../../core/tts/ttsManager';
import DOMPurify from 'dompurify';
import { createLogger } from '../../../shared/logger';
import MarkdownRenderer from './MarkdownRenderer';
import FileTypeIcon from '../common/FileTypeIcon';
import AgentProcessPanel from './AgentProcessPanel';
import { pcmToWav } from './audioUtils';

const logger = createLogger('ui');

const formatDuration = (durationMs?: number): string => {
  if (typeof durationMs !== 'number') return '';
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
};

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

type ProcessEvent = NonNullable<UIMessage['processEvents']>[number];

const formatTokenCount = (tokens: number): string => {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
};

const ChatImage: React.FC<{
  attachment: ImageAttachment;
  onOpen: (src: string, name: string) => void;
}> = ({ attachment, onOpen }) => {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    window.electronAPI?.attachmentReadDataUrl?.(attachment.relativePath, attachment.mimeType)
      .then((result) => {
        if (!active) return;
        if (result?.success && result.data) {
          setSrc(result.data);
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [attachment.mimeType, attachment.relativePath]);

  if (failed) {
    return <div className={styles.messageImageFallback}>图片无法读取<br />{attachment.name}</div>;
  }

  return src ? (
    <button type="button" className={styles.messageImageButton} onClick={() => onOpen(src, attachment.name)}>
      <img src={src} alt={attachment.name} className={styles.messageImage} />
    </button>
  ) : (
    <div className={styles.messageImageFallback}>正在加载图片...</div>
  );
};

const ChatDocument: React.FC<{ attachment: DocumentAttachment }> = ({ attachment }) => (
  <div
    className={styles.messageDocument}
    title={attachment.name}
  >
    <FileTypeIcon fileName={attachment.name} />
    <span className={styles.messageDocumentMeta}>
      <strong>{attachment.name}</strong>
      <small>{Math.max(1, Math.ceil(attachment.sizeBytes / 1024))} KB</small>
    </span>
  </div>
);

/**
 * ChatArea 聊天区域组件
 * @param props - 组件属性
 * @returns JSX 聊天区域元素
 */
const ChatArea: React.FC<ChatAreaProps> = ({ messages, isLoading, showToast }) => {
  /* 消息列表容器 ref，用于滚动到底部 */
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const previousRenderRef = useRef<{ count: number; lastId?: string }>({ count: 0 });

  /** 收起状态：记录哪些消息被收起了 */
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  /** Agent 处理过程展开状态：默认流式生成中展开，完成后可手动展开 */
  const [processExpandedIds, setProcessExpandedIds] = useState<Set<string>>(new Set());
  
  /** TTS 相关状态 */
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null); // 正在播放的消息 ID
  const [previewImage, setPreviewImage] = useState<{ src: string; name: string } | null>(null);
  const ttsManagerRef = useRef(getTTSManager()); // TTS 管理器实例
  const audioRef = useRef<HTMLAudioElement | null>(null); // 音频元素引用

  const isNearBottom = useCallback(() => {
    const container = chatContainerRef.current;
    if (!container) return true;
    const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
    return distance < 120;
  }, []);

  const handleScroll = useCallback(() => {
    shouldStickToBottomRef.current = isNearBottom();
  }, [isNearBottom]);

  /**
   * 自动滚动到最新消息底部
   */
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    const lastMessage = messages[messages.length - 1];
    const previous = previousRenderRef.current;
    const hasNewMessage = messages.length !== previous.count || lastMessage?.id !== previous.lastId;
    const isStreaming = Boolean(lastMessage?.isStreaming);

    previousRenderRef.current = {
      count: messages.length,
      lastId: lastMessage?.id,
    };

    if (!shouldStickToBottomRef.current && !hasNewMessage) return;

    const frameId = requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: hasNewMessage && !isStreaming ? 'smooth' : 'auto',
      });
    });

    return () => cancelAnimationFrame(frameId);
  }, [messages, isLoading]);

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
      logger.error('复制消息失败', { messageId, error: err });
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
      logger.info('点击当前消息，停止语音播放', { messageId: message.id });
      handleStopTTS();
      return;
    }

    // 如果正在播放其他消息，先停止
    if (playingMessageId) {
      logger.info('切换语音播放消息', { from: playingMessageId, to: message.id });
      handleStopTTS();
    }

    try {
      setPlayingMessageId(message.id);
      logger.info('聊天消息开始语音合成', { messageId: message.id });

      // 调用 TTS 合成。这里不指定 voice，让 TTSManager 根据当前引擎选择默认声音。
      const result = await ttsManagerRef.current.speak({
        text: message.content
      });

      if (result.success && !result.audioData) {
        logger.info('聊天消息语音播放成功', { messageId: message.id, mode: 'direct-playback' });
        setPlayingMessageId(null);
      } else if (result.success && result.audioData) {
        logger.info('聊天消息语音合成成功', { messageId: message.id, audioSizeBytes: result.audioData.byteLength });

        // PCM 转 WAV 格式（浏览器需要 WAV 头部才能播放 PCM）
        const wavBlob = new Blob([pcmToWav(result.audioData)], { type: 'audio/wav' });
        const url = URL.createObjectURL(wavBlob);

        const audio = new Audio(url);
        audioRef.current = audio;

        logger.info('聊天消息开始播放音频', { messageId: message.id });

        audio.onended = () => {
          logger.info('聊天消息音频播放结束', { messageId: message.id });
          setPlayingMessageId(null);
          URL.revokeObjectURL(url);
        };

        audio.onerror = (e) => {
          logger.error('聊天消息音频播放失败', { messageId: message.id, error: e });
          setPlayingMessageId(null);
          showToast?.('语音播放失败', 'error');
          URL.revokeObjectURL(url);
        };

        await audio.play();
      } else {
        logger.error('聊天消息语音合成失败', { messageId: message.id, error: result.error });
        setPlayingMessageId(null);
        showToast?.(result.error || '语音合成失败', 'error');
      }

    } catch (error) {
      logger.error('聊天消息语音播放异常', { messageId: message.id, error });
      setPlayingMessageId(null);
      showToast?.('语音播放失败，请稍后重试', 'error');
    }
  };

  /**
   * 停止当前播放的语音
   */
  const handleStopTTS = () => {
    logger.info('聊天消息语音播放已停止', { messageId: playingMessageId });
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setPlayingMessageId(null);
  };

  /**
   * 简单的 HTML 渲染（将文本中包含的 <kbd> 和 <code> 等 HTML 标签渲染出来）
   * 使用 DOMPurify 做基础净化，避免直接渲染未经处理的 HTML。
   * 这里仅用于展示设计稿效果
   * @param content - 可能包含 HTML 的消息内容
   * @returns JSX 元素或纯文本
   */
  const renderMessageContent = (content: string, role?: string) => {
    if (role === 'assistant') {
      return <MarkdownRenderer content={content} />;
    }
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

  const handleToggleProcess = (messageId: string) => {
    setProcessExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  /* 如果没有消息且不在加载中，不渲染任何内容（由 WelcomeScreen 处理） */
  if (messages.length === 0 && !isLoading) {
    return null;
  }

  return (
    <div className={styles.chatArea} ref={chatContainerRef} onScroll={handleScroll}>
      <div className={styles.messageGroup}>
          {/* ===== 遍历消息进行渲染 ===== */}
          {messages.map((message, index) => {
            const actualIndex = index;
            /* 获取前一条消息的时间戳，用于判断是否需要时间分割线 */
            const prevTimestamp = actualIndex > 0 ? messages[actualIndex - 1].timestamp : null;

            return (
              <div 
                key={message.id}
                data-message-id={message.id}
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
                          {message.attachments && message.attachments.length > 0 && (
                            <div className={styles.attachmentContainer}>
                              {message.attachments.some(a => a.type === 'image') && (
                                <div className={`${styles.messageImageGrid} ${message.attachments.filter(a => a.type === 'image').length === 1 ? styles.messageImageGridSingle : ''}`}>
                                  {message.attachments.filter(a => a.type === 'image').map((attachment) => (
                                    <ChatImage
                                      key={attachment.id}
                                      attachment={attachment as ImageAttachment}
                                      onOpen={(src, name) => setPreviewImage({ src, name })}
                                    />
                                  ))}
                                </div>
                              )}
                              {message.attachments.some(a => a.type === 'document') && (
                                <div className={styles.messageDocumentList}>
                                  {message.attachments.filter(a => a.type === 'document').map((attachment) => (
                                    <ChatDocument key={attachment.id} attachment={attachment as DocumentAttachment} />
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          {message.content.trim() && renderMessageContent(message.content, message.role)}
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
                      <div className={styles.aiAvatar} title="Nova">
                        <svg
                          className={styles.aiAvatarSvg}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      </div>

                      {/* 消息内容区 */}
                      <div className={styles.aiContent}>
                        {/* 消息气泡（支持收起/展开 + 流式光标） */}
                        <div 
                          className={`${styles.aiBubble} ${message.isStreaming ? styles.streamingBubble : ''}`}
                          style={collapsedIds.has(message.id) ? { maxHeight: '60px', overflow: 'hidden' } : undefined}
                        >
                          {renderMessageContent(message.content, message.role)}
                          {/* 流式输出时的闪烁光标 */}
                          {message.isStreaming && (
                            <span className={styles.streamingCursor}>|</span>
                          )}
                          {collapsedIds.has(message.id) && (
                            <span style={{ color: 'var(--text-muted)', fontSize: '12px', marginLeft: '8px' }}>...已收起</span>
                          )}
                        </div>

                        <AgentProcessPanel
                          message={message}
                          isExpanded={processExpandedIds.has(message.id)}
                          onToggle={() => handleToggleProcess(message.id)}
                        />

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
                                  <polygon points="8 5 19 12 8 19 8 5" />
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

                          {/* 耗时 + 用量显示 */}
                          {message.durationMs != null && (
                            <span className={styles.usageInfo}>
                              {formatDuration(message.durationMs)}
                            </span>
                          )}
                          {message.usage && (
                            <span className={styles.usageInfo} title={`输入: ${message.usage.prompt_tokens} tokens\n输出: ${message.usage.completion_tokens} tokens`}>
                              {formatTokenCount(message.usage.total_tokens)} tokens
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              </div>
            );
          })}

          {/* ===== 打字指示器（AI 正在思考/生成回复时显示）===== */}
          {isLoading && !messages.some(m => m.role === 'assistant' && m.isStreaming) && (
            <div className={styles.typingIndicator}>
              {/* AI 头像 */}
              <div className={styles.aiAvatar} title="Nova">
                <svg
                  className={styles.aiAvatarSvg}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
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

      </div>
      {previewImage && (
        <div className={styles.imagePreviewOverlay} role="dialog" aria-label={previewImage.name} onClick={() => setPreviewImage(null)}>
          <button type="button" className={styles.imagePreviewClose} onClick={() => setPreviewImage(null)} aria-label="关闭图片预览">×</button>
          <img src={previewImage.src} alt={previewImage.name} onClick={(event) => event.stopPropagation()} />
        </div>
      )}
    </div>
  );
};

export default ChatArea;
