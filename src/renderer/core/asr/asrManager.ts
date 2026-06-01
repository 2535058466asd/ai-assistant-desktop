// ==========================================
// ASR 管理器
// 支持：豆包语音 ASR 2.0 WebSocket v3
// ==========================================

import type { ASRService, ASRRequest, ASRResult } from './asrInterface';
import { VolcengineASRV3, type VolcengineASRV3Config } from './volcengineASRV3';
import type { ASRConfig as GlobalASRConfig } from '../../config/asrConfig';
import { createLogger } from '../../../shared/logger';

const logger = createLogger('asr');

export type ASRType = 'volcengine';

interface ASRConfig extends Omit<GlobalASRConfig, 'volcengine'> {
  volcengine?: VolcengineASRV3Config;
}

class UnsupportedASRService implements ASRService {
  constructor(private readonly reason: string) {}

  async initialize(): Promise<void> {
    logger.warn('ASR 服务不可用', { reason: this.reason });
  }

  async startListening(
    _onResult: (result: ASRResult) => void,
    onError?: (error: string) => void,
    onEnd?: () => void
  ): Promise<boolean> {
    onError?.(this.reason);
    onEnd?.();
    return false;
  }

  stopListening(): void {}

  async recognize(_request: ASRRequest): Promise<ASRResult> {
    return { success: false, error: this.reason };
  }

  isSupported(): boolean {
    return false;
  }

  getLanguages(): string[] {
    return ['zh-CN'];
  }
}

export class ASRManager {
  private currentService: ASRService;
  private config: ASRConfig;
  private activeType: ASRType = 'volcengine';
  private configKey = '';
  private serviceInitialized = false;
  private initializingService: Promise<void> | null = null;

  constructor(config?: Partial<ASRConfig>) {
    this.config = {
      type: 'volcengine',
      language: 'zh-CN',
      ...config
    };
    this.configKey = this.serializeConfig(this.config);
    
    this.currentService = this.createService(this.config.type);
  }

  private serializeConfig(config: Partial<ASRConfig>): string {
    return JSON.stringify(config);
  }

  private createService(type: ASRType): ASRService {
    switch (type) {
      case 'volcengine':
        if (this.config.volcengine?.appId && this.config.volcengine?.accessToken) {
          logger.info('正在初始化豆包语音 ASR v3');
          this.activeType = 'volcengine';
          return new VolcengineASRV3(this.config.volcengine);
        }
        logger.warn('豆包语音 ASR 配置不完整，当前不启用 ASR', {
          requestedType: 'volcengine'
        });
        this.activeType = 'volcengine';
        return new UnsupportedASRService('豆包 ASR 凭证未配置完整，请先填写 App ID 和 Access Token。');
      default:
        logger.warn('未知 ASR 类型，当前不启用 ASR', { type });
        this.activeType = 'volcengine';
        return new UnsupportedASRService('未知 ASR 类型，无法启动语音识别。');
    }
  }

  /**
   * 初始化 ASR 服务（使用全局配置）
   */
  initialize(globalConfig: GlobalASRConfig): void {
    const nextConfig: ASRConfig = {
      type: globalConfig.type,
      language: globalConfig.language,
      volcengine: globalConfig.volcengine
    };

    const nextConfigKey = this.serializeConfig(nextConfig);
    if (this.configKey === nextConfigKey) {
      logger.debug('ASR 管理器配置未变化，跳过重复初始化', { type: this.config.type });
      return;
    }

    this.config = nextConfig;
    this.configKey = nextConfigKey;
    
    this.currentService = this.createService(this.config.type);
    this.serviceInitialized = false;
    this.initializingService = null;
    logger.info('ASR 管理器已初始化', {
      requestedType: this.config.type,
      effectiveType: this.activeType
    });
  }

  private async ensureServiceInitialized(): Promise<void> {
    if (this.serviceInitialized) return;

    if (!this.initializingService) {
      this.initializingService = this.currentService.initialize()
        .then(() => {
          this.serviceInitialized = true;
          logger.info('ASR 服务初始化完成', {
            requestedType: this.config.type,
            effectiveType: this.activeType
          });
        })
        .catch((error) => {
          this.serviceInitialized = false;
          logger.error('ASR 服务初始化失败', {
            requestedType: this.config.type,
            effectiveType: this.activeType,
            error
          });
          throw error;
        })
        .finally(() => {
          this.initializingService = null;
        });
    }

    await this.initializingService;
  }

  /**
   * 开始实时语音识别
   */
  async startListening(
    onResult: (result: ASRResult) => void,
    onError?: (error: string) => void,
    onEnd?: () => void
  ): Promise<boolean> {
    await this.ensureServiceInitialized();
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
    await this.ensureServiceInitialized();
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
    
    logger.info('ASR 类型已切换', { from: this.config.type, to: type });
    this.config.type = type;
    this.currentService = this.createService(type);
    this.serviceInitialized = false;
    this.initializingService = null;
  }

  /**
   * 设置配置
   */
  setConfig(config: Partial<ASRConfig>): void {
    const oldType = this.config.type;
    this.config = { ...this.config, ...config };
    this.configKey = this.serializeConfig(this.config);
    if (config.type && config.type !== oldType) {
      this.switchType(config.type);
    } else if (config.volcengine || config.language) {
      this.currentService = this.createService(this.config.type);
      this.serviceInitialized = false;
      this.initializingService = null;
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
