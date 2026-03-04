// ==========================================
// ASR 配置文件
// ==========================================

import type { ASRType } from '../core/asr';

export interface ASRConfig {
  type: ASRType;
  
  // 火山引擎ASR配置（新版）
  volcengine?: {
    apiKey: string;           // 新版API Key
    apiUrl?: string;          // API地址
    format?: string;          // 音频格式
    sampleRate?: number;      // 采样率
  };
  
  // Whisper ASR配置
  whisper?: {
    language?: string;        // 语言（默认zh）
  };
  
  // 通用配置
  language?: string;
}

// 启源ASR配置（使用Web Speech API，浏览器自带，最简单）
export const DEFAULT_ASR_CONFIG: ASRConfig = {
  type: 'web-speech',  // 使用Web Speech API（浏览器自带，最简单）
  
  // Whisper ASR配置
  whisper: {
    language: 'zh'  // 默认中文
  },
  
  // 火山引擎ASR配置（新版）
  volcengine: {
    apiKey: '6f19c70a-0d33-404f-a82c-8200b89b6205',
    apiUrl: 'https://openspeech.bytedance.com/api/v3/asr/recognize',
    format: 'wav',
    sampleRate: 16000
  },
  
  // 通用配置
  language: 'zh-CN'
};
