// ==========================================
// 小米 MiMo ASR Provider
// 使用 OpenAI 兼容的 chat/completions 接口
// ==========================================

import type { ASRService, ASRRequest, ASRResult } from './asrInterface';
import { createLogger } from '../../../shared/logger';

const logger = createLogger('asr');

export interface MiMoASRConfig {
  baseUrl: string;
  apiKey: string;
  model?: string;
  language?: 'auto' | 'zh' | 'en';
  sampleRate?: number;
}

export class MiMoASR implements ASRService {
  private config: Required<MiMoASRConfig>;
  private audioContext: AudioContext | null = null;
  private audioSource: MediaStreamAudioSourceNode | null = null;
  private audioProcessor: ScriptProcessorNode | null = null;
  private mediaStream: MediaStream | null = null;
  private isRecording = false;
  private pcmChunks: Int16Array[] = [];
  private onResultCallback: ((result: ASRResult) => void) | null = null;
  private onErrorCallback: ((error: string) => void) | null = null;
  private onEndCallback: (() => void) | null = null;

  constructor(config: MiMoASRConfig) {
    this.config = {
      model: 'mimo-v2.5-asr',
      language: 'auto',
      sampleRate: 16000,
      ...config
    };

    logger.info('小米 MiMo ASR 初始化', {
      model: this.config.model,
      language: this.config.language,
      baseUrlType: this.getBaseUrlType()
    });
  }

  async initialize(): Promise<void> {
    if (!this.config.baseUrl || !this.config.apiKey) {
      throw new Error('小米 MiMo ASR 配置不完整，请先填写 Base URL 和 API Key。');
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('当前环境不支持麦克风录音。');
    }
  }

  async startListening(
    onResult: (result: ASRResult) => void,
    onError?: (error: string) => void,
    onEnd?: () => void
  ): Promise<boolean> {
    try {
      await this.initialize();

      this.onResultCallback = onResult;
      this.onErrorCallback = onError || null;
      this.onEndCallback = onEnd || null;
      this.pcmChunks = [];
      this.isRecording = true;

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.config.sampleRate,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      this.audioContext = new AudioContext({ sampleRate: this.config.sampleRate });
      this.audioSource = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.audioProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.audioProcessor.onaudioprocess = (event) => {
        if (!this.isRecording) return;
        const inputData = event.inputBuffer.getChannelData(0);
        this.pcmChunks.push(this.floatToInt16(inputData));
      };

      this.audioSource.connect(this.audioProcessor);
      this.audioProcessor.connect(this.audioContext.destination);

      logger.info('小米 MiMo ASR 已开始录音，停止后提交识别');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : '启动小米 MiMo ASR 失败';
      logger.error('小米 MiMo ASR 启动失败', { error: message });
      onError?.(message);
      this.cleanupRecording();
      return false;
    }
  }

  stopListening(): void {
    if (!this.isRecording) return;

    this.isRecording = false;
    this.cleanupRecording();

    const chunks = this.pcmChunks;
    this.pcmChunks = [];

    this.recognizeCapturedAudio(chunks).catch((error) => {
      const message = error instanceof Error ? error.message : '小米 MiMo ASR 识别失败';
      logger.error('小米 MiMo ASR 停止后识别失败', { error: message });
      this.onErrorCallback?.(message);
      this.onEndCallback?.();
    });
  }

  async recognize(request: ASRRequest): Promise<ASRResult> {
    try {
      if (!request.audioData) {
        return { success: false, error: '未提供音频数据' };
      }

      const audioData = request.audioData instanceof Blob
        ? await request.audioData.arrayBuffer()
        : request.audioData;

      return await this.sendRecognitionRequest(audioData, request.language);
    } catch (error) {
      const message = error instanceof Error ? error.message : '小米 MiMo ASR 识别失败';
      logger.error('小米 MiMo ASR 文件识别失败', { error: message });
      return { success: false, error: message };
    }
  }

  isSupported(): boolean {
    return !!this.config.baseUrl && !!this.config.apiKey && !!navigator.mediaDevices?.getUserMedia;
  }

  getLanguages(): string[] {
    return ['auto', 'zh', 'en'];
  }

  private async recognizeCapturedAudio(chunks: Int16Array[]): Promise<void> {
    try {
      if (chunks.length === 0) {
        throw new Error('没有采集到音频。');
      }

      const wavData = this.encodeWav(chunks, this.config.sampleRate);
      const result = await this.sendRecognitionRequest(wavData, this.config.language);

      if (result.success && result.text) {
        this.onResultCallback?.(result);
      } else if (!result.success) {
        this.onErrorCallback?.(result.error || '小米 MiMo ASR 未返回识别结果');
      }
    } finally {
      this.onEndCallback?.();
    }
  }

  private async sendRecognitionRequest(audioData: ArrayBuffer, language?: string): Promise<ASRResult> {
    const base64Audio = this.arrayBufferToBase64(audioData);

    if (base64Audio.length > 10 * 1024 * 1024) {
      return { success: false, error: '音频超过小米 MiMo ASR 10MB base64 限制，请缩短录音。' };
    }

    const body = {
      model: this.config.model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'input_audio',
              input_audio: {
                data: `data:audio/wav;base64,${base64Audio}`,
                format: 'wav'
              }
            }
          ]
        }
      ],
      asr_options: {
        language: this.normalizeLanguage(language)
      }
    };

    logger.debug('小米 MiMo ASR 请求', {
      model: this.config.model,
      audioBytes: audioData.byteLength,
      language: body.asr_options.language,
      baseUrlType: this.getBaseUrlType()
    });

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
      return { success: false, error: `ASR 请求失败: ${response.status}` };
    }

    const responseData = await response.json();
    const text = this.extractText(responseData);

    if (!text) {
      logger.error('小米 MiMo ASR 返回格式不支持', {
        keys: Object.keys(responseData || {}),
        choiceKeys: Object.keys(responseData?.choices?.[0]?.message || {})
      });
      return { success: false, error: '小米 MiMo ASR 未返回可用文字。' };
    }

    logger.info('小米 MiMo ASR 识别成功', { textLength: text.length });
    return { success: true, text, confidence: 0.95 };
  }

  private extractText(responseData: any): string {
    const message = responseData?.choices?.[0]?.message;
    const content = message?.content;

    if (typeof content === 'string') {
      return content.trim();
    }

    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === 'string') return part;
          if (typeof part?.text === 'string') return part.text;
          if (typeof part?.transcript === 'string') return part.transcript;
          return '';
        })
        .join('')
        .trim();
    }

    if (typeof message?.text === 'string') return message.text.trim();
    if (typeof message?.transcript === 'string') return message.transcript.trim();
    if (typeof responseData?.text === 'string') return responseData.text.trim();

    return '';
  }

  private cleanupRecording(): void {
    if (this.audioProcessor) {
      this.audioProcessor.disconnect();
      this.audioProcessor = null;
    }

    if (this.audioSource) {
      this.audioSource.disconnect();
      this.audioSource = null;
    }

    if (this.audioContext) {
      this.audioContext.close().catch((error) => {
        logger.warn('关闭 MiMo ASR AudioContext 失败', { error });
      });
      this.audioContext = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
  }

  private floatToInt16(input: Float32Array): Int16Array {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output;
  }

  private encodeWav(chunks: Int16Array[], sampleRate: number): ArrayBuffer {
    const sampleCount = chunks.reduce((total, chunk) => total + chunk.length, 0);
    const bytesPerSample = 2;
    const dataSize = sampleCount * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    this.writeString(view, 8, 'WAVE');
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * bytesPerSample, true);
    view.setUint16(32, bytesPerSample, true);
    view.setUint16(34, 16, true);
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (const chunk of chunks) {
      for (let i = 0; i < chunk.length; i++) {
        view.setInt16(offset, chunk[i], true);
        offset += bytesPerSample;
      }
    }

    return buffer;
  }

  private writeString(view: DataView, offset: number, value: string): void {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = '';

    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }

    return btoa(binary);
  }

  private normalizeLanguage(language?: string): 'auto' | 'zh' | 'en' {
    if (language === 'zh' || language === 'en' || language === 'auto') return language;
    if (language?.toLowerCase().startsWith('en')) return 'en';
    if (language?.toLowerCase().startsWith('zh')) return 'zh';
    return this.config.language;
  }

  private getBaseUrlType(): string {
    return this.config.baseUrl.includes('token-plan') ? 'token-plan' : 'standard';
  }
}
