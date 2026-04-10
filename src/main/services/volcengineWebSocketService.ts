// ==========================================
// 豆包语音 WebSocket v3 服务（主进程）
// 使用 Node.js 的 ws 库，支持自定义 HTTP 头
// 参考官方示例：
// - TTS: volcengine_bidirection_demo
// - ASR: sauc_python
// ==========================================

import WebSocket from 'ws'
import crypto from 'crypto'
import zlib from 'zlib'
import { BrowserWindow } from 'electron'

// 使用 Node.js 内置的 crypto 生成 UUID（避免 ESM 兼容性问题）
const uuidv4 = () => crypto.randomUUID()

// ==========================================
// TTS 协议定义（根据官方 TypeScript 示例）
// ==========================================

enum TTSMsgType {
  Invalid = 0,
  FullClientRequest = 0b1,
  AudioOnlyClient = 0b10,
  FullServerResponse = 0b1001,
  AudioOnlyServer = 0b1011,
  Error = 0b1111
}

enum TTSMsgTypeFlagBits {
  NoSeq = 0,
  PositiveSeq = 0b1,
  LastNoSeq = 0b10,
  NegativeSeq = 0b11,
  WithEvent = 0b100
}

enum TTSEventType {
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
// ASR 协议定义（根据官方 Python 示例）
// ==========================================

enum ASRMessageType {
  CLIENT_FULL_REQUEST = 0b0001,
  CLIENT_AUDIO_ONLY_REQUEST = 0b0010,
  SERVER_FULL_RESPONSE = 0b1001,
  SERVER_ERROR_RESPONSE = 0b1111
}

enum ASRMessageTypeSpecificFlags {
  NO_SEQUENCE = 0b0000,
  POS_SEQUENCE = 0b0001,
  NEG_SEQUENCE = 0b0010,
  NEG_WITH_SEQUENCE = 0b0011
}

enum ASRSerializationType {
  NO_SERIALIZATION = 0b0000,
  JSON = 0b0001
}

enum ASRCompressionType {
  NO_COMPRESSION = 0b0000,
  GZIP = 0b0001
}

// ==========================================
// TTS WebSocket 客户端
// ==========================================

interface TTSConfig {
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

        this.ws.on('close', () => {
          console.log('🔌 [Main] TTS WebSocket 连接关闭')
          this.isConnecting = false
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
      // 每次合成前都重新连接，避免上一次会话残留导致 "session number limit exceeded" 错误
      // readyState: 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
      const state = this.ws?.readyState ?? -1
      if (state !== WebSocket.OPEN) {
        await this.connect()
      } else {
        // 已有连接时也先断开再重连，确保服务端清理旧会话
        console.log('🔄 [Main] TTS 检测到已有连接，断开后重连以确保干净状态')
        const oldWs = this.ws
        this.ws = null
        try { oldWs.close() } catch(e) { /* 忽略关闭错误 */ }
        await this.connect()
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
// ASR WebSocket 客户端
// ==========================================

interface ASRConfig {
  appId: string
  accessToken: string
  resourceId: string
  apiUrl: string
  format: string
  sampleRate: number
}

export class VolcengineASRWebSocketService {
  private ws: WebSocket | null = null
  private config: ASRConfig
  private seq: number = 1
  private mainWindow: BrowserWindow | null = null
  private recognitionResult: string = ''

  constructor(config: ASRConfig) {
    this.config = config
    console.log('🎤 [Main] ASR WebSocket 服务初始化')
  }

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window
  }

  private gzipCompress(data: Buffer): Buffer {
    return zlib.gzipSync(data)
  }

  private gzipDecompress(data: Buffer): Buffer {
    return zlib.gunzipSync(data)
  }

  private buildASRHeader(
    messageType: ASRMessageType,
    messageFlags: ASRMessageTypeSpecificFlags,
    serialization: ASRSerializationType = ASRSerializationType.JSON,
    compression: ASRCompressionType = ASRCompressionType.GZIP
  ): Buffer {
    const header = Buffer.alloc(4)
    // Byte 0: 协议版本(4位) + 头部大小(4位，固定为1表示4字节)
    header[0] = (0b0001 << 4) | 0b0001
    // Byte 1: 消息类型(4位) + 消息特定标志(4位)
    header[1] = (messageType << 4) | messageFlags
    // Byte 2: 序列化类型(4位) + 压缩类型(4位)
    header[2] = (serialization << 4) | compression
    // Byte 3: 保留
    header[3] = 0
    return header
  }

  private buildFullClientRequest(seq: number): Buffer {
    const header = this.buildASRHeader(
      ASRMessageType.CLIENT_FULL_REQUEST,
      ASRMessageTypeSpecificFlags.POS_SEQUENCE,
      ASRSerializationType.JSON,
      ASRCompressionType.GZIP
    )

    const payload = {
      user: { uid: 'demo_uid' },
      audio: {
        format: this.config.format,
        codec: 'raw',
        rate: this.config.sampleRate,
        bits: 16,
        channel: 1
      },
      request: {
        model_name: 'bigmodel',
        enable_itn: true,
        enable_punc: true,
        enable_ddc: true,
        show_utterances: true,
        enable_nonstream: false
      }
    }

    const payloadBuffer = Buffer.from(JSON.stringify(payload), 'utf-8')
    const compressedPayload = this.gzipCompress(payloadBuffer)

    const message = Buffer.alloc(4 + 4 + 4 + compressedPayload.length)
    header.copy(message, 0)
    message.writeInt32BE(seq, 4)
    message.writeUInt32BE(compressedPayload.length, 8)
    compressedPayload.copy(message, 12)

    return message
  }

  private buildAudioOnlyRequest(seq: number, audioData: Buffer, isLast: boolean): Buffer {
    const messageFlags = isLast
      ? ASRMessageTypeSpecificFlags.NEG_WITH_SEQUENCE
      : ASRMessageTypeSpecificFlags.POS_SEQUENCE

    const header = this.buildASRHeader(
      ASRMessageType.CLIENT_AUDIO_ONLY_REQUEST,
      messageFlags,
      ASRSerializationType.NO_SERIALIZATION,
      ASRCompressionType.GZIP
    )

    const compressedAudio = this.gzipCompress(audioData)
    const actualSeq = isLast ? -seq : seq

    const message = Buffer.alloc(4 + 4 + 4 + compressedAudio.length)
    header.copy(message, 0)
    message.writeInt32BE(actualSeq, 4)
    message.writeUInt32BE(compressedAudio.length, 8)
    compressedAudio.copy(message, 12)

    return message
  }

  private parseServerResponse(data: Buffer): { code: number; isLastPackage: boolean; payloadMsg: any } {
    const headerSize = data[0] & 0x0f
    const messageType = data[1] >> 4
    const messageFlags = data[1] & 0x0f
    const serializationMethod = data[2] >> 4
    const messageCompression = data[2] & 0x0f

    let payload = data.slice(headerSize * 4)
    let code = 0
    let isLastPackage = false

    if (messageFlags & 0b0001) {
      payload = payload.slice(4)
    }
    if (messageFlags & 0b0010) {
      isLastPackage = true
    }

    if (messageType === ASRMessageType.SERVER_FULL_RESPONSE) {
      const payloadSize = payload.readUInt32BE(0)
      payload = payload.slice(4)
    } else if (messageType === ASRMessageType.SERVER_ERROR_RESPONSE) {
      code = payload.readInt32BE(0)
      const payloadSize = payload.readUInt32BE(4)
      payload = payload.slice(8)
    }

    if (payload.length === 0) {
      return { code, isLastPackage, payloadMsg: null }
    }

    if (messageCompression === ASRCompressionType.GZIP) {
      try {
        payload = Buffer.from(this.gzipDecompress(payload))
      } catch (error) {
        console.error('❌ [Main] ASR 解压缩失败:', error)
        return { code: -1, isLastPackage, payloadMsg: null }
      }
    }

    let payloadMsg = null
    if (serializationMethod === ASRSerializationType.JSON) {
      try {
        payloadMsg = JSON.parse(payload.toString('utf-8'))
      } catch (error) {
        console.error('❌ [Main] ASR 解析 JSON 失败:', error)
      }
    }

    return { code, isLastPackage, payloadMsg }
  }

  async connect(): Promise<boolean> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return true
    }

    return new Promise((resolve, reject) => {
      try {
        const headers = {
          'X-Api-App-Key': this.config.appId,
          'X-Api-Access-Key': this.config.accessToken,
          'X-Api-Resource-Id': this.config.resourceId,
          'X-Api-Request-Id': uuidv4()
        }

        console.log('🔌 [Main] ASR WebSocket 连接中...')
        console.log('📋 [Main] 请求头:', headers)

        this.ws = new WebSocket(this.config.apiUrl, {
          headers
        })

        this.ws.binaryType = 'arraybuffer'

        this.ws.on('open', () => {
          console.log('✅ [Main] ASR WebSocket 连接成功')
          resolve(true)
        })

        this.ws.on('message', (data: Buffer | ArrayBuffer) => {
          console.log('📨 [Main] ASR 收到响应:', data instanceof ArrayBuffer ? (data as ArrayBuffer).byteLength + ' bytes (ArrayBuffer)' : data.length + ' bytes')

          const buffer = data instanceof ArrayBuffer ? Buffer.from(data) : data
          console.log('📝 [Main] ASR 响应头部 (hex):', buffer.slice(0, 16).toString('hex'))

          const response = this.parseServerResponse(buffer)
          console.log('📝 [Main] ASR 解析结果:', { code: response.code, isLastPackage: response.isLastPackage, payloadMsg: response.payloadMsg })
          
          if (response.code !== 0) {
            this.mainWindow?.webContents.send('asr-error', { error: `服务端错误：code=${response.code}` })
            return
          }

          if (response.payloadMsg && response.payloadMsg.result) {
            const result = response.payloadMsg.result
            if (result.text) {
              this.recognitionResult = result.text
              console.log('✅ [Main] ASR 识别结果:', result.text)
              this.mainWindow?.webContents.send('asr-result', { 
                text: result.text,
                isFinal: response.isLastPackage
              })
            }
          }

          if (response.isLastPackage) {
            console.log('✅ [Main] ASR 识别完成')
            this.mainWindow?.webContents.send('asr-complete', { 
              text: this.recognitionResult 
            })
          }
        })

        this.ws.on('error', (error) => {
          console.error('❌ [Main] ASR WebSocket 错误:', error)
          reject(error)
        })

        this.ws.on('close', () => {
          console.log('🔌 [Main] ASR WebSocket 连接关闭')
        })

      } catch (error) {
        console.error('❌ [Main] ASR 连接失败:', error)
        reject(error)
      }
    })
  }

  async startRecognition(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect()
    }

    this.seq = 1
    this.recognitionResult = ''

    const fullRequest = this.buildFullClientRequest(this.seq++)
    console.log('📤 [Main] ASR 发送初始化请求 (seq=%d)', this.seq - 1)
    console.log('📝 [Main] FullClientRequest 头部 (hex):', fullRequest.slice(0, 12).toString('hex'))
    console.log('📝 [Main] FullClientRequest 总长度:', fullRequest.length, 'bytes')
    this.ws!.send(fullRequest)
    console.log('📤 [Main] ASR 发送初始化请求')

    // 等待服务端响应（FullServerResponse with code=0）
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.error('⏰ [Main] ASR 等待响应超时')
        reject(new Error('ASR 等待响应超时'))
      }, 5000)

      const messageHandler = (data: Buffer) => {
        const response = this.parseServerResponse(data)
        console.log('📨 [Main] ASR 收到初始化响应:', { code: response.code, isLastPackage: response.isLastPackage })

        if (response.code === 0) {
          console.log('✅ [Main] ASR 服务端已接受初始化请求')
          clearTimeout(timeout)
          this.ws?.off('message', messageHandler)
          resolve()
        } else {
          console.error('❌ [Main] ASR 服务端错误:', response.code)
          clearTimeout(timeout)
          this.ws?.off('message', messageHandler)
          reject(new Error(`ASR 服务端错误：code=${response.code}`))
        }
      }

      this.ws!.on('message', messageHandler)
    })
  }

  async sendAudioChunk(audioBase64: string, isLast: boolean = false): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket 未连接')
    }

    const audioBuffer = Buffer.from(audioBase64, 'base64')
    console.log('📤 [Main] ASR 发送音频块：size=%d bytes, isLast=%s', audioBuffer.length, isLast)
    
    const audioRequest = this.buildAudioOnlyRequest(this.seq, audioBuffer, isLast)
    console.log('📝 [Main] AudioOnlyRequest 头部 (hex):', audioRequest.slice(0, 12).toString('hex'))
    console.log('📝 [Main] AudioOnlyRequest 总长度:', audioRequest.length, 'bytes')
    
    this.ws!.send(audioRequest)
    
    if (!isLast) {
      this.seq++
    }
    
    console.log('📤 [Main] ASR 发送音频块, seq:', this.seq, 'isLast:', isLast)
  }

  stopRecognition(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }
}

// ==========================================
// 服务实例管理
// ==========================================

let ttsService: VolcengineTTSWebSocketService | null = null
let asrService: VolcengineASRWebSocketService | null = null

export function getTTSService(config: TTSConfig, mainWindow: BrowserWindow): VolcengineTTSWebSocketService {
  if (!ttsService) {
    ttsService = new VolcengineTTSWebSocketService(config)
  }
  ttsService.setMainWindow(mainWindow)
  return ttsService
}

export function getASRService(config: ASRConfig, mainWindow: BrowserWindow): VolcengineASRWebSocketService {
  if (!asrService) {
    asrService = new VolcengineASRWebSocketService(config)
  }
  asrService.setMainWindow(mainWindow)
  return asrService
}
