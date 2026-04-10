// ==========================================
// ASR 配置文件
// 豆包语音 ASR 2.0 WebSocket v3 双向流式
// ==========================================

import type { ASRType } from '../core/asr';

export interface ASRConfig {
  type: ASRType;
  
  // 豆包 ASR 2.0 配置（WebSocket v3 双向流式优化版）
  volcengine?: {
    appId: string;            // 应用 ID（X-Api-App-Key）
    accessToken: string;      // Access Token（X-Api-Access-Key）
    apiUrl?: string;          // WebSocket API 地址
    resourceId?: string;      // 资源 ID（X-Api-Resource-Id）
    format?: string;          // 音频格式（pcm/wav/ogg/mp3）
    sampleRate?: number;      // 采样率（默认 16000）
    language?: string;        // 语言（zh-CN）
  };
  
  // 通用配置
  language?: string;
}

// 默认 ASR 配置（使用豆包 ASR 2.0 WebSocket v3 双向流式优化版）
export const DEFAULT_ASR_CONFIG: ASRConfig = {
  type: 'volcengine',  // 默认使用豆包 ASR 2.0 WebSocket v3
  
  // 豆包 ASR 2.0 配置（WebSocket v3 双向流式优化版）
  volcengine: {
    appId: '3206095607',  // 应用 ID（X-Api-App-Key）
    accessToken: 'PabCghuQaDa8CcI9mP0XNImQeZ3auelD',  // Access Token（从 ASR 标签页获取的新 Token，与 TTS 相同）
    apiUrl: 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async',  // 双向流式优化版
    resourceId: 'volc.bigasr.sauc.duration',  // 资源 ID（与官方Python示例一致）
    format: 'pcm',  // 音频格式
    sampleRate: 16000,  // 采样率
    language: 'zh-CN'  // 语言
  },
  
  // 通用配置
  language: 'zh-CN'
};
