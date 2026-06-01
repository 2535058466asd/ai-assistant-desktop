import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

export interface StoredImageAttachment {
  id: string;
  type: 'image';
  name: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  sizeBytes: number;
  relativePath: string;
}

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

export function saveImageAttachment(input: {
  chatId: string;
  name: string;
  mimeType: string;
  dataUrl: string;
}): StoredImageAttachment {
  const chatId = sanitizeChatId(input.chatId);
  const extension = ALLOWED_IMAGE_TYPES[input.mimeType];
  if (!extension) {
    throw new Error('仅支持 PNG、JPG 和 WEBP 图片');
  }

  const match = input.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match || match[1] !== input.mimeType) {
    throw new Error('图片数据格式不合法');
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('单张图片大小必须在 10 MB 以内');
  }

  const id = `img-${crypto.randomUUID()}`;
  const relativePath = path.join(chatId, `${id}${extension}`);
  const filePath = resolveInsideAttachmentRoot(relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);

  return {
    id,
    type: 'image',
    name: path.basename(input.name || `${id}${extension}`),
    mimeType: input.mimeType as StoredImageAttachment['mimeType'],
    sizeBytes: buffer.length,
    relativePath,
  };
}

export function readAttachmentDataUrl(relativePath: string, mimeType: string): string {
  if (!ALLOWED_IMAGE_TYPES[mimeType]) {
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
