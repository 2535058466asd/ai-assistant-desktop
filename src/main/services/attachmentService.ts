import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const ALLOWED_TYPES: Record<string, { ext: string; maxSize: number; prefix: string }> = {
  'image/png':  { ext: '.png',  maxSize: 10 * 1024 * 1024,  prefix: 'img' },
  'image/jpeg': { ext: '.jpg',  maxSize: 10 * 1024 * 1024,  prefix: 'img' },
  'image/webp': { ext: '.webp', maxSize: 10 * 1024 * 1024,  prefix: 'img' },
};

export interface StoredAttachment {
  id: string;
  type: 'image';
  name: string;
  mimeType: string;
  sizeBytes: number;
  relativePath: string;
}

export type StoredImageAttachment = StoredAttachment & { type: 'image' };

function getAttachmentRoot(): string {
  return path.join(app.getPath('userData'), 'attachments');
}

function resolveInsideAttachmentRoot(relativePath: string): string {
  const root = path.resolve(getAttachmentRoot());
  const target = path.resolve(root, relativePath);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error('附件路径不合法');
  }
  return target;
}

function sanitizeChatId(chatId: string): string {
  if (!/^chat-[a-zA-Z0-9-]+$/.test(chatId)) {
    throw new Error('对话 ID 不合法');
  }
  return chatId;
}

export function saveAttachment(input: {
  chatId: string;
  name: string;
  mimeType: string;
  dataUrl: string;
}): StoredAttachment {
  const chatId = sanitizeChatId(input.chatId);
  const typeConfig = ALLOWED_TYPES[input.mimeType];
  if (!typeConfig) {
    throw new Error('不支持的附件类型');
  }

  const match = input.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match || match[1] !== input.mimeType) {
    throw new Error('附件数据格式不合法');
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0 || buffer.length > typeConfig.maxSize) {
    const maxMB = typeConfig.maxSize / 1024 / 1024;
    throw new Error(`附件大小必须在 ${maxMB} MB 以内`);
  }

  const id = `${typeConfig.prefix}-${crypto.randomUUID()}`;
  const relativePath = path.join(chatId, `${id}${typeConfig.ext}`);
  const filePath = resolveInsideAttachmentRoot(relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);

  return {
    id,
    type: 'image',
    name: path.basename(input.name || `${id}${typeConfig.ext}`),
    mimeType: input.mimeType,
    sizeBytes: buffer.length,
    relativePath,
  };
}

export function saveImageAttachment(input: {
  chatId: string;
  name: string;
  mimeType: string;
  dataUrl: string;
}): StoredImageAttachment {
  return saveAttachment(input) as StoredImageAttachment;
}

export function readAttachmentDataUrl(relativePath: string, mimeType: string): string {
  if (!ALLOWED_TYPES[mimeType]) {
    throw new Error('附件类型不合法');
  }
  const filePath = resolveInsideAttachmentRoot(relativePath);
  const buffer = fs.readFileSync(filePath);
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

export function deleteAttachmentsByChat(chatId: string): void {
  const target = resolveInsideAttachmentRoot(sanitizeChatId(chatId));
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}
