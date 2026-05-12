// ==========================================
// 豆包语音 ASR WebSocket v3 服务（主进程）
// 使用 Node.js 的 ws 库，支持自定义 HTTP 头
// ==========================================

import WebSocket from 'ws'
import crypto from 'crypto'
import zlib from 'zlib'
import { BrowserWindow } from 'electron'
import { createLogger } from '../../../shared/logger'

const logger = createLogger('asr')

// 使用 Node.js 内置的 crypto 生成 UUID（避免 ESM 兼容性问题）
const uuidv4 = () => crypto.randomUUID()

// ==========================================
// ASR 协议定义（根据官方 Python 示例）
// ==========================================

export enum ASRMessageType {
  CLIENT_FULL_REQUEST = 0b0001,
  CLIENT_AUDIO_ONLY_REQUEST = 0b0010,
  SERVER_FULL_RESPONSE = 0b1001,
  SERVER_ERROR_RESPONSE = 0b1111
}

export enum ASRMessageTypeSpecificFlags {
  NO_SEQUENCE = 0b0000,
  POS_SEQUENCE = 0b0001,
  NEG_SEQUENCE = 0b0010,
  NEG_WITH_SEQUENCE = 0b0011
}

export enum ASRSerializationType {
  NO_SERIALIZATION = 0b0000,
  JSON = 0b0001
}

export enum ASRCompressionType {
  NO_COMPRESSION = 0b0000,
  GZIP = 0b0001
}

// ==========================================
// ASR WebSocket 客户端
// ==========================================

export interface ASRConfig {
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
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 5
  private reconnectDelay: number = 1000
  private isReconnecting: boolean = false
  private isConnecting: boolean = false

  constructor(config: ASRConfig) {
    this.config = config
    logger.debug('🎤 [Main] ASR WebSocket 服务初始化')
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
        logger.error('❌ [Main] ASR 解压缩失败:', error)
        return { code: -1, isLastPackage, payloadMsg: null }
      }
    }

    let payloadMsg = null
    if (serializationMethod === ASRSerializationType.JSON) {
      try {
        payloadMsg = JSON.parse(payload.toString('utf-8'))
      } catch (error) {
        logger.error('❌ [Main] ASR 解析 JSON 失败:', error)
      }
    }

    return { code, isLastPackage, payloadMsg }
  }

  private async reconnect(): Promise<boolean> {
    if (this.isReconnecting || this.reconnectAttempts >= this.maxReconnectAttempts) {
      return false
    }

    this.isReconnecting = true
    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1) // 指数退避

    logger.debug(`🔄 [Main] ASR 尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})，延迟 ${delay}ms`)

    return new Promise((resolve) => {
      setTimeout(async () => {
        try {
          const success = await this.connect()
          if (success) {
            logger.debug('✅ [Main] ASR 重连成功')
            this.reconnectAttempts = 0
            this.isReconnecting = false
            resolve(true)
          } else {
            logger.warn('⚠️ [Main] ASR 重连失败')
            this.isReconnecting = false
            resolve(false)
          }
        } catch (error) {
          logger.error('❌ [Main] ASR 重连错误:', error)
          this.isReconnecting = false
          resolve(false)
        }
      }, delay)
    })
  }

  async connect(): Promise<boolean> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return true
    }

    if (this.isConnecting) {
      logger.debug('🔄 [Main] ASR 连接正在进行中，等待完成')
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
          'X-Api-Request-Id': uuidv4()
        }

        logger.debug('🔌 [Main] ASR WebSocket 连接中...')
        logger.debug('📋 [Main] 请求头:', headers)

        this.ws = new WebSocket(this.config.apiUrl, {
          headers
        })

        this.ws.binaryType = 'arraybuffer'

        this.ws.on('open', () => {
          logger.debug('✅ [Main] ASR WebSocket 连接成功')
          this.isConnecting = false
          this.reconnectAttempts = 0 // 重置重连次数
          resolve(true)
        })

        this.ws.on('message', (data: Buffer | ArrayBuffer) => {
          logger.debug('📨 [Main] ASR 收到响应:', data instanceof ArrayBuffer ? (data as ArrayBuffer).byteLength + ' bytes (ArrayBuffer)' : data.length + ' bytes')

          const buffer = data instanceof ArrayBuffer ? Buffer.from(data) : data
          logger.debug('📝 [Main] ASR 响应头部 (hex):', buffer.slice(0, 16).toString('hex'))

          const response = this.parseServerResponse(buffer)
          logger.debug('📝 [Main] ASR 解析结果:', { code: response.code, isLastPackage: response.isLastPackage, payloadMsg: response.payloadMsg })
          
          if (response.code !== 0) {
            this.mainWindow?.webContents.send('asr-error', { error: `服务端错误：code=${response.code}` })
            return
          }

          if (response.payloadMsg && response.payloadMsg.result) {
            const result = response.payloadMsg.result
            if (result.text) {
              this.recognitionResult = result.text
              logger.debug('✅ [Main] ASR 识别结果:', result.text)
              this.mainWindow?.webContents.send('asr-result', { 
                text: result.text,
                isFinal: response.isLastPackage
              })
            }
          }

          if (response.isLastPackage) {
            logger.debug('✅ [Main] ASR 识别完成')
            this.mainWindow?.webContents.send('asr-complete', { 
              text: this.recognitionResult 
            })
          }
        })

        this.ws.on('error', (error) => {
          logger.error('❌ [Main] ASR WebSocket 错误:', error)
          this.isConnecting = false
          reject(error)
        })

        this.ws.on('close', (code, reason) => {
          logger.debug(`🔌 [Main] ASR WebSocket 连接关闭，code: ${code}, reason: ${reason}`)
          this.isConnecting = false
          
          // 自动重连（排除主动关闭的情况）
          if (code !== 1000 && !this.isReconnecting) {
            logger.debug('🔄 [Main] ASR 连接意外关闭，准备重连')
            this.reconnect().catch(error => {
              logger.error('❌ [Main] ASR 重连失败:', error)
            })
          }
        })

      } catch (error) {
        logger.error('❌ [Main] ASR 连接失败:', error)
        this.isConnecting = false
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
    logger.debug('📤 [Main] ASR 发送初始化请求 (seq=%d)', this.seq - 1)
    logger.debug('📝 [Main] FullClientRequest 头部 (hex):', fullRequest.slice(0, 12).toString('hex'))
    logger.debug('📝 [Main] FullClientRequest 总长度:', fullRequest.length, 'bytes')
    this.ws!.send(fullRequest)
    logger.debug('📤 [Main] ASR 发送初始化请求')

    // 等待服务端响应（FullServerResponse with code=0）
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        logger.error('⏰ [Main] ASR 等待响应超时')
        reject(new Error('ASR 等待响应超时'))
      }, 5000)

      const messageHandler = (data: Buffer) => {
        const response = this.parseServerResponse(data)
        logger.debug('📨 [Main] ASR 收到初始化响应:', { code: response.code, isLastPackage: response.isLastPackage })

        if (response.code === 0) {
          logger.debug('✅ [Main] ASR 服务端已接受初始化请求')
          clearTimeout(timeout)
          this.ws?.off('message', messageHandler)
          resolve()
        } else {
          logger.error('❌ [Main] ASR 服务端错误:', response.code)
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
    logger.debug('📤 [Main] ASR 发送音频块：size=%d bytes, isLast=%s', audioBuffer.length, isLast)
    
    const audioRequest = this.buildAudioOnlyRequest(this.seq, audioBuffer, isLast)
    logger.debug('📝 [Main] AudioOnlyRequest 头部 (hex):', audioRequest.slice(0, 12).toString('hex'))
    logger.debug('📝 [Main] AudioOnlyRequest 总长度:', audioRequest.length, 'bytes')
    
    this.ws!.send(audioRequest)
    
    if (!isLast) {
      this.seq++
    }
    
    logger.debug('📤 [Main] ASR 发送音频块, seq:', this.seq, 'isLast:', isLast)
  }

  stopRecognition(): void {
    if (this.ws) {
      // 显式传入关闭码 1000，防止 ws.on('close') 误判为意外断开触发重连
      this.ws.close(1000, 'Normal closure')
      this.ws = null
    }
  }
}

// ==========================================
// 服务实例管理
// ==========================================

let asrService: VolcengineASRWebSocketService | null = null

export function getASRService(config: ASRConfig, mainWindow: BrowserWindow): VolcengineASRWebSocketService {
  if (!asrService) {
    asrService = new VolcengineASRWebSocketService(config)
  }
  asrService.setMainWindow(mainWindow)
  return asrService
}
