// ==========================================
// TTS 管理器
// 豆包语音 TTS 2.0 WebSocket v3 双向流式
// ==========================================

import type { TTSService, TTSRequest, TTSResult } from './ttsInterface';
import { WebSpeechTTS } from './webSpeechTTS';
import { VolcengineTTSV3, type VolcengineTTSV3Config } from './volcengineTTSV3';
import type { TTSConfig as GlobalTTSConfig } from '../../config/ttsConfig';
import { createLogger } from '../../../shared/logger';

const logger = createLogger('tts');

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
    logger.info('TTS manager initialized', { type: this.config.type });
  }

  private createService(type: TTSType): TTSService {
    switch (type) {
      case 'volcengine':
        // 豆包 TTS 2.0 WebSocket v3 双向流式
        if (this.config.volcengine?.appId && this.config.volcengine?.accessToken) {
          logger.info('Initializing Volcengine TTS v3');
          return new VolcengineTTSV3(this.config.volcengine);
        } else {
          logger.warn('Volcengine TTS config incomplete, falling back to Web Speech API');
          return new WebSpeechTTS();
        }
      case 'web-speech':
        logger.info('Using Web Speech TTS');
        return new WebSpeechTTS();
      default:
        logger.warn('Unknown TTS type, using Web Speech API', { type });
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
      logger.debug('TTS memory cache hit');
      return { success: true, audioData: cachedAudio };
    }

    // 第2步：检查本地持久化缓存（跨会话复用）
    try {
      logger.debug('Checking TTS local cache');
      const localCacheResult = await window.electronAPI!.ttsCacheCheck(mergedRequest.text, mergedRequest.voice);
      
      if (localCacheResult.exists && localCacheResult.audioData) {
        logger.info('TTS local cache hit');
        // 将 base64 转换为 ArrayBuffer
        const binaryString = atob(localCacheResult.audioData);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const audioBuffer = bytes.buffer;
        
        // 同时存入内存缓存
        this.audioCache.set(cacheKey, audioBuffer);
        logger.debug('TTS local cache loaded into memory', { memoryCacheSize: this.audioCache.size });
        
        return { success: true, audioData: audioBuffer };
      }
    } catch (error) {
      logger.warn('TTS local cache check failed, continuing with provider', error);
    }

    // 第3步：向豆包请求 TTS
    try {
      // 首先尝试使用当前配置的 TTS 服务
      const result = await this.currentService.speak(mergedRequest);

      // 缓存成功的音频
      if (result.success && result.audioData) {
        // 存入内存缓存
        this.audioCache.set(cacheKey, result.audioData);
        logger.debug('TTS audio cached in memory', { memoryCacheSize: this.audioCache.size });

        // 第4步：保存到本地持久化缓存（异步，不阻塞播放）
        this.saveToLocalCache(mergedRequest.text, mergedRequest.voice, result.audioData);
      }

      return result;
    } catch (error) {
      // 如果当前不是 Web Speech，则降级到 Web Speech
      if (this.config.type !== 'web-speech') {
        logger.warn('Current TTS service failed, falling back to Web Speech API', { type: this.config.type, error });
        
        // 自动切换到 Web Speech TTS
        const fallbackService = new WebSpeechTTS();
        this.currentService = fallbackService;
        this.config.type = 'web-speech';
        
        // 使用 Web Speech 重新尝试
        try {
          logger.info('Retrying TTS with Web Speech API');
          return await fallbackService.speak(mergedRequest);
        } catch (fallbackError) {
          logger.error('Web Speech API fallback failed', fallbackError);
          throw new Error('所有 TTS 服务都失败了');
        }
      } else {
        // 已经在用 Web Speech，直接报错
        logger.error('Web Speech API failed', error);
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
      
      logger.debug('Saving TTS audio to local cache');
      const result = await window.electronAPI!.ttsCacheSave(text, voice || '', base64Audio);
      
      if (result.success) {
        logger.info('TTS audio saved to local cache');
      } else {
        logger.warn('TTS local cache save failed', { error: result.error });
      }
    } catch (error) {
      logger.warn('TTS local cache save exception', error);
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
    
    logger.info('TTS type switched', { from: this.config.type, to: type });
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
