// ==========================================
// 记忆服务门面（组合 Store + Strategy + Preference）
// ==========================================

import { createLogger } from '../../../shared/logger';
import type { Memory, MemoryWriteOptions, MemoryWriteResult, MemorySourceKind, MemoryScope } from './memoryTypes';
import { MemoryStore } from './memoryStore';
import { PreferenceStore } from './memoryPreference';
import { normalizeContent, normalizeMemoryKey, findDuplicate, selectEvictionCandidates } from './memoryStrategy';

export type { Memory, MemoryWriteOptions, MemoryWriteResult, MemorySourceKind, MemoryScope };

const logger = createLogger('memoryStore');

function normalizeCategory(category: string): Memory['category'] {
  const allowed = new Set<Memory['category']>(['preference', 'fact', 'project', 'decision', 'belief', 'event']);
  return allowed.has(category as Memory['category']) ? category as Memory['category'] : 'fact';
}

function normalizeScope(scope: unknown, category: Memory['category'], memoryKey?: string, importance: number = 5): MemoryScope {
  if (scope === 'core' || scope === 'long_term') return scope;
  if (memoryKey?.startsWith('profile.')) return 'core';
  if (memoryKey === 'preference.reply_style' || memoryKey === 'preference.language') return 'core';
  if (category === 'preference' && importance >= 7) return 'core';
  if (category === 'project' && importance >= 8) return 'core';
  return 'long_term';
}

export class MemoryService {
  private store: MemoryStore;
  private prefs: PreferenceStore;

  constructor() {
    this.store = new MemoryStore();
    this.prefs = new PreferenceStore(this.store.getDataDir());
    logger.info('Main memory service initialized');
  }

  // ========== 偏好 ==========

  setPreference(key: string, value: any): void { this.prefs.set(key, value); }
  getPreference(key: string): any { return this.prefs.get(key); }
  getAllPreferences() { return this.prefs.getAll(); }

  // ========== 记忆写入 ==========

  async addMemory(
    content: string,
    category: Memory['category'] = 'fact',
    importance: number = 5,
    options: MemoryWriteOptions = {}
  ): Promise<MemoryWriteResult> {
    await this.store.ready();
    const db = this.store.getDb();
    if (!db) return { action: 'ignored', reason: 'database_unavailable' };

    const trimmedContent = content.trim();
    if (trimmedContent.length < 4 || trimmedContent.length > 500) {
      return { action: 'ignored', reason: 'invalid_length' };
    }

    const normalizedCategory = normalizeCategory(category);
    const normalizedImportance = Math.max(1, Math.min(10, Math.round(importance)));
    const confidence = Math.max(0, Math.min(1, options.confidence ?? (options.sourceKind === 'explicit' ? 1 : 0.7)));
    const sourceKind = options.sourceKind || 'inferred';
    const memoryKey = normalizeMemoryKey(options.memoryKey);
    const validUntil = this.normalizeTimestamp(options.validUntil);
    const validFrom = this.normalizeTimestamp(options.validFrom);
    const scope = normalizeScope(options.scope, normalizedCategory, memoryKey, normalizedImportance);
    const reason = options.reason?.trim().slice(0, 300) || undefined;

    const opts: MemoryWriteOptions = { ...options, sourceKind, memoryKey, confidence, validFrom, validUntil, scope, reason };

    if (sourceKind === 'inferred' && confidence < 0.78) return { action: 'ignored', reason: 'low_confidence' };
    if (validUntil && validUntil <= Date.now()) return { action: 'ignored', reason: 'already_expired' };

    // memoryKey 去重
    if (memoryKey) {
      const existingByKey = await this.store.getByKey(memoryKey);
      if (existingByKey) {
        if (normalizeContent(trimmedContent) === normalizeContent(existingByKey.content)) {
          await this.store.mergeMemory(existingByKey, { content: trimmedContent, category: normalizedCategory, importance: normalizedImportance, ...opts });
          return { action: 'merged', id: existingByKey.id, reason: 'same_memory_key_similar_content' };
        }
        const id = await this.store.insertMemory(trimmedContent, normalizedCategory, normalizedImportance, opts);
        await this.store.updateMemory(existingByKey.id, { status: 'superseded', superseded_by: id });
        return { action: 'superseded', id, reason: 'same_memory_key_new_content' };
      }
    }

    // 内容去重
    const activeMemories = await this.store.getActive();
    const duplicate = findDuplicate(activeMemories, trimmedContent);
    if (duplicate) {
      await this.store.mergeMemory(duplicate, { content: trimmedContent, category: normalizedCategory, importance: normalizedImportance, ...opts });
      return { action: 'merged', id: duplicate.id, reason: 'similar_content' };
    }

    // 存入
    const id = await this.store.insertMemory(trimmedContent, normalizedCategory, normalizedImportance, opts);

    // 容量检查
    const count = await this.store.countActive();
    if (count > this.store.getMaxMemories()) {
      const toEvict = selectEvictionCandidates(activeMemories, count - this.store.getMaxMemories());
      await this.store.evictByIds(toEvict);
    }

    logger.info('Memory added', { id, category: normalizedCategory, importance: normalizedImportance });
    return { action: 'added', id, reason: 'new_memory' };
  }

  private normalizeTimestamp(value?: number): number | undefined {
    if (!value || !Number.isFinite(value)) return undefined;
    return Math.round(value);
  }

  // ========== 记忆查询 ==========

  async searchMemories(query: string, limit: number = 10): Promise<Memory[]> {
    await this.store.ready();
    const trimmed = query.trim();
    if (!trimmed) return this.store.getRecent(limit);
    await this.store.runMaintenance();
    const ftsResults = await this.store.searchFTS(trimmed, limit);
    if (ftsResults.length > 0) return ftsResults;
    return this.searchWithSubstring(trimmed, limit);
  }

  private async searchWithSubstring(query: string, limit: number): Promise<Memory[]> {
    const allMemories = await this.store.getActive();
    const keywords = query.split(/\s+/).filter(w => w.length > 1);
    if (keywords.length === 0) return this.store.getRecent(limit);
    const now = Date.now();
    const scored = allMemories.map(mem => {
      let score = 0;
      for (const kw of keywords) { if (mem.content.toLowerCase().includes(kw.toLowerCase())) score += 1; }
      const ageInDays = (now - mem.created_at) / (1000 * 60 * 60 * 24);
      score += 5 * Math.exp(-ageInDays / 60) + mem.importance * 0.5;
      return { ...mem, score };
    });
    return scored.filter(m => m.score > 0).sort((a, b) => b.score - a.score).slice(0, limit) as Memory[];
  }

  async getRecentMemories(limit: number = 10, category?: string): Promise<Memory[]> {
    await this.store.ready();
    return this.store.getRecent(limit, category);
  }

  async getAllMemories(): Promise<Memory[]> {
    await this.store.ready();
    return this.store.getAll();
  }

  async deleteMemory(id: string): Promise<void> {
    await this.store.ready();
    await this.store.deleteMemory(id);
  }

  async setMemoryStatus(id: string, status: 'active' | 'archived'): Promise<void> {
    await this.store.ready();
    await this.store.setStatus(id, status);
  }

  async clearAllMemories(): Promise<void> {
    await this.store.ready();
    await this.store.clearAll();
  }

  // ========== 记忆提示词 ==========

  async getMemoryPrompt(userInput: string = ''): Promise<string> {
    await this.store.ready();
    const parts: string[] = [];

    const prefs = this.getAllPreferences();
    if (Object.keys(prefs).length > 0) {
      parts.push('【用户偏好】');
      for (const [key, value] of Object.entries(prefs)) { if (value) parts.push(`- ${key}: ${value}`); }
    }

    const coreMemories = await this.store.getCore(8);
    if (coreMemories.length > 0) {
      parts.push('\n【常驻记忆】');
      for (const mem of coreMemories) parts.push(`- [${mem.category}] ${mem.content}`);
    }

    const coreIds = new Set(coreMemories.map(m => m.id));
    const relevantMemories = (await this.searchMemories(userInput, 10)).filter(m => !coreIds.has(m.id));
    if (relevantMemories.length > 0) {
      parts.push('\n【相关记忆】');
      for (const mem of relevantMemories) parts.push(`- [${mem.category}] ${mem.content}`);
    }

    await this.store.markInjected([...coreMemories, ...relevantMemories].map(m => m.id));
    return parts.length > 0 ? parts.join('\n') : '';
  }
}

// 单例
let memoryServiceInstance: MemoryService | null = null;
export function getMemoryService(): MemoryService {
  if (!memoryServiceInstance) memoryServiceInstance = new MemoryService();
  return memoryServiceInstance;
}
