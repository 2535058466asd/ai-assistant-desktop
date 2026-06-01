// ==========================================
// TTS 管理器
// 支持：豆包、小米 MiMo
// ==========================================

import type { TTSService, TTSRequest, TTSResult } from './ttsInterface';
import { VolcengineTTSV3, type VolcengineTTSV3Config } from './volcengineTTSV3';
import { MiMoTTS, type MiMoTTSConfig } from './mimoTTS';
import type { TTSConfig as GlobalTTSConfig } from '../../config/ttsConfig';
import { createLogger } from '../../../shared/logger';

const logger = createLogger('tts');

export type TTSType = 'volcengine' | 'mimo';

interface TTSConfig extends Omit<GlobalTTSConfig, 'volcengine' | 'mimo'> {
  volcengine?: VolcengineTTSV3Config;
  mimo?: MiMoTTSConfig;
}

class UnsupportedTTSService implements TTSService {
  constructor(private readonly reason: string) {}

  async speak(_request: TTSRequest): Promise<TTSResult> {
    logger.warn('TTS 服务不可用', { reason: this.reason });
    return { success: false, error: this.reason };
  }

  stop(): void {}

  isSupported(): boolean {
    return false;
  }

  getVoices(): string[] {
    return [];
  }
}

export class TTSManager {
  private currentService: TTSService;
  private config: TTSConfig;
  private activeType: TTSType = 'volcengine';
  private configKey = '';
  private audioCache: Map<string, ArrayBuffer> = new Map();
  private static readonly MAX_CACHE_SIZE = 50;

  private evictCache() {
    while (this.audioCache.size > TTSManager.MAX_CACHE_SIZE) {
      const oldest = this.audioCache.keys().next().value;
      if (oldest !== undefined) this.audioCache.delete(oldest);
    }
  }

  constructor(config?: Partial<TTSConfig>) {
    this.config = {
      type: 'volcengine',
      speed: 1.0,
      pitch: 1.0,
      volume: 1.0,
      ...config
    };
    this.configKey = this.serializeConfig(this.config);
    
    this.currentService = this.createService(this.config.type);
  }

  private serializeConfig(config: Partial<TTSConfig>): string {
    return JSON.stringify(config);
  }

  /**
   * 根据当前 TTS 引擎选择默认音色。
   * 上层语音对话不要写死豆包音色，否则切到小米 TTS 时会把错误 voice 传过去。
   */
  private getDefaultVoice(): string | undefined {
    if (this.config.type === 'mimo') {
      return this.config.mimo?.voice;
    }
    if (this.config.type === 'volcengine') {
      return this.config.volcengine?.voice;
    }
    return undefined;
  }

  /**
   * 初始化 TTS 服务（使用全局配置）
   */
  initialize(globalConfig: GlobalTTSConfig): void {
    const nextConfig: TTSConfig = {
      type: globalConfig.type,
      speed: globalConfig.speed,
      pitch: globalConfig.pitch,
      volume: globalConfig.volume,
      volcengine: globalConfig.volcengine,
      mimo: globalConfig.mimo
    };

    const nextConfigKey = this.serializeConfig(nextConfig);
    if (this.configKey === nextConfigKey) {
      logger.debug('TTS 管理器配置未变化，跳过重复初始化', { type: this.config.type });
      return;
    }

    this.config = nextConfig;
    this.configKey = nextConfigKey;
    
    this.currentService = this.createService(this.config.type);
    logger.info('TTS 管理器已初始化', {
      requestedType: this.config.type,
      effectiveType: this.activeType
    });
  }

  private createService(type: TTSType): TTSService {
    switch (type) {
      case 'volcengine':
        if (this.config.volcengine?.appId && this.config.volcengine?.accessToken) {
          logger.info('正在初始化豆包语音 TTS v3');
          this.activeType = 'volcengine';
          return new VolcengineTTSV3(this.config.volcengine);
        }
        logger.warn('豆包语音 TTS 配置不完整，当前不启用 TTS', {
          requestedType: 'volcengine'
        });
        this.activeType = 'volcengine';
        return new UnsupportedTTSService('豆包 TTS 凭证未配置完整，请先填写 App ID 和 Access Token。');
      case 'mimo':
        if (this.config.mimo?.baseUrl && this.config.mimo?.apiKey) {
          logger.info('正在初始化小米 MiMo TTS');
          this.activeType = 'mimo';
          return new MiMoTTS(this.config.mimo);
        }
        logger.warn('小米 MiMo TTS 配置不完整，当前不启用 TTS', {
          requestedType: 'mimo'
        });
        this.activeType = 'mimo';
        return new UnsupportedTTSService('小米 MiMo TTS 配置不完整，请先填写 Base URL 和 API Key。');
      default:
        logger.warn('未知 TTS 类型，当前不启用 TTS', { type });
        this.activeType = 'volcengine';
        return new UnsupportedTTSService('未知 TTS 类型，无法进行语音合成。');
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
      voice: request.voice || this.getDefaultVoice()
    };

    // 生成缓存 key（基于文本和语音配置）
    const cacheKey = `${mergedRequest.text}_${mergedRequest.voice}_${this.config.speed}_${this.config.pitch}`;

    // 第1步：检查内存缓存（同会话内快速访问）
    const cachedAudio = this.audioCache.get(cacheKey);
    if (cachedAudio) {
      logger.debug('TTS 命中内存缓存');
      return { success: true, audioData: cachedAudio };
    }

    // 第2步：检查本地持久化缓存（跨会话复用）
    try {
      logger.debug('正在检查 TTS 本地缓存');
      const localCacheResult = await window.electronAPI!.ttsCacheCheck(mergedRequest.text, mergedRequest.voice);
      
      if (localCacheResult.exists && localCacheResult.audioData) {
        logger.info('TTS 命中本地缓存');
        // 将 base64 转换为 ArrayBuffer
        const binaryString = atob(localCacheResult.audioData);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const audioBuffer = bytes.buffer;
        
        // 同时存入内存缓存
        this.audioCache.set(cacheKey, audioBuffer);
        this.evictCache();
        logger.debug('TTS 本地缓存已载入内存', { memoryCacheSize: this.audioCache.size });
        
        return { success: true, audioData: audioBuffer };
      }
    } catch (error) {
      logger.warn('TTS 本地缓存检查失败，继续请求语音服务', error);
    }

    // 第3步：向 TTS 服务请求
    try {
      const result = await this.currentService.speak(mergedRequest);

      // 缓存成功的音频
      if (result.success && result.audioData) {
        // 存入内存缓存
        this.audioCache.set(cacheKey, result.audioData);
        logger.debug('TTS 音频已写入内存缓存', { memoryCacheSize: this.audioCache.size });

        // 第4步：保存到本地持久化缓存（异步，不阻塞播放）
        this.saveToLocalCache(mergedRequest.text, mergedRequest.voice, result.audioData);
      }

      return result;
    } catch (error) {
      logger.error('TTS 服务失败', {
        requestedType: this.config.type,
        effectiveType: this.activeType,
        error
      });
      throw error;
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
      
      logger.debug('正在保存 TTS 音频到本地缓存');
      const result = await window.electronAPI!.ttsCacheSave(text, voice || '', base64Audio);
      
      if (result.success) {
        logger.info('TTS 音频已保存到本地缓存');
      } else {
        logger.warn('TTS 本地缓存保存失败', { error: result.error });
      }
    } catch (error) {
      logger.warn('TTS 本地缓存保存异常', error);
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
    
    logger.info('TTS 类型已切换', { from: this.config.type, to: type });
    this.config.type = type;
    this.currentService = this.createService(type);
  }

  setConfig(config: Partial<TTSConfig>): void {
    const oldType = this.config.type;
    this.config = { ...this.config, ...config };
    this.configKey = this.serializeConfig(this.config);
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
