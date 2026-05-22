// ==========================================
// 小米 MiMo TTS Provider
// 使用 OpenAI 兼容的 chat/completions 接口
// ==========================================

import type { TTSService, TTSRequest, TTSResult } from './ttsInterface';
import { createLogger } from '../../../shared/logger';

const logger = createLogger('tts');

export interface MiMoTTSConfig {
  baseUrl: string;          // API 地址，例如：https://token-plan-cn.xiaomimimo.com/v1
  apiKey: string;           // API Key，例如：tp-xxxxx
  model?: string;           // TTS 模型，默认：mimo-v2.5-tts
  voice?: string;           // 音色，默认：mimo_default
  format?: 'wav' | 'mp3' | 'pcm' | 'pcm16'; // 音频格式，默认：mp3
  voiceStyle?: string;      // 音色风格指令（仅用于 voice-design/voice-clone 模型）
}

export class MiMoTTS implements TTSService {
  private config: MiMoTTSConfig;

  constructor(config: MiMoTTSConfig) {
    this.config = {
      model: 'mimo-v2.5-tts',
      voice: 'mimo_default',
      format: 'mp3',
      ...config
    };
    logger.info('小米 MiMo TTS 初始化', { model: this.config.model, voice: this.config.voice });
  }

  async speak(request: TTSRequest): Promise<TTSResult> {
    try {
      logger.debug('小米 MiMo TTS 请求', { text: request.text.substring(0, 100) });

      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        {
          role: 'assistant',
          content: request.text // TTS 文本必须放在 assistant role
        }
      ];

      // 如果有音色风格指令，需要放在 user role
      if (this.config.voiceStyle && (
        this.config.model?.includes('voice-design') || 
        this.config.model?.includes('voice-clone')
      )) {
        messages.unshift({
          role: 'user',
          content: this.config.voiceStyle
        });
      }

      const body = {
        model: this.config.model,
        messages,
        audio: {
          format: this.config.format,
          voice: request.voice || this.config.voice
        }
      };

      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.config.apiKey,
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('小米 MiMo TTS 请求失败', { status: response.status, error: errorText });
        throw new Error(`TTS 请求失败: ${response.status}`);
      }

      const responseData = await response.json();

      // 小米 TTS 返回的是音频数据
      let audioBuffer: ArrayBuffer;

      if (responseData.audio?.url) {
        // 如果返回的是音频 URL
        const audioResponse = await fetch(responseData.audio.url);
        audioBuffer = await audioResponse.arrayBuffer();
      } else if (responseData.audio?.data) {
        // 如果返回的是 base64 音频数据
        const base64Audio = responseData.audio.data;
        const binaryString = atob(base64Audio);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        audioBuffer = bytes.buffer;
      } else {
        throw new Error('TTS 返回格式不支持');
      }

      logger.info('小米 MiMo TTS 合成成功', { audioSize: audioBuffer.byteLength });

      return {
        success: true,
        audioData: audioBuffer
      };

    } catch (error) {
      logger.error('小米 MiMo TTS 异常', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  stop(): void {
    // 小米 TTS 是一次性请求，不需要 stop
  }

  isSupported(): boolean {
    return !!this.config.baseUrl && !!this.config.apiKey;
  }

  getVoices(): string[] {
    // 小米内置音色列表
    return [
      'mimo_default',
      '冰糖',
      '茉莉',
      '苏打',
      '白桦',
      'Mia',
      'Chloe',
      'Milo',
      'Dean'
    ];
  }
}
