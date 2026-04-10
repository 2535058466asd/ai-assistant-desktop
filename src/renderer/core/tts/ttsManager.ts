// ==========================================
// TTS 管理器
// 豆包语音 TTS 2.0 WebSocket v3 双向流式
// ==========================================

import type { TTSService, TTSRequest, TTSResult } from './ttsInterface';
import { WebSpeechTTS } from './webSpeechTTS';
import { VolcengineTTSV3, type VolcengineTTSV3Config } from './volcengineTTSV3';
import type { TTSConfig as GlobalTTSConfig } from '../../config/ttsConfig';

export type TTSType = 'volcengine' | 'web-speech';

interface TTSConfig extends Omit<GlobalTTSConfig, 'volcengine'> {
  volcengine?: VolcengineTTSV3Config;
}

export class TTSManager {
  private currentService: TTSService;
  private config: TTSConfig;
  private audioCache: Map<string, ArrayBuffer> = new Map();

  constructor(config?: Partial<TTSConfig>) {
    this.config = {
      type: 'volcengine',
      speed: 1.0,
      pitch: 1.0,
      volume: 1.0,
      ...config
    };
    
    this.currentService = this.createService(this.config.type);
  }

  /**
   * 初始化 TTS 服务（使用全局配置）
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
    console.log('🎵 TTS 管理器已初始化，类型:', this.config.type);
  }

  private createService(type: TTSType): TTSService {
    switch (type) {
      case 'volcengine':
        // 豆包 TTS 2.0 WebSocket v3 双向流式
        if (this.config.volcengine?.appId && this.config.volcengine?.accessToken) {
          console.log('🔄 初始化豆包语音 TTS 2.0（WebSocket v3 双向流式）');
          return new VolcengineTTSV3(this.config.volcengine);
        } else {
          console.warn('⚠️  豆包 TTS 配置不完整，降级使用 Web Speech API');
          return new WebSpeechTTS();
        }
      case 'web-speech':
        console.log('🔄 使用浏览器原生 Web Speech API');
        return new WebSpeechTTS();
      default:
        console.warn('⚠️  未知的 TTS 类型，使用 Web Speech API');
        return new WebSpeechTTS();
    }
  }

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

    // 生成缓存 key（基于文本和语音配置）
    const cacheKey = `${mergedRequest.text}_${mergedRequest.voice}_${this.config.speed}_${this.config.pitch}`;

    // 第1步：检查内存缓存（同会话内快速访问）
    const cachedAudio = this.audioCache.get(cacheKey);
    if (cachedAudio) {
      console.log('🎵 [TTS 内存缓存] 命中缓存，直接返回已合成的音频');
      return { success: true, audioData: cachedAudio };
    }

    // 第2步：检查本地持久化缓存（跨会话复用）
    try {
      console.log('🔍 [TTS 本地缓存] 检查本地缓存是否存在...');
      const localCacheResult = await window.electronAPI!.ttsCacheCheck(mergedRequest.text, mergedRequest.voice);
      
      if (localCacheResult.exists && localCacheResult.audioData) {
        console.log('💾 [TTS 本地缓存] 命中缓存！从本地加载音频');
        // 将 base64 转换为 ArrayBuffer
        const binaryString = atob(localCacheResult.audioData);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const audioBuffer = bytes.buffer;
        
        // 同时存入内存缓存
        this.audioCache.set(cacheKey, audioBuffer);
        console.log('🎵 [TTS 本地缓存] 已加载到内存，当前内存缓存数量:', this.audioCache.size);
        
        return { success: true, audioData: audioBuffer };
      }
    } catch (error) {
      console.warn('⚠️ [TTS 本地缓存] 检查缓存失败，继续请求豆包:', error);
    }

    // 第3步：向豆包请求 TTS
    try {
      // 首先尝试使用当前配置的 TTS 服务
      const result = await this.currentService.speak(mergedRequest);

      // 缓存成功的音频
      if (result.success && result.audioData) {
        // 存入内存缓存
        this.audioCache.set(cacheKey, result.audioData);
        console.log('🎵 [TTS 内存缓存] 已缓存音频，当前缓存数量:', this.audioCache.size);

        // 第4步：保存到本地持久化缓存（异步，不阻塞播放）
        this.saveToLocalCache(mergedRequest.text, mergedRequest.voice, result.audioData);
      }

      return result;
    } catch (error) {
      // 如果当前不是 Web Speech，则降级到 Web Speech
      if (this.config.type !== 'web-speech') {
        console.warn(`⚠️  当前 TTS 服务 (${this.config.type}) 失败，自动降级到 Web Speech API`);
        console.error('TTS 失败详情:', error);
        
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
          throw new Error('所有 TTS 服务都失败了');
        }
      } else {
        // 已经在用 Web Speech，直接报错
        console.error('❌ Web Speech API 失败:', error);
        throw new Error('TTS 服务失败');
      }
    }
  }

  // 保存音频到本地持久化缓存
  private async saveToLocalCache(text: string, voice: string | undefined, audioData: ArrayBuffer): Promise<void> {
    try {
      // 将 ArrayBuffer 转换为 base64
      const bytes = new Uint8Array(audioData);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Audio = btoa(binary);
      
      console.log('💾 [TTS 本地缓存] 正在保存音频到本地...');
      const result = await window.electronAPI!.ttsCacheSave(text, voice || '', base64Audio);
      
      if (result.success) {
        console.log('💾 [TTS 本地缓存] 音频已保存到本地持久化存储');
      } else {
        console.warn('⚠️ [TTS 本地缓存] 保存失败:', result.error);
      }
    } catch (error) {
      console.warn('⚠️ [TTS 本地缓存] 保存异常:', error);
    }
  }

  stop(): void {
    this.currentService.stop();
  }

  isSupported(): boolean {
    return this.currentService.isSupported();
  }

  getVoices(): string[] {
    if (this.currentService.getVoices) {
      return this.currentService.getVoices();
    }
    return [];
  }

  switchType(type: TTSType): void {
    if (this.config.type === type) return;
    
    console.log(`🔄 切换 TTS 方案: ${this.config.type} -> ${type}`);
    this.config.type = type;
    this.currentService = this.createService(type);
  }

  setConfig(config: Partial<TTSConfig>): void {
    const oldType = this.config.type;
    this.config = { ...this.config, ...config };
    if (config.type && config.type !== oldType) {
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
