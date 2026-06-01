import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { createLogger } from '../../shared/logger';

const logger = createLogger('history');

export interface ArchivedConversation {
  id: string;
  title: string;
  preview: string;
  icon: string;
  createdAt: number;
  updatedAt: number;
  isPinned?: boolean;
}

export interface ArchivedMessage {
  id: string;
  role: string;
  content: string;
  timestamp: number;
  sessionId: string;
  [key: string]: unknown;
}

export interface LegacyConversationImport {
  conversation: ArchivedConversation;
  messages: ArchivedMessage[];
}

function validateConversation(conversation: ArchivedConversation): ArchivedConversation {
  if (!/^chat-[a-zA-Z0-9-]+$/.test(conversation.id)) {
    throw new Error('对话 ID 不合法');
  }
  if (!conversation.title || conversation.title.length > 200) {
    throw new Error('对话标题不合法');
  }
  return {
    id: conversation.id,
    title: conversation.title,
    preview: String(conversation.preview || '').slice(0, 500),
    icon: String(conversation.icon || '💬').slice(0, 20),
    createdAt: Number(conversation.createdAt) || Date.now(),
    updatedAt: Number(conversation.updatedAt) || Date.now(),
    isPinned: Boolean(conversation.isPinned),
  };
}

function validateMessages(messages: ArchivedMessage[]): ArchivedMessage[] {
  if (!Array.isArray(messages)) throw new Error('消息列表格式不合法');
  return messages
    .filter((message) => message && typeof message === 'object' && message.sessionId !== 'welcome')
    .map((message) => {
      if (!message.id || typeof message.id !== 'string') throw new Error('消息 ID 不合法');
      if (!['user', 'assistant', 'system', 'tool'].includes(message.role)) throw new Error('消息角色不合法');
      return {
        ...message,
        id: message.id,
        role: message.role,
        content: String(message.content || ''),
        timestamp: Number(message.timestamp) || Date.now(),
        sessionId: String(message.sessionId || ''),
      };
    });
}

export class ConversationArchiveService {
  private db: Database | null = null;
  private readonly dataDir: string;
  private readonly dbPath: string;
  private readonly dbReady: Promise<void>;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor() {
    this.dataDir = path.join(app.getPath('userData'), 'nova-chat');
    this.dbPath = path.join(this.dataDir, 'chats.db');
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.dbReady = this.initDatabase();
  }

  private async initDatabase(): Promise<void> {
    this.db = await open({ filename: this.dbPath, driver: sqlite3.Database });
    await this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        preview TEXT NOT NULL DEFAULT '',
        icon TEXT NOT NULL DEFAULT '💬',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_pinned INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_conversations_updated_at
        ON conversations(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_timestamp
        ON messages(conversation_id, timestamp);
    `);
    logger.info('SQLite 聊天存档数据库已初始化', { dbPath: this.dbPath });
  }

  private async ensureDb(): Promise<Database> {
    await this.dbReady;
    if (!this.db) throw new Error('聊天存档数据库未初始化');
    return this.db;
  }

  private enqueueWrite<T>(operationName: string, operation: () => Promise<T>): Promise<T> {
    const run = this.writeQueue.then(operation, operation);
    this.writeQueue = run.then(() => undefined, () => undefined);
    return run.catch((error) => {
      logger.error(`SQLite 聊天存档写入失败: ${operationName}`, { error });
      throw error;
    });
  }

  async listConversations(): Promise<ArchivedConversation[]> {
    const db = await this.ensureDb();
    const rows = await db.all(`
      SELECT id, title, preview, icon, created_at, updated_at, is_pinned
      FROM conversations
      ORDER BY is_pinned DESC, updated_at DESC
    `);
    return rows.map((row: any) => ({
      id: row.id,
      title: row.title,
      preview: row.preview,
      icon: row.icon,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isPinned: Boolean(row.is_pinned),
    }));
  }

  async getMessages(conversationId: string): Promise<ArchivedMessage[]> {
    const db = await this.ensureDb();
    const rows = await db.all(`
      SELECT id, role, content, timestamp, payload_json
      FROM messages
      WHERE conversation_id = ?
      ORDER BY timestamp ASC, rowid ASC
    `, [conversationId]);
    return rows.map((row: any) => {
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(row.payload_json || '{}');
      } catch {
        logger.warn('聊天消息扩展字段解析失败，已忽略', { conversationId, messageId: row.id });
      }
      return {
        ...payload,
        id: row.id,
        role: row.role,
        content: row.content,
        timestamp: row.timestamp,
        sessionId: String(payload.sessionId || ''),
      };
    });
  }

  async saveConversation(conversation: ArchivedConversation, rawMessages: ArchivedMessage[]): Promise<void> {
    const safeConversation = validateConversation(conversation);
    const messages = validateMessages(rawMessages);
    return this.enqueueWrite('saveConversation', async () => {
      const db = await this.ensureDb();
      let transactionStarted = false;
      try {
        await db.exec('BEGIN IMMEDIATE TRANSACTION');
        transactionStarted = true;
        await this.upsertConversation(db, safeConversation);
        await db.run('DELETE FROM messages WHERE conversation_id = ?', [safeConversation.id]);
        for (const message of messages) {
          const { id, role, content, timestamp, ...payload } = message;
          await db.run(`
            INSERT INTO messages (id, conversation_id, role, content, timestamp, payload_json)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [id, safeConversation.id, role, content, timestamp, JSON.stringify(payload)]);
        }
        await db.exec('COMMIT');
        logger.info('SQLite 聊天存档保存成功', {
          chatId: safeConversation.id,
          messageCount: messages.length,
          phase: 'persist',
        });
      } catch (error) {
        if (transactionStarted) {
          try {
            await db.exec('ROLLBACK');
          } catch (rollbackError) {
            logger.error('SQLite 聊天存档回滚失败', { chatId: safeConversation.id, error: rollbackError });
          }
        }
        throw error;
      }
    });
  }

  async deleteConversation(conversationId: string): Promise<void> {
    return this.enqueueWrite('deleteConversation', async () => {
      const db = await this.ensureDb();
      await db.run('DELETE FROM conversations WHERE id = ?', [conversationId]);
      logger.info('SQLite 聊天存档已删除', { chatId: conversationId, phase: 'persist' });
    });
  }

  async renameConversation(conversationId: string, title: string): Promise<void> {
    const safeTitle = title.trim();
    if (!safeTitle || safeTitle.length > 200) throw new Error('对话标题不合法');
    return this.enqueueWrite('renameConversation', async () => {
      const db = await this.ensureDb();
      await db.run('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?', [safeTitle, Date.now(), conversationId]);
    });
  }

  async setPinned(conversationId: string, isPinned: boolean): Promise<void> {
    return this.enqueueWrite('setPinned', async () => {
      const db = await this.ensureDb();
      await db.run('UPDATE conversations SET is_pinned = ?, updated_at = ? WHERE id = ?', [isPinned ? 1 : 0, Date.now(), conversationId]);
    });
  }

  async importLegacy(entries: LegacyConversationImport[]): Promise<{ conversations: number; messages: number }> {
    return this.enqueueWrite('importLegacy', async () => {
      const db = await this.ensureDb();
      let conversationCount = 0;
      let messageCount = 0;
      let transactionStarted = false;
      try {
        await db.exec('BEGIN IMMEDIATE TRANSACTION');
        transactionStarted = true;
        for (const entry of entries) {
          const conversation = validateConversation(entry.conversation);
          const messages = validateMessages(entry.messages);
          const existing = await db.get('SELECT id FROM conversations WHERE id = ?', [conversation.id]);
          if (existing) continue;
          await this.upsertConversation(db, conversation);
          for (const message of messages) {
            const { id, role, content, timestamp, ...payload } = message;
            await db.run(`
              INSERT OR IGNORE INTO messages (id, conversation_id, role, content, timestamp, payload_json)
              VALUES (?, ?, ?, ?, ?, ?)
            `, [id, conversation.id, role, content, timestamp, JSON.stringify(payload)]);
            messageCount++;
          }
          conversationCount++;
        }
        await db.exec('COMMIT');
        logger.info('旧版聊天记录已导入 SQLite', { conversationCount, messageCount, phase: 'persist' });
        return { conversations: conversationCount, messages: messageCount };
      } catch (error) {
        if (transactionStarted) {
          try {
            await db.exec('ROLLBACK');
          } catch (rollbackError) {
            logger.error('旧版聊天记录导入回滚失败', { error: rollbackError });
          }
        }
        throw error;
      }
    });
  }

  private async upsertConversation(db: Database, conversation: ArchivedConversation): Promise<void> {
    await db.run(`
      INSERT INTO conversations (id, title, preview, icon, created_at, updated_at, is_pinned)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        preview = excluded.preview,
        icon = excluded.icon,
        updated_at = excluded.updated_at,
        is_pinned = excluded.is_pinned
    `, [
      conversation.id,
      conversation.title,
      conversation.preview,
      conversation.icon,
      conversation.createdAt,
      conversation.updatedAt,
      conversation.isPinned ? 1 : 0,
    ]);
  }
}

let conversationArchiveService: ConversationArchiveService | null = null;

export function getConversationArchiveService(): ConversationArchiveService {
  if (!conversationArchiveService) {
    conversationArchiveService = new ConversationArchiveService();
  }
  return conversationArchiveService;
}
