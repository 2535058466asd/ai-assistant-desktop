// ==========================================
// 豆包语音 ASR 2.0 - WebSocket v3 双向流式接口
// 渲染进程版本：通过 IPC 与主进程通信
// 主进程使用 Node.js 的 ws 库，支持自定义 HTTP 头
// ==========================================

import type { ASRService, ASRRequest, ASRResult } from './asrInterface'
import { createLogger } from '../../../shared/logger'

const logger = createLogger('asr')

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
  private static activeInstance: VolcengineASRV3 | null = null
  private static listenersRegistered = false
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

    logger.debug('🎤 豆包语音 ASR 2.0 初始化成功（WebSocket v3 IPC 版本）')
    logger.debug('📋 配置信息:', {
      apiUrl: this.config.apiUrl,
      resourceId: this.config.resourceId,
      format: this.config.format,
      sampleRate: this.config.sampleRate
    })
  }

  private setupEventListeners(): void {
    VolcengineASRV3.activeInstance = this

    if (!window.electronAPI) {
      logger.warn('⚠️ electronAPI 不可用，ASR 功能可能无法正常工作')
      return
    }

    if (VolcengineASRV3.listenersRegistered) {
      return
    }

    VolcengineASRV3.listenersRegistered = true

    window.electronAPI.on('asr-result', (data: { text: string; isFinal: boolean }) => {
      const instance = VolcengineASRV3.activeInstance
      if (!instance) return
      if (!data) {
        logger.warn('⚠️ ASR 收到空数据')
        return
      }
      logger.debug('📨 ASR 识别结果:', data.text, 'isFinal:', data.isFinal)
      instance.recognitionResult = data.text

      if (instance.onResultCallback) {
        instance.onResultCallback({
          success: true,
          text: data.text,
          confidence: 0.95
        })
      }
    })

    window.electronAPI.on('asr-complete', (data: { text: string }) => {
      const instance = VolcengineASRV3.activeInstance
      if (!instance) return
      logger.debug('✅ ASR 识别完成:', data.text)
      instance.recognitionResult = data.text
      instance.isRecording = false

      if (instance.onEndCallback) {
        instance.onEndCallback()
      }
    })

    window.electronAPI.on('asr-error', (data: { error: string }) => {
      const instance = VolcengineASRV3.activeInstance
      if (!instance) return
      logger.error('❌ ASR 错误:', data.error)

      if (instance.onErrorCallback) {
        instance.onErrorCallback(data.error)
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
      const result = await window.electronAPI.asrV3Connect(this.config)
      if (!result.success) {
        throw new Error(result.error || 'ASR 连接失败')
      }
      this.isConnected = true
      logger.debug('✅ ASR WebSocket 连接成功')
    } catch (error) {
      logger.error('❌ ASR 初始化失败:', error)
      throw error
    }
  }

  async startListening(
    onResult: (result: ASRResult) => void,
    onError?: (error: string) => void,
    onEnd?: () => void
  ): Promise<boolean> {
    try {
      logger.debug('🎤 开始录音并识别...')
      
      this.onResultCallback = onResult ?? null
      this.onErrorCallback = onError ?? null
      this.onEndCallback = onEnd ?? null
      this.recognitionResult = ''
      this.isRecording = true

      if (!this.isConnected) {
        await this.initialize()
      }

      const result = await window.electronAPI!.asrV3StartRecognition(this.config)
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
      await window.electronAPI!.asrV3SendAudio(this.config, audioBase64, false)
        } catch (error) {
          logger.error('❌ 发送音频数据失败:', error)
        }
      }

      this.audioSource.connect(this.audioProcessor)
      this.audioProcessor.connect(this.audioContext.destination)
      
      logger.debug('🚀 录音已开始，实时发送音频流到豆包 ASR')
      return true

    } catch (error) {
      logger.error('❌ 启动录音失败:', error)
      if (onError) {
        onError(error instanceof Error ? error.message : '启动录音失败')
      }
      return false
    }
  }

  async stopListening(): Promise<void> {
    if (!this.isRecording) return

    logger.debug('⏹️ 停止录音...')
    this.isRecording = false

    // ★ 关键修复：立即保存并置空回调，防止 asr-complete IPC 事件和手动触发重复调用
    // 根因：发送 isLast=true 后，服务端会返回 isLastPackage=true 的响应，
    // 主进程 ws.on('message') 会发送 asr-complete IPC 事件到渲染进程，
    // 而 stopListening() 最后又会手动触发 onEndCallback，导致 sendToAI 被调用两次
    const cb = this.onEndCallback
    this.onEndCallback = null

    try {
      const emptyBase64 = ''
      await window.electronAPI!.asrV3SendAudio(this.config, emptyBase64, true)
    } catch (error) {
      logger.error('❌ 发送结束标记失败:', error)
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

    try {
      await window.electronAPI?.asrV3StopRecognition(this.config)
    } catch (error) {
      logger.error('❌ 停止识别失败:', error)
    }
    this.isConnected = false

    // 手动触发 onEnd 回调（如果 asr-complete 事件还没触发的话）
    // 此时 onEndCallback 已为 null，asr-complete 事件到达时不会再触发
    if (cb) {
      logger.debug('📢 [ASR] 手动触发 onEnd 回调，识别结果:', this.recognitionResult)
      cb()
    }
  }

  async recognize(request: ASRRequest): Promise<ASRResult> {
    try {
      if (!request.audioData) {
        return { success: false, error: '未提供音频数据' }
      }

      logger.debug('🎤 开始识别音频数据...')
      this.recognitionResult = ''

      if (!this.isConnected) {
        await this.initialize()
      }

      const result = await window.electronAPI!.asrV3StartRecognition(this.config)
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
        
      await window.electronAPI!.asrV3SendAudio(this.config, segmentBase64, isLast)
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
      logger.error('❌ 识别失败:', error)
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
