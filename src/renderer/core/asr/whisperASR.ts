// ==========================================
// Whisper ASR 适配器
// 通过Electron主进程调用本地Whisper进行语音识别
// ==========================================

import type { ASRService, ASRRequest, ASRResult } from './asrInterface';

export interface WhisperASRConfig {
  language?: string;  // 语言（默认zh）
}

export class WhisperASR implements ASRService {
  private config: WhisperASRConfig;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private isRecording: boolean = false;

  constructor(config?: WhisperASRConfig) {
    this.config = {
      language: 'zh',  // 默认中文
      ...config
    };
    console.log('🎤 Whisper ASR 初始化成功');
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

  async initialize(): Promise<void> {
    console.log('🎤 Whisper ASR 已就绪');
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
          
          // 通过IPC调用主进程的Whisper服务
          if (typeof window !== 'undefined' && (window as any).electronAPI?.whisperTranscribe) {
            console.log('🚀 调用Whisper识别...');
            const result = await (window as any).electronAPI.whisperTranscribe(
              base64Audio, 
              this.config.language
            );
            
            if (result.success) {
              console.log('✅ Whisper识别成功:', result.text);
              if (onResult) {
                onResult({
                  success: true,
                  text: result.text,
                  confidence: 0.95
                });
              }
            } else {
              throw new Error(result.error || '识别失败');
            }
          } else {
            throw new Error('Electron API不可用');
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
      if (typeof window !== 'undefined' && (window as any).electronAPI?.whisperTranscribe) {
        const result = await (window as any).electronAPI.whisperTranscribe(
          base64Audio, 
          this.config.language
        );
        
        if (result.success) {
          return {
            success: true,
            text: result.text,
            confidence: 0.95
          };
        } else {
          throw new Error(result.error || '识别失败');
        }
      } else {
        throw new Error('Electron API不可用');
      }

    } catch (error) {
      console.error('❌ 识别失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '识别失败'
      };
    }
  }

  isSupported(): boolean {
    return !!navigator.mediaDevices?.getUserMedia && 
           typeof window !== 'undefined' && 
           !!(window as any).electronAPI?.whisperTranscribe;
  }

  getLanguages?(): string[] {
    return ['zh', 'en'];
  }
}
