// ==========================================
// ASR 管理器
// 支持：豆包语音 ASR 2.0 WebSocket v3
// ==========================================

import type { ASRService, ASRRequest, ASRResult, ASRMode } from './asrInterface';
import { VolcengineASRV3, type VolcengineASRV3Config } from './volcengineASRV3';
import { MiMoASR, type MiMoASRConfig } from './mimoASR';
import type { ASRConfig as GlobalASRConfig } from '../../config/asrConfig';
import { createLogger } from '../../../shared/logger';

const logger = createLogger('asr');

export type ASRType = 'volcengine' | 'mimo';

interface ASRConfig extends Omit<GlobalASRConfig, 'volcengine' | 'mimo'> {
  volcengine?: VolcengineASRV3Config;
  mimo?: MiMoASRConfig;
}

class UnsupportedASRService implements ASRService {
  constructor(private readonly reason: string) {}

  getMode(): ASRMode {
    return 'batch';
  }

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

/**
 * ASR 服务门面。
 *
 * 上层语音对话只依赖 ASRService，不直接关心豆包流式 ASR 或小米批量 ASR 的实现差异。
 */
export class ASRManager {
  private currentService: ASRService;
  private config: ASRConfig;
  private activeType: ASRType = 'volcengine';
  private configKey = '';
  private serviceInitialized = false;
  private initializingService: Promise<void> | null = null;

  /**
   * 切换 Provider 或更新配置前释放当前录音资源。
   */
  private stopCurrentService(reason: string): void {
    try {
      this.currentService?.stopListening();
      logger.info('已停止当前 ASR 服务', {
        reason,
        type: this.activeType
      });
    } catch (error) {
      logger.warn('停止当前 ASR 服务失败', {
        reason,
        type: this.activeType,
        error
      });
    }
  }

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

  /**
   * 根据当前配置创建实际 Provider。
   * 配置不完整时返回占位服务，避免 UI 层判断 null。
   */
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
      case 'mimo':
        if (this.config.mimo?.baseUrl && this.config.mimo?.apiKey) {
          logger.info('正在初始化小米 MiMo ASR');
          this.activeType = 'mimo';
          return new MiMoASR(this.config.mimo);
        }
        logger.warn('小米 MiMo ASR 配置不完整，当前不启用 ASR', {
          requestedType: 'mimo'
        });
        this.activeType = 'mimo';
        return new UnsupportedASRService('小米 MiMo ASR 配置不完整，请先填写 Base URL 和 API Key。');
      default:
        logger.warn('未知 ASR 类型，当前不启用 ASR', { type });
        this.activeType = 'volcengine';
        return new UnsupportedASRService('未知 ASR 类型，无法启动语音识别。');
    }
  }

  /**
   * 使用全局设置同步 ASR 配置。
   */
  initialize(globalConfig: GlobalASRConfig): void {
    const nextConfig: ASRConfig = {
      type: globalConfig.type,
      language: globalConfig.language,
      volcengine: globalConfig.volcengine,
      mimo: globalConfig.mimo
    };

    const nextConfigKey = this.serializeConfig(nextConfig);
    if (this.configKey === nextConfigKey) {
      logger.debug('ASR 管理器配置未变化，跳过重复初始化', { type: this.config.type });
      return;
    }

    this.stopCurrentService('重新初始化 ASR 配置');
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
   * 开始语音识别。
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
   * 停止语音识别。
   */
  stopListening(): void {
    this.currentService.stopListening();
  }

  /**
   * 识别音频文件或音频数据。
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
   * 切换 ASR Provider。
   */
  switchType(type: ASRType): void {
    if (this.config.type === type) return;
    
    logger.info('ASR 类型已切换', { from: this.config.type, to: type });
    this.stopCurrentService('切换 ASR 类型');
    this.config.type = type;
    this.currentService = this.createService(type);
    this.serviceInitialized = false;
    this.initializingService = null;
  }

  /**
   * 更新 ASR 配置。
   */
  setConfig(config: Partial<ASRConfig>): void {
    const oldType = this.config.type;
    this.config = { ...this.config, ...config };
    this.configKey = this.serializeConfig(this.config);
    if (config.type && config.type !== oldType) {
      this.switchType(config.type);
    } else if (config.volcengine || config.mimo || config.language) {
      this.stopCurrentService('更新 ASR 配置');
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

  getMode(): ASRMode {
    return this.currentService.getMode();
  }
}

let asrManagerInstance: ASRManager | null = null;

export function getASRManager(config?: Partial<ASRConfig>): ASRManager {
  if (!asrManagerInstance) {
    asrManagerInstance = new ASRManager(config);
  }
  return asrManagerInstance;
}
