// ==========================================
// 火山引擎 TTS 适配器（老版v3接口 - appid+token鉴权）
// 按项目文档补充的「Missing required: app.appid 一键修复」方案
// 接口地址：https://openspeech.bytedance.com/api/v3/tts/unidirectional
// ==========================================

import type { TTSService, TTSRequest, TTSResult } from './ttsInterface';

export interface VolcengineTTSConfig {
  appId: string;            // 应用ID（老版鉴权，必填）
  token: string;            // Token（老版鉴权，必填）
  apiUrl?: string;          // API地址（可选，默认用v3）
  voice?: string;            // 音色
  model?: string;            // 模型版本
  resourceId?: string;       // 资源ID
  encoding?: string;         // 音频格式（wav/ogg_opus）
  sampleRate?: number;       // 采样率（默认16000）
  speed?: number;           // 语速（0.5-2.0）
  volume?: number;          // 音量（0.5-2.0）
  pitch?: number;           // 音调（0.5-2.0）
}

export class VolcengineTTS implements TTSService {
  private config: VolcengineTTSConfig;
  private audio: HTMLAudioElement | null = null;
  private useElectronProxy: boolean;

  constructor(config: VolcengineTTSConfig) {
    this.config = {
      apiUrl: 'https://openspeech.bytedance.com/api/v3/tts/unidirectional',
      voice: 'zh_female_xiaoyi',
      model: 'doubao-tts-1.0',
      resourceId: 'volc.service_type.10029',
      encoding: 'wav',
      sampleRate: 16000,
      speed: 1.0,
      volume: 1.0,
      pitch: 1.0,
      ...config
    };
    
    // 检查是否在Electron环境中
    this.useElectronProxy = typeof window !== 'undefined' && 'electronAPI' in window;
    
    console.log('🔊 火山引擎 TTS 初始化成功（appid+token鉴权）');
    console.log('🌐 使用Electron代理:', this.useElectronProxy);
    console.log('📋 配置信息:', {
      apiUrl: this.config.apiUrl,
      voice: this.config.voice,
      encoding: this.config.encoding,
      sampleRate: this.config.sampleRate
    });
  }

  async speak(request: TTSRequest): Promise<TTSResult> {
    try {
      this.stop();

      if (!request.text.trim()) {
        return {
          success: false,
          error: '文本内容为空'
        };
      }

      console.log('🎤 调用火山引擎TTS v3 API（appid+token鉴权）:', request.text);

      // 构建请求头（老版v3接口，按项目文档补充方案）
      const headers: any = {
        'Content-Type': 'application/json'
        // 注意：不要传 x-api-key 和 X-Api-Timestamp！
      };
      
      // 手动构造JSON字符串（老版v3接口，appid+token + model+resourceId）
      const jsonData = `{
        "app": {
          "appid": "${this.config.appId}"
        },
        "token": "${this.config.token}",
        "model": "${this.config.model || 'doubao-tts-1.0'}",
        "resourceId": "${this.config.resourceId || 'volc.service_type.10029'}",
        "voice": "${request.voice || this.config.voice || 'zh_female_xiaoyi'}",
        "encoding": "${this.config.encoding || 'wav'}",
        "sample_rate": ${this.config.sampleRate || 16000},
        "text": ${JSON.stringify(request.text)}
      }`;

      console.log('📤 发送请求到:', this.config.apiUrl);
      console.log('📦 完整请求体JSON:', jsonData);

      let audioData: ArrayBuffer;
      
      if (this.useElectronProxy && window.electronAPI?.httpProxy) {
        // 使用Electron主进程代理
        console.log('🚀 使用Electron代理发送请求');
        const proxyResponse = await window.electronAPI.httpProxy({
          url: this.config.apiUrl,
          method: 'POST',
          headers: headers,
          data: jsonData,
          responseType: 'arraybuffer'  // 告诉代理我们要二进制数据
        });

        if (!proxyResponse.success) {
          throw new Error(proxyResponse.error || '代理请求失败');
        }

        // 1. 先打印所有调试信息（先于任何检查）
        console.log('📊 HTTP状态码:', proxyResponse.status);
        console.log('📋 响应头:', proxyResponse.headers);

        if (proxyResponse.data) {
          console.log('📦 原始响应数据长度:', proxyResponse.data.length, 'bytes');
          console.log('📦 原始响应数据:', proxyResponse.data);
          
          try {
            if (proxyResponse.isBinary) {
              const decodedText = atob(proxyResponse.data);
              console.log('📝 解码后的文本:', decodedText);
            } else {
              console.log('📝 响应文本内容:', proxyResponse.data);
            }
          } catch (e) {
            console.log('⚠️  无法解码为文本，错误:', e);
          }
        }

        // 2. 检查HTTP状态码
        if (proxyResponse.status && proxyResponse.status >= 400) {
          console.log('❌ API返回错误，状态码:', proxyResponse.status);
          throw new Error(`API请求失败，状态码: ${proxyResponse.status}`);
        }

        // 3. 检查Content-Type
        const contentType = proxyResponse.headers?.['content-type'] || '';
        console.log('📝 Content-Type:', contentType);
        
        if (!contentType.includes('audio') && !contentType.includes('octet-stream')) {
          console.log('❌ 响应不是音频格式，但先让我们看看响应内容是什么...');
          throw new Error(`响应不是音频格式，Content-Type: ${contentType}`);
        }

        // 老版API直接返回二进制音频数据（主进程已经转成base64了）
        if (proxyResponse.isBinary && proxyResponse.data) {
          console.log('📦 音频数据长度:', proxyResponse.data.length, 'bytes');
          // 把base64转回ArrayBuffer
          audioData = this.base64ToArrayBuffer(proxyResponse.data);
        } else {
          throw new Error('响应数据格式错误');
        }
      } else {
        throw new Error('不在Electron环境中，无法使用火山引擎TTS（CORS限制）');
      }

      console.log('✅ 火山引擎TTS v3 API（appid+token鉴权）调用成功');

      // 直接用二进制数据创建音频
      const audioBlob = new Blob([audioData], { type: 'audio/wav' });
      const audioUrl = URL.createObjectURL(audioBlob);

      this.audio = new Audio(audioUrl);
      
      return new Promise((resolve) => {
        if (!this.audio) {
          resolve({ success: false, error: '音频创建失败' });
          return;
        }

        this.audio.onended = () => {
          console.log('🔊 语音播放结束');
          if (this.audio) {
            URL.revokeObjectURL(audioUrl);
          }
          resolve({ success: true });
        };

        this.audio.onerror = (error) => {
          console.error('❌ 音频播放错误:', error);
          if (this.audio) {
            URL.revokeObjectURL(audioUrl);
          }
          resolve({
            success: false,
            error: '音频播放失败'
          });
        };

        console.log('🔊 开始播放语音');
        this.audio.play().catch((error) => {
          console.error('❌ 播放失败:', error);
          if (this.audio) {
            URL.revokeObjectURL(audioUrl);
          }
          resolve({
            success: false,
            error: '播放失败'
          });
        });
      });

    } catch (error: any) {
      console.error('❌ 火山引擎TTS v3 API调用失败:', error);
      // 重新抛出异常，让TTS管理器可以捕获并自动降级
      throw error;
    }
  }

  stop(): void {
    if (this.audio) {
      try {
        this.audio.pause();
        this.audio.currentTime = 0;
        console.log('⏹️  已停止语音播放');
      } catch (error) {
        console.warn('⚠️  停止语音播放时出错:', error);
      }
      this.audio = null;
    }
  }

  isSupported(): boolean {
    return !!this.config.appId && !!this.config.token;
  }

  updateConfig(config: Partial<VolcengineTTSConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Base64字符串转ArrayBuffer
   * @param base64 Base64编码的字符串
   * @returns ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
