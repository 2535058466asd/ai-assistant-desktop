import { loadRealtimeCallConfig, type RealtimeCallConfig } from '../../config/realtimeCallConfig';
import { createLogger } from '../../../shared/logger';

const logger = createLogger('asr');
const INPUT_SAMPLE_RATE = 16000;

export type RealtimeCallState = 'idle' | 'connecting' | 'connected' | 'error';

export interface RealtimeCallCallbacks {
  onStateChange?: (state: RealtimeCallState) => void;
  onError?: (error: string) => void;
  onEvent?: (event: string) => void;
}

class RealtimeCallMode {
  private state: RealtimeCallState = 'idle';
  private callbacks: RealtimeCallCallbacks = {};
  private mediaStream: MediaStream | null = null;
  private inputAudioContext: AudioContext | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private inputProcessor: ScriptProcessorNode | null = null;
  private outputAudioContext: AudioContext | null = null;
  private nextPlaybackTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private isRecording = false;

  setCallbacks(callbacks: RealtimeCallCallbacks): void {
    this.callbacks = callbacks;
  }

  getState(): RealtimeCallState {
    return this.state;
  }

  async toggle(): Promise<boolean> {
    if (this.state === 'connected' || this.state === 'connecting') {
      await this.stop();
      return false;
    }

    await this.start();
    return true;
  }

  async start(): Promise<void> {
    const config = loadRealtimeCallConfig();
    const missing = this.getMissingConfig(config);
    if (missing.length > 0) {
      throw new Error(`实时通话配置不完整：${missing.join('、')}`);
    }

    this.setState('connecting');
    this.emitEvent('正在连接豆包端到端实时语音 WebSocket');

    try {
      this.registerIpcListeners();
      const result = await window.electronAPI.realtimeDialogConnect(config);
      if (!result.success) throw new Error(result.error || '实时语音连接失败');

      await this.startMicrophone();
      this.setState('connected');
      this.emitEvent('豆包实时语音通话已连接');
    } catch (error) {
      const message = error instanceof Error ? error.message : '实时通话启动失败';
      logger.error('实时通话启动失败', { error: message });
      this.callbacks.onError?.(message);
      await this.stop();
      this.setState('error');
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.isRecording = false;

    if (this.inputProcessor) {
      this.inputProcessor.disconnect();
      this.inputProcessor = null;
    }
    if (this.inputSource) {
      this.inputSource.disconnect();
      this.inputSource = null;
    }
    if (this.inputAudioContext) {
      await this.inputAudioContext.close().catch(() => {});
      this.inputAudioContext = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    this.clearPlaybackQueue();
    await window.electronAPI.realtimeDialogDisconnect().catch(() => {});
    this.setState('idle');
    this.emitEvent('实时通话已结束');
  }

  private async startMicrophone(): Promise<void> {
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    this.inputAudioContext = new AudioContext();
    this.inputSource = this.inputAudioContext.createMediaStreamSource(this.mediaStream);
    this.inputProcessor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);
    this.isRecording = true;

    this.inputProcessor.onaudioprocess = (event) => {
      if (!this.isRecording || !this.inputAudioContext) return;
      const input = event.inputBuffer.getChannelData(0);
      const resampled = this.resample(input, this.inputAudioContext.sampleRate, INPUT_SAMPLE_RATE);
      const pcm = this.floatToInt16(resampled);
      window.electronAPI.realtimeDialogSendAudio(this.arrayBufferToBase64(pcm.buffer as ArrayBuffer)).catch((error) => {
        logger.error('发送实时语音音频失败', { error });
      });
    };

    this.inputSource.connect(this.inputProcessor);
    this.inputProcessor.connect(this.inputAudioContext.destination);
  }

  private registerIpcListeners(): void {
    window.electronAPI.on('realtime-dialog-audio', (data: { audioBase64: string; sampleRate: number }) => {
      this.playFloat32Pcm(data.audioBase64, data.sampleRate || 24000).catch((error) => {
        logger.error('播放实时语音音频失败', { error });
      });
    });

    window.electronAPI.on('realtime-dialog-event', (data: { event: number; payload?: any }) => {
      this.emitEvent(`实时语音事件：${data.event}`);
      if (data.event === 450 || data.event === 350) {
        this.clearPlaybackQueue();
      }
    });

    window.electronAPI.on('realtime-dialog-error', (data: { error: string }) => {
      this.callbacks.onError?.(data.error);
      this.setState('error');
    });
  }

  private async playFloat32Pcm(audioBase64: string, sampleRate: number): Promise<void> {
    if (!this.outputAudioContext) {
      this.outputAudioContext = new AudioContext({ sampleRate });
      this.nextPlaybackTime = this.outputAudioContext.currentTime;
    }
    if (this.outputAudioContext.state === 'suspended') {
      await this.outputAudioContext.resume();
    }

    const bytes = this.base64ToUint8Array(audioBase64);
    const floatData = new Float32Array(bytes.buffer as ArrayBuffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4));
    const audioBuffer = this.outputAudioContext.createBuffer(1, floatData.length, sampleRate);
    audioBuffer.copyToChannel(floatData, 0);

    const source = this.outputAudioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.outputAudioContext.destination);
    source.onended = () => {
      this.activeSources = this.activeSources.filter((item) => item !== source);
    };

    const startAt = Math.max(this.outputAudioContext.currentTime, this.nextPlaybackTime);
    source.start(startAt);
    this.nextPlaybackTime = startAt + audioBuffer.duration;
    this.activeSources.push(source);
  }

  private clearPlaybackQueue(): void {
    this.activeSources.forEach((source) => {
      try {
        source.stop();
      } catch (_) {}
    });
    this.activeSources = [];
    if (this.outputAudioContext) {
      this.nextPlaybackTime = this.outputAudioContext.currentTime;
    }
  }

  private getMissingConfig(config: RealtimeCallConfig): string[] {
    const missing: string[] = [];
    if (!config.appId) missing.push('端到端语音 App ID');
    if (!config.accessKey) missing.push('端到端语音 Access Key');
    return missing;
  }

  private resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
    if (fromRate === toRate) return input.slice();
    const ratio = fromRate / toRate;
    const outputLength = Math.floor(input.length / ratio);
    const output = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const sourceIndex = i * ratio;
      const before = Math.floor(sourceIndex);
      const after = Math.min(before + 1, input.length - 1);
      const weight = sourceIndex - before;
      output[i] = input[before] * (1 - weight) + input[after] * weight;
    }

    return output;
  }

  private floatToInt16(input: Float32Array): Int16Array {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return output;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  private base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  private setState(state: RealtimeCallState): void {
    if (this.state === state) return;
    this.state = state;
    this.callbacks.onStateChange?.(state);
  }

  private emitEvent(event: string): void {
    logger.info('实时通话事件', { event });
    this.callbacks.onEvent?.(event);
  }
}

let realtimeCallModeInstance: RealtimeCallMode | null = null;

export function getRealtimeCallMode(): RealtimeCallMode {
  if (!realtimeCallModeInstance) {
    realtimeCallModeInstance = new RealtimeCallMode();
  }
  return realtimeCallModeInstance;
}
