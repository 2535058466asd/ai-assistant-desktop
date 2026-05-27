import type { InteractionRequest, InteractionResponse, Message, SessionId } from '../../types';
import { getWakeWordDetector } from './wakeWordDetector';
import { getASRManager } from '../asr';
import { getTTSManager } from '../tts';
import { loadTTSConfig } from '../../config/ttsConfig';
import { loadASRConfig } from '../../config/asrConfig';
import { createLogger } from '../../../shared/logger';

const logger = createLogger('voice');

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

  private initializeServices(): void {
    const ttsConfig = loadTTSConfig();
    const asrConfig = loadASRConfig();

    try {
      this.ttsManager.initialize(ttsConfig);
      logger.debug('🎵 TTS服务初始化成功，使用:', ttsConfig.type);
    } catch (error) {
      logger.error('❌ TTS服务初始化失败:', error);
    }

    try {
      this.asrManager.initialize(asrConfig);
      logger.debug('🎤 ASR服务初始化成功，使用:', asrConfig.type);
    } catch (error) {
      logger.error('❌ ASR服务初始化失败:', error);
    }
  }

  initialize(sessionId: SessionId): void {
    this.currentSessionId = sessionId;
    logger.debug('🎯 语音网关已初始化，会话 ID:', sessionId);
  }

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
            if (this.onMessageCallback) {
              this.onMessageCallback(result.text);
            }
          } else {
            if (this.wakeWordDetector.detect(result.text)) {
              logger.debug('🎯 检测到唤醒词！');
              this.isAwake = true;
              
              const command = this.wakeWordDetector.extractCommand(result.text);
              if (command && this.onMessageCallback) {
                this.onMessageCallback(command);
              } else if (this.onMessageCallback) {
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

  stopListening(): void {
    this.wakeWordDetector.stopListening();
    this.asrManager.stopListening();
    this.isListening = false;
    logger.debug('⏹️  语音监听已停止');
  }

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

  stopSpeaking(): void {
    this.ttsManager.stop();
  }

  async processRequest(request: InteractionRequest): Promise<InteractionResponse> {
    try {
      if (request.audioData) {
        logger.warn('⚠️  音频文件识别功能待实现');
      }

      if (request.text) {
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

        return {
          success: false,
          error: '请先叫"Nova"唤醒我'
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

  onMessage(callback: (message: string) => void): void {
    this.onMessageCallback = callback;
  }

  wakeUp(): void {
    this.isAwake = true;
    logger.debug('🎯 已手动唤醒Nova');
  }

  resetWakeState(): void {
    this.isAwake = false;
    logger.debug('😴 Nova已进入休眠状态');
  }

  getIsAwake(): boolean {
    return this.isAwake;
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }
}

let voiceGatewayManagerInstance: VoiceGatewayManager | null = null;

export function getVoiceGatewayManager(): VoiceGatewayManager {
  if (!voiceGatewayManagerInstance) {
    voiceGatewayManagerInstance = new VoiceGatewayManager();
  }
  return voiceGatewayManagerInstance;
}
