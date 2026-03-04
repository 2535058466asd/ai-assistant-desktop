// ==========================================
// TTS 配置文件
// ==========================================

import type { TTSType } from '../core/tts';

export interface TTSConfig {
  type: TTSType;
  
  // 火山引擎TTS配置（老版v3接口 - appid+token鉴权）
  volcengine?: {
    appId: string;
    token: string;
    apiUrl?: string;
    voice?: string;
    model?: string;
    resourceId?: string;
    encoding?: string;
    sampleRate?: number;
    speed?: number;
    volume?: number;
    pitch?: number;
  };
  
  // 通用配置
  speed?: number;
  pitch?: number;
  volume?: number;
}

// 启源TTS配置（使用Web Speech API，浏览器自带，最简单）
export const DEFAULT_TTS_CONFIG: TTSConfig = {
  type: 'web-speech',  // 使用Web Speech API（浏览器自带，最简单）
  
  // 火山引擎TTS配置（已保留代码，需要时再启用）
  volcengine: {
    appId: '5259888408',  // 应用ID
    token: 'ApoHiCrmTcLARDXwa-TKCvV1ludiFKZZ',  // Token
    apiUrl: 'https://openspeech.bytedance.com/api/v3/tts/unidirectional',
    voice: 'zh_female_xiaoyi',  // 音色：晓伊
    model: 'doubao-tts-1.0',  // 模型
    resourceId: 'volc.service_type.10029',  // 资源ID
    encoding: 'wav',
    sampleRate: 16000,
    speed: 1.0,
    volume: 1.0,
    pitch: 1.0
  },
  
  // 通用配置
  speed: 1.0,   // 语速: 0.5-2.0
  pitch: 1.0,   // 音调: 0.5-2.0
  volume: 1.0   // 音量: 0.0-1.0
};
