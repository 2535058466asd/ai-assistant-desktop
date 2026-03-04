// ==========================================
// ASR 管理器
// 统一管理不同的ASR方案，方便切换
// ==========================================

import type { ASRService, ASRRequest, ASRResult } from './asrInterface';
import { WebSpeechASR } from './webSpeechASR';
import { VolcengineASR, type VolcengineASRConfig } from './volcengineASR';
import { WhisperASR } from './whisperASR';
import type { ASRConfig as GlobalASRConfig } from '../../config/asrConfig';

export type ASRType = 'web-speech' | 'whisper' | 'volcengine';

interface ASRConfig extends Omit<GlobalASRConfig, 'volcengine'> {
  volcengine?: VolcengineASRConfig;
}

export class ASRManager {
  private currentService: ASRService;
  private config: ASRConfig;

  constructor(config?: Partial<ASRConfig>) {
    this.config = {
      type: 'web-speech',
      language: 'zh-CN',
      ...config
    };
    
    this.currentService = this.createService(this.config.type);
  }

  private createService(type: ASRType): ASRService {
    switch (type) {
      case 'web-speech':
        return new WebSpeechASR();
      case 'whisper':
        console.log('🔄 初始化Whisper ASR');
        return new WhisperASR();
      case 'volcengine':
        if (this.config.volcengine?.apiKey) {
          console.log('🔄 初始化火山引擎 ASR');
          return new VolcengineASR(this.config.volcengine);
        } else {
          console.warn('⚠️  火山引擎ASR配置不完整，使用Whisper ASR');
          return new WhisperASR();
        }
      default:
        return new WhisperASR();
    }
  }

  /**
   * 初始化ASR服务（使用全局配置）
   */
  initialize(globalConfig: GlobalASRConfig): void {
    this.config = {
      type: globalConfig.type,
      language: globalConfig.language,
      volcengine: globalConfig.volcengine
    };
    
    this.currentService = this.createService(this.config.type);
    console.log('🎵 ASR管理器已初始化，类型:', this.config.type);
  }

  /**
   * 开始实时语音识别
   */
  async startListening(
    onResult: (result: ASRResult) => void,
    onError?: (error: string) => void,
    onEnd?: () => void
  ): Promise<boolean> {
    return await this.currentService.startListening(
      onResult,
      onError,
      onEnd
    );
  }

  /**
   * 停止语音识别
   */
  stopListening(): void {
    this.currentService.stopListening();
  }

  /**
   * 识别音频文件/数据
   */
  async recognize(request: ASRRequest): Promise<ASRResult> {
    return await this.currentService.recognize(request);
  }

  /**
   * 检查是否支持
   */
  isSupported(): boolean {
    return this.currentService.isSupported();
  }

  /**
   * 切换ASR方案
   */
  switchType(type: ASRType): void {
    if (this.config.type === type) return;
    
    console.log(`🔄 切换ASR方案: ${this.config.type} -> ${type}`);
    this.config.type = type;
    this.currentService = this.createService(type);
  }

  /**
   * 设置配置
   */
  setConfig(config: Partial<ASRConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.type && config.type !== this.config.type) {
      this.switchType(config.type);
    }
  }

  /**
   * 获取配置
   */
  getConfig(): ASRConfig {
    return { ...this.config };
  }
}

let asrManagerInstance: ASRManager | null = null;

export function getASRManager(config?: Partial<ASRConfig>): ASRManager {
  if (!asrManagerInstance) {
    asrManagerInstance = new ASRManager(config);
  }
  return asrManagerInstance;
}
