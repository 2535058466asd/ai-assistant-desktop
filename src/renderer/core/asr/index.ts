// ==========================================
// ASR 服务入口
// 豆包语音 2.0 WebSocket v3
// ==========================================

export type { ASRService, ASRRequest, ASRResult } from './asrInterface';
export { VolcengineASRV3 } from './volcengineASRV3';
export { ASRManager, getASRManager } from './asrManager';
export type { ASRType } from './asrManager';
