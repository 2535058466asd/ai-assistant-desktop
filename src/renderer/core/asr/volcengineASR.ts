// ==========================================
// 火山引擎 ASR 适配器
// 使用豆包语音新版API
// ==========================================

import type { ASRService, ASRRequest, ASRResult } from './asrInterface';

// 新版火山引擎ASR配置接口
export interface VolcengineASRConfig {
  apiKey: string;              // 新版API Key
  apiUrl?: string;             // API地址
  voice?: string;              // 识别模型
  format?: string;             // 音频格式
  sampleRate?: number;         // 采样率
  language?: string;           // 语言
}

// 新版识别请求接口
export interface VolcengineASRRequest {
  audio: string;               // Base64编码的音频数据
  format?: string;             // 音频格式
  sample_rate?: number;        // 采样率
  language?: string;           // 语言
}

// 新版识别响应接口
export interface VolcengineASRResponse {
  code?: number;
  message?: string;
  result?: {
    text?: string;
  };
}

export class VolcengineASR implements ASRService {
  private config: VolcengineASRConfig;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private isRecording: boolean = false;
  private audioContext: AudioContext | null = null;
  private audioSource: MediaStreamAudioSourceNode | null = null;
  private audioProcessor: ScriptProcessorNode | null = null;

  constructor(config: VolcengineASRConfig) {
    this.config = {
      apiUrl: 'https://openspeech.bytedance.com/api/v3/asr/recognize',
      format: 'wav',
      sampleRate: 16000,
      language: 'zh-CN',
      ...config
    };
    console.log('🎤 火山引擎 ASR 初始化成功（新版API）');
  }

  // 生成请求ID
  private generateRequestId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Blob转Base64
  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result as string;
        // 去掉data:audio/*;base64,前缀
        const base64 = base64data.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // 通过Electron主进程代理发送HTTP请求
  private async proxyRequest(options: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.httpProxy) {
        console.log('🔄 通过主进程代理发送请求...');
        return await (window as any).electronAPI.httpProxy(options);
      } else {
        throw new Error('Electron API不可用，请在桌面应用中运行');
      }
    } catch (error) {
      console.error('❌ 代理请求失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '请求失败'
      };
    }
  }

  // 调用新版ASR API进行识别
  private async recognizeAudio(audioData: string): Promise<ASRResult> {
    try {
      const requestId = this.generateRequestId();
      const timestamp = Math.floor(Date.now() / 1000).toString();

      // 构建请求头
      const headers = {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'X-Api-Timestamp': timestamp
      };

      // 构建请求体
      const payload: VolcengineASRRequest = {
        audio: audioData,
        format: this.config.format,
        sample_rate: this.config.sampleRate
      };

      console.log('🎤 发送ASR识别请求...');

      // 发送请求
      const response = await this.proxyRequest({
        url: this.config.apiUrl!,
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
      });

      if (!response.success) {
        throw new Error(response.error || '请求失败');
      }

      // 解析响应
      let result: VolcengineASRResponse;
      if (typeof response.data === 'string') {
        result = JSON.parse(response.data);
      } else {
        result = response.data;
      }

      console.log('🎤 ASR响应:', result);

      // 检查响应
      if (result.code && result.code !== 0) {
        throw new Error(result.message || `识别失败，错误码: ${result.code}`);
      }

      const text = result.result?.text || '';

      return {
        success: true,
        text: text,
        confidence: 0.95
      };

    } catch (error) {
      console.error('❌ ASR识别失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '识别失败'
      };
    }
  }

  async initialize(): Promise<void> {
    console.log('🎤 火山引擎 ASR 已就绪（新版API）');
  }

  async startListening(
    onResult: (result: ASRResult) => void,
    onError?: (error: string) => void,
    onEnd?: () => void
  ): Promise<boolean> {
    try {
      console.log('🎤 开始录音...');
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];
      this.isRecording = true;

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        console.log('🎤 录音结束，开始识别...');
        
        try {
          const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
          
          // 将音频转换为Base64
          const base64Audio = await this.blobToBase64(audioBlob);
          
          // 调用ASR API
          const result = await this.recognizeAudio(base64Audio);
          
          if (onResult) {
            onResult(result);
          }
          
        } catch (error) {
          console.error('❌ 识别失败:', error);
          if (onError) {
            onError(error instanceof Error ? error.message : '识别失败');
          }
          
          if (onResult) {
            onResult({
              success: false,
              error: error instanceof Error ? error.message : '识别失败'
            });
          }
        }
        
        if (onEnd) {
          onEnd();
        }
        
        this.isRecording = false;
      };

      this.mediaRecorder.start();
      console.log('🚀 录音已开始');
      return true;

    } catch (error) {
      console.error('❌ 启动录音失败:', error);
      if (onError) {
        onError(error instanceof Error ? error.message : '启动录音失败');
      }
      return false;
    }
  }

  stopListening(): void {
    if (this.mediaRecorder && this.isRecording) {
      try {
        this.mediaRecorder.stop();
        console.log('⏹️  录音已停止');
      } catch (error) {
        console.warn('⚠️  停止录音时出错:', error);
      }
    }
    this.isRecording = false;
  }

  async recognize(request: ASRRequest): Promise<ASRResult> {
    try {
      if (!request.audioData) {
        return {
          success: false,
          error: '未提供音频数据'
        };
      }

      // 处理音频数据
      let base64Audio: string;
      
      if (request.audioData instanceof Blob) {
        base64Audio = await this.blobToBase64(request.audioData);
      } else if (request.audioData instanceof ArrayBuffer) {
        const blob = new Blob([request.audioData], { type: 'audio/wav' });
        base64Audio = await this.blobToBase64(blob);
      } else {
        return {
          success: false,
          error: '不支持的音频数据格式'
        };
      }

      // 调用识别
      return await this.recognizeAudio(base64Audio);

    } catch (error) {
      console.error('❌ 识别失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '识别失败'
      };
    }
  }

  isSupported(): boolean {
    return !!this.config.apiKey && !!navigator.mediaDevices?.getUserMedia;
  }

  getLanguages?(): string[] {
    return ['zh-CN', 'en-US'];
  }
}
