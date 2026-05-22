// ==========================================
// 小米 MiMo ASR Provider
// 使用多模态音频理解模拟 ASR 功能
// ==========================================

import type { ASRService, ASRRequest, ASRResult } from './asrInterface';
import { createLogger } from '../../../shared/logger';

const logger = createLogger('asr');

export interface MiMoASRConfig {
  baseUrl: string;          // API 地址，例如：https://token-plan-cn.xiaomimimo.com/v1
  apiKey: string;           // API Key，例如：tp-xxxxx
  model?: string;           // 多模态模型，默认：mimo-v2.5
  language?: string;          // 识别语言（用于提示模型）
  chunkDuration?: number;  // 音频分片时长（秒），默认 5 秒
}

export class MiMoASR implements ASRService {
  private config: MiMoASRConfig;
  private isRecording: boolean = false;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recognitionResult: string = '';
  private onResultCallback: ((result: ASRResult) => void) | null = null;
  private onErrorCallback: ((error: string) => void) | null = null;
  private onEndCallback: (() => void) | null = null;

  constructor(config: MiMoASRConfig) {
    this.config = {
      model: 'mimo-v2.5',
      language: 'zh-CN',
      chunkDuration: 5,
      ...config
    };
    logger.info('小米 MiMo ASR 初始化', { model: this.config.model });
  }

  async initialize(): Promise<void> {
    logger.debug('小米 MiMo ASR 初始化完成');
  }

  async startListening(
    onResult: (result: ASRResult) => void,
    onError?: (error: string) => void,
    onEnd?: () => void
  ): Promise<boolean> {
    try {
      logger.debug('🎤 开始录音（小米 MiMo 模式）...');
      
      this.onResultCallback = onResult;
      this.onErrorCallback = onError;
      this.onEndCallback = onEnd;
      this.audioChunks = [];
      this.recognitionResult = '';
      this.isRecording = true;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        logger.debug('🎤 录音结束，开始识别...');
        await this.processAudio();
      };

      this.mediaRecorder.start(1000);
      logger.debug('🚀 录音已开始');
      return true;

    } catch (error) {
      logger.error('❌ 启动录音失败:', error);
      if (onError) {
        onError(error instanceof Error ? error.message : '启动录音失败');
      }
      return false;
    }
  }

  stopListening(): void {
    if (!this.isRecording) return;

    logger.debug('⏹️ 停止录音');
    this.isRecording = false;

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    // 释放媒体流
    this.mediaRecorder?.stream.getTracks().forEach(track => track.stop());
  }

  private async processAudio(): Promise<void> {
    try {
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
      const result = await this.recognize({ audioData: audioBlob });

      if (result.success && result.text) {
        this.recognitionResult = result.text;
        if (this.onResultCallback) {
          this.onResultCallback(result);
        }
      }

      if (this.onEndCallback) {
        this.onEndCallback();
      }

    } catch (error) {
      logger.error('❌ 音频处理失败:', error);
      if (this.onErrorCallback) {
        this.onErrorCallback(error instanceof Error ? error.message : '音频处理失败');
      }
    }
  }

  async recognize(request: ASRRequest): Promise<ASRResult> {
    try {
      logger.debug('🎤 小米 MiMo 音频识别...');

      if (!request.audioData) {
        return { success: false, error: '未提供音频数据' };
      }

      let audioData: ArrayBuffer;
      let mimeType: string;

      if (request.audioData instanceof Blob) {
        audioData = await request.audioData.arrayBuffer();
        mimeType = request.audioData.type || 'audio/webm';
      } else if (request.audioData instanceof ArrayBuffer) {
        audioData = request.audioData;
        mimeType = 'audio/wav';
      } else {
        return { success: false, error: '不支持的音频数据格式' };
      }

      const base64Audio = this.arrayBufferToBase64(audioData);
      const dataUri = `data:${mimeType};base64,${base64Audio}`;

      const languagePrompt = this.config.language === 'zh-CN'
        ? '请将这段音频中的语音内容准确转写成中文文字。'
        : 'Please accurately transcribe the speech content in this audio into text.';

      const body = {
        model: this.config.model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: languagePrompt },
              { type: 'image_url', image_url: { url: dataUri } }
            ]
          }
        ]
      };

      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.config.apiKey,
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('小米 MiMo ASR 请求失败', { status: response.status, error: errorText });
        throw new Error(`ASR 请求失败: ${response.status}`);
      }

      const responseData = await response.json();
      const transcript = responseData.choices?.[0]?.message?.content || '';

      logger.info('小米 MiMo ASR 识别成功', { transcript: transcript.substring(0, 100) });

      return {
        success: true,
        text: transcript.trim(),
        confidence: 0.85
      };

    } catch (error) {
      logger.error('小米 MiMo ASR 异常:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  isSupported(): boolean {
    return !!this.config.baseUrl && 
           !!this.config.apiKey && 
           !!navigator.mediaDevices?.getUserMedia;
  }

  getLanguages(): string[] {
    return ['zh-CN', 'en-US'];
  }
}
