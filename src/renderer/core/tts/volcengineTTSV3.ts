// ==========================================
// 豆包语音 TTS 2.0 - WebSocket v3 双向流式接口
// 渲染进程版本：通过 IPC 与主进程通信
// 主进程使用 Node.js 的 ws 库，支持自定义 HTTP 头
// ==========================================

import type { TTSService, TTSRequest, TTSResult } from './ttsInterface'

export interface VolcengineTTSV3Config {
  appId: string
  accessToken: string
  apiUrl?: string
  resourceId?: string
  voice?: string
  model?: string
  format?: string
  sampleRate?: number
}

export class VolcengineTTSV3 implements TTSService {
  private config: VolcengineTTSV3Config
  private isConnected: boolean = false
  private currentSessionId: string = ''
  private audioChunks: string[] = []
  private onAudioChunkCallback: ((chunk: ArrayBuffer) => void) | null = null
  private onCompleteCallback: ((audio: ArrayBuffer) => void) | null = null
  private onErrorCallback: ((error: string) => void) | null = null

  // 防并发锁：正在合成中时拒绝新的合成请求
  private isSynthesizing: boolean = false

  // 静态单例：确保 IPC 监听器全局只注册一次
  private static listenersRegistered: boolean = false
  private static activeInstance: VolcengineTTSV3 | null = null

  private generateUUID(): string {
    return crypto.randomUUID()
  }

  constructor(config: VolcengineTTSV3Config) {
    this.config = {
      apiUrl: 'wss://openspeech.bytedance.com/api/v3/tts/bidirection',
      resourceId: 'seed-tts-2.0',
      voice: 'zh_female_vv_uranus_bigtts',
      model: 'seed-tts-2.0-expressive',
      format: 'mp3',
      sampleRate: 24000,
      ...config
    }

    // 标记当前实例为活跃实例
    VolcengineTTSV3.activeInstance = this

    // 全局只注册一次 IPC 监听器
    if (!VolcengineTTSV3.listenersRegistered) {
      VolcengineTTSV3.setupGlobalListeners()
      VolcengineTTSV3.listenersRegistered = true
    }

    console.log('🎤 豆包语音 TTS 2.0 初始化成功（WebSocket v3 IPC 版本）')
    console.log('📋 配置信息:', {
      apiUrl: this.config.apiUrl,
      resourceId: this.config.resourceId,
      voice: this.config.voice,
      model: this.config.model
    })
  }

  // 静态方法：全局只注册一次 IPC 监听器
  private static setupGlobalListeners(): void {
    if (!window.electronAPI) {
      console.warn('⚠️ electronAPI 不可用，TTS 功能可能无法正常工作')
      return
    }

    window.electronAPI.on('tts-session-started', (data: { sessionId: string }) => {
      const inst = VolcengineTTSV3.activeInstance
      if (inst) {
        console.log('✅ TTS 会话已开始:', data?.sessionId)
      }
    })

    window.electronAPI.on('tts-audio-chunk', (data: { sessionId: string; chunkBase64: string }) => {
      const inst = VolcengineTTSV3.activeInstance
      if (inst && data && data.sessionId === inst.currentSessionId) {
        inst.audioChunks.push(data.chunkBase64)
        if (inst.onAudioChunkCallback) {
          const chunkBuffer = inst.base64ToArrayBuffer(data.chunkBase64)
          inst.onAudioChunkCallback(chunkBuffer)
        }
      }
    })

    window.electronAPI.on('tts-audio-complete', (data: { sessionId: string; audioBase64: string; format: string }) => {
      const inst = VolcengineTTSV3.activeInstance
      if (!inst || !data) return
      if (data.sessionId !== inst.currentSessionId) return

      console.log('✅ TTS 音频合成完成, sessionId 匹配!')

      try {
        if (data.audioBase64 && inst.onCompleteCallback) {
          console.log('📦 [前端] 开始解码完整音频，base64 长度:', data.audioBase64.length)
          const audioBuffer = inst.base64ToArrayBuffer(data.audioBase64)
          console.log('✅ [前端] 音频解码成功，大小:', audioBuffer.byteLength, 'bytes')
          inst.onCompleteCallback(audioBuffer)
        }
      } catch (error) {
        if (inst.onErrorCallback) {
          inst.onErrorCallback('音频解码失败: ' + String(error))
        }
      }

      inst.audioChunks = []
    })

    window.electronAPI.on('tts-error', (data: { sessionId: string; error: string }) => {
      const inst = VolcengineTTSV3.activeInstance
      if (inst && data && data.sessionId === inst.currentSessionId) {
        console.error('❌ TTS 错误:', data.error)
        if (data.error.includes('session number limit') ||
            data.error.includes('WebSocket') ||
            data.error.includes('connect')) {
          inst.isConnected = false
        }
        if (inst.onErrorCallback) {
          inst.onErrorCallback(data.error)
        }
      }
    })

    console.log('🔧 [TTS] 全局 IPC 监听器已注册（仅一次）')
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes.buffer
  }

  async initialize(): Promise<void> {
    if (!window.electronAPI) {
      throw new Error('electronAPI 不可用')
    }

    try {
      const result = await window.electronAPI.invoke('tts-v3-connect', this.config)
      if (!result.success) {
        throw new Error(result.error || 'TTS 连接失败')
      }
      this.isConnected = true
      console.log('✅ TTS WebSocket 连接成功')
    } catch (error) {
      console.error('❌ TTS 初始化失败:', error)
      throw error
    }
  }

  async synthesize(request: TTSRequest): Promise<TTSResult> {
    // 防并发锁：如果正在合成中，直接返回错误
    if (this.isSynthesizing) {
      console.warn('⚠️ [VolcengineTTSV3] 上一次合成尚未完成，忽略本次重复调用')
      return { success: false, error: '上一次 TTS 合成尚未完成' }
    }
    this.isSynthesizing = true

    try {
      if (!this.isConnected) {
        await this.initialize()
      }

      this.audioChunks = []
      this.currentSessionId = ''

      console.log('🎤 [VolcengineTTSV3] 开始 TTS 合成:', request.text.substring(0, 50) + '...')

      const sessionId = this.generateUUID()
      this.currentSessionId = sessionId
      console.log('🎯 [VolcengineTTSV3] 生成 sessionId:', sessionId)

      return new Promise<TTSResult>((resolve) => {
        this.onCompleteCallback = (audioBuffer: ArrayBuffer) => {
          console.log('🔔 [VolcengineTTSV3] onCompleteCallback 被调用，音频大小:', audioBuffer.byteLength)
          this.onCompleteCallback = null
          this.onErrorCallback = null
          this.isSynthesizing = false
          resolve({
            success: true,
            audioData: audioBuffer
          })
        }

        this.onErrorCallback = (error: string) => {
          console.error('❌ [VolcengineTTSV3] onErrorCallback 被调用:', error)
          this.onCompleteCallback = null
          this.onErrorCallback = null
          this.isSynthesizing = false

          if (error.includes('session number limit') ||
              error.includes('WebSocket') ||
              error.includes('connect')) {
            console.log('🔄 [VolcengineTTSV3] 检测到连接/会话错误，重置连接状态')
            this.isConnected = false
          }

          resolve({ success: false, error })
        }

        console.log('✅ [VolcengineTTSV3] 回调已设置，准备发送合成请求...')

        window.electronAPI!.invoke('tts-v3-synthesize', this.config, request.text, { sessionId })
          .catch((error) => {
            console.error('❌ TTS 合成请求失败:', error)
            this.onCompleteCallback = null
            this.onErrorCallback = null
            this.isSynthesizing = false
            resolve({ success: false, error: error instanceof Error ? error.message : 'TTS 合成失败' })
          })

        console.log('✅ [VolcengineTTSV3] TTS 合成请求已发送，等待响应...')
      })
    } catch (error) {
      console.error('❌ TTS 合成失败:', error)
      this.onCompleteCallback = null
      this.onErrorCallback = null
      this.isSynthesizing = false
      return { success: false, error: error instanceof Error ? error.message : 'TTS 合成失败' }
    }
  }

  async synthesizeStream(
    request: TTSRequest,
    onChunk: (chunk: ArrayBuffer) => void,
    onComplete: (audio: ArrayBuffer) => void,
    onError: (error: string) => void
  ): Promise<void> {
    this.onAudioChunkCallback = onChunk
    this.onCompleteCallback = onComplete
    this.onErrorCallback = onError

    const result = await this.synthesize(request)
    if (!result.success) {
      onError(result.error || 'TTS 合成失败')
    }
  }

  async speak(request: TTSRequest): Promise<TTSResult> {
    return this.synthesize(request)
  }

  stop(): void {
    if (window.electronAPI) {
      window.electronAPI.invoke('tts-v3-disconnect')
      this.isConnected = false
    }
  }

  isSupported(): boolean {
    return !!this.config.appId &&
           !!this.config.accessToken &&
           !!window.electronAPI
  }

  getVoices(): string[] {
    return [
      'zh_female_vv_uranus_bigtts',
      'zh_male_chunshui_uranus_bigtts',
      'zh_female_tianmei_uranus_bigtts'
    ]
  }

  setVoice(voiceId: string): void {
    this.config.voice = voiceId
    console.log('🎤 TTS 音色已切换:', voiceId)
  }
}