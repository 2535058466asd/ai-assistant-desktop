// ==========================================
// ASR 配置文件
// 支持：豆包语音 ASR 2.0 WebSocket v3、小米 MiMo ASR
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

  // 小米 MiMo ASR 配置（OpenAI-compatible chat/completions）
  mimo?: {
    baseUrl: string;
    apiKey: string;
    model?: string;
    language?: 'auto' | 'zh' | 'en';
    sampleRate?: number;
  };

  // 通用配置
  language?: string;
}

function readStoredValue(key: string): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(key) || '';
}

function readStoredWithLegacy(key: string, legacyKey: string): string {
  return readStoredValue(key) || readStoredValue(legacyKey);
}

function readEnvValue(key: string): string {
  return (import.meta.env[key] as string | undefined) || '';
}

function readASRType(): ASRConfig['type'] {
  const stored = readStoredValue('nova.asr.type');
  return stored === 'volcengine' || stored === 'mimo' ? stored : 'volcengine';
}

// 默认 ASR 配置。
// ASR 只负责“听你说话并转文字”，默认使用火山 ASR。
export const DEFAULT_ASR_CONFIG: ASRConfig = {
  type: readASRType(),
  
  // 豆包 ASR 2.0 配置（WebSocket v3 双向流式优化版）
  volcengine: {
    appId: readEnvValue('VITE_VOLCENGINE_APP_ID') || readStoredWithLegacy('nova.volcengine.appId', 'qiyuan.volcengine.appId'),
    accessToken: readEnvValue('VITE_VOLCENGINE_ACCESS_TOKEN') || readStoredWithLegacy('nova.volcengine.accessToken', 'qiyuan.volcengine.accessToken'),
    apiUrl: 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async',  // 双向流式优化版
    resourceId: 'volc.bigasr.sauc.duration',  // 资源 ID（与官方Python示例一致）
    format: 'pcm',  // 音频格式
    sampleRate: 16000,  // 采样率
    language: 'zh-CN'  // 语言
  },
  mimo: {
    baseUrl: readEnvValue('VITE_MIMO_BASE_URL') || readStoredValue('nova.mimo.baseUrl') || 'https://api.xiaomimimo.com/v1',
    apiKey: readEnvValue('VITE_MIMO_API_KEY') || readStoredValue('nova.mimo.apiKey'),
    model: readStoredValue('nova.mimo.asrModel') || 'mimo-v2.5-asr',
    language: 'auto',
    sampleRate: 16000
  },
  
  // 通用配置
  language: 'zh-CN'
};

export function loadASRConfig(): ASRConfig {
  return {
    type: readASRType(),
    volcengine: {
      appId: readEnvValue('VITE_VOLCENGINE_APP_ID') || readStoredWithLegacy('nova.volcengine.appId', 'qiyuan.volcengine.appId'),
      accessToken: readEnvValue('VITE_VOLCENGINE_ACCESS_TOKEN') || readStoredWithLegacy('nova.volcengine.accessToken', 'qiyuan.volcengine.accessToken'),
      apiUrl: 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async',
      resourceId: 'volc.bigasr.sauc.duration',
      format: 'pcm',
      sampleRate: 16000,
      language: 'zh-CN'
    },
    mimo: {
      baseUrl: readEnvValue('VITE_MIMO_BASE_URL') || readStoredValue('nova.mimo.baseUrl') || 'https://api.xiaomimimo.com/v1',
      apiKey: readEnvValue('VITE_MIMO_API_KEY') || readStoredValue('nova.mimo.apiKey'),
      model: readStoredValue('nova.mimo.asrModel') || 'mimo-v2.5-asr',
      language: 'auto',
      sampleRate: 16000
    },
    language: 'zh-CN'
  };
}
