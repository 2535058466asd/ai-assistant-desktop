// ==========================================
// Web Speech API TTS 适配器
// 使用浏览器自带的Web Speech API
// ==========================================

import type { TTSService, TTSRequest, TTSResult } from './ttsInterface';

export class WebSpeechTTS implements TTSService {
  private synthesis: SpeechSynthesis;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private voiceSpeed: number = 1.0;
  private voicePitch: number = 1.0;
  private voiceVolume: number = 1.0;
  private voicesLoaded: boolean = false;

  constructor() {
    this.synthesis = window.speechSynthesis;
    
    // 确保语音列表加载完成
    if (this.synthesis.getVoices().length === 0) {
      this.synthesis.onvoiceschanged = () => {
        this.voicesLoaded = true;
        console.log('🔊 Web Speech TTS 语音列表已加载，共', this.synthesis.getVoices().length, '个语音');
        this.logAvailableVoices();
      };
    } else {
      this.voicesLoaded = true;
      console.log('🔊 Web Speech TTS 初始化成功');
      this.logAvailableVoices();
    }
  }

  // 记录可用的语音
  private logAvailableVoices(): void {
    const voices = this.synthesis.getVoices();
    const chineseVoices = voices.filter(v => v.lang.startsWith('zh'));
    console.log('📢 可用的中文语音:', chineseVoices.map(v => `${v.name} (${v.lang})`));
    console.log('📢 所有可用语音:', voices.map(v => `${v.name} (${v.lang})`));
  }

  async speak(request: TTSRequest): Promise<TTSResult> {
    return new Promise((resolve) => {
      try {
        this.stop();

        if (!request.text.trim()) {
          resolve({
            success: false,
            error: '文本内容为空'
          });
          return;
        }

        // 等待语音列表加载
        if (!this.voicesLoaded || this.synthesis.getVoices().length === 0) {
          console.log('⏳ 等待语音列表加载...');
          const checkVoices = setInterval(() => {
            if (this.synthesis.getVoices().length > 0) {
              clearInterval(checkVoices);
              this.voicesLoaded = true;
              this.doSpeak(request, resolve);
            }
          }, 100);
          
          // 超时处理
          setTimeout(() => {
            clearInterval(checkVoices);
            this.doSpeak(request, resolve);
          }, 3000);
        } else {
          this.doSpeak(request, resolve);
        }

      } catch (error) {
        console.error('❌ 语音合成失败:', error);
        resolve({
          success: false,
          error: error instanceof Error ? error.message : '未知错误'
        });
      }
    });
  }

  private doSpeak(request: TTSRequest, resolve: (result: TTSResult) => void): void {
    this.currentUtterance = new SpeechSynthesisUtterance(request.text);
    
    const volume = request.volume || this.voiceVolume;
    const speed = request.speed || this.voiceSpeed;
    const pitch = request.pitch || this.voicePitch;
    
    this.currentUtterance.rate = speed;
    this.currentUtterance.pitch = pitch;
    this.currentUtterance.volume = volume;
    this.currentUtterance.lang = 'zh-CN';

    console.log('🎵 语音合成参数:', {
      text: request.text.substring(0, 30) + '...',
      volume,
      speed,
      pitch,
      lang: 'zh-CN'
    });

    const chineseVoice = this.getChineseVoice();
    if (chineseVoice) {
      console.log('🎤 使用语音:', chineseVoice.name, '(' + chineseVoice.lang + ')');
      this.currentUtterance.voice = chineseVoice;
    } else {
      console.warn('⚠️ 未找到中文语音，使用默认语音');
    }

    this.currentUtterance.onstart = () => {
      console.log('🔊 开始播放语音');
      console.log('🔔 如果没有听到声音，请检查：1) 系统音量 2) 浏览器音量 3) 是否有其他程序占用音频');
    };

    this.currentUtterance.onend = () => {
      console.log('🔊 语音播放结束');
      this.currentUtterance = null;
      resolve({ success: true });
    };

    this.currentUtterance.onerror = (event) => {
      console.error('❌ 语音合成错误:', event.error, event);
      this.currentUtterance = null;
      resolve({
        success: false,
        error: event.error
      });
    };

    // 确保语音被播放
    this.synthesis.cancel();
    setTimeout(() => {
      this.synthesis.speak(this.currentUtterance!);
      console.log('📢 已调用 synthesis.speak()');
      
      // 如果浏览器阻止自动播放，尝试在用户交互后重新播放
      if (this.synthesis.speaking === false) {
        console.warn('⚠️ 语音可能被浏览器阻止，请点击页面任意位置后重试');
      }
    }, 100);
  }

  stop(): void {
    try {
      this.synthesis.cancel();
      this.currentUtterance = null;
      console.log('⏹️  已停止语音播放');
    } catch (error) {
      console.warn('⚠️  停止语音播放时出错:', error);
    }
  }

  isSupported(): boolean {
    return 'speechSynthesis' in window;
  }

  getVoices(): string[] {
    return this.synthesis.getVoices()
      .filter(voice => voice.lang.startsWith('zh') || voice.lang.startsWith('en'))
      .map(voice => voice.name);
  }

  private getChineseVoice(): SpeechSynthesisVoice | null {
    const voices = this.synthesis.getVoices();
    
    // 优先找简体中文语音
    let chineseVoice = voices.find(voice => voice.lang === 'zh-CN');
    if (chineseVoice) return chineseVoice;
    
    // 其次找任何中文语音
    chineseVoice = voices.find(voice => voice.lang.startsWith('zh'));
    if (chineseVoice) return chineseVoice;
    
    // 最后返回第一个语音
    return voices[0] || null;
  }

  setSpeed(speed: number): void {
    this.voiceSpeed = Math.max(0.5, Math.min(2.0, speed));
  }

  setPitch(pitch: number): void {
    this.voicePitch = Math.max(0.5, Math.min(2.0, pitch));
  }

  setVolume(volume: number): void {
    this.voiceVolume = Math.max(0, Math.min(1.0, volume));
  }
}
