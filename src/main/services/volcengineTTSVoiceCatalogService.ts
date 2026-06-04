import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createLogger } from '../../shared/logger';

const logger = createLogger('ipc');

const HOST = 'open.volcengineapi.com';
const ACTION = 'ListSpeakers';
const VERSION = '2025-05-20';
const SERVICE = 'speech_saas_prod';
const DEFAULT_REGION = 'cn-beijing';
const DEFAULT_RESOURCE_ID = 'seed-tts-2.0';
const DEFAULT_LIMIT = 20;

export interface VolcengineSpeakerOption {
  value: string;
  label: string;
  resourceId: string;
  description?: string;
  raw?: any;
}

interface SpeakerCatalogResponse {
  data: VolcengineSpeakerOption[];
  raw: any;
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

function toBasicUtcDate(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[:\-]/g, '');
}

function uriEscape(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => {
    return `%${char.charCodeAt(0).toString(16).toUpperCase()}`;
  });
}

function sha256Hex(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function hmacSha256Buffer(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function hmacSha256Hex(key: Buffer | string, data: string): string {
  return crypto.createHmac('sha256', key).update(data).digest('hex');
}

function canonicalQueryString(params: Record<string, string | number>): string {
  return Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null)
    .sort()
    .map((key) => `${uriEscape(key)}=${uriEscape(String(params[key]))}`)
    .join('&');
}

function buildAuthorization(params: {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  method: string;
  path: string;
  query: Record<string, string | number>;
  body: string;
  requestDate: Date;
}): { headers: Record<string, string>; queryString: string } {
  const xDate = toBasicUtcDate(params.requestDate);
  const dateStamp = xDate.slice(0, 8);
  const contentSha256 = sha256Hex(params.body);
  const queryString = canonicalQueryString(params.query);
  const signHeaders: Record<string, string> = {
    host: HOST,
    'x-content-sha256': contentSha256,
    'x-date': xDate,
  };
  const signedHeaders = Object.keys(signHeaders).sort().join(';');
  const canonicalHeaders = Object.keys(signHeaders)
    .sort()
    .map((key) => `${key}:${signHeaders[key].replace(/\s+/g, ' ').trim()}`)
    .join('\n');
  const canonicalRequest = [
    params.method.toUpperCase(),
    params.path,
    queryString,
    `${canonicalHeaders}\n`,
    signedHeaders,
    contentSha256,
  ].join('\n');

  const credentialScope = `${dateStamp}/${params.region}/${SERVICE}/request`;
  const stringToSign = [
    'HMAC-SHA256',
    xDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = hmacSha256Buffer(params.secretAccessKey, dateStamp);
  const kRegion = hmacSha256Buffer(kDate, params.region);
  const kService = hmacSha256Buffer(kRegion, SERVICE);
  const kSigning = hmacSha256Buffer(kService, 'request');
  const signature = hmacSha256Hex(kSigning, stringToSign);
  const authorization = [
    `HMAC-SHA256 Credential=${params.accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(', ');

  return {
    queryString,
    headers: {
      Host: HOST,
      'Content-Type': 'application/json',
      'X-Date': xDate,
      'X-Content-Sha256': contentSha256,
      Authorization: authorization,
    },
  };
}

function extractSpeakers(raw: any): VolcengineSpeakerOption[] {
  const candidates = [
    raw?.Result?.Speakers,
    raw?.Result?.SpeakerList,
    raw?.Result?.speakers,
    raw?.Data?.Speakers,
    raw?.Data?.SpeakerList,
    raw?.Data?.speakers,
    raw?.Speakers,
    raw?.SpeakerList,
    raw?.speakers,
    raw?.result?.Speakers,
    raw?.result?.SpeakerList,
    raw?.result?.speakers,
    raw?.data?.Speakers,
    raw?.data?.SpeakerList,
    raw?.data?.speakers
  ];

  const list = candidates.find(Array.isArray) as any[] | undefined;
  if (!list?.length) return [];

  return list.map((item) => {
    const value = String(item?.VoiceType || item?.voice_type || item?.VoiceID || item?.voice_id || item?.ID || item?.id || item?.SpeakerID || item?.speaker_id || item?.Name || item?.name || '');
    const resourceId = String(item?.ResourceID || item?.resource_id || DEFAULT_RESOURCE_ID);
    const name = String(item?.SpeakerName || item?.speaker_name || item?.Name || item?.name || item?.Title || item?.title || value);
    const description = String(item?.Description || item?.description || item?.Desc || item?.desc || '');
    const tags = Array.isArray(item?.Tags) ? item.Tags.join(' · ') : Array.isArray(item?.tags) ? item.tags.join(' · ') : '';
    return {
      value: value || name,
      label: name,
      resourceId,
      description: [description, tags, value].filter(Boolean).join(' · ') || undefined,
      raw: item
    };
  }).filter((item) => item.value);
}

class VolcengineTTSVoiceCatalogService {
  private cache: Map<string, { expiresAt: number; data: VolcengineSpeakerOption[] }> = new Map();

  async listSpeakers(resourceId = DEFAULT_RESOURCE_ID, forceRefresh = false): Promise<SpeakerCatalogResponse> {
    const cacheKey = resourceId;
    const cached = this.cache.get(cacheKey);
    if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
      return { data: cached.data, raw: { cached: true } };
    }

    const accessKeyId = readSecret('VOLCENGINE_ACCESS_KEY_ID') || readSecret('VITE_VOLCENGINE_ACCESS_KEY_ID');
    const secretAccessKey = readSecret('VOLCENGINE_SECRET_ACCESS_KEY') || readSecret('VITE_VOLCENGINE_SECRET_ACCESS_KEY');
    const region = readSecret('VOLCENGINE_REGION') || DEFAULT_REGION;

    if (!accessKeyId || !secretAccessKey) {
      throw new Error('缺少火山引擎 AK/SK。请配置 VOLCENGINE_ACCESS_KEY_ID 和 VOLCENGINE_SECRET_ACCESS_KEY。');
    }

    logger.info('Fetching Volcengine TTS speaker catalog', { resourceId, region });

    const body = JSON.stringify({
      ResourceIDs: [resourceId],
      Page: 1,
      Limit: DEFAULT_LIMIT,
    });
    const query = {
      Action: ACTION,
      Version: VERSION,
    };
    const signed = buildAuthorization({
      accessKeyId,
      secretAccessKey,
      region,
      method: 'POST',
      path: '/',
      query,
      body,
      requestDate: new Date(),
    });

    const response = await fetch(`https://${HOST}/?${signed.queryString}`, {
      method: 'POST',
      headers: signed.headers,
      body,
    });
    const text = await response.text();
    let raw: any = text;
    try {
      raw = text ? JSON.parse(text) : {};
    } catch (_) {}

    if (!response.ok) {
      const error = raw?.ResponseMetadata?.Error;
      throw new Error(`ListSpeakers 请求失败: ${error?.Code || response.status} ${error?.Message || text || response.statusText}`);
    }

    const data = extractSpeakers(raw);
    this.cache.set(cacheKey, { data, expiresAt: Date.now() + 10 * 60 * 1000 });

    return { data, raw };
  }
}

let catalogService: VolcengineTTSVoiceCatalogService | null = null;

export function getVolcengineTTSVoiceCatalogService(): VolcengineTTSVoiceCatalogService {
  if (!catalogService) {
    catalogService = new VolcengineTTSVoiceCatalogService();
  }
  return catalogService;
}
