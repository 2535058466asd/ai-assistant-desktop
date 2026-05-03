// ==========================================
// TTS 配置文件
// 豆包语音 TTS 2.0 WebSocket v3 双向流式
// ==========================================

import type { TTSType } from '../core/tts';

export interface TTSConfig {
  type: TTSType;
  
  // 豆包 TTS 2.0 配置（WebSocket v3 双向流式）
  volcengine?: {
    appId: string;            // 应用 ID（X-Api-App-Key）
    accessToken: string;      // Access Token（X-Api-Access-Key）
    apiUrl?: string;          // WebSocket API 地址
    voice?: string;           // 音色（speaker，必须是 TTS 2.0 专属音色）
    model?: string;           // 模型版本（seed-tts-2.0-expressive 或 seed-tts-2.0-standard）
    resourceId?: string;      // 资源 ID（X-Api-Resource-Id: seed-tts-2.0）
    format?: string;          // 音频格式（pcm/ogg_opus/mp3）
    sampleRate?: number;      // 采样率（默认 24000）
    speed?: number;           // 语速（speech_rate: -50~100）
    volume?: number;          // 音量（loudness_rate: -50~100）
    pitch?: number;           // 音调（post_process.pitch: -12~12）
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

// 默认 TTS 配置（使用豆包 TTS 2.0 WebSocket v3）
export const DEFAULT_TTS_CONFIG: TTSConfig = {
  type: 'volcengine',  // 默认使用豆包 TTS 2.0 WebSocket v3
  
  // 豆包 TTS 2.0 配置（WebSocket v3 双向流式）
  volcengine: {
    appId: readEnvValue('VITE_VOLCENGINE_APP_ID') || readStoredValue('qiyuan.volcengine.appId'),
    accessToken: readEnvValue('VITE_VOLCENGINE_ACCESS_TOKEN') || readStoredValue('qiyuan.volcengine.accessToken'),
    apiUrl: 'wss://openspeech.bytedance.com/api/v3/tts/bidirection',  // WebSocket 双向流式接口
    voice: 'zh_female_vv_uranus_bigtts',  // 音色：Vivi 2.0（TTS 2.0 专属音色，表现力强）
    model: 'seed-tts-2.0-expressive',  // 模型：表现力强版本（推荐）
    resourceId: 'seed-tts-2.0',  // 资源 ID（TTS 2.0 固定值，不是实例名！）
    format: 'pcm',  // 音频格式（pcm/ogg_opus/mp3）
    sampleRate: 24000,  // 采样率（默认 24000）
    speed: 0,  // 语速（-50~100，0 为正常）
    volume: 0,  // 音量（-50~100，0 为正常）
    pitch: 0   // 音调（-12~12，0 为正常）
  },
  
  // 通用配置
  speed: 1.0,   // 语速：0.5-2.0
  pitch: 1.0,   // 音调：0.5-2.0
  volume: 1.0   // 音量：0.0-1.0
};
