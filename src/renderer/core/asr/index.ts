// ==========================================
// ASR 服务入口
// ==========================================

export type { ASRService, ASRRequest, ASRResult } from './asrInterface';
export { WebSpeechASR } from './webSpeechASR';
export { ASRManager, getASRManager } from './asrManager';
export type { ASRType } from './asrManager';
