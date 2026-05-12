// ==========================================
// 第 1 层：交互层整合入口
// 语音入口 / 出口层，只负责语音与文本互转
// ==========================================

export { WakeWordDetector, getWakeWordDetector } from './wakeWordDetector';

import type { InteractionRequest, InteractionResponse, Message, SessionId } from '../../types';
import { getWakeWordDetector } from './wakeWordDetector';
import { getASRManager } from '../asr';
import { getTTSManager } from '../tts';
import { DEFAULT_TTS_CONFIG } from '../../config/ttsConfig';
import { DEFAULT_ASR_CONFIG } from '../../config/asrConfig';
import { createLogger } from '../../../shared/logger';

const logger = createLogger('asr');

/**
 * 交互层管理器
 * 协调 ASR、TTS 和唤醒词检测
 */
export class VoiceGatewayManager {
  private wakeWordDetector = getWakeWordDetector();
  private asrManager = getASRManager();
  private ttsManager = getTTSManager();
  private currentSessionId: SessionId | null = null;
  private isAwake: boolean = false;
  private onMessageCallback: ((message: string) => void) | null = null;
  private isListening: boolean = false;

  constructor() {
    this.initializeServices();
  }

  /**
   * 初始化服务
   */
  private initializeServices(): void {
    try {
      this.ttsManager.initialize(DEFAULT_TTS_CONFIG);
      logger.debug('🎵 TTS服务初始化成功，使用:', DEFAULT_TTS_CONFIG.type);
    } catch (error) {
      logger.error('❌ TTS服务初始化失败:', error);
    }

    try {
      this.asrManager.initialize(DEFAULT_ASR_CONFIG);
      logger.debug('🎤 ASR服务初始化成功，使用:', DEFAULT_ASR_CONFIG.type);
    } catch (error) {
      logger.error('❌ ASR服务初始化失败:', error);
    }
  }

  /**
   * 初始化交互层
   */
  initialize(sessionId: SessionId): void {
    this.currentSessionId = sessionId;
    logger.debug('🎯 交互层已初始化，会话 ID:', sessionId);
  }

  /**
   * 开始语音监听
   */
  async startListening(): Promise<boolean> {
    if (this.isListening) {
      logger.debug('⚠️  语音监听已在运行中');
      return true;
    }

    this.wakeWordDetector.startListening();
    
    const success = await this.asrManager.startListening(
      (result) => {
        if (result.success && result.text) {
          logger.debug('🎤 识别结果:', result.text);
          
          if (this.isAwake) {
            // 如果已经唤醒，直接发送消息
            if (this.onMessageCallback) {
              this.onMessageCallback(result.text);
            }
          } else {
            // 如果未唤醒，检查是否包含唤醒词
            if (this.wakeWordDetector.detect(result.text)) {
              logger.debug('🎯 检测到唤醒词！');
              this.isAwake = true;
              
              // 提取唤醒词后的命令
              const command = this.wakeWordDetector.extractCommand(result.text);
              if (command && this.onMessageCallback) {
                this.onMessageCallback(command);
              } else if (this.onMessageCallback) {
                // 如果只有唤醒词，提示用户说话
                this.onMessageCallback('我在');
              }
            }
          }
        }
      },
      (error) => {
        logger.error('❌ ASR 错误:', error);
      },
      () => {
        logger.debug('ℹ️  语音识别已结束');
        this.isListening = false;
      }
    );

    if (success) {
      this.isListening = true;
      logger.debug('🎤 语音监听已启动');
    }
    return success;
  }

  /**
   * 停止语音监听
   */
  stopListening(): void {
    this.wakeWordDetector.stopListening();
    this.asrManager.stopListening();
    this.isListening = false;
    logger.debug('⏹️  语音监听已停止');
  }

  /**
   * 语音合成并播放
   */
  async speak(text: string): Promise<boolean> {
    if (!this.currentSessionId) {
      logger.error('❌ 会话未初始化');
      return false;
    }

    try {
      await this.ttsManager.speak(text);
      return true;
    } catch (error) {
      logger.error('❌ 语音合成失败:', error);
      return false;
    }
  }

  /**
   * 停止语音播放
   */
  stopSpeaking(): void {
    this.ttsManager.stop();
  }

  /**
   * 处理交互请求（统一入口）
   */
  async processRequest(request: InteractionRequest): Promise<InteractionResponse> {
    try {
      // 如果有音频数据，先识别
      if (request.audioData) {
        // TODO: 处理音频文件的识别（未来功能）
        logger.warn('⚠️  音频文件识别功能待实现');
      }

      // 如果有文本，直接使用
      if (request.text) {
        // 检查是否包含唤醒词
        if (this.wakeWordDetector.detect(request.text)) {
          this.isAwake = true;
          const command = this.wakeWordDetector.extractCommand(request.text);
          if (command) {
            return {
              success: true,
              message: {
                id: this.generateId(),
                role: 'user',
                content: command,
                timestamp: Date.now(),
                sessionId: request.sessionId
              }
            };
          }
        }

        // 如果已经唤醒，直接返回消息
        if (this.isAwake) {
          return {
            success: true,
            message: {
              id: this.generateId(),
              role: 'user',
              content: request.text,
              timestamp: Date.now(),
              sessionId: request.sessionId
            }
          };
        }

        // 未唤醒且无唤醒词
        return {
          success: false,
          error: '请先叫"启源"唤醒我'
        };
      }

      return {
        success: false,
        error: '无效的请求'
      };

    } catch (error) {
      logger.error('❌ 处理请求失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  /**
   * 设置消息回调
   */
  onMessage(callback: (message: string) => void): void {
    this.onMessageCallback = callback;
  }

  /**
   * 手动唤醒（用于按钮触发）
   */
  wakeUp(): void {
    this.isAwake = true;
    logger.debug('🎯 已手动唤醒启源');
  }

  /**
   * 重置唤醒状态
   */
  resetWakeState(): void {
    this.isAwake = false;
    logger.debug('😴 启源已进入休眠状态');
  }

  /**
   * 获取唤醒状态
   */
  getIsAwake(): boolean {
    return this.isAwake;
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }
}

// 创建单例
let voiceGatewayManagerInstance: VoiceGatewayManager | null = null;

export function getVoiceGatewayManager(): VoiceGatewayManager {
  if (!voiceGatewayManagerInstance) {
    voiceGatewayManagerInstance = new VoiceGatewayManager();
  }
  return voiceGatewayManagerInstance;
}
