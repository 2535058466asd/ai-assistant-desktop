// ==========================================
// ASR 管理器
// 豆包语音 ASR 2.0 WebSocket v3 双向流式
// ==========================================

import type { ASRService, ASRRequest, ASRResult } from './asrInterface';
import { WebSpeechASR } from './webSpeechASR';
import { VolcengineASRV3, type VolcengineASRV3Config } from './volcengineASRV3';
import type { ASRConfig as GlobalASRConfig } from '../../config/asrConfig';
import { createLogger } from '../../../shared/logger';

const logger = createLogger('asr');

export type ASRType = 'volcengine' | 'web-speech';

interface ASRConfig extends Omit<GlobalASRConfig, 'volcengine'> {
  volcengine?: VolcengineASRV3Config;
}

export class ASRManager {
  private currentService: ASRService;
  private config: ASRConfig;

  constructor(config?: Partial<ASRConfig>) {
    this.config = {
      type: 'volcengine',
      language: 'zh-CN',
      ...config
    };
    
    this.currentService = this.createService(this.config.type);
  }

  private createService(type: ASRType): ASRService {
    switch (type) {
      case 'volcengine':
        // 豆包 ASR 2.0 WebSocket v3 双向流式优化版
        if (this.config.volcengine?.appId && this.config.volcengine?.accessToken) {
          logger.info('Initializing Volcengine ASR v3');
          return new VolcengineASRV3(this.config.volcengine);
        } else {
          logger.warn('Volcengine ASR config incomplete, falling back to Web Speech API');
          return new WebSpeechASR();
        }
      case 'web-speech':
        logger.info('Using Web Speech ASR');
        return new WebSpeechASR();
      default:
        logger.warn('Unknown ASR type, using Web Speech API', { type });
        return new WebSpeechASR();
    }
  }

  /**
   * 初始化 ASR 服务（使用全局配置）
   */
  initialize(globalConfig: GlobalASRConfig): void {
    this.config = {
      type: globalConfig.type,
      language: globalConfig.language,
      volcengine: globalConfig.volcengine
    };
    
    this.currentService = this.createService(this.config.type);
    logger.info('ASR manager initialized', { type: this.config.type });
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
   * 切换 ASR 方案
   */
  switchType(type: ASRType): void {
    if (this.config.type === type) return;
    
    logger.info('ASR type switched', { from: this.config.type, to: type });
    this.config.type = type;
    this.currentService = this.createService(type);
  }

  /**
   * 设置配置
   */
  setConfig(config: Partial<ASRConfig>): void {
    const oldType = this.config.type;
    this.config = { ...this.config, ...config };
    if (config.type && config.type !== oldType) {
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
