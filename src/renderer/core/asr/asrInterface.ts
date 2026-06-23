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

/**
 * ASR 服务的交互形态。
 *
 * streaming：服务端边收音频边返回中间文本，前端可以用静音计时自动提交。
 * batch：前端先录完整句音频，再一次性发给服务端识别。
 */
export type ASRMode = 'streaming' | 'batch';

export interface ASRService {
  /**
   * 获取 ASR 工作模式
   * streaming：边录边返回识别结果，适合静音检测自动提交
   * batch：停止录音后一次性识别，适合点击结束本句后提交
   */
  getMode(): ASRMode;

  /** 初始化 ASR 服务或校验运行环境。 */
  initialize(): Promise<void>;

  /**
   * 开始语音识别。
   *
   * streaming 服务会多次触发 onResult；batch 服务通常在录音结束后触发一次。
   * @param onResult 识别结果回调
   * @param onError 错误回调
   * @param onEnd 结束回调
   */
  startListening(
    onResult: (result: ASRResult) => void,
    onError?: (error: string) => void,
    onEnd?: () => void
  ): Promise<boolean>;

  /** 停止当前识别流程。 */
  stopListening(): void;

  /** 识别已有音频文件或音频数据。 */
  recognize(request: ASRRequest): Promise<ASRResult>;

  /** 当前环境和配置是否支持该服务。 */
  isSupported(): boolean;

  /** 获取支持的语言列表。 */
  getLanguages(): string[];
}
