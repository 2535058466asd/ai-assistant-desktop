// ==========================================
// 记忆策略：去重、相似度计算、淘汰
// ==========================================

import type { Memory } from './memoryTypes';

/**
 * Jaccard 字符二元组相似度
 * 比 LCS 快一个数量级，对中文效果好
 */
export function calculateSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1.0;
  if (str1.length < 2 || str2.length < 2) {
    return str1 === str2 ? 1.0 : 0;
  }

  const bigrams1 = getBigrams(str1);
  const bigrams2 = getBigrams(str2);

  const set1 = new Set(bigrams1);
  const set2 = new Set(bigrams2);

  let intersection = 0;
  for (const b of set1) {
    if (set2.has(b)) intersection++;
  }

  const union = set1.size + set2.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function getBigrams(str: string): string[] {
  const bigrams: string[] = [];
  for (let i = 0; i < str.length - 1; i++) {
    bigrams.push(str.slice(i, i + 2));
  }
  return bigrams;
}

/**
 * 在已有记忆中查找与新内容相似的条目（相似度 ≥ 0.9）
 */
export function findDuplicate(candidates: Memory[], newContent: string): Memory | null {
  const normalized = normalizeContent(newContent);
  for (const mem of candidates) {
    const similarity = calculateSimilarity(normalized, normalizeContent(mem.content));
    if (similarity >= 0.9) {
      return mem;
    }
  }
  return null;
}

/**
 * 淘汰分数最低的记忆
 * 评分公式：importance * 0.5 + access_count + 5 * exp(-ageDays / 60)
 */
export function scoreMemory(mem: Memory, now: number): number {
  const ageInDays = (now - mem.created_at) / (1000 * 60 * 60 * 24);
  return mem.importance * 0.5 + mem.access_count + 5 * Math.exp(-ageInDays / 60);
}

/**
 * 选择应被淘汰的记忆 ID
 */
export function selectEvictionCandidates(memories: Memory[], count: number): string[] {
  const now = Date.now();
  const scored = memories.map(mem => ({ id: mem.id, score: scoreMemory(mem, now) }));
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, count).map(s => s.id);
}

/**
 * 标准化内容用于比较
 */
export function normalizeContent(content: string): string {
  return content.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * 标准化记忆键
 */
export function normalizeMemoryKey(memoryKey?: string): string | undefined {
  if (!memoryKey) return undefined;
  const normalized = memoryKey.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 100);
  if (!/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/.test(normalized)) return undefined;
  return normalized || undefined;
}
