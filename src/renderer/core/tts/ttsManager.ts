// ==========================================
// TTS 管理器
// 统一管理不同的TTS方案，方便切换
// ==========================================

import type { TTSService, TTSRequest, TTSResult } from './ttsInterface';
import { WebSpeechTTS } from './webSpeechTTS';
import { VolcengineTTS, type VolcengineTTSConfig } from './volcengineTTS';
import { EdgeTTS } from './edgeTTS';
import type { TTSConfig as GlobalTTSConfig } from '../../config/ttsConfig';

export type TTSType = 'web-speech' | 'kokoro' | 'emotivoice' | 'volcengine' | 'edge';

interface TTSConfig extends Omit<GlobalTTSConfig, 'volcengine'> {
  volcengine?: VolcengineTTSConfig;
}

export class TTSManager {
  private currentService: TTSService;
  private config: TTSConfig;

  constructor(config?: Partial<TTSConfig>) {
    this.config = {
      type: 'web-speech',
      speed: 1.0,
      pitch: 1.0,
      volume: 1.0,
      ...config
    };
    
    this.currentService = this.createService(this.config.type);
  }

  /**
   * 初始化TTS服务（使用全局配置）
   */
  initialize(globalConfig: GlobalTTSConfig): void {
    this.config = {
      type: globalConfig.type,
      speed: globalConfig.speed,
      pitch: globalConfig.pitch,
      volume: globalConfig.volume,
      volcengine: globalConfig.volcengine
    };
    
    this.currentService = this.createService(this.config.type);
    console.log('🎵 TTS管理器已初始化，类型:', this.config.type);
  }

  private createService(type: TTSType): TTSService {
    switch (type) {
      case 'web-speech':
        return new WebSpeechTTS();
      case 'edge':
        console.log('🔄 初始化 Edge TTS');
        return new EdgeTTS();
      case 'kokoro':
        console.log('🔄 Kokoro TTS 待实现');
        return new WebSpeechTTS();
      case 'emotivoice':
        console.log('🔄 EmotiVoice TTS 待实现');
        return new WebSpeechTTS();
      case 'volcengine':
        // 老版v3接口：检查appId和token
        if (this.config.volcengine?.appId && this.config.volcengine?.token) {
          console.log('🔄 初始化火山引擎 TTS（appid+token鉴权）');
          return new VolcengineTTS(this.config.volcengine);
        } else {
          console.warn('⚠️  火山引擎TTS配置不完整，使用Web Speech API');
          return new WebSpeechTTS();
        }
      default:
        return new WebSpeechTTS();
    }
  }

  /**
   * 语音合成（支持字符串或TTSRequest对象）
   * 添加了自动降级机制：如果当前TTS失败，自动切换到Web Speech
   */
  async speak(textOrRequest: string | TTSRequest): Promise<TTSResult> {
    let request: TTSRequest;
    
    if (typeof textOrRequest === 'string') {
      request = { text: textOrRequest };
    } else {
      request = textOrRequest;
    }
    
    const mergedRequest = {
      ...request,
      speed: request.speed || this.config.speed,
      pitch: request.pitch || this.config.pitch,
      volume: request.volume || this.config.volume,
      voice: request.voice || this.config.volcengine?.voice
    };
    
    try {
      // 首先尝试使用当前配置的TTS服务
      return await this.currentService.speak(mergedRequest);
    } catch (error) {
      console.warn(`⚠️ 当前TTS服务 (${this.config.type}) 失败，自动降级到 Web Speech API`);
      console.error('TTS失败详情:', error);
      
      // 自动切换到 Web Speech TTS
      const fallbackService = new WebSpeechTTS();
      this.currentService = fallbackService;
      this.config.type = 'web-speech';
      
      // 使用 Web Speech 重新尝试
      try {
        console.log('🔄 使用 Web Speech API 重新尝试语音合成');
        return await fallbackService.speak(mergedRequest);
      } catch (fallbackError) {
        console.error('❌ Web Speech API 也失败了:', fallbackError);
        throw new Error('所有TTS服务都失败了');
      }
    }
  }

  stop(): void {
    this.currentService.stop();
  }

  isSupported(): boolean {
    return this.currentService.isSupported();
  }

  getVoices?(): string[] {
    if (this.currentService.getVoices) {
      return this.currentService.getVoices();
    }
    return [];
  }

  switchType(type: TTSType): void {
    if (this.config.type === type) return;
    
    console.log(`🔄 切换TTS方案: ${this.config.type} -> ${type}`);
    this.config.type = type;
    this.currentService = this.createService(type);
  }

  setConfig(config: Partial<TTSConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.type && config.type !== this.config.type) {
      this.switchType(config.type);
    }
  }

  getConfig(): TTSConfig {
    return { ...this.config };
  }
}

let ttsManagerInstance: TTSManager | null = null;

export function getTTSManager(config?: Partial<TTSConfig>): TTSManager {
  if (!ttsManagerInstance) {
    ttsManagerInstance = new TTSManager(config);
  }
  return ttsManagerInstance;
}
