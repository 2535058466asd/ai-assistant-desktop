// ==========================================
// Edge TTS 适配器
// 通过IPC直接调用主进程的Edge-TTS
// ==========================================

import type { TTSService, TTSRequest, TTSResult } from './ttsInterface';

export class EdgeTTS implements TTSService {
  private audio: HTMLAudioElement | null = null;

  constructor() {
    console.log('🎵 Edge TTS 初始化成功');
  }

  async speak(request: TTSRequest): Promise<TTSResult> {
    try {
      this.stop();

      if (!request.text.trim()) {
        return {
          success: false,
          error: '文本内容为空'
        };
      }

      console.log('🎤 调用 Edge TTS:', request.text);

      // 检查是否在Electron环境中
      if (typeof window === 'undefined' || !(window as any).electronAPI?.textToSpeech) {
        throw new Error('不在Electron环境中，无法使用Edge-TTS');
      }

      // 通过IPC调用主进程的Edge-TTS
      const result = await (window as any).electronAPI.textToSpeech(request.text);
      
      if (!result.success) {
        throw new Error(result.error || 'Edge TTS调用失败');
      }

      console.log('✅ Edge TTS调用成功，音频路径:', result.audioPath);

      // 创建本地文件URL（file://协议）
      const audioUrl = `file://${result.audioPath}`;
      
      this.audio = new Audio(audioUrl);
      
      return new Promise((resolve) => {
        if (!this.audio) {
          resolve({ success: false, error: '音频创建失败' });
          return;
        }

        this.audio.onended = () => {
          console.log('🔊 语音播放结束');
          resolve({ success: true });
        };

        this.audio.onerror = (error) => {
          console.error('❌ 音频播放错误:', error);
          resolve({
            success: false,
            error: '音频播放失败'
          });
        };

        console.log('🔊 开始播放语音');
        this.audio.play().catch((error) => {
          console.error('❌ 播放失败:', error);
          resolve({
            success: false,
            error: '播放失败'
          });
        });
      });

    } catch (error: any) {
      console.error('❌ Edge TTS调用失败:', error);
      throw error;
    }
  }

  stop(): void {
    if (this.audio) {
      try {
        this.audio.pause();
        this.audio.currentTime = 0;
        console.log('⏹️  已停止语音播放');
      } catch (error) {
        console.warn('⚠️  停止语音播放时出错:', error);
      }
      this.audio = null;
    }
  }

  isSupported(): boolean {
    return true;
  }

  updateConfig(): void {
    // Edge TTS暂时不需要更新配置
  }
}
