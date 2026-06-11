// ==========================================
// 记忆服务（主进程）
// 负责用户记忆的存储和读取
// ==========================================

import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import crypto from 'crypto';
import { createLogger } from '../../shared/logger';

const logger = createLogger('memoryStore');

/**
 * 用户偏好类型
 */
export interface UserPreferences {
  favoriteArtist?: string;
  musicGenre?: string;
  wakeWord?: string;
  voiceSpeed?: number;
  voicePitch?: number;
  theme?: 'light' | 'dark';
  [key: string]: any;
}

/**
 * 记忆类型
 */
export interface Memory {
  id: string;
  content: string;
  category: 'preference' | 'fact' | 'project' | 'decision' | 'belief' | 'event';
  importance: number;
  created_at: number;
  updated_at: number;
  access_count: number;
  source_conversation?: string;
  source_message?: string;
  source_kind?: MemorySourceKind;
  memory_key?: string;
  confidence: number;
  status: MemoryStatus;
  valid_from?: number;
  valid_until?: number;
  superseded_by?: string;
  scope?: MemoryScope;
  reason?: string;
  last_injected_at?: number;
  inject_count?: number;
}

export type MemoryStatus = 'active' | 'superseded' | 'archived';
export type MemorySourceKind = 'explicit' | 'inferred' | 'manual';
export type MemoryScope = 'core' | 'long_term';

export interface MemoryWriteOptions {
  sourceConversation?: string;
  sourceMessage?: string;
  sourceKind?: MemorySourceKind;
  memoryKey?: string;
  confidence?: number;
  validFrom?: number;
  validUntil?: number;
  scope?: MemoryScope;
  reason?: string;
}

export interface MemoryWriteResult {
  action: 'added' | 'merged' | 'superseded' | 'ignored';
  id?: string;
  reason: string;
}

/**
 * 记忆服务类（主进程）
 */
export class MemoryService {
  private dataDir: string;
  private preferencesPath: string;
  private dbPath: string;
  private preferences: UserPreferences;
  private db: Database | null = null;
  private dbReady: Promise<void>;
  
  private static readonly MAX_MEMORIES = 500;
  private static readonly DATA_DIR_NAME = 'nova-memory';
  private static readonly LEGACY_DATA_DIR_NAME = 'qiyuan-memory';

  constructor() {
    this.dataDir = path.join(app.getPath('userData'), MemoryService.DATA_DIR_NAME);
    this.preferencesPath = path.join(this.dataDir, 'preferences.json');
    this.dbPath = path.join(this.dataDir, 'memories.db');
    
    this.ensureDataDir();
    this.preferences = this.loadPreferences();
    this.dbReady = this.initDatabase();
    
    logger.info('Main memory service initialized');
  }

  /**
   * 等待数据库初始化完成
   */
  private async ensureDbReady(): Promise<void> {
    await this.dbReady;
  }

  private ensureDataDir(): void {
    this.migrateLegacyDataDir();

    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
      logger.info('Memory data directory created', { dataDir: this.dataDir });
    }
  }

  private migrateLegacyDataDir(): void {
    const legacyDataDir = path.join(app.getPath('userData'), MemoryService.LEGACY_DATA_DIR_NAME);
    if (fs.existsSync(this.dataDir) || !fs.existsSync(legacyDataDir)) return;

    try {
      fs.cpSync(legacyDataDir, this.dataDir, { recursive: true });
      logger.info('Legacy memory data migrated', {
        from: legacyDataDir,
        to: this.dataDir,
      });
    } catch (error) {
      logger.error('Legacy memory data migration failed', {
        from: legacyDataDir,
        to: this.dataDir,
        error,
      });
    }
  }

  private loadPreferences(): UserPreferences {
    try {
      if (fs.existsSync(this.preferencesPath)) {
        const data = fs.readFileSync(this.preferencesPath, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      logger.error('Load user preferences failed', error);
    }
    return {};
  }

  private savePreferences(): void {
    try {
      fs.writeFileSync(this.preferencesPath, JSON.stringify(this.preferences, null, 2));
      logger.info('User preferences saved');
    } catch (error) {
      logger.error('Save user preferences failed', error);
    }
  }

  private async initDatabase(): Promise<void> {
    try {
      this.db = await open({
        filename: this.dbPath,
        driver: sqlite3.Database
      });

      await this.db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA foreign_keys = ON;
      `);

      // 创建记忆表
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

      await this.migrateMemorySchema();
      await this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_memory_status ON memories(status);
        CREATE INDEX IF NOT EXISTS idx_memory_key ON memories(memory_key);
        CREATE INDEX IF NOT EXISTS idx_memory_valid_until ON memories(valid_until);
      `);

      // FTS5 全文检索虚拟表
      await this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(content, category);
      `);

      // 回填：如果 FTS 表为空但 memories 有数据，批量同步
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

  private async migrateMemorySchema(): Promise<void> {
    if (!this.db) return;

    const columns = await this.db.all('PRAGMA table_info(memories)') as Array<{ name: string }>;
    const existing = new Set(columns.map(column => column.name));
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

  // ========== 公开方法 ==========

  /**
   * 设置用户偏好
   * @param key 偏好键名
   * @param value 偏好值
   */
  setPreference(key: string, value: any): void {
    this.preferences[key] = value;
    this.savePreferences();
  }

  /**
   * 获取用户偏好
   * @param key 偏好键名
   * @returns 偏好值
   */
  getPreference(key: string): any {
    return this.preferences[key];
  }

  /**
   * 获取所有用户偏好
   * @returns 用户偏好对象副本
   */
  getAllPreferences(): UserPreferences {
    return { ...this.preferences };
  }

  /**
   * 添加记忆（带去重 + 自动清理）
   * @param content 记忆内容
   * @param category 记忆类别
   * @param importance 重要性 1-10
   */
  async addMemory(
    content: string,
    category: Memory['category'] = 'fact',
    importance: number = 5,
    options: MemoryWriteOptions = {}
  ): Promise<MemoryWriteResult> {
    await this.ensureDbReady();
    if (!this.db) {
      logger.error('Memory database is not initialized');
      return { action: 'ignored', reason: 'database_unavailable' };
    }

    const trimmedContent = content.trim();
    if (trimmedContent.length < 4 || trimmedContent.length > 500) {
      logger.warn('忽略长度异常的候选记忆', { length: trimmedContent.length });
      return { action: 'ignored', reason: 'invalid_length' };
    }

    const normalizedCategory = this.normalizeCategory(category);
    const normalizedImportance = Math.max(1, Math.min(10, Math.round(importance)));
    const confidence = Math.max(0, Math.min(1, options.confidence ?? (options.sourceKind === 'explicit' ? 1 : 0.7)));
    const sourceKind = options.sourceKind || 'inferred';
    const memoryKey = this.normalizeMemoryKey(options.memoryKey);
    const validUntil = this.normalizeTimestamp(options.validUntil);
    const validFrom = this.normalizeTimestamp(options.validFrom);
    const scope = this.normalizeScope(options.scope, normalizedCategory, memoryKey, normalizedImportance);
    const reason = this.normalizeReason(options.reason);

    if (sourceKind === 'inferred' && confidence < 0.78) {
      logger.info('忽略低可信度候选记忆', { content: trimmedContent, confidence });
      return { action: 'ignored', reason: 'low_confidence' };
    }

    if (validUntil && validUntil <= Date.now()) {
      logger.info('忽略已经过期的候选记忆', { content: trimmedContent, validUntil });
      return { action: 'ignored', reason: 'already_expired' };
    }

    if (memoryKey) {
      const existingByKey = await this.db.get(
        "SELECT * FROM memories WHERE memory_key = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1",
        [memoryKey]
      ) as Memory | undefined;

      if (existingByKey) {
        if (this.normalizeContent(trimmedContent) === this.normalizeContent(existingByKey.content)) {
          await this.mergeMemory(existingByKey, {
            content: trimmedContent,
            category: normalizedCategory,
            importance: normalizedImportance,
            confidence,
            sourceKind,
            memoryKey,
            validFrom,
            validUntil,
            scope,
            reason,
            ...options,
          });
          return { action: 'merged', id: existingByKey.id, reason: 'same_memory_key_similar_content' };
        }

        const id = await this.insertMemory(trimmedContent, normalizedCategory, normalizedImportance, {
          ...options,
          sourceKind,
          memoryKey,
          confidence,
          validFrom,
          validUntil,
          scope,
          reason,
        });
        await this.db.run(
          "UPDATE memories SET status = 'superseded', superseded_by = ?, updated_at = ? WHERE id = ?",
          [id, Date.now(), existingByKey.id]
        );
        logger.info('旧记忆已被新事实替换', { oldId: existingByKey.id, newId: id, memoryKey });
        return { action: 'superseded', id, reason: 'same_memory_key_new_content' };
      }
    }
    
    // 1. 去重检查
    const duplicate = await this.deduplicateMemory(trimmedContent);
    if (duplicate) {
      await this.mergeMemory(duplicate, {
        content: trimmedContent,
        category: normalizedCategory,
        importance: normalizedImportance,
        confidence,
        sourceKind,
        memoryKey,
        validFrom,
        validUntil,
        scope,
        reason,
        ...options,
      });
      return { action: 'merged', id: duplicate.id, reason: 'similar_content' };
    }
    
    // 2. 存入新记忆
    const id = await this.insertMemory(trimmedContent, normalizedCategory, normalizedImportance, {
      ...options,
      sourceKind,
      memoryKey,
      confidence,
      validFrom,
      validUntil,
      scope,
      reason,
    });
    
    // 3. 容量检查，超限则自动淘汰
    const { count } = await this.db.get("SELECT COUNT(*) as count FROM memories WHERE status = 'active'") as { count: number };
    if (count > MemoryService.MAX_MEMORIES) {
      await this.evictMemories(count - MemoryService.MAX_MEMORIES);
    }
    
    logger.info('Memory added', { id, category: normalizedCategory, importance: normalizedImportance, content: trimmedContent });
    return { action: 'added', id, reason: 'new_memory' };
  }

  private async insertMemory(
    content: string,
    category: Memory['category'],
    importance: number,
    options: MemoryWriteOptions
  ): Promise<string> {
    const id = crypto.randomUUID();
    const now = Date.now();
    await this.db!.run(
      `INSERT INTO memories (
        id, content, category, importance, created_at, updated_at, access_count,
        source_conversation, source_message, source_kind, memory_key, confidence,
        status, valid_from, valid_until, scope, reason, inject_count
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, 0)`,
      [
        id, content, category, importance, now, now,
        options.sourceConversation || null,
        options.sourceMessage || null,
        options.sourceKind || 'inferred',
        options.memoryKey || null,
        options.confidence ?? 0.7,
        options.validFrom || null,
        options.validUntil || null,
        options.scope || 'long_term',
        options.reason || null,
      ]
    );
    await this.syncFtsForMemory(id);
    return id;
  }

  private async mergeMemory(existing: Memory, candidate: MemoryWriteOptions & {
    content: string;
    category: Memory['category'];
    importance: number;
  }): Promise<void> {
    const content = candidate.content.length > existing.content.length ? candidate.content : existing.content;
    await this.db!.run(
      `UPDATE memories
       SET content = ?, category = ?, importance = ?, confidence = ?, access_count = access_count + 1,
           updated_at = ?, source_conversation = COALESCE(?, source_conversation),
           source_message = COALESCE(?, source_message), source_kind = ?,
           memory_key = COALESCE(?, memory_key), valid_from = COALESCE(?, valid_from),
           valid_until = COALESCE(?, valid_until), scope = COALESCE(?, scope),
           reason = COALESCE(?, reason)
       WHERE id = ?`,
      [
        content,
        candidate.category,
        Math.max(existing.importance, candidate.importance),
        Math.max(existing.confidence || 0, candidate.confidence || 0),
        Date.now(),
        candidate.sourceConversation || null,
        candidate.sourceMessage || null,
        candidate.sourceKind || existing.source_kind || 'inferred',
        candidate.memoryKey || null,
        candidate.validFrom || null,
        candidate.validUntil || null,
        candidate.scope || null,
        candidate.reason || null,
        existing.id,
      ]
    );
    await this.syncFtsForMemory(existing.id);
    logger.info('相似记忆已合并', { id: existing.id, memoryKey: candidate.memoryKey });
  }

  private async syncFtsForMemory(id: string): Promise<void> {
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
  
  /**
   * 淘汰最低分记忆
   * @param count 要淘汰的数量
   */
  private async evictMemories(count: number): Promise<void> {
    await this.ensureDbReady();
    if (!this.db) {
      logger.error('Memory database is not initialized');
      return;
    }

    try {
      const allMemories = await this.db.all("SELECT * FROM memories WHERE status = 'active'") as Memory[];
      const now = Date.now();

      const scored = allMemories.map(mem => {
        const ageInDays = (now - mem.created_at) / (1000 * 60 * 60 * 24);
        const score = mem.importance * 0.5 + mem.access_count + 5 * Math.exp(-ageInDays / 60);
        return { ...mem, score };
      });

      scored.sort((a, b) => a.score - b.score);
      const toEvict = scored.slice(0, count);

      for (const mem of toEvict) {
        const row = await this.db.get('SELECT rowid FROM memories WHERE id = ?', [mem.id]);
        await this.db.run("UPDATE memories SET status = 'archived', updated_at = ? WHERE id = ?", [Date.now(), mem.id]);
        if (row) {
          try { await this.db.run('DELETE FROM memories_fts WHERE rowid = ?', [row.rowid]); } catch (_) {}
        }
      }

      logger.info('Memory eviction completed', { archivedCount: toEvict.length });
    } catch (error) {
      logger.error('Memory eviction failed', error);
    }
  }

  /**
   * 记忆去重（内容相似度>90%则合并）
   * @param content 新记忆内容
   * @returns 重复的记忆或null
   */
  private async deduplicateMemory(content: string): Promise<Memory | null> {
    await this.ensureDbReady();
    if (!this.db) {
      logger.error('Memory database is not initialized');
      return null;
    }

    try {
      const contentLower = content.toLowerCase();
      // 跨类别比较，避免同义记忆分散在不同 category 中
      const memories = await this.db.all("SELECT * FROM memories WHERE status = 'active'");

      for (const mem of memories) {
        const similarity = this.calculateSimilarity(contentLower, mem.content.toLowerCase());
        if (similarity >= 0.9) {
          return mem as Memory;
        }
      }

      return null;
    } catch (error) {
      logger.error('Memory deduplication failed', error);
      return null;
    }
  }

  /**
   * 计算字符串相似度（Jaccard 字符二元组）
   * 比 LCS 快一个数量级，对中文效果好
   */
  private calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1.0;
    if (str1.length < 2 || str2.length < 2) {
      return str1 === str2 ? 1.0 : 0;
    }

    const bigrams1 = this.getBigrams(str1);
    const bigrams2 = this.getBigrams(str2);

    const set1 = new Set(bigrams1);
    const set2 = new Set(bigrams2);

    let intersection = 0;
    for (const b of set1) {
      if (set2.has(b)) intersection++;
    }

    const union = set1.size + set2.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  private getBigrams(str: string): string[] {
    const bigrams: string[] = [];
    for (let i = 0; i < str.length - 1; i++) {
      bigrams.push(str.slice(i, i + 2));
    }
    return bigrams;
  }

  private normalizeCategory(category: string): Memory['category'] {
    const allowed = new Set<Memory['category']>(['preference', 'fact', 'project', 'decision', 'belief', 'event']);
    return allowed.has(category as Memory['category']) ? category as Memory['category'] : 'fact';
  }

  private normalizeMemoryKey(memoryKey?: string): string | undefined {
    if (!memoryKey) return undefined;
    const normalized = memoryKey.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 100);
    if (!/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/.test(normalized)) return undefined;
    return normalized || undefined;
  }

  private normalizeScope(scope: unknown, category: Memory['category'], memoryKey?: string, importance: number = 5): MemoryScope {
    if (scope === 'core' || scope === 'long_term') return scope;
    if (memoryKey?.startsWith('profile.')) return 'core';
    if (memoryKey === 'preference.reply_style' || memoryKey === 'preference.language') return 'core';
    if (category === 'preference' && importance >= 7) return 'core';
    if (category === 'project' && importance >= 8) return 'core';
    return 'long_term';
  }

  private normalizeReason(reason?: string): string | undefined {
    const normalized = reason?.trim().slice(0, 300);
    return normalized || undefined;
  }

  private normalizeContent(content: string): string {
    return content.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private normalizeTimestamp(value?: number): number | undefined {
    if (!value || !Number.isFinite(value)) return undefined;
    return Math.round(value);
  }

  private async runMaintenance(): Promise<void> {
    if (!this.db) return;
    const now = Date.now();
    const result = await this.db.run(
      "UPDATE memories SET status = 'archived', updated_at = ? WHERE status = 'active' AND valid_until IS NOT NULL AND valid_until <= ?",
      [now, now]
    );
    if ((result.changes || 0) > 0) {
      logger.info('已归档过期记忆', { count: result.changes });
    }

    const activeMemories = await this.db.all(`
      SELECT * FROM memories
      WHERE status = 'active'
      ORDER BY importance DESC, confidence DESC, updated_at DESC
    `) as Memory[];
    const seen = new Set<string>();
    let duplicateCount = 0;

    for (const memory of activeMemories) {
      const fingerprint = this.normalizeContent(memory.content);
      if (!seen.has(fingerprint)) {
        seen.add(fingerprint);
        continue;
      }
      await this.db.run("UPDATE memories SET status = 'archived', updated_at = ? WHERE id = ?", [now, memory.id]);
      duplicateCount += 1;
    }

    if (duplicateCount > 0) {
      logger.info('已归档完全重复的旧记忆', { count: duplicateCount });
    }
  }

  /**
   * 搜索记忆（关键词+类别+时间衰减+重要性加权）
   * @param query 搜索查询
   * @param limit 限制数量
   * @returns 匹配的记忆数组
   */
  async searchMemories(query: string, limit: number = 10): Promise<Memory[]> {
    await this.ensureDbReady();
    if (!this.db) {
      logger.error('Memory database is not initialized');
      return [];
    }

    try {
      const trimmed = query.trim();
      if (!trimmed) {
        return await this.getRecentMemories(limit);
      }

      // FTS5 检索
      await this.runMaintenance();
      const ftsResults = await this.searchWithFTS(trimmed, limit);
      if (ftsResults.length > 0) return ftsResults;

      // 降级：子串匹配 + 指数时间衰减
      return await this.searchWithSubstring(trimmed, limit);
    } catch (error) {
      logger.error('Search memories failed', error);
      return [];
    }
  }

  private async searchWithFTS(query: string, limit: number): Promise<Memory[]> {
    if (!this.db) return [];

    try {
      // FTS5 MATCH 语法：对中文做字符级分词
      const tokens = query.split(/\s+/).filter(w => w.length > 0);
      const matchQuery = tokens.map(t => `"${t.replace(/"/g, '""')}"`).join(' OR ');

      const rows = await this.db.all(`
        SELECT m.*, rank
        FROM memories_fts fts
        JOIN memories m ON m.rowid = fts.rowid
        WHERE memories_fts MATCH ? AND m.status = 'active'
          AND (m.valid_until IS NULL OR m.valid_until > ?)
        ORDER BY rank
        LIMIT ?
      `, [matchQuery, Date.now(), limit]);

      if (rows.length === 0) return [];

      // 叠加 importance 和时间衰减重新排序
      const now = Date.now();
      const scored = rows.map((row: any) => {
        const ageInDays = (now - row.created_at) / (1000 * 60 * 60 * 24);
        const decay = 5 * Math.exp(-ageInDays / 60);
        return { ...row, score: (row.importance * 0.5) + decay - Math.abs(row.rank || 0) };
      });

      scored.sort((a: any, b: any) => b.score - a.score);
      return scored.slice(0, limit) as Memory[];
    } catch {
      return [];
    }
  }

  private async searchWithSubstring(query: string, limit: number): Promise<Memory[]> {
    if (!this.db) return [];

    const keywords = query.split(/\s+/).filter(w => w.length > 1);
    if (keywords.length === 0) return await this.getRecentMemories(limit);

    const allMemories = await this.db.all(
      "SELECT * FROM memories WHERE status = 'active' AND (valid_until IS NULL OR valid_until > ?)",
      [Date.now()]
    );
    const now = Date.now();

    const scored = allMemories.map(mem => {
      let score = 0;
      for (const kw of keywords) {
        if (mem.content.toLowerCase().includes(kw.toLowerCase())) score += 1;
      }
      const ageInDays = (now - mem.created_at) / (1000 * 60 * 60 * 24);
      score += 5 * Math.exp(-ageInDays / 60);
      score += mem.importance * 0.5;
      return { ...mem, score };
    });

    return scored
      .filter(m => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit) as Memory[];
  }

  /**
   * 获取最近N条记忆
   * @param limit 限制数量
   * @param category 可选的类别过滤
   * @returns 最近的记忆数组
   */
  async getRecentMemories(limit: number = 10, category?: string): Promise<Memory[]> {
    await this.ensureDbReady();
    if (!this.db) {
      logger.error('Memory database is not initialized');
      return [];
    }

    try {
      let query = "SELECT * FROM memories WHERE status = 'active' AND (valid_until IS NULL OR valid_until > ?)";
      const params: any[] = [Date.now()];

      if (category) {
        query += ' AND category = ?';
        params.push(category);
      }

      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);

      return await this.db.all(query, params) as Memory[];
    } catch (error) {
      logger.error('Get recent memories failed', error);
      return [];
    }
  }

  /**
   * 获取所有记忆
   * @returns 记忆数组
   */
  async getAllMemories(): Promise<Memory[]> {
    await this.ensureDbReady();
    if (!this.db) {
      logger.error('Memory database is not initialized');
      return [];
    }

    try {
      await this.runMaintenance();
      return await this.db.all(`
        SELECT * FROM memories
        ORDER BY
          CASE status WHEN 'active' THEN 0 WHEN 'superseded' THEN 1 ELSE 2 END,
          updated_at DESC
      `) as Memory[];
    } catch (error) {
      logger.error('Get all memories failed', error);
      return [];
    }
  }

  /**
   * 删除指定记忆
   * @param id 记忆ID
   */
  async deleteMemory(id: string): Promise<void> {
    await this.ensureDbReady();
    if (!this.db) {
      logger.error('Memory database is not initialized');
      return;
    }

    try {
      const row = await this.db.get('SELECT rowid FROM memories WHERE id = ?', [id]);
      await this.db.run('DELETE FROM memories WHERE id = ?', [id]);
      if (row) {
        try { await this.db.run('DELETE FROM memories_fts WHERE rowid = ?', [row.rowid]); } catch (_) {}
      }
      logger.info('Memory deleted', { id });
    } catch (error) {
      logger.error('Delete memory failed', { id, error });
    }
  }

  /**
   * 更新记忆状态。归档用于整理低价值记忆，恢复仅允许将归档记录重新激活。
   */
  async setMemoryStatus(id: string, status: 'active' | 'archived'): Promise<void> {
    await this.ensureDbReady();
    if (!this.db) {
      logger.error('Memory database is not initialized');
      return;
    }

    await this.db.run('UPDATE memories SET status = ?, updated_at = ? WHERE id = ?', [status, Date.now(), id]);
    logger.info('记忆状态已更新', { id, status });
  }

  /**
   * 清空所有记忆
   */
  async clearAllMemories(): Promise<void> {
    await this.ensureDbReady();
    if (!this.db) {
      logger.error('Memory database is not initialized');
      return;
    }

    try {
      await this.db.run('DELETE FROM memories');
      try { await this.db.run('DELETE FROM memories_fts'); } catch (_) {}
      logger.warn('All memories cleared');
    } catch (error) {
      logger.error('Clear all memories failed', error);
    }
  }

  /**
   * 生成用于LLM的记忆提示词
   * @param userInput 用户输入，用于记忆检索
   * @returns 格式化的记忆提示词字符串
   */
  async getMemoryPrompt(userInput: string = ''): Promise<string> {
    await this.ensureDbReady();
    const parts: string[] = [];
    
    // 1. 偏好：全部输出
    const prefs = this.getAllPreferences();
    if (Object.keys(prefs).length > 0) {
      parts.push('【用户偏好】');
      for (const [key, value] of Object.entries(prefs)) {
        if (value) {
          parts.push(`- ${key}: ${value}`);
        }
      }
    }
    
    // 2. 常驻记忆：身份、回复偏好、长期项目等基础上下文
    const coreMemories = await this.getCoreMemories(8);
    if (coreMemories.length > 0) {
      parts.push('\n【常驻记忆】');
      for (const mem of coreMemories) {
        parts.push(`- [${mem.category}] ${mem.content}`);
      }
    }

    // 3. 相关记忆：根据用户当前输入检索，排除已经常驻注入的内容
    const coreIds = new Set(coreMemories.map(memory => memory.id));
    const relevantMemories = (await this.searchMemories(userInput, 10))
      .filter(memory => !coreIds.has(memory.id));
    
    if (relevantMemories.length > 0) {
      parts.push('\n【相关记忆】');
      for (const mem of relevantMemories) {
        parts.push(`- [${mem.category}] ${mem.content}`);
      }

    }

    await this.markMemoriesInjected([...coreMemories, ...relevantMemories]);
    
    return parts.length > 0 ? parts.join('\n') : '';
  }

  private async getCoreMemories(limit: number): Promise<Memory[]> {
    await this.ensureDbReady();
    if (!this.db) return [];
    try {
      await this.runMaintenance();
      return await this.db.all(
        `SELECT * FROM memories
         WHERE status = 'active'
           AND scope = 'core'
           AND (valid_until IS NULL OR valid_until > ?)
         ORDER BY importance DESC, confidence DESC, updated_at DESC
         LIMIT ?`,
        [Date.now(), limit]
      ) as Memory[];
    } catch (error) {
      logger.error('Get core memories failed', error);
      return [];
    }
  }

  private async markMemoriesInjected(memories: Memory[]): Promise<void> {
    if (!this.db || memories.length === 0) return;
    try {
      const ids = Array.from(new Set(memories.map(memory => memory.id)));
      const placeholders = ids.map(() => '?').join(',');
      await this.db.run(
        `UPDATE memories
         SET access_count = access_count + 1,
             inject_count = COALESCE(inject_count, 0) + 1,
             last_injected_at = ?,
             updated_at = ?
         WHERE id IN (${placeholders})`,
        [Date.now(), Date.now(), ...ids]
      );
    } catch (error) {
      logger.error('Failed to update memory injection counters', error);
    }
  }
}

// 创建单例
let memoryServiceInstance: MemoryService | null = null;

export function getMemoryService(): MemoryService {
  if (!memoryServiceInstance) {
    memoryServiceInstance = new MemoryService();
  }
  return memoryServiceInstance;
}
