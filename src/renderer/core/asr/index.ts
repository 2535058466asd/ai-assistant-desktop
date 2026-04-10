// ==========================================
// ASR 服务入口
// 豆包语音 2.0 WebSocket v3 + 浏览器语音（降级备用）
// ==========================================

export type { ASRService, ASRRequest, ASRResult } from './asrInterface';
export { WebSpeechASR } from './webSpeechASR';
export { VolcengineASRV3 } from './volcengineASRV3';
export { ASRManager, getASRManager } from './asrManager';
export type { ASRType } from './asrManager';
