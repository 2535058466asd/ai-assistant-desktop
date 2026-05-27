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

import React, { useState, useEffect, useRef } from 'react';
import styles from './ChatArea.module.css';
import type { UIMessage } from '../../types/chat';
import { getTTSManager } from '../../core/tts/ttsManager';
import DOMPurify from 'dompurify';
import { createLogger } from '../../../shared/logger';

const logger = createLogger('ui');

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

type ProcessEvent = NonNullable<UIMessage['processEvents']>[number];

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  exec_command: '执行命令',
  open_app: '打开应用',
  read_file: '读取文件',
  write_file: '写入文件',
  web_search: '搜索网页',
  web_fetch: '读取网页',
  clipboard_read: '读取剪贴板',
  clipboard_write: '写入剪贴板',
  knowledge_search: '检索知识库',
  knowledge_import_file: '导入知识库',
  workspace_create_task: '创建任务',
  workspace_update_project: '更新项目',
};

const PROCESS_STATUS_LABELS: Record<ProcessEvent['status'], string> = {
  pending: '等待',
  running: '执行中',
  success: '完成',
  error: '失败',
  cancelled: '取消',
};

const getToolDisplayName = (toolName: string): string => TOOL_DISPLAY_NAMES[toolName] || toolName;

const formatDuration = (durationMs?: number): string => {
  if (typeof durationMs !== 'number') return '';
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
};

const formatTokenCount = (tokens: number): string => {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
};

/**
 * ChatArea 聊天区域组件
 * @param props - 组件属性
 * @returns JSX 聊天区域元素
 */
const ChatArea: React.FC<ChatAreaProps> = ({ messages, isLoading, showToast }) => {
  /* 消息列表容器 ref，用于滚动到底部 */
  const chatContainerRef = useRef<HTMLDivElement>(null);
  /* 消息列表底部的 ref，用于自动滚动 */
  const messagesEndRef = useRef<HTMLDivElement>(null);

  /** 收起状态：记录哪些消息被收起了 */
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  /** Agent 处理过程展开状态：默认流式生成中展开，完成后可手动展开 */
  const [processExpandedIds, setProcessExpandedIds] = useState<Set<string>>(new Set());
  
  /** TTS 相关状态 */
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null); // 正在播放的消息 ID
  const ttsManagerRef = useRef(getTTSManager()); // TTS 管理器实例
  const audioRef = useRef<HTMLAudioElement | null>(null); // 音频元素引用

  /**
   * 自动滚动到最新消息底部
   */
  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
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

  const renderAgentProcess = (message: UIMessage) => {
    const hasReasoning = !!message.reasoningContent;
    const hasToolCalls = message.toolCallSummary && message.toolCallSummary.length > 0;

    // 如果没有思考内容和工具调用，不渲染
    if (!hasReasoning && !hasToolCalls) return null;

    const isExpanded = message.isStreaming || processExpandedIds.has(message.id);
    const toolCount = message.toolCallSummary?.length || 0;
    const summaryText = message.isStreaming
      ? '思考中'
      : toolCount > 0
        ? `思考过程 · ${toolCount} 个工具调用`
        : '思考过程';

    return (
      <div className={styles.agentProcessPanel}>
        <button
          type="button"
          className={styles.agentProcessToggle}
          onClick={() => handleToggleProcess(message.id)}
          aria-expanded={isExpanded}
        >
          <span className={`${styles.agentProcessSummaryDot} ${message.isStreaming ? styles.processSummaryRunning : ''}`} />
          <span className={styles.agentProcessSummaryText}>{summaryText}</span>
          <span className={styles.agentProcessSummaryHint}>{isExpanded ? '收起' : '展开'}</span>
          <svg
            className={`${styles.agentProcessChevron} ${isExpanded ? styles.agentProcessChevronOpen : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {isExpanded && (
          <div className={styles.agentProcessList}>
            {/* 推理内容 - 分段展示 */}
            {hasReasoning && message.reasoningSegments && message.reasoningSegments.length > 0 ? (
              message.reasoningSegments.map((segment, index) => (
                <div key={index} className={styles.agentProcessItem}>
                  <span className={styles.agentProcessDot} />
                  <div className={styles.agentProcessBody}>
                    <div className={styles.agentProcessHeader}>
                      <span className={styles.agentProcessName}>第{segment.round}轮思考</span>
                    </div>
                    <div className={styles.agentProcessResult}>
                      {segment.content}
                    </div>
                  </div>
                </div>
              ))
            ) : hasReasoning ? (
              <div className={styles.agentProcessItem}>
                <span className={styles.agentProcessDot} />
                <div className={styles.agentProcessBody}>
                  <div className={styles.agentProcessHeader}>
                    <span className={styles.agentProcessName}>推理内容</span>
                  </div>
                  <div className={styles.agentProcessResult}>
                    {message.reasoningContent}
                  </div>
                </div>
              </div>
            ) : null}

            {/* 工具调用列表 */}
            {hasToolCalls && message.toolCallSummary?.map((tool, index) => (
              <div
                key={index}
                className={`${styles.agentProcessItem} ${styles.processKind_tool} ${styles[`processStatus_${tool.status}`] || ''}`}
              >
                <span className={styles.agentProcessDot} />
                <div className={styles.agentProcessBody}>
                  <div className={styles.agentProcessHeader}>
                    <span className={styles.agentProcessName}>{getToolDisplayName(tool.name)}</span>
                    <span className={styles.agentProcessStatus}>{tool.status === 'success' ? '完成' : '失败'}</span>
                    <span className={styles.agentProcessDuration}>{formatDuration(tool.durationMs)}</span>
                  </div>
                  {tool.argsPreview && (
                    <div className={styles.agentProcessMeta}>
                      {tool.argsPreview}
                    </div>
                  )}
                  {tool.resultPreview && (
                    <div className={styles.agentProcessResult}>
                      {tool.resultPreview}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  /* 如果没有消息且不在加载中，不渲染任何内容（由 WelcomeScreen 处理） */
  if (messages.length === 0 && !isLoading) {
    return null;
  }

  return (
    <div className={styles.chatArea} ref={chatContainerRef}>
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
                          {renderMessageContent(message.content)}
                          {/* 流式输出时的闪烁光标 */}
                          {message.isStreaming && (
                            <span className={styles.streamingCursor}>|</span>
                          )}
                          {collapsedIds.has(message.id) && (
                            <span style={{ color: 'var(--text-muted)', fontSize: '12px', marginLeft: '8px' }}>...已收起</span>
                          )}
                        </div>

                        {renderAgentProcess(message)}

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

                          {/* 用量显示 */}
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
          {isLoading && (
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

          {/* 滚动锚点元素 - 用于自动滚动到底部 */}
          <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

export default ChatArea;
