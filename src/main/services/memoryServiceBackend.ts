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

const logger = createLogger('memory');

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
          source_conversation TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_category ON memories(category);
        CREATE INDEX IF NOT EXISTS idx_importance ON memories(importance);
        CREATE INDEX IF NOT EXISTS idx_created_at ON memories(created_at);
      `);

      logger.info('SQLite memory database initialized');
    } catch (error) {
      logger.error('Initialize memory database failed', error);
    }
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
  async addMemory(content: string, category: Memory['category'] = 'fact', importance: number = 5): Promise<void> {
    await this.ensureDbReady();
    if (!this.db) {
      logger.error('Memory database is not initialized');
      return;
    }

    const trimmedContent = content.trim();
    
    // 1. 去重检查
    const duplicate = await this.deduplicateMemory(trimmedContent);
    if (duplicate) {
      await this.db.run(
        'UPDATE memories SET access_count = access_count + 1, updated_at = ? WHERE id = ?',
        [Date.now(), duplicate.id]
      );
      logger.info('Similar memory detected, access count updated', { id: duplicate.id });
      return;
    }
    
    // 2. 存入新记忆
    const id = crypto.randomUUID();
    const now = Date.now();
    await this.db.run(
      'INSERT INTO memories (id, content, category, importance, created_at, updated_at, access_count) VALUES (?, ?, ?, ?, ?, ?, 0)',
      [id, trimmedContent, category, importance, now, now]
    );
    
    // 3. 容量检查，超限则自动淘汰
    const { count } = await this.db.get('SELECT COUNT(*) as count FROM memories') as { count: number };
    if (count > MemoryService.MAX_MEMORIES) {
      await this.evictMemories(count - MemoryService.MAX_MEMORIES);
    }
    
    logger.info('Memory added', { id, category, importance, content: trimmedContent });
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
      // 淘汰规则：优先级 = importance * 0.5 + access_count + 时间衰减分
      // 时间衰减：30天内线性衰减，超过30天不再加分
      const toEvict = await this.db.all(`
        SELECT id FROM memories
        ORDER BY (
          importance * 0.5
          + access_count
          + MAX(0, 5 - (strftime('%s','now') - created_at / 1000) / 86400 / 30)
        ) ASC
        LIMIT ?
      `, [count]);

      for (const mem of toEvict) {
        await this.db.run('DELETE FROM memories WHERE id = ?', [mem.id]);
      }

      logger.info('Memory eviction completed', { evictedCount: toEvict.length });
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
      const memories = await this.db.all('SELECT * FROM memories');
      const contentLower = content.toLowerCase();

      for (const mem of memories) {
        const existingContentLower = mem.content.toLowerCase();
        const similarity = this.calculateSimilarity(contentLower, existingContentLower);
        if (similarity > 0.9) {
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
   * 计算字符串相似度（基于最长公共子序列比率）
   * @param str1 字符串1
   * @param str2 字符串2
   * @returns 相似度 0-1
   */
  private calculateSimilarity(str1: string, str2: string): number {
    // 包含关系直接返回1.0
    if (str1.includes(str2) || str2.includes(str1)) {
      return 1.0;
    }

    const m = str1.length;
    const n = str2.length;
    if (m === 0 || n === 0) return 0;

    // 计算最长公共子序列（LCS）长度
    // 使用滚动数组优化空间复杂度 O(min(m,n))
    const shorter = m < n ? str1 : str2;
    const longer = m < n ? str2 : str1;
    const len = shorter.length;

    let prev = new Array(len + 1).fill(0);
    let curr = new Array(len + 1).fill(0);

    for (let i = 1; i <= longer.length; i++) {
      for (let j = 1; j <= len; j++) {
        if (longer[i - 1] === shorter[j - 1]) {
          curr[j] = prev[j - 1] + 1;
        } else {
          curr[j] = Math.max(prev[j], curr[j - 1]);
        }
      }
      [prev, curr] = [curr, prev];
      curr.fill(0);
    }

    const lcsLength = prev[len];
    // 相似度 = LCS长度 / 两个字符串的较长长度
    return lcsLength / Math.max(m, n);
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
      // 分词：将用户输入拆分为关键词
      const keywords = query.split(/\s+/).filter(w => w.length > 1);
      
      if (keywords.length === 0) {
        // 如果没有关键词，返回最近的记忆
        return await this.getRecentMemories(limit);
      }

      // 获取所有记忆
      const allMemories = await this.db.all('SELECT * FROM memories');
      
      // 对每条记忆计算匹配分数
      const scored = allMemories.map(mem => {
        let score = 0;
        for (const kw of keywords) {
          if (mem.content.toLowerCase().includes(kw.toLowerCase())) score += 1;
        }
        // 时间衰减：越近的记忆加分
        const ageInDays = (Date.now() - mem.created_at) / (1000 * 60 * 60 * 24);
        score += Math.max(0, 5 - ageInDays / 30); // 30天内线性衰减
        // 重要性加权
        score += mem.importance * 0.5;
        return { ...mem, score };
      });

      // 按分数排序，返回top N
      return scored
        .filter(m => m.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit) as Memory[];
    } catch (error) {
      logger.error('Search memories failed', error);
      return [];
    }
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
      let query = 'SELECT * FROM memories';
      const params: any[] = [];

      if (category) {
        query += ' WHERE category = ?';
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
      return await this.db.all('SELECT * FROM memories') as Memory[];
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
      await this.db.run('DELETE FROM memories WHERE id = ?', [id]);
      logger.info('Memory deleted', { id });
    } catch (error) {
      logger.error('Delete memory failed', { id, error });
    }
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
    
    // 2. 记忆：根据用户当前输入检索相关记忆
    const relevantMemories = await this.searchMemories(userInput, 10);
    
    if (relevantMemories.length > 0) {
      parts.push('\n【相关记忆】');
      for (const mem of relevantMemories) {
        parts.push(`- [${mem.category}] ${mem.content}`);
      }
    }
    
    return parts.length > 0 ? parts.join('\n') : '';
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
