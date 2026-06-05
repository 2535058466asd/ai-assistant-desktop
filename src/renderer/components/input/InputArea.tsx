/**
 * InputArea 输入区域组件
 * 用户与 AI 交互的核心入口
 *
 * 功能：
 * - 文本输入（支持多行自动调整高度）
 * - 快捷建议芯片点击
 * - 发送消息（按钮点击 / Enter 键）
 * - 附件按钮（上传文件、语音输入等）
 * - 支持通过 ref 暴露 setText 方法（供父组件调用）
 *
 * 交互细节：
 * - Enter 发送，Shift+Enter 换行
 * - 空内容时禁用发送按钮
 * - 输入框聚焦时容器边框发光
 */

import React, { useState, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import styles from './InputArea.module.css';
import type { SendMessageHandler } from '../../types/chat';
import type { PendingAttachment, PendingImageAttachment, PendingAudioAttachment, PendingVideoAttachment } from '../../types';
import { getASRManager } from '../../core/asr/asrManager';
import type { ASRResult } from '../../core/asr/asrInterface';
import { createLogger } from '../../../shared/logger';

const logger = createLogger('ui');
const MAX_IMAGE_COUNT = 4;
const MAX_AUDIO_COUNT = 3;
const MAX_VIDEO_COUNT = 2;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const ALLOWED_AUDIO_TYPES = new Set(['audio/mp3', 'audio/wav', 'audio/m4a', 'audio/ogg', 'audio/mpeg', 'audio/x-m4a']);
const ALLOWED_VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

/* ==========================================
   组件 Props 类型定义
   ========================================== */
interface InputAreaProps {
  isLoading: boolean;
  showSuggestions?: boolean;
  onSendMessage: SendMessageHandler;
  onSuggestionClick?: (prompt: string) => void;
  /** 语音对话模式状态（用于状态提示）*/
  voiceChatState?: 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';
  /** 语音对话模式是否开启（用于状态提示）*/
  isVoiceChatEnabled?: boolean;
  /** 切换语音对话模式回调 */
  onToggleVoiceChat?: () => void;
  realtimeCallState?: 'idle' | 'connecting' | 'connected' | 'error';
  isRealtimeCallEnabled?: boolean;
  onToggleRealtimeCall?: () => void;
  /** 显示附件校验提示 */
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

/**
 * InputArea 暴露给父组件的方法类型
 */
export interface InputAreaHandle {
  setText(text: string): void;
}

const DEFAULT_SUGGESTIONS = [
  '\uD83D\uDCA1 解释一个概念',
  '\uD83D\uDD27 帮我写代码',
  '\uD83D\uDCDD 帮我写文案',
  '\uD83D\uDD0D 搜索信息',
];

/**
 * InputArea 输入区域组件
 */
const InputArea = forwardRef<InputAreaHandle, InputAreaProps>(({
  isLoading,
  showSuggestions = false,
  onSendMessage,
  onSuggestionClick,
  voiceChatState = 'idle',
  isVoiceChatEnabled = false,
  onToggleVoiceChat,
  realtimeCallState = 'idle',
  isRealtimeCallEnabled = false,
  onToggleRealtimeCall,
  showToast,
}, ref) => {
  
  const [inputText, setInputText] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recognitionText, setRecognitionText] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const asrManagerRef = useRef(getASRManager());

  useImperativeHandle(ref, () => ({
    setText(text: string) {
      setInputText(text);
      textareaRef.current?.focus();
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
        }
      }, 0);
    },
  }));

  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    requestAnimationFrame(adjustTextareaHeight);
  };

  const handleSend = async () => {
    const trimmedText = inputText.trim();
    if ((!trimmedText && pendingAttachments.length === 0) || isLoading) return;
    logger.info('发送按钮或回车提交输入', {
      textPreview: trimmedText.slice(0, 120),
      length: trimmedText.length,
      attachmentCount: pendingAttachments.length,
      via: 'input-area',
    });

    // 先清空输入框，再发送消息（避免等待回复期间输入框残留文字）
    setInputText('');
    const attachmentsToSend = pendingAttachments;
    setPendingAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      await onSendMessage(trimmedText, undefined, attachmentsToSend);
    } catch (error) {
      logger.error('输入区发送失败', error);
      setPendingAttachments(attachmentsToSend);
    }
  };

  const readFileAsDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`无法读取图片：${file.name}`));
    reader.readAsDataURL(file);
  });

  const addFiles = async (files: File[]) => {
    const accepted: PendingAttachment[] = [];
    let totalImageBytes = pendingAttachments.filter(a => a.type === 'image').reduce((sum, a) => sum + a.sizeBytes, 0);
    const imageCount = pendingAttachments.filter(a => a.type === 'image').length;
    const audioCount = pendingAttachments.filter(a => a.type === 'audio').length;
    const videoCount = pendingAttachments.filter(a => a.type === 'video').length;

    for (const file of files) {
      const mimeType = file.type;

      if (ALLOWED_IMAGE_TYPES.has(mimeType)) {
        if (imageCount + accepted.filter(a => a.type === 'image').length >= MAX_IMAGE_COUNT) {
          showToast?.(`单条消息最多添加 ${MAX_IMAGE_COUNT} 张图片。`, 'info');
          continue;
        }
        if (file.size > MAX_IMAGE_BYTES || totalImageBytes + file.size > MAX_TOTAL_IMAGE_BYTES) {
          showToast?.('单张图片不能超过 10 MB，总计不能超过 20 MB。', 'error');
          continue;
        }
        const dataUrl = await readFileAsDataUrl(file);
        accepted.push({
          id: `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          type: 'image',
          name: file.name,
          mimeType: mimeType as PendingImageAttachment['mimeType'],
          sizeBytes: file.size,
          dataUrl,
        });
        totalImageBytes += file.size;
      } else if (ALLOWED_AUDIO_TYPES.has(mimeType)) {
        if (audioCount + accepted.filter(a => a.type === 'audio').length >= MAX_AUDIO_COUNT) {
          showToast?.(`单条消息最多添加 ${MAX_AUDIO_COUNT} 个音频。`, 'info');
          continue;
        }
        if (file.size > MAX_AUDIO_BYTES) {
          showToast?.('单个音频不能超过 25 MB。', 'error');
          continue;
        }
        const dataUrl = await readFileAsDataUrl(file);
        const normalizedMime = mimeType === 'audio/mpeg' ? 'audio/mp3'
          : mimeType === 'audio/x-m4a' ? 'audio/m4a'
          : mimeType as PendingAudioAttachment['mimeType'];
        accepted.push({
          id: `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          type: 'audio',
          name: file.name,
          mimeType: normalizedMime,
          sizeBytes: file.size,
          dataUrl,
        });
      } else if (ALLOWED_VIDEO_TYPES.has(mimeType)) {
        if (videoCount + accepted.filter(a => a.type === 'video').length >= MAX_VIDEO_COUNT) {
          showToast?.(`单条消息最多添加 ${MAX_VIDEO_COUNT} 个视频。`, 'info');
          continue;
        }
        if (file.size > MAX_VIDEO_BYTES) {
          showToast?.('单个视频不能超过 100 MB。', 'error');
          continue;
        }
        const dataUrl = await readFileAsDataUrl(file);
        const normalizedMime = mimeType === 'video/quicktime' ? 'video/mov'
          : mimeType as PendingVideoAttachment['mimeType'];
        accepted.push({
          id: `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          type: 'video',
          name: file.name,
          mimeType: normalizedMime,
          sizeBytes: file.size,
          dataUrl,
        });
      } else {
        showToast?.('仅支持图片、音频和视频文件。', 'error');
      }
    }

    if (accepted.length > 0) {
      logger.info('已添加附件', {
        count: accepted.length,
        types: accepted.map(a => a.type),
      });
      setPendingAttachments((prev) => [...prev, ...accepted]);
    }
  };

  const handleFileInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    await addFiles(Array.from(event.target.files || []));
    event.target.value = '';
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    await addFiles(Array.from(event.dataTransfer.files || []));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
      logger.debug('按下回车发送消息');
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    logger.info('点击快捷建议', { suggestion });
    if (onSuggestionClick) {
      const prompt = suggestion.replace(/^[^\s]+\s*/, '');
      onSuggestionClick(prompt);
      return;
    }
    setInputText(suggestion);
    textareaRef.current?.focus();
    requestAnimationFrame(adjustTextareaHeight);
  };

  /* ==========================================
     语音识别功能
     ========================================== */

  const toggleVoiceInput = async () => {
    logger.info('切换语音输入', { isRecording });
    if (isRecording) {
      await stopVoiceRecognition();
    } else {
      await startVoiceRecognition();
    }
  };

  const startVoiceRecognition = async () => {
    try {
      logger.info('语音识别开始启动');
      setRecognitionText('');
      setIsRecording(true);

      // 使用 ref 存储最新的识别结果，供 onEnd 回调使用
      let latestText = '';

      const success = await asrManagerRef.current.startListening(
        // onResult: 收到识别结果
        (result: ASRResult) => {
          if (result.success && result.text) {
            logger.debug('语音识别中间结果', { text: result.text });
            latestText = result.text;
            setRecognitionText(result.text);
          }
        },
        // onError: 识别出错
        (error: string) => {
          logger.error('语音识别错误', { error });
          setIsRecording(false);
        },
        // onEnd: 识别结束
        () => {
          logger.info('语音识别结束', { finalText: latestText });
          setIsRecording(false);
          
          if (latestText) {
            setInputText(latestText);
            textareaRef.current?.focus();
            adjustTextareaHeight();
          }
        }
      );

      if (!success) {
        logger.warn('语音识别启动返回失败');
        setIsRecording(false);
      }

    } catch (error) {
      logger.error('语音识别启动异常', error);
      setIsRecording(false);
    }
  };

  const stopVoiceRecognition = async () => {
    try {
      logger.info('正在停止语音识别', { recognitionText });
      asrManagerRef.current.stopListening();
      setIsRecording(false);
      
      if (recognitionText) {
        setInputText(recognitionText);
        textareaRef.current?.focus();
        adjustTextareaHeight();
      }
    } catch (error) {
      logger.error('停止语音识别失败', error);
      setIsRecording(false);
    }
  };

  return (
    <div
      className={styles.inputArea}
      onDragEnter={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setIsDragging(false);
      }}
      onDrop={handleDrop}
    >
      <div className={styles.inputWrapper}>
        {isDragging && (
          <div className={styles.dropOverlay}>释放鼠标，将文件添加到当前对话</div>
        )}
        
        {/* 快捷建议芯片组 */}
        {showSuggestions && (
          <div className={styles.quickSuggestions}>
            {DEFAULT_SUGGESTIONS.map((suggestion, index) => (
              <button
                key={index}
                className={styles.suggestionChip}
                onClick={() => handleSuggestionClick(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {/* 主输入容器 */}
        <div
          className={`${styles.inputContainer} ${
            isFocused ? styles.inputContainerFocusWithin : ''
          } ${isRecording ? styles.recordingMode : ''}`}
        >
          {pendingAttachments.length > 0 && (
            <div className={styles.pendingImages}>
              {pendingAttachments.map((attachment) => (
                <div className={styles.pendingImageCard} key={attachment.id}>
                  {attachment.type === 'image' && (
                    <img src={attachment.dataUrl} alt={attachment.name} />
                  )}
                  {attachment.type === 'audio' && (
                    <div className={styles.pendingAudioCard}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24">
                        <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                      </svg>
                      <span className={styles.pendingFileName}>{attachment.name}</span>
                    </div>
                  )}
                  {attachment.type === 'video' && (
                    <div className={styles.pendingVideoCard}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                      <span className={styles.pendingFileName}>{attachment.name}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    className={styles.removeImageBtn}
                    title="移除附件"
                    onClick={() => setPendingAttachments((prev) => prev.filter((item) => item.id !== attachment.id))}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {/* 左侧：附件/功能按钮组 */}
          <div className={styles.inputExtras}>
            {/* 上传文件按钮 */}
            <button
              className={styles.extraBtn}
              title="上传文件"
              onClick={() => fileInputRef.current?.click()}
            >
              <svg
                className={styles.extraBtnSvg}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              className={styles.hiddenFileInput}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,audio/mp3,audio/wav,audio/m4a,audio/ogg,audio/mpeg,video/mp4,video/webm,video/quicktime"
              onChange={handleFileInputChange}
            />

            {/* 语音输入按钮（语音转文字） */}
            <button
              className={`${styles.extraBtn} ${isRecording ? styles.voiceBtnActive : ''}`}
              title={isRecording ? '停止录音' : '语音输入'}
              onClick={toggleVoiceInput}
            >
              {isRecording ? (
                <>
                  <span className={styles.recordingPulse}></span>
                  <svg
                    className={styles.extraBtnSvg}
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                </>
              ) : (
                <svg
                  className={styles.extraBtnSvg}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              )}
            </button>
          </div>

          {/* 中间：多行文本输入框 */}
          <textarea
            ref={textareaRef}
            className={styles.chatInput}
            placeholder={isRecording ? '正在聆听...' : '和 Nova 聊聊天吧~'}
            value={isRecording ? recognitionText : inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            disabled={isLoading || isRecording}
            rows={1}
          />

          {/* 语音对话模式按钮 */}
          {onToggleVoiceChat && (
            <button
              className={`${styles.extraBtn} ${isVoiceChatEnabled ? styles.voiceChatBtnActive : ''}`}
              title={isVoiceChatEnabled ? '关闭语音对话模式' : '开启语音对话模式'}
              onClick={onToggleVoiceChat}
            >
              <svg
                className={styles.extraBtnSvg}
                viewBox="0 0 24 24"
                fill={isVoiceChatEnabled ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
                {isVoiceChatEnabled && (
                  <circle cx="18" cy="6" r="3" fill="var(--accent-blue)" stroke="none" />
                )}
              </svg>
            </button>
          )}

          {onToggleRealtimeCall && (
            <button
              className={`${styles.extraBtn} ${isRealtimeCallEnabled ? styles.realtimeCallBtnActive : ''}`}
              title={isRealtimeCallEnabled ? '关闭实时通话' : '开启豆包实时通话'}
              onClick={onToggleRealtimeCall}
              type="button"
            >
              <svg
                className={styles.extraBtnSvg}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.11 4.2 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.32 1.78.6 2.63a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.45-1.17a2 2 0 0 1 2.11-.45c.85.28 1.73.48 2.63.6A2 2 0 0 1 22 16.92z" />
                {isRealtimeCallEnabled && <circle cx="18" cy="6" r="3" fill="#22c55e" stroke="none" />}
              </svg>
            </button>
          )}

          {/* 右侧：发送按钮 */}
          <button
            className={styles.sendBtn}
            onClick={handleSend}
            disabled={(!inputText.trim() && pendingAttachments.length === 0) || isLoading || isRecording}
            title="发送消息"
          >
            <svg
              className={styles.sendBtnSvg}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>

        {/* 录音状态提示 */}
        {isRecording && (
          <div className={styles.recordingStatus}>
            <span className={styles.recordingDot}></span>
            正在聆听{recognitionText ? `: "${recognitionText}"` : '...'}
          </div>
        )}

        {/* 语音对话模式状态提示 */}
        {isVoiceChatEnabled && voiceChatState !== 'idle' && (
          <div className={styles.voiceChatStatus}>
            {voiceChatState === 'listening' && (
              <>
                <span className={styles.voiceChatDot}></span>
                正在听...
              </>
            )}
            {voiceChatState === 'thinking' && (
              <>
                <span className={styles.voiceChatThinking}></span>
                正在思考...
              </>
            )}
            {voiceChatState === 'speaking' && (
              <>
                <span className={styles.voiceChatSpeaking}></span>
                正在播放...
              </>
            )}
            {voiceChatState === 'error' && (
              <>
                <span style={{ color: 'var(--text-secondary)' }}>语音识别出错，请检查麦克风权限或网络后重试</span>
              </>
            )}
          </div>
        )}

        {isRealtimeCallEnabled && (
          <div className={styles.realtimeCallStatus}>
            <span className={styles.voiceChatDot}></span>
            {realtimeCallState === 'connecting' && '正在连接豆包实时通话...'}
            {realtimeCallState === 'connected' && '豆包实时通话中'}
            {realtimeCallState === 'error' && '实时通话出错，请检查 RTC 配置'}
            {realtimeCallState === 'idle' && '实时通话准备中'}
          </div>
        )}

        {/* 底部提示文字 */}
        <div className={styles.inputHint}>
          Nova 可能会产生不准确的信息，请注意甄别
        </div>
      </div>
    </div>
  );
});

InputArea.displayName = 'InputArea';

export default InputArea;
