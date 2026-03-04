// ==========================================
// TTS 服务接口定义
// 定义统一的TTS接口，方便切换不同的TTS方案
// ==========================================

export interface TTSRequest {
  text: string;
  voice?: string;
  speed?: number;
  pitch?: number;
  volume?: number;
}

export interface TTSResult {
  success: boolean;
  audioData?: ArrayBuffer;
  audioUrl?: string;
  error?: string;
}

export interface TTSService {
  speak(request: TTSRequest): Promise<TTSResult>;
  stop(): void;
  isSupported(): boolean;
  getVoices?(): string[];
}
