import { createLogger } from '../../../shared/logger';

const logger = createLogger('voice');

export class WakeWordDetector {
  private wakeWords: string[];
  private isListening: boolean = false;

  constructor(wakeWords: string[] = ['Nova', '小诺', '诺诺']) {
    this.wakeWords = wakeWords;
  }

  setWakeWords(words: string[]): void {
    this.wakeWords = words;
  }

  detect(text: string): boolean {
    const normalizedText = text.toLowerCase().trim();
    
    for (const wakeWord of this.wakeWords) {
      if (normalizedText.includes(wakeWord.toLowerCase())) {
        return true;
      }
    }
    
    return false;
  }

  extractCommand(text: string): string {
    let result = text.trim();
    
    for (const wakeWord of this.wakeWords) {
      const index = result.toLowerCase().indexOf(wakeWord.toLowerCase());
      if (index !== -1) {
        result = result.slice(index + wakeWord.length).trim();
        result = result.replace(/^[，。！？,.!?\s]+/, '');
        break;
      }
    }
    
    return result;
  }

  startListening(): void {
    this.isListening = true;
    logger.debug('🎯 唤醒词检测器已启动，监听词：', this.wakeWords);
  }

  stopListening(): void {
    this.isListening = false;
    logger.debug('⏹️  唤醒词检测器已停止');
  }

  getIsListening(): boolean {
    return this.isListening;
  }
}

let wakeWordDetectorInstance: WakeWordDetector | null = null;

export function getWakeWordDetector(): WakeWordDetector {
  if (!wakeWordDetectorInstance) {
    wakeWordDetectorInstance = new WakeWordDetector();
  }
  return wakeWordDetectorInstance;
}