// ==========================================
// 语音对话模式状态管理
// 实现半双工语音对话：用户一句，AI一句
// ==========================================

import { getASRManager } from '../asr/asrManager';
import { getTTSManager } from '../tts/ttsManager';
import type { ASRResult } from '../asr/asrInterface';
import type { TTSResult } from '../tts/ttsInterface';
import { createLogger } from '../../../shared/logger';

const logger = createLogger('asr');

/**
 * 语音对话模式状态
 */
export type VoiceChatState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

/**
 * 语音对话模式回调
 */
export interface VoiceChatCallbacks {
  /** 状态变化回调 */
  onStateChange: (state: VoiceChatState) => void;
  /** 用户说话文字回调（用于显示在聊天框） */
  onUserText: (text: string) => void;
  /** AI 回复文字回调（用于显示在聊天框） */
  onAIText: (text: string) => void;
  /** 发送消息给 AI 的回调 */
  onSendMessage: (text: string) => Promise<void>;
  /** 错误回调 */
  onError: (error: string) => void;
}

/**
 * 语音对话模式类
 * 管理语音对话的完整流程：ASR → LLM → TTS → ASR → ...
 */
export class VoiceChatMode {
  private asrManager = getASRManager();
  private ttsManager = getTTSManager();
  private callbacks: VoiceChatCallbacks | null = null;
  private currentState: VoiceChatState = 'idle';
  private isEnabled: boolean = false;
  
  // 静音检测相关
  private lastText: string = '';
  private silenceTimer: NodeJS.Timeout | null = null;
  private readonly SILENCE_TIMEOUT = 1500; // 1.5 秒静音后自动发送

  // 防重复调用锁：TTS 播放中不再触发新的播放
  private isSpeaking: boolean = false;

  // ASR 错误重试计数（防止无限递归）
  private asrRetryCount: number = 0;
  private readonly MAX_ASR_RETRIES = 5;
  
  // AudioContext 单例，避免内存泄漏
  private audioContext: AudioContext | null = null;

  /**
   * 初始化语音对话模式
   */
  constructor() {
    logger.info('语音对话模式已初始化');
  }

  /**
   * 设置回调
   */
  setCallbacks(callbacks: VoiceChatCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * 获取当前状态
   */
  getState(): VoiceChatState {
    return this.currentState;
  }

  /**
   * 是否已启用
   */
  getIsEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * 启用语音对话模式
   */
  async enable(): Promise<void> {
    if (this.isEnabled) return;
    
    logger.info('语音对话模式已开启');
    this.isEnabled = true;
    this.asrRetryCount = 0; // 重置重试计数
    
    // 自动开始监听
    await this.startListening();
  }

  /**
   * 禁用语音对话模式
   */
  async disable(): Promise<void> {
    if (!this.isEnabled) return;
    
    logger.info('语音对话模式已关闭');
    this.isEnabled = false;
    
    // 停止所有活动
    await this.stopAll();
    this.setState('idle');
  }

  /**
   * 切换启用状态
   */
  async toggle(): Promise<boolean> {
    if (this.isEnabled) {
      await this.disable();
      return false;
    } else {
      await this.enable();
      return true;
    }
  }

  /**
   * 开始监听用户说话
   */
  private async startListening(): Promise<void> {
    if (!this.isEnabled) return;
    
    logger.info('语音对话开始监听用户说话');
    this.lastText = '';
    
    try {
      const success = await this.asrManager.startListening(
        // onResult: 收到识别结果
        (result: ASRResult) => {
          if (result && result.success && result.text) {
            this.lastText = result.text;
            // 通知 UI 更新用户正在说的文字
            if (this.callbacks?.onUserText) {
              this.callbacks.onUserText(result.text);
            }
            // 重置静音计时器
            this.resetSilenceTimer();
          }
        },
        // onError: 识别出错
        (error: string) => {
          logger.error('语音对话识别出错', { error });
          if (this.callbacks?.onError) {
            this.callbacks.onError(error);
          }
          // 出错后重新开始监听（最多重试 MAX_ASR_RETRIES 次）
          if (this.isEnabled && this.asrRetryCount < this.MAX_ASR_RETRIES) {
            this.asrRetryCount++;
            logger.warn('语音识别将自动重试', { retryCount: this.asrRetryCount, maxRetries: this.MAX_ASR_RETRIES });
            setTimeout(() => this.startListening(), 500);
          } else if (this.asrRetryCount >= this.MAX_ASR_RETRIES) {
            logger.error('语音识别重试次数已达上限');
            this.callbacks?.onError('语音识别连续出错，已停止监听');
          }
        },
        // onEnd: 识别结束
        () => {
          logger.info('语音识别已结束', { textPreview: this.lastText.slice(0, 120) });
          this.asrRetryCount = 0; // 成功结束，重置重试计数
          // 如果有识别结果，发送给 AI
          if (this.lastText.trim()) {
            this.sendToAI(this.lastText);
          } else if (this.isEnabled) {
            // 没有识别结果，重新开始监听
            this.startListening();
          }
        }
      );
      
      if (!success) {
        logger.error('语音识别启动返回失败');
        this.setState('error');
        if (this.callbacks?.onError) {
          this.callbacks.onError('无法启动语音识别');
        }
        // 启动失败后重新尝试
        if (this.isEnabled) {
          setTimeout(() => this.startListening(), 1000);
        }
        return;
      }

      this.setState('listening');
    } catch (error) {
      logger.error('语音对话监听启动失败', error);
      this.setState('error');
      if (this.callbacks?.onError) {
        this.callbacks.onError('启动语音识别失败');
      }
      // 出错后重新尝试
      if (this.isEnabled) {
        setTimeout(() => this.startListening(), 1000);
      }
    }
  }

  /**
   * 重置静音计时器
   * 用户停止说话 1.5 秒后自动发送
   */
  private resetSilenceTimer(): void {
    // 清除之前的计时器
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
    }
    
    // 设置新的计时器
    this.silenceTimer = setTimeout(() => {
      logger.info('检测到静音，停止语音识别并发送给 AI');
      this.asrManager.stopListening();
    }, this.SILENCE_TIMEOUT);
  }

  /**
   * 发送文字给 AI
   */
  private async sendToAI(text: string): Promise<void> {
    if (!this.isEnabled) return;
    
    logger.info('语音文字发送给 AI', { text });
    this.setState('thinking');
    
    // 清除静音计时器
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    
    try {
      // 调用回调发送消息
      if (this.callbacks?.onSendMessage) {
        await this.callbacks.onSendMessage(text);
      }
    } catch (error) {
      logger.error('语音文字发送给 AI 失败', error);
      if (this.callbacks?.onError) {
        this.callbacks.onError('发送消息失败');
      }
      // 出错后重新开始监听
      if (this.isEnabled) {
        setTimeout(() => this.startListening(), 500);
      }
    }
  }

  /**
   * 播放 AI 回复（由外部调用）
   * 当 AI 返回回复后，调用此方法播放语音
   */
  async speakResponse(text: string): Promise<void> {
    if (!this.isEnabled) return;
    
    // 防重复调用锁：如果正在播放，忽略后续重复调用
    if (this.isSpeaking) {
      logger.warn('语音播放中，忽略重复播放请求');
      return;
    }
    this.isSpeaking = true;
    
    if (!text || !text.trim()) {
      logger.warn('AI 回复为空，跳过语音合成');
      this.isSpeaking = false;
      // 播放完成后，重新开始监听
      if (this.isEnabled) {
        await this.startListening();
      }
      return;
    }
    
    logger.info('开始播放 AI 回复语音', { textPreview: text.substring(0, 80) });
    this.setState('speaking');
    
    // 通知 UI 显示 AI 回复
    if (this.callbacks?.onAIText) {
      this.callbacks.onAIText(text);
    }
    
    try {
      // 使用 TTS 播放（不指定 voice，让 ttsManager 使用当前配置的默认声音）
      const result: TTSResult = await this.ttsManager.speak({
        text
      });
      
      if (result && result.success && result.audioData) {
        // 播放音频
        await this.playAudio(result.audioData);
      } else {
        logger.error('语音对话 TTS 合成失败', { error: result?.error || '未知错误' });
        if (this.callbacks?.onError) {
          this.callbacks.onError('语音合成失败');
        }
      }
    } catch (error) {
      logger.error('语音对话播放失败', error);
      if (this.callbacks?.onError) {
        this.callbacks.onError('播放语音失败');
      }
    } finally {
      // 无论成功失败都释放锁
      this.isSpeaking = false;
    }
    
    // 播放完成后，重新开始监听
    if (this.isEnabled) {
      logger.info('语音播放完成，重新开始监听');
      await this.startListening();
    }
  }

  /**
   * 播放音频（自动识别 MP3/WAV/PCM 格式）
   */
  private async playAudio(audioData: ArrayBuffer): Promise<void> {
    try {
      let wavData: ArrayBuffer;

      // 先尝试用 AudioContext 解码（自动识别 MP3/WAV/OGG 等格式）
      try {
        // 复用 AudioContext，避免内存泄漏
        if (!this.audioContext) {
          this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        // 如果 AudioContext 被暂停，需要恢复
        if (this.audioContext.state === 'suspended') {
          await this.audioContext.resume();
        }
        const decoded = await this.audioContext.decodeAudioData(audioData.slice(0));
        wavData = this.audioBufferToWav(decoded);
        logger.debug('语音音频已通过 AudioContext 解码');
      } catch (e) {
        // 解码失败说明是裸 PCM 数据，直接加 WAV 头
        logger.warn('AudioContext 解码失败，改用 PCM 转 WAV 兜底', e);
        wavData = this.pcmToWav(audioData);
      }

      const blob = new Blob([wavData], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

      await new Promise<void>((resolve) => {
        audio.onended = () => {
          URL.revokeObjectURL(url);
          resolve();
        };

        audio.onerror = () => {
          logger.error('语音音频元素播放失败');
          URL.revokeObjectURL(url);
          resolve();
        };

        audio.play().catch(error => {
          logger.error('浏览器拒绝播放语音音频', error);
          URL.revokeObjectURL(url);
          resolve();
        });
      });
    } catch (error) {
      logger.error('语音音频创建失败', error);
    }
  }

  /**
   * AudioBuffer（解码后）转 WAV 格式
   */
  private audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const bitsPerSample = 16;

    let interleaved: Float32Array;
    if (numChannels === 1) {
      interleaved = buffer.getChannelData(0);
    } else {
      interleaved = new Float32Array(buffer.length * numChannels);
      for (let ch = 0; ch < numChannels; ch++) {
        const data = buffer.getChannelData(ch);
        for (let i = 0; i < buffer.length; i++) {
          interleaved[i * numChannels + ch] = data[i];
        }
      }
    }

    const dataLength = interleaved.length * (bitsPerSample / 8);
    const wav = new ArrayBuffer(44 + dataLength);
    const view = new DataView(wav);

    const writeStr = (off: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
    };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bitsPerSample / 8, true);
    view.setUint16(32, numChannels * bitsPerSample / 8, true);
    view.setUint16(34, bitsPerSample, true);
    writeStr(36, 'data');
    view.setUint32(40, dataLength, true);

    let offset = 44;
    for (let i = 0; i < interleaved.length; i++) {
      const s = Math.max(-1, Math.min(1, interleaved[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }

    return wav;
  }

  /**
   * PCM 转 WAV（裸 PCM 数据的 fallback）
   */
  private pcmToWav(pcmData: ArrayBuffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): ArrayBuffer {
    const pcmBytes = new Uint8Array(pcmData);
    const wavBuffer = new ArrayBuffer(44 + pcmBytes.length);
    const view = new DataView(wavBuffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + pcmBytes.length, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bitsPerSample / 8, true);
    view.setUint16(32, numChannels * bitsPerSample / 8, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, pcmBytes.length, true);

    const dataOffset = 44;
    for (let i = 0; i < pcmBytes.length; i++) {
      view.setUint8(dataOffset + i, pcmBytes[i]);
    }

    return wavBuffer;
  }

  /**
   * 停止所有活动
   */
  private async stopAll(): Promise<void> {
    // 清除静音计时器
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    
    // 停止 ASR
    try {
      this.asrManager.stopListening();
    } catch (error) {
      logger.error('停止语音识别失败', error);
    }
    
    // 关闭 AudioContext 释放资源
    if (this.audioContext) {
      try {
        await this.audioContext.close();
        this.audioContext = null;
        logger.info('语音 AudioContext 已关闭');
      } catch (error) {
        logger.error('语音 AudioContext 关闭失败', error);
      }
    }
  }

  /**
   * 设置状态
   */
  private setState(state: VoiceChatState): void {
    if (this.currentState === state) return;
    
    const previous = this.currentState;
    this.currentState = state;
    logger.info('语音对话状态变化', { from: previous, to: state });
    
    if (this.callbacks?.onStateChange) {
      this.callbacks.onStateChange(state);
    }
  }
}

// 单例
let voiceChatModeInstance: VoiceChatMode | null = null;

export function getVoiceChatMode(): VoiceChatMode {
  if (!voiceChatModeInstance) {
    voiceChatModeInstance = new VoiceChatMode();
  }
  return voiceChatModeInstance;
}
