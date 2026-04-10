// ==========================================
// ASR 服务接口
// 定义统一的ASR接口，方便切换不同方案
// ==========================================

export interface ASRRequest {
  audioData?: Blob | ArrayBuffer; // 音频数据（可选，用于文件识别）
  language?: string;               // 语言代码（如：zh, en）
}

export interface ASRResult {
  success: boolean;
  text?: string;                   // 识别的文字
  error?: string;                  // 错误信息
  confidence?: number;             // 置信度（0-1）
}

export interface ASRService {
  /**
   * 初始化ASR服务
   */
  initialize(): Promise<void>;

  /**
   * 开始实时语音识别
   * @param onResult 识别结果回调
   * @param onError 错误回调
   * @param onEnd 结束回调
   */
  startListening(
    onResult: (result: ASRResult) => void,
    onError?: (error: string) => void,
    onEnd?: () => void
  ): Promise<boolean>;

  /**
   * 停止语音识别
   */
  stopListening(): void;

  /**
   * 识别音频文件/数据
   */
  recognize(request: ASRRequest): Promise<ASRResult>;

  /**
   * 检查是否支持
   */
  isSupported(): boolean;

  /**
   * 获取支持的语言列表
   */
  getLanguages(): string[];
}
