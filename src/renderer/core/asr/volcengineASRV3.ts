// ==========================================
// 豆包语音 ASR 2.0 - WebSocket v3 双向流式接口
// 渲染进程版本：通过 IPC 与主进程通信
// 主进程使用 Node.js 的 ws 库，支持自定义 HTTP 头
// ==========================================

import type { ASRService, ASRRequest, ASRResult } from './asrInterface'

export interface VolcengineASRV3Config {
  appId: string
  accessToken: string
  apiUrl?: string
  resourceId?: string
  format?: string
  sampleRate?: number
  language?: string
}

export class VolcengineASRV3 implements ASRService {
  private config: VolcengineASRV3Config
  private isConnected: boolean = false
  private mediaRecorder: MediaRecorder | null = null
  private audioContext: AudioContext | null = null
  private audioSource: MediaStreamAudioSourceNode | null = null
  private audioProcessor: ScriptProcessorNode | null = null
  private isRecording: boolean = false
  private recognitionResult: string = ''
  private onResultCallback: ((result: ASRResult) => void) | null = null
  private onErrorCallback: ((error: string) => void) | null = null
  private onEndCallback: (() => void) | null = null

  constructor(config: VolcengineASRV3Config) {
    this.config = {
      apiUrl: 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async',
      resourceId: 'volc.seedasr.sauc.duration',
      format: 'pcm',
      sampleRate: 16000,
      language: 'zh-CN',
      ...config
    }

    this.setupEventListeners()

    console.log('🎤 豆包语音 ASR 2.0 初始化成功（WebSocket v3 IPC 版本）')
    console.log('📋 配置信息:', {
      apiUrl: this.config.apiUrl,
      resourceId: this.config.resourceId,
      format: this.config.format,
      sampleRate: this.config.sampleRate
    })
  }

  private setupEventListeners(): void {
    if (!window.electronAPI) {
      console.warn('⚠️ electronAPI 不可用，ASR 功能可能无法正常工作')
      return
    }

    window.electronAPI.on('asr-result', (data: { text: string; isFinal: boolean }) => {
      if (!data) {
        console.warn('⚠️ ASR 收到空数据')
        return
      }
      console.log('📨 ASR 识别结果:', data.text, 'isFinal:', data.isFinal)
      this.recognitionResult = data.text

      if (this.onResultCallback) {
        this.onResultCallback({
          success: true,
          text: data.text,
          confidence: 0.95
        })
      }
    })

    window.electronAPI.on('asr-complete', (data: { text: string }) => {
      console.log('✅ ASR 识别完成:', data.text)
      this.recognitionResult = data.text
      this.isRecording = false

      if (this.onEndCallback) {
        this.onEndCallback()
      }
    })

    window.electronAPI.on('asr-error', (data: { error: string }) => {
      console.error('❌ ASR 错误:', data.error)

      if (this.onErrorCallback) {
        this.onErrorCallback(data.error)
      }
    })
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  async initialize(): Promise<void> {
    if (!window.electronAPI) {
      throw new Error('electronAPI 不可用')
    }

    try {
      const result = await window.electronAPI.invoke('asr-v3-connect', this.config)
      if (!result.success) {
        throw new Error(result.error || 'ASR 连接失败')
      }
      this.isConnected = true
      console.log('✅ ASR WebSocket 连接成功')
    } catch (error) {
      console.error('❌ ASR 初始化失败:', error)
      throw error
    }
  }

  async startListening(
    onResult: (result: ASRResult) => void,
    onError?: (error: string) => void,
    onEnd?: () => void
  ): Promise<boolean> {
    try {
      console.log('🎤 开始录音并识别...')
      
      this.onResultCallback = onResult
      this.onErrorCallback = onError
      this.onEndCallback = onEnd
      this.recognitionResult = ''
      this.isRecording = true

      if (!this.isConnected) {
        await this.initialize()
      }

      const result = await window.electronAPI!.invoke('asr-v3-start-recognition', this.config)
      if (!result.success) {
        throw new Error(result.error || 'ASR 开始识别失败')
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: this.config.sampleRate,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      })

      this.audioContext = new AudioContext({ sampleRate: this.config.sampleRate })
      this.audioSource = this.audioContext.createMediaStreamSource(stream)
      
      const bufferSize = 4096
      this.audioProcessor = this.audioContext.createScriptProcessor(bufferSize, 1, 1)
      
      this.audioProcessor.onaudioprocess = async (event) => {
        if (!this.isRecording) return
        
        const inputData = event.inputBuffer.getChannelData(0)
        const int16Data = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]))
          int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
        }
        
        const audioBase64 = this.arrayBufferToBase64(int16Data.buffer)
        
        try {
          await window.electronAPI!.invoke('asr-v3-send-audio', this.config, audioBase64, false)
        } catch (error) {
          console.error('❌ 发送音频数据失败:', error)
        }
      }

      this.audioSource.connect(this.audioProcessor)
      this.audioProcessor.connect(this.audioContext.destination)
      
      console.log('🚀 录音已开始，实时发送音频流到豆包 ASR')
      return true

    } catch (error) {
      console.error('❌ 启动录音失败:', error)
      if (onError) {
        onError(error instanceof Error ? error.message : '启动录音失败')
      }
      return false
    }
  }

  async stopListening(): Promise<void> {
    if (!this.isRecording) return

    console.log('⏹️ 停止录音...')
    this.isRecording = false

    try {
      const emptyBase64 = ''
      await window.electronAPI!.invoke('asr-v3-send-audio', this.config, emptyBase64, true)
    } catch (error) {
      console.error('❌ 发送结束标记失败:', error)
    }

    if (this.audioProcessor) {
      this.audioProcessor.disconnect()
      this.audioProcessor = null
    }
    
    if (this.audioSource) {
      this.audioSource.disconnect()
      this.audioSource = null
    }
    
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }

    await window.electronAPI?.invoke('asr-v3-stop-recognition', this.config)
    this.isConnected = false

    // 手动触发 onEnd 回调，通知上层 ASR 已停止
    // 因为主进程 stopRecognition 是直接关闭 WebSocket，不会发送 asr-complete 事件
    if (this.onEndCallback) {
      console.log('📢 [ASR] 手动触发 onEnd 回调，识别结果:', this.recognitionResult)
      this.onEndCallback()
    }
  }

  async recognize(request: ASRRequest): Promise<ASRResult> {
    try {
      if (!request.audioData) {
        return { success: false, error: '未提供音频数据' }
      }

      console.log('🎤 开始识别音频数据...')
      this.recognitionResult = ''

      if (!this.isConnected) {
        await this.initialize()
      }

      const result = await window.electronAPI!.invoke('asr-v3-start-recognition', this.config)
      if (!result.success) {
        return { success: false, error: result.error || 'ASR 开始识别失败' }
      }

      let audioData: ArrayBuffer
      
      if (request.audioData instanceof Blob) {
        audioData = await request.audioData.arrayBuffer()
      } else if (request.audioData instanceof ArrayBuffer) {
        audioData = request.audioData
      } else {
        return { success: false, error: '不支持的音频数据格式' }
      }

      const segmentSize = this.config.sampleRate! * 0.2 * 2
      const totalSegments = Math.ceil(audioData.byteLength / segmentSize)
      
      for (let i = 0; i < totalSegments; i++) {
        const start = i * segmentSize
        const end = Math.min(start + segmentSize, audioData.byteLength)
        const segment = audioData.slice(start, end)
        const segmentBase64 = this.arrayBufferToBase64(segment)
        const isLast = i === totalSegments - 1
        
        await window.electronAPI!.invoke('asr-v3-send-audio', this.config, segmentBase64, isLast)
      }

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve({ success: false, error: 'ASR 识别超时' })
        }, 30000)

        const originalOnEnd = this.onEndCallback
        this.onEndCallback = () => {
          clearTimeout(timeout)
          this.onEndCallback = originalOnEnd
          resolve({
            success: true,
            text: this.recognitionResult,
            confidence: 0.95
          })
        }

        const originalOnError = this.onErrorCallback
        this.onErrorCallback = (error: string) => {
          clearTimeout(timeout)
          this.onErrorCallback = originalOnError
          resolve({ success: false, error })
        }
      })

    } catch (error) {
      console.error('❌ 识别失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '识别失败'
      }
    }
  }

  isSupported(): boolean {
    return !!this.config.appId && 
           !!this.config.accessToken && 
           !!window.electronAPI && 
           !!navigator.mediaDevices?.getUserMedia
  }

  getLanguages(): string[] {
    return ['zh-CN', 'en-US']
  }
}
