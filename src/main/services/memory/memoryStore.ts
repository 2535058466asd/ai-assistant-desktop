// ==========================================
// 记忆 SQLite 存储层（CRUD + FTS5 全文检索）
// ==========================================

import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import crypto from 'crypto';
import { createLogger } from '../../../shared/logger';
import type { Memory, MemoryWriteOptions } from './memoryTypes';

const logger = createLogger('memoryStore');

const DATA_DIR_NAME = 'nova-memory';
const LEGACY_DATA_DIR_NAME = 'qiyuan-memory';
const MAX_MEMORIES = 500;

export class MemoryStore {
  private dataDir: string;
  private dbPath: string;
  private db: Database | null = null;
  private dbReady: Promise<void>;

  constructor() {
    this.dataDir = path.join(app.getPath('userData'), DATA_DIR_NAME);
    this.dbPath = path.join(this.dataDir, 'memories.db');
    this.ensureDataDir();
    this.dbReady = this.initDatabase();
  }

  async ready(): Promise<void> {
    await this.dbReady;
  }

  getDb(): Database | null {
    return this.db;
  }

  // ========== 数据目录 ==========

  private ensureDataDir(): void {
    this.migrateLegacyDataDir();
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
      logger.info('Memory data directory created', { dataDir: this.dataDir });
    }
  }

  private migrateLegacyDataDir(): void {
    const legacyDataDir = path.join(app.getPath('userData'), LEGACY_DATA_DIR_NAME);
    if (fs.existsSync(this.dataDir) || !fs.existsSync(legacyDataDir)) return;
    try {
      fs.cpSync(legacyDataDir, this.dataDir, { recursive: true });
      logger.info('Legacy memory data migrated', { from: legacyDataDir, to: this.dataDir });
    } catch (error) {
      logger.error('Legacy memory data migration failed', { error });
    }
  }

  // ========== 数据库初始化 ==========

  private async initDatabase(): Promise<void> {
    try {
      this.db = await open({ filename: this.dbPath, driver: sqlite3.Database });

      await this.db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA foreign_keys = ON;
      `);

      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS memories (
          id TEXT PRIMARY KEY,
          content TEXT NOT NULL,
          category TEXT NOT NULL,
          importance INTEGER DEFAULT 5,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          access_count INTEGER DEFAULT 0,
          source_conversation TEXT,
          source_message TEXT,
          source_kind TEXT DEFAULT 'inferred',
          memory_key TEXT,
          confidence REAL DEFAULT 0.7,
          status TEXT DEFAULT 'active',
          valid_from INTEGER,
          valid_until INTEGER,
          superseded_by TEXT,
          scope TEXT DEFAULT 'long_term',
          reason TEXT,
          last_injected_at INTEGER,
          inject_count INTEGER DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_category ON memories(category);
        CREATE INDEX IF NOT EXISTS idx_importance ON memories(importance);
        CREATE INDEX IF NOT EXISTS idx_created_at ON memories(created_at);
      `);

      await this.migrateSchema();

      await this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_memory_status ON memories(status);
        CREATE INDEX IF NOT EXISTS idx_memory_key ON memories(memory_key);
        CREATE INDEX IF NOT EXISTS idx_memory_valid_until ON memories(valid_until);
        CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(content, category);
      `);

      // 回填 FTS 索引
      const ftsCount = await this.db.get('SELECT COUNT(*) as count FROM memories_fts') as { count: number };
      if (ftsCount.count === 0) {
        const memCount = await this.db.get('SELECT COUNT(*) as count FROM memories') as { count: number };
        if (memCount.count > 0) {
          await this.db.exec(`INSERT INTO memories_fts(rowid, content, category) SELECT rowid, content, category FROM memories`);
          logger.info('FTS5 index backfilled', { count: memCount.count });
        }
      }

      await this.runMaintenance();
      logger.info('SQLite memory database initialized');
    } catch (error) {
      logger.error('Initialize memory database failed', error);
    }
  }

  private async migrateSchema(): Promise<void> {
    if (!this.db) return;
    const columns = await this.db.all('PRAGMA table_info(memories)') as Array<{ name: string }>;
    const existing = new Set(columns.map(c => c.name));
    const additions: Array<[string, string]> = [
      ['source_message', 'TEXT'],
      ['source_kind', "TEXT DEFAULT 'inferred'"],
      ['memory_key', 'TEXT'],
      ['confidence', 'REAL DEFAULT 0.7'],
      ['status', "TEXT DEFAULT 'active'"],
      ['valid_from', 'INTEGER'],
      ['valid_until', 'INTEGER'],
      ['superseded_by', 'TEXT'],
      ['scope', "TEXT DEFAULT 'long_term'"],
      ['reason', 'TEXT'],
      ['last_injected_at', 'INTEGER'],
      ['inject_count', 'INTEGER DEFAULT 0'],
    ];
    for (const [name, definition] of additions) {
      if (!existing.has(name)) {
        await this.db.exec(`ALTER TABLE memories ADD COLUMN ${name} ${definition}`);
        logger.info('记忆数据库字段迁移完成', { column: name });
      }
    }
    await this.db.run("UPDATE memories SET status = 'active' WHERE status IS NULL OR status = ''");
    await this.db.run("UPDATE memories SET confidence = 0.7 WHERE confidence IS NULL");
    await this.db.run("UPDATE memories SET source_kind = 'inferred' WHERE source_kind IS NULL OR source_kind = ''");
    await this.db.run("UPDATE memories SET scope = 'long_term' WHERE scope IS NULL OR scope = ''");
  }

  // ========== CRUD ==========

  async insertMemory(content: string, category: Memory['category'], importance: number, options: MemoryWriteOptions): Promise<string> {
    await this.ready();
    if (!this.db) throw new Error('DB not ready');
    const id = crypto.randomUUID();
    const now = Date.now();
    await this.db.run(
      `INSERT INTO memories (id, content, category, importance, created_at, updated_at, access_count,
        source_conversation, source_message, source_kind, memory_key, confidence,
        status, valid_from, valid_until, scope, reason, inject_count)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, 0)`,
      [id, content, category, importance, now, now,
        options.sourceConversation || null, options.sourceMessage || null,
        options.sourceKind || 'inferred', options.memoryKey || null,
        options.confidence ?? 0.7, options.validFrom || null,
        options.validUntil || null, options.scope || 'long_term', options.reason || null]
    );
    await this.syncFts(id);
    return id;
  }

  async updateMemory(id: string, updates: Record<string, any>): Promise<void> {
    await this.ready();
    if (!this.db) return;
    const sets = Object.entries(updates).map(([k, _]) => `${k} = ?`);
    const values = Object.values(updates);
    await this.db.run(`UPDATE memories SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, [...values, Date.now(), id]);
  }

  async mergeMemory(existing: Memory, candidate: MemoryWriteOptions & { content: string; category: Memory['category']; importance: number }): Promise<void> {
    await this.ready();
    if (!this.db) return;
    const content = candidate.content.length > existing.content.length ? candidate.content : existing.content;
    await this.db.run(
      `UPDATE memories SET content = ?, category = ?, importance = ?, confidence = ?, access_count = access_count + 1,
       updated_at = ?, source_conversation = COALESCE(?, source_conversation),
       source_message = COALESCE(?, source_message), source_kind = ?,
       memory_key = COALESCE(?, memory_key), valid_from = COALESCE(?, valid_from),
       valid_until = COALESCE(?, valid_until), scope = COALESCE(?, scope),
       reason = COALESCE(?, reason) WHERE id = ?`,
      [content, candidate.category, Math.max(existing.importance, candidate.importance),
        Math.max(existing.confidence || 0, candidate.confidence || 0), Date.now(),
        candidate.sourceConversation || null, candidate.sourceMessage || null,
        candidate.sourceKind || existing.source_kind || 'inferred', candidate.memoryKey || null,
        candidate.validFrom || null, candidate.validUntil || null, candidate.scope || null,
        candidate.reason || null, existing.id]
    );
    await this.syncFts(existing.id);
    logger.info('相似记忆已合并', { id: existing.id, memoryKey: candidate.memoryKey });
  }

  async deleteMemory(id: string): Promise<void> {
    await this.ready();
    if (!this.db) return;
    const row = await this.db.get('SELECT rowid FROM memories WHERE id = ?', [id]);
    await this.db.run('DELETE FROM memories WHERE id = ?', [id]);
    if (row) { try { await this.db.run('DELETE FROM memories_fts WHERE rowid = ?', [row.rowid]); } catch (_) {} }
    logger.info('Memory deleted', { id });
  }

  async setStatus(id: string, status: 'active' | 'archived'): Promise<void> {
    await this.ready();
    if (!this.db) return;
    await this.db.run('UPDATE memories SET status = ?, updated_at = ? WHERE id = ?', [status, Date.now(), id]);
    logger.info('记忆状态已更新', { id, status });
  }

  async clearAll(): Promise<void> {
    await this.ready();
    if (!this.db) return;
    await this.db.run('DELETE FROM memories');
    try { await this.db.run('DELETE FROM memories_fts'); } catch (_) {}
    logger.warn('All memories cleared');
  }

  // ========== 查询 ==========

  async getAll(): Promise<Memory[]> {
    await this.ready();
    if (!this.db) return [];
    await this.runMaintenance();
    return this.db.all(`SELECT * FROM memories ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'superseded' THEN 1 ELSE 2 END, updated_at DESC`) as Promise<Memory[]>;
  }

  async getActive(): Promise<Memory[]> {
    await this.ready();
    if (!this.db) return [];
    return this.db.all("SELECT * FROM memories WHERE status = 'active'") as Promise<Memory[]>;
  }

  async getRecent(limit: number, category?: string): Promise<Memory[]> {
    await this.ready();
    if (!this.db) return [];
    let query = "SELECT * FROM memories WHERE status = 'active' AND (valid_until IS NULL OR valid_until > ?)";
    const params: any[] = [Date.now()];
    if (category) { query += ' AND category = ?'; params.push(category); }
    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);
    return this.db.all(query, params) as Promise<Memory[]>;
  }

  async getByKey(memoryKey: string): Promise<Memory | undefined> {
    await this.ready();
    if (!this.db) return undefined;
    return this.db.get("SELECT * FROM memories WHERE memory_key = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1", [memoryKey]) as Promise<Memory | undefined>;
  }

  async getCore(limit: number): Promise<Memory[]> {
    await this.ready();
    if (!this.db) return [];
    await this.runMaintenance();
    return this.db.all(
      `SELECT * FROM memories WHERE status = 'active' AND scope = 'core' AND (valid_until IS NULL OR valid_until > ?) ORDER BY importance DESC, confidence DESC, updated_at DESC LIMIT ?`,
      [Date.now(), limit]
    ) as Promise<Memory[]>;
  }

  async searchFTS(query: string, limit: number): Promise<Memory[]> {
    await this.ready();
    if (!this.db) return [];
    try {
      const tokens = query.split(/\s+/).filter(w => w.length > 0);
      const matchQuery = tokens.map(t => `"${t.replace(/"/g, '""')}"`).join(' OR ');
      const rows = await this.db.all(
        `SELECT m.*, rank FROM memories_fts fts JOIN memories m ON m.rowid = fts.rowid
         WHERE memories_fts MATCH ? AND m.status = 'active' AND (m.valid_until IS NULL OR m.valid_until > ?)
         ORDER BY rank LIMIT ?`,
        [matchQuery, Date.now(), limit]
      );
      if (rows.length === 0) return [];
      const now = Date.now();
      const scored = rows.map((row: any) => {
        const ageInDays = (now - row.created_at) / (1000 * 60 * 60 * 24);
        const decay = 5 * Math.exp(-ageInDays / 60);
        return { ...row, score: (row.importance * 0.5) + decay - Math.abs(row.rank || 0) };
      });
      scored.sort((a: any, b: any) => b.score - a.score);
      return scored.slice(0, limit) as Memory[];
    } catch { return []; }
  }

  async markInjected(ids: string[]): Promise<void> {
    await this.ready();
    if (!this.db || ids.length === 0) return;
    const unique = Array.from(new Set(ids));
    const placeholders = unique.map(() => '?').join(',');
    await this.db.run(
      `UPDATE memories SET access_count = access_count + 1, inject_count = COALESCE(inject_count, 0) + 1,
       last_injected_at = ?, updated_at = ? WHERE id IN (${placeholders})`,
      [Date.now(), Date.now(), ...unique]
    );
  }

  // ========== FTS 同步 ==========

  async syncFts(id: string): Promise<void> {
    if (!this.db) return;
    try {
      const row = await this.db.get('SELECT rowid, content, category FROM memories WHERE id = ?', [id]);
      if (!row) return;
      await this.db.run('DELETE FROM memories_fts WHERE rowid = ?', [row.rowid]);
      await this.db.run('INSERT INTO memories_fts(rowid, content, category) VALUES (?, ?, ?)', [row.rowid, row.content, row.category]);
    } catch (error) {
      logger.error('FTS5 sync failed', { id, error });
    }
  }

  // ========== 维护 ==========

  async runMaintenance(): Promise<void> {
    if (!this.db) return;
    const now = Date.now();
    const result = await this.db.run(
      "UPDATE memories SET status = 'archived', updated_at = ? WHERE status = 'active' AND valid_until IS NOT NULL AND valid_until <= ?",
      [now, now]
    );
    if ((result.changes || 0) > 0) {
      logger.info('已归档过期记忆', { count: result.changes });
    }

    const activeMemories = await this.db.all(
      `SELECT * FROM memories WHERE status = 'active' ORDER BY importance DESC, confidence DESC, updated_at DESC`
    ) as Memory[];
    const seen = new Set<string>();
    let duplicateCount = 0;
    for (const memory of activeMemories) {
      const fingerprint = memory.content.trim().toLowerCase().replace(/\s+/g, ' ');
      if (!seen.has(fingerprint)) { seen.add(fingerprint); continue; }
      await this.db.run("UPDATE memories SET status = 'archived', updated_at = ? WHERE id = ?", [now, memory.id]);
      duplicateCount += 1;
    }
    if (duplicateCount > 0) {
      logger.info('已归档完全重复的旧记忆', { count: duplicateCount });
    }
  }

  async countActive(): Promise<number> {
    await this.ready();
    if (!this.db) return 0;
    const result = await this.db.get("SELECT COUNT(*) as count FROM memories WHERE status = 'active'") as { count: number };
    return result.count;
  }

  async evictByIds(ids: string[]): Promise<void> {
    await this.ready();
    if (!this.db || ids.length === 0) return;
    const now = Date.now();
    for (const id of ids) {
      const row = await this.db.get('SELECT rowid FROM memories WHERE id = ?', [id]);
      await this.db.run("UPDATE memories SET status = 'archived', updated_at = ? WHERE id = ?", [now, id]);
      if (row) { try { await this.db.run('DELETE FROM memories_fts WHERE rowid = ?', [row.rowid]); } catch (_) {} }
    }
    logger.info('Memory eviction completed', { archivedCount: ids.length });
  }

  getDataDir(): string { return this.dataDir; }
  getMaxMemories(): number { return MAX_MEMORIES; }
}
