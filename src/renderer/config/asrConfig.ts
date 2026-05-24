// ==========================================
// ASR 配置文件
// 支持：豆包语音 ASR 2.0 WebSocket v3、小米 MiMo 音频理解、浏览器 Web Speech
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

  // 小米 MiMo ASR 配置（多模态音频理解）
  mimo?: {
    baseUrl: string;        // API 地址，例如：https://token-plan-cn.xiaomimimo.com/v1
    apiKey: string;         // API Key，例如：tp-xxxxx
    model?: string;         // 多模态模型，默认：mimo-v2.5
    language?: string;       // 识别语言（用于提示模型）
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

// 默认 ASR 配置。
// ASR 只负责“听你说话并转文字”，开发阶段优先使用浏览器内置 Web Speech：轻量、免费、启动快。
export const DEFAULT_ASR_CONFIG: ASRConfig = {
  type: (readStoredValue('nova.asr.type') as ASRConfig['type']) || 'web-speech',
  
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

  // 小米 MiMo ASR 配置（可通过环境变量设置）
  mimo: {
    baseUrl: readEnvValue('VITE_MIMO_BASE_URL') || readStoredValue('nova.mimo.baseUrl') || 'https://token-plan-cn.xiaomimimo.com/v1',
    apiKey: readEnvValue('VITE_MIMO_API_KEY') || readStoredValue('nova.mimo.apiKey') || '',
    model: 'mimo-v2.5',
    language: 'zh-CN'
  },
  
  // 通用配置
  language: 'zh-CN'
};
