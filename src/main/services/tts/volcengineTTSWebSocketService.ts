// ==========================================
// 豆包语音 TTS WebSocket v3 服务（主进程）
// 使用 Node.js 的 ws 库，支持自定义 HTTP 头
// ==========================================

import WebSocket from 'ws'
import crypto from 'crypto'
import { BrowserWindow } from 'electron'

// 使用 Node.js 内置的 crypto 生成 UUID（避免 ESM 兼容性问题）
const uuidv4 = () => crypto.randomUUID()

// ==========================================
// TTS 协议定义（根据官方 TypeScript 示例）
// ==========================================

export enum TTSMsgType {
  Invalid = 0,
  FullClientRequest = 0b1,
  AudioOnlyClient = 0b10,
  FullServerResponse = 0b1001,
  AudioOnlyServer = 0b1011,
  Error = 0b1111
}

export enum TTSMsgTypeFlagBits {
  NoSeq = 0,
  PositiveSeq = 0b1,
  LastNoSeq = 0b10,
  NegativeSeq = 0b11,
  WithEvent = 0b100
}

export enum TTSEventType {
  None = 0,
  StartConnection = 1,
  FinishConnection = 2,
  ConnectionStarted = 50,
  ConnectionFailed = 51,
  ConnectionFinished = 52,
  StartSession = 100,
  CancelSession = 101,
  FinishSession = 102,
  SessionStarted = 150,
  SessionCanceled = 151,
  SessionFinished = 152,
  SessionFailed = 153,
  TaskRequest = 200,
  TTSSentenceStart = 350,
  TTSSentenceEnd = 351,
  TTSResponse = 352
}

// ==========================================
// TTS WebSocket 客户端
// ==========================================

export interface TTSConfig {
  appId: string
  accessToken: string
  resourceId: string
  apiUrl: string
  voice: string
  model: string
  format: string
  sampleRate: number
}

export class VolcengineTTSWebSocketService {
  private ws: WebSocket | null = null
  private config: TTSConfig
  private sessionId: string = ''
  private mainWindow: BrowserWindow | null = null
  private audioChunks: Buffer[] = []
  private isConnecting: boolean = false
  private sessionStartedResolver: (() => void) | null = null
  private sessionStartedRejecter: ((error: Error) => void) | null = null
  private sessionFinishedResolver: (() => void) | null = null
  private sessionFinishedRejecter: ((error: Error) => void) | null = null
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 5
  private reconnectDelay: number = 1000
  private isReconnecting: boolean = false

  constructor(config: TTSConfig) {
    this.config = config
    console.log('🎤 [Main] TTS WebSocket 服务初始化')
  }

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window
  }

  private buildTTSMessage(
    msgType: TTSMsgType,
    flagBits: TTSMsgTypeFlagBits,
    event: TTSEventType,
    payload: object,
    sessionId?: string,
    sequence?: number
  ): Buffer {
    const header = Buffer.alloc(4)
    header[0] = (1 << 4) | 1
    header[1] = (msgType << 4) | flagBits
    header[2] = (1 << 4) | 0
    header[3] = 0

    const parts: Buffer[] = [header]

    if (flagBits & TTSMsgTypeFlagBits.WithEvent) {
      const eventBuf = Buffer.alloc(4)
      eventBuf.writeInt32BE(event, 0)
      parts.push(eventBuf)

      if (event !== TTSEventType.StartConnection &&
          event !== TTSEventType.FinishConnection &&
          event !== TTSEventType.ConnectionStarted &&
          event !== TTSEventType.ConnectionFailed &&
          event !== TTSEventType.ConnectionFinished) {
        const sidStr = sessionId || ''
        const sidBuf = Buffer.from(sidStr, 'utf-8')
        const sidLenBuf = Buffer.alloc(4)
        sidLenBuf.writeUInt32BE(sidBuf.length, 0)
        parts.push(sidLenBuf)
        parts.push(sidBuf)
      }
    }

    if ((flagBits & TTSMsgTypeFlagBits.PositiveSeq || flagBits & TTSMsgTypeFlagBits.NegativeSeq) && sequence !== undefined) {
      const seqBuf = Buffer.alloc(4)
      seqBuf.writeInt32BE(sequence, 0)
      parts.push(seqBuf)
    }

    const payloadJson = JSON.stringify(payload)
    const payloadBuf = Buffer.from(payloadJson, 'utf-8')
    const payloadSizeBuf = Buffer.alloc(4)
    payloadSizeBuf.writeUInt32BE(payloadBuf.length, 0)
    parts.push(payloadSizeBuf)
    parts.push(payloadBuf)

    return Buffer.concat(parts)
  }

  private parseTTSMessage(data: Buffer): { type: TTSMsgType; event: TTSEventType; payload: Buffer; serialNumber: number } {
    const versionAndHS = data[0]
    const typeAndFlag = data[1]
    const serAndComp = data[2]
    const headerSize = (versionAndHS & 0x0f) * 4

    const msgType = (typeAndFlag >> 4) as TTSMsgType
    const flagBits = (typeAndFlag & 0x0f) as TTSMsgTypeFlagBits

    let offset = headerSize
    let event = TTSEventType.None
    let serialNumber = 0
    let payload = Buffer.alloc(0)

    if (flagBits & TTSMsgTypeFlagBits.WithEvent) {
      event = data.readInt32BE(offset); offset += 4

      if (event !== TTSEventType.StartConnection && event !== TTSEventType.FinishConnection &&
          event !== TTSEventType.ConnectionStarted && event !== TTSEventType.ConnectionFailed &&
          event !== TTSEventType.ConnectionFinished) {
        const sidLen = data.readUInt32BE(offset); offset += 4
        offset += sidLen
      }

      if (event === TTSEventType.ConnectionStarted || event === TTSEventType.ConnectionFailed ||
          event === TTSEventType.ConnectionFinished) {
        const connIdLen = data.readUInt32BE(offset); offset += 4
        offset += connIdLen
      }
    }

    if (msgType === TTSMsgType.AudioOnlyServer || msgType === TTSMsgType.AudioOnlyClient ||
        msgType === TTSMsgType.FullClientRequest || msgType === TTSMsgType.FullServerResponse) {
      if (flagBits & TTSMsgTypeFlagBits.PositiveSeq || flagBits & TTSMsgTypeFlagBits.NegativeSeq) {
        serialNumber = data.readInt32BE(offset); offset += 4
      }
    }

    if (msgType === TTSMsgType.Error) {
      const errorCode = data.readUInt32BE(offset); offset += 4
      console.error('❌ [Main] TTS 服务端错误码:', errorCode)
    }

    const payloadSize = data.readUInt32BE(offset); offset += 4
    payload = data.slice(offset, offset + payloadSize)

    return { type: msgType, event, payload, serialNumber }
  }

  async connect(): Promise<boolean> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return true
    }

    if (this.isConnecting) {
      console.log('🔄 [Main] TTS 连接正在进行中，等待完成')
      // 等待当前连接完成
      return new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
          if (!this.isConnecting) {
            clearInterval(checkInterval)
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
              resolve(true)
            } else {
              reject(new Error('连接失败'))
            }
          }
        }, 100)
        
        // 超时处理
        setTimeout(() => {
          clearInterval(checkInterval)
          reject(new Error('连接超时'))
        }, 30000)
      })
    }

    return new Promise((resolve, reject) => {
      try {
        this.isConnecting = true
        
        const headers = {
          'X-Api-App-Key': this.config.appId,
          'X-Api-Access-Key': this.config.accessToken,
          'X-Api-Resource-Id': this.config.resourceId,
          'X-Api-Connect-Id': uuidv4()
        }

        console.log('🔌 [Main] TTS WebSocket 连接中...')
        console.log('📋 [Main] TTS 完整配置:', JSON.stringify({
          appId: this.config.appId,
          resourceId: this.config.resourceId,
          voice: this.config.voice,
          apiUrl: this.config.apiUrl
        }, null, 2))
        console.log('📋 [Main] 请求头:', JSON.stringify(headers, null, 2))

        this.ws = new WebSocket(this.config.apiUrl, {
          headers,
          skipUTF8Validation: true
        })

        this.ws.on('open', () => {
          console.log('✅ [Main] TTS WebSocket 连接成功')
          this.isConnecting = false
          this.reconnectAttempts = 0 // 重置重连次数
          
          this.ws!.send(this.buildTTSMessage(TTSMsgType.FullClientRequest, TTSMsgTypeFlagBits.WithEvent, TTSEventType.StartConnection, {}))
          console.log('📤 [Main] TTS 已发送 StartConnection (event=1)')
        })

        this.ws.on('message', (data: Buffer) => {
          console.log('📨 [Main] TTS 收到消息:', data.length, 'bytes')
          console.log('📝 [Main] 消息头部 (hex):', data.slice(0, 16).toString('hex'))
          
          const msg = this.parseTTSMessage(data)
          console.log('📝 [Main] 解析结果:', { type: msg.type, event: msg.event, serialNumber: msg.serialNumber, payloadSize: msg.payload.length })
          
          if (msg.type === TTSMsgType.FullServerResponse) {
            if (msg.event === TTSEventType.ConnectionStarted) {
              console.log('✅ [Main] TTS 连接已建立 (event=101)')
              resolve(true)
            } else if (msg.event === TTSEventType.SessionStarted) {
              console.log('✅ [Main] TTS 会话已开始 (event=201)')
              this.mainWindow?.webContents.send('tts-session-started', { sessionId: this.sessionId })
              if (this.sessionStartedResolver) {
                this.sessionStartedResolver()
                this.sessionStartedResolver = null
                this.sessionStartedRejecter = null
              }
            } else if (msg.event === TTSEventType.SessionFinished) {
              console.log('✅ [Main] TTS 会话已完成 (event=202)')
              const audioBuffer = Buffer.concat(this.audioChunks)
              const base64Audio = audioBuffer.toString('base64')
              console.log('📤 [Main] TTS 发送 tts-audio-complete 事件, sessionId:', this.sessionId, 'audioSize:', audioBuffer.length, 'bytes')
              this.mainWindow?.webContents.send('tts-audio-complete', {
                sessionId: this.sessionId,
                audioBase64: base64Audio,
                format: this.config.format
              })
              console.log('📤 [Main] TTS tts-audio-complete 事件已发送')
              this.audioChunks = []
              if (this.sessionFinishedResolver) {
                this.sessionFinishedResolver()
                this.sessionFinishedResolver = null
                this.sessionFinishedRejecter = null
              }
            }
          } else if (msg.type === TTSMsgType.AudioOnlyServer) {
            console.log('📨 [Main] TTS 收到音频块:', msg.payload.length, 'bytes')
            this.audioChunks.push(msg.payload)
            this.mainWindow?.webContents.send('tts-audio-chunk', { 
              sessionId: this.sessionId,
              chunkBase64: msg.payload.toString('base64')
            })
          } else if (msg.type === TTSMsgType.Error) {
            console.error('❌ [Main] TTS 服务端错误:', msg.payload.toString())
            this.mainWindow?.webContents.send('tts-error', { 
              sessionId: this.sessionId,
              error: msg.payload.toString()
            })
          }
        })

        this.ws.on('error', (error) => {
          console.error('❌ [Main] TTS WebSocket 错误:', error)
          this.isConnecting = false
          reject(error)
        })

        this.ws.on('close', (code, reason) => {
          console.log(`🔌 [Main] TTS WebSocket 连接关闭，code: ${code}, reason: ${reason}`)
          this.isConnecting = false
          
          // 自动重连（排除主动关闭的情况）
          if (code !== 1000 && !this.isReconnecting) {
            console.log('🔄 [Main] TTS 连接意外关闭，准备重连')
            this.reconnect().catch(error => {
              console.error('❌ [Main] TTS 重连失败:', error)
            })
          }
        })

      } catch (error) {
        console.error('❌ [Main] TTS 连接失败:', error)
        this.isConnecting = false
        reject(error)
      }
    })
  }

  async synthesize(text: string, externalSessionId?: string): Promise<string> {
    let needsReconnect = false

    try {
      // 只有在连接异常时才重连，避免每次都断开重连影响性能
      // readyState: 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
      const state = this.ws?.readyState ?? -1
      if (state !== WebSocket.OPEN) {
        console.log('🔄 [Main] TTS 连接未打开，正在连接...')
        await this.connect()
      } else {
        console.log('✅ [Main] TTS 连接已打开，直接使用现有连接')
      }

      this.sessionId = externalSessionId || uuidv4()
      this.audioChunks = []

      const startSessionPayload = {
        user: { uid: uuidv4() },
        req_params: {
          speaker: this.config.voice,
          audio_params: {
            format: this.config.format,
            sample_rate: this.config.sampleRate,
            enable_timestamp: true
          },
          additions: JSON.stringify({ disable_markdown_filter: false })
        },
        event: TTSEventType.StartSession
      }

      this.ws!.send(this.buildTTSMessage(TTSMsgType.FullClientRequest, TTSMsgTypeFlagBits.WithEvent, TTSEventType.StartSession, startSessionPayload, this.sessionId))
      console.log('📤 [Main] TTS 已发送 StartSession (event=100, sessionId=%s)', this.sessionId)

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.log('⚠️ [Main] TTS 等待 SessionStarted 超时，继续发送 TaskRequest')
          this.sessionStartedResolver = null
          this.sessionStartedRejecter = null
          resolve()
        }, 5000)

        this.sessionStartedResolver = () => {
          clearTimeout(timeout)
          console.log('✅ [Main] TTS 收到 SessionStarted 响应')
          this.sessionStartedResolver = null
          this.sessionStartedRejecter = null
          resolve()
        }
        this.sessionStartedRejecter = reject
      })

      const sentences = text.split('。').filter(s => s.trim().length > 0)

      for (const sentence of sentences) {
        for (const char of sentence) {
          const taskPayload = {
            user: { uid: uuidv4() },
            req_params: {
              speaker: this.config.voice,
              text: char,
              audio_params: {
                format: this.config.format,
                sample_rate: this.config.sampleRate,
                enable_timestamp: true
              },
              additions: JSON.stringify({ disable_markdown_filter: false })
            },
            event: TTSEventType.TaskRequest
          }
          this.ws!.send(this.buildTTSMessage(TTSMsgType.FullClientRequest, TTSMsgTypeFlagBits.WithEvent, TTSEventType.TaskRequest, taskPayload, this.sessionId))
          console.log('📤 [Main] TTS 发送 TaskRequest (event=3, text="%s")', char)
          await new Promise(r => setTimeout(r, 10))
        }
      }

      const finishSessionPayload = {
        user: { uid: uuidv4() }
      }
      this.ws!.send(this.buildTTSMessage(TTSMsgType.FullClientRequest, TTSMsgTypeFlagBits.WithEvent, TTSEventType.FinishSession, finishSessionPayload, this.sessionId))
      console.log('📤 [Main] TTS 已发送 FinishSession (event=102)')

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.log('⚠️ [Main] TTS 等待 SessionFinished 超时')
          this.sessionFinishedResolver = null
          this.sessionFinishedRejecter = null
          resolve()
        }, 30000)

        this.sessionFinishedResolver = () => {
          clearTimeout(timeout)
          console.log('✅ [Main] TTS 收到 SessionFinished 响应，音频接收完成')
          this.sessionFinishedResolver = null
          this.sessionFinishedRejecter = null
          resolve()
        }
        this.sessionFinishedRejecter = reject
      })

      return this.sessionId

    } catch (error) {
      console.error('❌ [Main] TTS 合成失败:', error)
      // 失败时标记需要重连，下次调用时会建立全新连接
      needsReconnect = true
      throw error
    } finally {
      // 如果出错或异常，关闭当前连接确保干净状态
      if (needsReconnect && this.ws) {
        console.log('🧹 [Main] TTS 合成异常，清理 WebSocket 连接')
        try { this.ws.close() } catch(e) { /* 忽略 */ }
        this.ws = null
      }
    }
  }

  private async reconnect(): Promise<boolean> {
    if (this.isReconnecting || this.reconnectAttempts >= this.maxReconnectAttempts) {
      return false
    }

    this.isReconnecting = true
    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1) // 指数退避

    console.log(`🔄 [Main] TTS 尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})，延迟 ${delay}ms`)

    return new Promise((resolve) => {
      setTimeout(async () => {
        try {
          const success = await this.connect()
          if (success) {
            console.log('✅ [Main] TTS 重连成功')
            this.reconnectAttempts = 0
            this.isReconnecting = false
            resolve(true)
          } else {
            console.warn('⚠️ [Main] TTS 重连失败')
            this.isReconnecting = false
            resolve(false)
          }
        } catch (error) {
          console.error('❌ [Main] TTS 重连错误:', error)
          this.isReconnecting = false
          resolve(false)
        }
      }, delay)
    })
  }

  disconnect() {
    if (this.ws) {
      this.ws.send(this.buildTTSMessage(TTSMsgType.FullClientRequest, TTSMsgTypeFlagBits.WithEvent, TTSEventType.FinishConnection, {}))
      setTimeout(() => {
        this.ws?.close()
        this.ws = null
      }, 500)
    }
  }
}

// ==========================================
// 服务实例管理
// ==========================================

let ttsService: VolcengineTTSWebSocketService | null = null

export function getTTSService(config: TTSConfig, mainWindow: BrowserWindow): VolcengineTTSWebSocketService {
  if (!ttsService) {
    ttsService = new VolcengineTTSWebSocketService(config)
  }
  ttsService.setMainWindow(mainWindow)
  return ttsService
}
