import path from 'path';
import fs from 'fs';
import zlib from 'zlib';
import crypto from 'crypto';
import WebSocket from 'ws';
import type { BrowserWindow } from 'electron';
import { createLogger } from '../../shared/logger';

const logger = createLogger('ipc');

const PROTOCOL_VERSION = 0b0001;
const DEFAULT_HEADER_SIZE = 0b0001;
const CLIENT_FULL_REQUEST = 0b0001;
const CLIENT_AUDIO_ONLY_REQUEST = 0b0010;
const SERVER_FULL_RESPONSE = 0b1001;
const SERVER_ACK = 0b1011;
const SERVER_ERROR_RESPONSE = 0b1111;
const MSG_WITH_EVENT = 0b0100;
const JSON_SERIALIZATION = 0b0001;
const NO_SERIALIZATION = 0b0000;
const GZIP = 0b0001;

export interface RealtimeDialogConfig {
  appId?: string;
  accessKey?: string;
  speaker?: string;
  systemRole?: string;
  speakingStyle?: string;
  city?: string;
  recvTimeout?: number;
}

interface ParsedResponse {
  message_type?: 'SERVER_FULL_RESPONSE' | 'SERVER_ACK' | 'SERVER_ERROR';
  event?: number;
  session_id?: string;
  payload_msg?: any;
  payload_size?: number;
  code?: number;
}

function readDotEnv(): Record<string, string> {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return {};

  const values: Record<string, string> = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    values[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return values;
}

function readSecret(key: string): string {
  const fileEnv = readDotEnv();
  return process.env[key] || fileEnv[key] || '';
}

function generateHeader(messageType = CLIENT_FULL_REQUEST, serialMethod = JSON_SERIALIZATION): Buffer {
  return Buffer.from([
    (PROTOCOL_VERSION << 4) | DEFAULT_HEADER_SIZE,
    (messageType << 4) | MSG_WITH_EVENT,
    (serialMethod << 4) | GZIP,
    0x00
  ]);
}

function appendEventAndPayload(event: number, sessionId: string | null, payload: Buffer, messageType = CLIENT_FULL_REQUEST, serialMethod = JSON_SERIALIZATION): Buffer {
  const gzipped = zlib.gzipSync(payload);
  const chunks: Buffer[] = [generateHeader(messageType, serialMethod), Buffer.alloc(4)];
  chunks[1].writeUInt32BE(event, 0);

  if (sessionId !== null) {
    const sessionBytes = Buffer.from(sessionId);
    const sessionLength = Buffer.alloc(4);
    sessionLength.writeUInt32BE(sessionBytes.length, 0);
    chunks.push(sessionLength, sessionBytes);
  }

  const payloadLength = Buffer.alloc(4);
  payloadLength.writeUInt32BE(gzipped.length, 0);
  chunks.push(payloadLength, gzipped);
  return Buffer.concat(chunks);
}

function parseResponse(data: WebSocket.RawData): ParsedResponse {
  const res = Buffer.isBuffer(data) ? data : Buffer.from(data as any);
  if (res.length < 4) return {};

  const headerSize = res[0] & 0x0f;
  const messageType = res[1] >> 4;
  const flags = res[1] & 0x0f;
  const serialization = res[2] >> 4;
  const compression = res[2] & 0x0f;

  let payload = res.subarray(headerSize * 4);
  const result: ParsedResponse = {};
  let start = 0;

  if (messageType === SERVER_FULL_RESPONSE || messageType === SERVER_ACK) {
    result.message_type = messageType === SERVER_ACK ? 'SERVER_ACK' : 'SERVER_FULL_RESPONSE';
    if ((flags & MSG_WITH_EVENT) > 0) {
      result.event = payload.readUInt32BE(0);
      start += 4;
    }
    payload = payload.subarray(start);

    if (payload.length < 4) return result;
    const sessionIdSize = payload.readInt32BE(0);
    if (payload.length < 4 + sessionIdSize + 4) return result;
    result.session_id = payload.subarray(4, 4 + sessionIdSize).toString();
    payload = payload.subarray(4 + sessionIdSize);
    result.payload_size = payload.readUInt32BE(0);
    payload = payload.subarray(4);
  } else if (messageType === SERVER_ERROR_RESPONSE) {
    result.message_type = 'SERVER_ERROR';
    result.code = payload.readUInt32BE(0);
    result.payload_size = payload.readUInt32BE(4);
    payload = payload.subarray(8);
  }

  if (compression === GZIP && payload.length > 0) {
    payload = zlib.gunzipSync(payload);
  }

  if (serialization === JSON_SERIALIZATION && payload.length > 0) {
    result.payload_msg = JSON.parse(payload.toString('utf8'));
  } else if (serialization === NO_SERIALIZATION) {
    result.payload_msg = payload;
  } else if (payload.length > 0) {
    result.payload_msg = payload.toString('utf8');
  }

  return result;
}

export class RealtimeDialogService {
  private ws: WebSocket | null = null;
  private connectingPromise: Promise<void> | null = null;
  private mainWindow: BrowserWindow | null = null;
  private sessionId = '';
  private config: RealtimeDialogConfig = {};

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  async connect(config: RealtimeDialogConfig): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    if (this.connectingPromise) return this.connectingPromise;

    this.connectingPromise = this.connectInternal(config).finally(() => {
      this.connectingPromise = null;
    });
    return this.connectingPromise;
  }

  private async connectInternal(config: RealtimeDialogConfig): Promise<void> {
    this.config = config;
    this.sessionId = crypto.randomUUID();
    const appId = config.appId || readSecret('VITE_VOLCENGINE_REALTIME_DIALOG_APP_ID') || readSecret('VITE_VOLCENGINE_APP_ID');
    const accessKey = config.accessKey || readSecret('VITE_VOLCENGINE_REALTIME_DIALOG_ACCESS_KEY') || readSecret('VITE_VOLCENGINE_ACCESS_TOKEN');

    if (!appId || !accessKey) {
      throw new Error('缺少端到端实时语音 App ID / Access Key。请在语音设置中填写，或配置 VITE_VOLCENGINE_REALTIME_DIALOG_APP_ID / VITE_VOLCENGINE_REALTIME_DIALOG_ACCESS_KEY。');
    }

    if (this.ws && this.ws.readyState !== WebSocket.CLOSED && this.ws.readyState !== WebSocket.CLOSING) {
      this.ws.close();
      this.ws = null;
    }

    this.ws = await new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket('wss://openspeech.bytedance.com/api/v3/realtime/dialogue', {
        headers: {
          'X-Api-App-ID': appId,
          'X-Api-Access-Key': accessKey,
          'X-Api-Resource-Id': 'volc.speech.dialog',
          'X-Api-App-Key': 'PlgvMymc7f3tQnJ6',
          'X-Api-Connect-Id': crypto.randomUUID()
        }
      });

      ws.once('open', () => resolve(ws));
      ws.once('error', reject);
    });

    this.ws.on('close', () => this.emit('realtime-dialog-state', { state: 'idle' }));
    this.ws.on('error', (error) => this.emit('realtime-dialog-error', { error: error.message }));

    await this.sendStartConnection();
    await this.sendStartSession();
    this.ws.on('message', (data) => this.handleMessage(data));
    this.emit('realtime-dialog-state', { state: 'connected' });
  }

  async sendAudio(audioBase64: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('实时语音 WebSocket 未连接');
    }
    const audio = Buffer.from(audioBase64, 'base64');
    this.ws.send(appendEventAndPayload(200, this.sessionId, audio, CLIENT_AUDIO_ONLY_REQUEST, NO_SERIALIZATION));
  }

  async disconnect(): Promise<void> {
    if (!this.ws) return;

    try {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(appendEventAndPayload(102, this.sessionId, Buffer.from('{}')));
        this.ws.send(appendEventAndPayload(2, null, Buffer.from('{}')));
      }
      this.ws.close();
    } finally {
      this.ws = null;
      this.emit('realtime-dialog-state', { state: 'idle' });
    }
  }

  private async sendStartConnection(): Promise<void> {
    await this.sendAndWait(appendEventAndPayload(1, null, Buffer.from('{}')));
  }

  private async sendStartSession(): Promise<void> {
    const payload = {
      asr: {
        extra: {
          end_smooth_window_ms: 1500
        }
      },
      tts: {
        speaker: this.config.speaker || 'zh_male_yunzhou_jupiter_bigtts',
        audio_config: {
          channel: 1,
          format: 'pcm',
          sample_rate: 24000
        }
      },
      dialog: {
        bot_name: '豆包',
        system_role: this.config.systemRole || '你使用自然、友好、简洁的中文和用户实时语音交流。',
        speaking_style: this.config.speakingStyle || '你的说话风格简洁明了，语速适中，语调自然。',
        location: {
          city: this.config.city || '北京'
        },
        extra: {
          strict_audit: false,
          audit_response: '这个问题我暂时不能回答，我们换个话题吧。',
          recv_timeout: this.config.recvTimeout || 10,
          input_mod: 'audio'
        }
      }
    };

    await this.sendAndWait(appendEventAndPayload(100, this.sessionId, Buffer.from(JSON.stringify(payload))));
  }

  private async sendAndWait(payload: Buffer): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error('实时语音 WebSocket 未连接');

    await new Promise<void>((resolve, reject) => {
      const ws = this.ws!;
      const onMessage = (data: WebSocket.RawData) => {
        try {
          const parsed = parseResponse(data);
          logger.debug('实时语音握手响应', { event: parsed.event, messageType: parsed.message_type });
          ws.off('message', onMessage);
          resolve();
        } catch (error) {
          ws.off('message', onMessage);
          reject(error);
        }
      };
      ws.once('message', onMessage);
      ws.send(payload);
    });
  }

  private handleMessage(data: WebSocket.RawData): void {
    try {
      const parsed = parseResponse(data);
      if (parsed.message_type === 'SERVER_ACK' && Buffer.isBuffer(parsed.payload_msg)) {
        this.emit('realtime-dialog-audio', {
          audioBase64: parsed.payload_msg.toString('base64'),
          sampleRate: 24000,
          format: 'pcm-f32le'
        });
        return;
      }

      if (parsed.message_type === 'SERVER_FULL_RESPONSE') {
        this.emit('realtime-dialog-event', {
          event: parsed.event,
          payload: parsed.payload_msg
        });
        return;
      }

      if (parsed.message_type === 'SERVER_ERROR') {
        this.emit('realtime-dialog-error', {
          error: typeof parsed.payload_msg === 'string' ? parsed.payload_msg : JSON.stringify(parsed.payload_msg),
          code: parsed.code
        });
      }
    } catch (error) {
      logger.error('解析实时语音响应失败', error);
      this.emit('realtime-dialog-error', { error: error instanceof Error ? error.message : '解析实时语音响应失败' });
    }
  }

  private emit(channel: string, data: any): void {
    this.mainWindow?.webContents.send(channel, data);
  }
}

let realtimeDialogService: RealtimeDialogService | null = null;

export function getRealtimeDialogService(mainWindow: BrowserWindow): RealtimeDialogService {
  if (!realtimeDialogService) {
    realtimeDialogService = new RealtimeDialogService();
  }
  realtimeDialogService.setMainWindow(mainWindow);
  return realtimeDialogService;
}
