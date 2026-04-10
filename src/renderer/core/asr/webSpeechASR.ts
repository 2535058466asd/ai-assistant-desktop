// ==========================================
// Web Speech API ASR 适配器
// 使用浏览器内置的语音识别API
// ==========================================

import type { ASRService, ASRRequest, ASRResult } from './asrInterface';

// 声明 SpeechRecognition 类型
declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: any[];
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

export class WebSpeechASR implements ASRService {
  private recognition: any | null = null;
  private isListening: boolean = false;
  private onResultCallback: ((result: ASRResult) => void) | null = null;
  private onErrorCallback: ((error: string) => void) | null = null;
  private onEndCallback: (() => void) | null = null;

  constructor() {
    console.log('🎤 Web Speech ASR 初始化中...');
  }

  async initialize(): Promise<void> {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognitionConstructor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      this.recognition = new SpeechRecognitionConstructor();
      
      // 配置语音识别
      this.recognition.continuous = true;      // 持续监听
      this.recognition.interimResults = true;  // 返回中间结果
      this.recognition.lang = 'zh-CN';         // 设置为中文
      
      console.log('✅ Web Speech ASR 初始化成功');
    } else {
      console.warn('⚠️  Web Speech API 不支持');
    }
  }

  async startListening(
    onResult: (result: ASRResult) => void,
    onError?: (error: string) => void,
    onEnd?: () => void
  ): Promise<boolean> {
    if (!this.recognition) {
      console.error('❌ 语音识别未初始化');
      return false;
    }

    if (this.isListening) {
      console.warn('⚠️  语音识别已经在运行中');
      return true;
    }

    this.onResultCallback = onResult;
    this.onErrorCallback = onError || null;
    this.onEndCallback = onEnd || null;

    // 设置事件监听
    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = '';
      let isFinal = false;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          isFinal = true;
        }
      }

      if (transcript.trim()) {
        console.log('🎤 识别结果:', transcript, isFinal ? '(最终)' : '(中间)');
        
        const result: ASRResult = {
          success: true,
          text: transcript,
          confidence: event.results[0][0].confidence
        };

        if (this.onResultCallback) {
          this.onResultCallback(result);
        }
      }
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('❌ 语音识别错误:', event.error);
      
      if (this.onErrorCallback) {
        this.onErrorCallback(event.error);
      }
    };

    this.recognition.onend = () => {
      console.log('ℹ️  语音识别已结束');
      this.isListening = false;
      
      if (this.onEndCallback) {
        this.onEndCallback();
      }
    };

    try {
      this.recognition.start();
      this.isListening = true;
      console.log('🚀 语音监听已启动');
      return true;
    } catch (error) {
      console.error('❌ 启动语音监听失败:', error);
      return false;
    }
  }

  stopListening(): void {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
        this.isListening = false;
        console.log('⏹️  语音监听已停止');
      } catch (error) {
        console.warn('⚠️  停止语音监听时出错:', error);
      }
    }
  }

  async recognize(request: ASRRequest): Promise<ASRResult> {
    console.warn('⚠️  Web Speech ASR 不支持文件识别');
    return {
      success: false,
      error: 'Web Speech ASR 不支持文件识别'
    };
  }

  isSupported(): boolean {
    return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  }

  getLanguages(): string[] {
    return ['zh-CN', 'en-US', 'ja-JP', 'ko-KR'];
  }
}
