// ==========================================
// 第 1 层：交互层 - 唤醒词检测器
// 负责检测用户是否叫了"启源"
// ==========================================

/**
 * 唤醒词检测器类
 */
export class WakeWordDetector {
  private wakeWords: string[];
  private isListening: boolean = false;

  constructor(wakeWords: string[] = ['启源', '小启', '小源']) {
    this.wakeWords = wakeWords;
  }

  /**
   * 设置唤醒词列表
   */
  setWakeWords(words: string[]): void {
    this.wakeWords = words;
  }

  /**
   * 检测文本中是否包含唤醒词
   */
  detect(text: string): boolean {
    const normalizedText = text.toLowerCase().trim();
    
    for (const wakeWord of this.wakeWords) {
      if (normalizedText.includes(wakeWord.toLowerCase())) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 从文本中提取唤醒词之后的内容
   * 例如："启源，今天天气怎么样" → "今天天气怎么样"
   */
  extractCommand(text: string): string {
    let result = text.trim();
    
    for (const wakeWord of this.wakeWords) {
      const index = result.toLowerCase().indexOf(wakeWord.toLowerCase());
      if (index !== -1) {
        // 移除唤醒词及其后面的标点符号
        result = result.slice(index + wakeWord.length).trim();
        // 移除开头的标点符号
        result = result.replace(/^[，。！？,.!?\s]+/, '');
        break;
      }
    }
    
    return result;
  }

  /**
   * 开始监听（占位，未来可以做实时音频检测）
   */
  startListening(): void {
    this.isListening = true;
    console.log('🎯 唤醒词检测器已启动，监听词：', this.wakeWords);
  }

  /**
   * 停止监听
   */
  stopListening(): void {
    this.isListening = false;
    console.log('⏹️  唤醒词检测器已停止');
  }

  /**
   * 获取当前监听状态
   */
  getIsListening(): boolean {
    return this.isListening;
  }
}

// 创建单例
let wakeWordDetectorInstance: WakeWordDetector | null = null;

export function getWakeWordDetector(): WakeWordDetector {
  if (!wakeWordDetectorInstance) {
    wakeWordDetectorInstance = new WakeWordDetector();
  }
  return wakeWordDetectorInstance;
}
