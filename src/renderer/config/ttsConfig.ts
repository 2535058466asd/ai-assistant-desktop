// ==========================================
// TTS 配置文件
// 支持：豆包 TTS 2.0、小米 MiMo TTS
// ==========================================

import type { TTSType } from '../core/tts';
import { DEFAULT_VOLCENGINE_TTS_VOICE, normalizeVolcengineVoice } from './volcengineVoices';

export interface TTSConfig {
  type: TTSType;
  
  // 豆包 TTS 2.0 配置（WebSocket v3 双向流式）
  volcengine?: {
    appId: string;          // 应用 ID（X-Api-App-Key）
    accessToken: string;    // Access Token（X-Api-Access-Key）
    apiUrl?: string;        // WebSocket API 地址
    voice?: string;         // 音色（speaker，必须是 TTS 2.0 专属音色）
    model?: string;         // 模型版本（seed-tts-2.0-expressive 或 seed-tts-2.0-standard）
    resourceId?: string;    // 资源 ID（X-Api-Resource-Id: seed-tts-2.0）
    format?: string;        // 音频格式（pcm/ogg_opus/mp3）
    sampleRate?: number;    // 采样率（默认 24000）
    speed?: number;         // 语速（speech_rate: -50~100）
    volume?: number;        // 音量（loudness_rate: -50~100）
    pitch?: number;         // 音调（post_process.pitch: -12~12）
  };

  // 小米 MiMo TTS 配置
  mimo?: {
    baseUrl: string;        // API 地址，例如：https://token-plan-cn.xiaomimimo.com/v1
    apiKey: string;         // API Key，例如：tp-xxxxx
    model?: string;         // TTS 模型，默认：mimo-v2.5-tts
    voice?: string;         // 音色，默认：mimo_default
    format?: 'wav' | 'mp3' | 'pcm' | 'pcm16'; // 音频格式，默认：mp3
    voiceStyle?: string;    // 音色风格指令（仅用于 voice-design/voice-clone 模型）
  };
  
  // 通用配置
  speed?: number;
  pitch?: number;
  volume?: number;
}

function readStoredValue(key: string): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(key) || '';
}

function readEnvValue(key: string): string {
  return (import.meta.env[key] as string | undefined) || '';
}

function readTTSType(): TTSConfig['type'] {
  const stored = readStoredValue('nova.tts.type');
  return stored === 'volcengine' || stored === 'mimo' ? stored : 'volcengine';
}

function readStoredNumber(key: string, fallback: number): number {
  const value = Number(readStoredValue(key));
  return Number.isFinite(value) ? value : fallback;
}

const MIMO_TTS_MODELS = new Set([
  'mimo-v2.5-tts',
  'mimo-v2.5-tts-voicedesign',
  'mimo-v2.5-tts-voiceclone',
  'mimo-v2-tts'
]);

export function readMiMoTTSModel(): string {
  const stored = readStoredValue('nova.mimo.ttsModel');
  return MIMO_TTS_MODELS.has(stored) ? stored : 'mimo-v2.5-tts';
}

function readVolcengineVoice(): string {
  return normalizeVolcengineVoice(readStoredValue('nova.tts.voice'));
}

// 默认 TTS 配置（支持豆包、小米）。
// TTS 负责“AI 说话的声音”，可以和聊天模型、ASR 引擎独立选择。
export const DEFAULT_TTS_CONFIG: TTSConfig = {
  type: readTTSType(),
  
  // 豆包 TTS 2.0 配置（WebSocket v3 双向流式）
  volcengine: {
    appId: readEnvValue('VITE_VOLCENGINE_APP_ID') || readStoredValue('nova.volcengine.appId'),
    accessToken: readEnvValue('VITE_VOLCENGINE_ACCESS_TOKEN') || readStoredValue('nova.volcengine.accessToken'),
    apiUrl: 'wss://openspeech.bytedance.com/api/v3/tts/bidirection',
    voice: readVolcengineVoice() || DEFAULT_VOLCENGINE_TTS_VOICE,
    model: 'seed-tts-2.0-expressive',
    resourceId: 'seed-tts-2.0',
    format: 'pcm',
    sampleRate: 24000,
    speed: 0,
    volume: 0,
    pitch: 0
  },

  // 小米 MiMo TTS 配置（可通过环境变量设置）
  mimo: {
    baseUrl: readEnvValue('VITE_MIMO_BASE_URL') || readStoredValue('nova.mimo.baseUrl') || 'https://api.xiaomimimo.com/v1',
    apiKey: readEnvValue('VITE_MIMO_API_KEY') || readStoredValue('nova.mimo.apiKey') || '',
    model: readMiMoTTSModel(),
    voice: readStoredValue('nova.mimo.voice') || 'Chloe',
    format: 'wav'
  },
  
  // 通用配置
  speed: readStoredNumber('nova.tts.speed', 1.0),
  pitch: readStoredNumber('nova.tts.pitch', 1.0),
  volume: readStoredNumber('nova.tts.volume', 1.0)
};

export function loadTTSConfig(): TTSConfig {
  return {
    type: readTTSType(),
    volcengine: {
      appId: readEnvValue('VITE_VOLCENGINE_APP_ID') || readStoredValue('nova.volcengine.appId'),
      accessToken: readEnvValue('VITE_VOLCENGINE_ACCESS_TOKEN') || readStoredValue('nova.volcengine.accessToken'),
      apiUrl: 'wss://openspeech.bytedance.com/api/v3/tts/bidirection',
      voice: readVolcengineVoice() || DEFAULT_VOLCENGINE_TTS_VOICE,
      model: 'seed-tts-2.0-expressive',
      resourceId: 'seed-tts-2.0',
      format: 'pcm',
      sampleRate: 24000,
      speed: 0,
      volume: 0,
      pitch: 0
    },
    mimo: {
      baseUrl: readEnvValue('VITE_MIMO_BASE_URL') || readStoredValue('nova.mimo.baseUrl') || 'https://api.xiaomimimo.com/v1',
      apiKey: readEnvValue('VITE_MIMO_API_KEY') || readStoredValue('nova.mimo.apiKey') || '',
      model: readMiMoTTSModel(),
      voice: readStoredValue('nova.mimo.voice') || 'Chloe',
      format: 'wav'
    },
    speed: readStoredNumber('nova.tts.speed', 1.0),
    pitch: readStoredNumber('nova.tts.pitch', 1.0),
    volume: readStoredNumber('nova.tts.volume', 1.0)
  };
}
