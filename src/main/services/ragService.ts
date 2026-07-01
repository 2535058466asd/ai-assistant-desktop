/**
 * Nova AI - RAG 知识库服务
 *
 *  - Embedding：@huggingface/transformers（本地小模型，首次下载后离线）
 *  - 存储：SQLite + sqlite-vec 向量扩展
 *  - 搜索：vec0 虚拟表 KNN 向量搜索 + 关键词 boost
 */

import { pipeline, env } from '@huggingface/transformers';
import * as sqlite3 from 'sqlite3';
import { open, type Database } from 'sqlite';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import { createLogger } from '../../shared/logger';

const logger = createLogger('rag');

env.remoteHost = 'https://hf-mirror.com';
env.allowLocalModels = true;
env.cacheDir = path.join(app.getPath('userData'), 'models');

const KB_DB_PATH = path.join(app.getPath('userData'), 'nova-knowledge', 'knowledge.db');
const OLD_JSON_PATH = path.join(app.getPath('userData'), 'knowledge_store.json');
const DEFAULT_MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const VECTOR_DIM = 384;

// ========== 类型 ==========

export interface SearchResultItem {
  text: string;
  source: string;
  category: string;
  chunkId: string;
  distance: number;
}

// ========== Embedding ==========

let extractor: any = null;
let extractorFailed = false;

async function getExtractor(): Promise<any> {
  if (extractorFailed) return null;
  if (extractor) return extractor;
  try {
    logger.info('正在加载 Embedding 模型（首次需下载，约 120MB）...');
    extractor = await pipeline('feature-extraction', DEFAULT_MODEL, { dtype: 'fp32' });
    logger.info('Embedding 模型就绪');
    return extractor;
  } catch (error: any) {
    extractorFailed = true;
    logger.error('Embedding 模型加载失败，降级为关键词搜索', { error: error.message });
    return null;
  }
}

export function isEmbeddingReady(): boolean {
  return !extractorFailed;
}

async function embedText(text: string): Promise<number[] | null> {
  const ext = await getExtractor();
  if (!ext) return null;
  const output = await ext(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data) as number[];
}

// ========== SQLite + vec ==========

let db: Database | null = null;
let dbReady: Promise<void> | null = null;

function vectorToBuffer(vector: number[]): Buffer {
  return Buffer.from(new Float32Array(vector).buffer);
}

async function getDb(): Promise<Database> {
  if (db) return db;
  if (!dbReady) {
    dbReady = (async () => {
      const dir = path.dirname(KB_DB_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const sv = require('sqlite-vec');
      db = await open({ filename: KB_DB_PATH, driver: sqlite3.Database });
      await db.loadExtension(sv.getLoadablePath());

      await db.exec(`PRAGMA journal_mode = WAL`);
      await db.exec(`PRAGMA synchronous = NORMAL`);

      await db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks USING vec0(
          id TEXT PRIMARY KEY,
          embedding FLOAT[${VECTOR_DIM}],
          document TEXT,
          source TEXT,
          category TEXT,
          chunk_id TEXT,
          created_at TEXT
        )
      `);

      await migrateOldJson(db);
      logger.info('知识库 SQLite 初始化完成');
    })();
  }
  await dbReady;
  return db!;
}

// ========== 旧 JSON 数据迁移 ==========

async function migrateOldJson(database: Database): Promise<void> {
  if (!fs.existsSync(OLD_JSON_PATH)) return;

  try {
    const raw = JSON.parse(fs.readFileSync(OLD_JSON_PATH, 'utf-8'));
    const chunks: any[] = raw.chunks || [];
    if (chunks.length === 0) { fs.renameSync(OLD_JSON_PATH, OLD_JSON_PATH + '.bak'); return; }

    const stmt = await database.prepare(
      `INSERT OR IGNORE INTO knowledge_chunks VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    for (const chunk of chunks) {
      const vector: number[] = chunk.vector || [];
      if (vector.length === 0) continue;
      await stmt.run(
        chunk.id,
        vectorToBuffer(vector),
        chunk.document,
        chunk.metadata?.source || 'unknown',
        chunk.metadata?.category || 'imported',
        chunk.metadata?.chunkId || chunk.id,
        chunk.metadata?.created_at || new Date().toISOString(),
      );
    }
    await stmt.finalize();

    fs.renameSync(OLD_JSON_PATH, OLD_JSON_PATH + '.bak');
    logger.info(`已从旧 JSON 文件迁移 ${chunks.length} 条记录`);
  } catch (error: any) {
    logger.error('旧 JSON 数据迁移失败', { error: error.message });
  }
}

// ========== 文本处理 ==========

function cleanText(text: string): string {
  return text
    .replace(/[\r\n]+/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export { cleanText };

// ========== 核心 API ==========

export async function addDocuments(
  documents: string[],
  metadatas?: Record<string, string>[],
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const database = await getDb();
    const stmt = await database.prepare(
      `INSERT INTO knowledge_chunks VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    let added = 0;
    for (let i = 0; i < documents.length; i++) {
      const meta = metadatas?.[i] || { source: 'manual', chunkId: `${i}` };
      const chunk = documents[i];
      if (!chunk.trim()) continue;

      const vector = await embedText(chunk);
      await stmt.run(
        `doc_${Date.now()}_${added}`,
        vector ? vectorToBuffer(vector) : null,
        chunk,
        meta.source || 'unknown',
        meta.category || 'imported',
        meta.chunkId || `${i}`,
        meta.created_at || new Date().toISOString(),
      );
      added++;
    }

    await stmt.finalize();
    logger.info(`知识库添加 ${added} 个片段`);
    return { success: true, count: added };
  } catch (error: any) {
    logger.error('知识库添加失败:', error.message);
    return { success: false, count: 0, error: error.message };
  }
}

/** 中文感知分词：按中英文边界拆分，保留 ≥2 字符的 token */
function extractSearchTerms(query: string): string[] {
  const terms: string[] = [];
  // 按中英文/数字边界拆分
  const segments = query.split(/(?<=[一-鿿])(?=[a-zA-Z0-9])|(?<=[a-zA-Z0-9])(?=[一-鿿])|[\s,;.!?，。；！？、]+/).filter(Boolean);
  for (const seg of segments) {
    if (seg.length >= 2) {
      terms.push(seg);
      // 中文子串：每 2-3 字也作为匹配项
      if (/[一-鿿]/.test(seg)) {
        for (let len = 2; len <= Math.min(seg.length, 4); len++) {
          for (let i = 0; i <= seg.length - len; i++) {
            const sub = seg.slice(i, i + len);
            if (sub.length >= 2) terms.push(sub);
          }
        }
      }
    }
  }
  // 整个 query 本身也作为匹配项
  if (query.trim().length >= 2 && !terms.includes(query.trim())) {
    terms.push(query.trim());
  }
  // 去重
  return [...new Set(terms)];
}

export async function searchKnowledgeStructured(
  query: string,
  nResults: number = 8,
): Promise<{ success: boolean; data?: SearchResultItem[]; error?: string }> {
  try {
    const database = await getDb();
    const total = await database.get<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM knowledge_chunks`);
    if (!total || total.cnt === 0) {
      return { success: false, error: '知识库为空，请先添加文档' };
    }

    const queryVector = await embedText(query);
    const queryTerms = extractSearchTerms(query);
    logger.info('搜索 terms', { query, terms: queryTerms.slice(0, 10) });

    // 候选集要足够大，给关键词 boost 更多翻盘机会
    const fetchK = Math.max(nResults * 5, 50);
    let rows: any[];
    if (queryVector) {
      const k = Math.min(fetchK, total.cnt);
      rows = await database.all(
        `SELECT id, document, source, category, chunk_id, distance
         FROM knowledge_chunks
         WHERE embedding MATCH ? AND k = ?
         ORDER BY distance`,
        [vectorToBuffer(queryVector), k],
      );
    } else {
      rows = await database.all(
        `SELECT id, document, source, category, chunk_id, 1.0 as distance
         FROM knowledge_chunks
         LIMIT ?`,
        [fetchK],
      );
    }

    // 关键词 boost：匹配越多，distance 越低
    if (queryTerms.length > 0) {
      const queryLower = query.trim().toLowerCase();
      for (const row of rows) {
        const textLower = (row.document || '').toLowerCase();
        const sourceLower = (row.source || '').toLowerCase();
        let matchCount = 0;
        for (const t of queryTerms) {
          const tl = t.toLowerCase();
          if (textLower.includes(tl) || sourceLower.includes(tl)) matchCount++;
        }
        // 每个匹配项降低 distance 0.25（比原 0.15 更强）
        let boost = matchCount * 0.25;
        // 整个 query 精确命中额外 boost
        if (textLower.includes(queryLower) || sourceLower.includes(queryLower)) boost += 0.3;
        row.distance = Math.max(0, row.distance - boost);
      }
      rows.sort((a: any, b: any) => a.distance - b.distance);
    }

    // 结果去重：限制同一 source 最多占 40%，鼓励结果多样性
    const maxPerSource = Math.max(2, Math.ceil(nResults * 0.4));
    const sourceCounts = new Map<string, number>();
    const usedIds = new Set<string>();
    const top: SearchResultItem[] = [];

    // 距离阈值：超过 0.8 的结果不相关，直接跳过
    const DISTANCE_THRESHOLD = 0.8;

    for (const row of rows) {
      if (top.length >= nResults) break;
      if (row.distance > DISTANCE_THRESHOLD) continue; // 太远了，跳过
      const count = sourceCounts.get(row.source) || 0;
      if (count >= maxPerSource) continue;
      sourceCounts.set(row.source, count + 1);
      usedIds.add(row.chunk_id);
      top.push({
        text: row.document,
        source: row.source,
        category: row.category,
        chunkId: row.chunk_id,
        distance: row.distance,
      });
    }

    // 如果去重后不够，放宽限制补满（但仍遵守 maxPerSource）
    if (top.length < nResults) {
      const relaxedMax = Math.max(maxPerSource, Math.ceil(nResults * 0.6));
      for (const row of rows) {
        if (top.length >= nResults) break;
        if (usedIds.has(row.chunk_id)) continue;
        const count = sourceCounts.get(row.source) || 0;
        if (count >= relaxedMax) continue;
        sourceCounts.set(row.source, count + 1);
        usedIds.add(row.chunk_id);
        top.push({
          text: row.document,
          source: row.source,
          category: row.category,
          chunkId: row.chunk_id,
          distance: row.distance,
        });
      }
    }

    logger.info(`检索到 ${top.length} 条相关内容`, { query, nResults, topSources: top.map(t => t.source) });
    return { success: true, data: top };
  } catch (error: any) {
    logger.error('检索失败:', error.message);
    return { success: false, error: error.message };
  }
}

export async function searchKnowledge(
  query: string,
  nResults: number = 3,
): Promise<{ success: boolean; data?: string; error?: string }> {
  const structured = await searchKnowledgeStructured(query, nResults);
  if (!structured.success || !structured.data) {
    return { success: false, error: structured.error };
  }

  let formatted = '';
  structured.data.forEach((item, rank) => {
    formatted += `--- 相关内容 ${rank + 1}（距离: ${item.distance.toFixed(4)}，越小越相关）---\n`;
    formatted += `来源: ${item.source} | 分类: ${item.category} | 片段: ${item.chunkId}\n`;
    formatted += `${item.text}\n\n`;
  });
  return { success: true, data: formatted };
}

export async function listKnowledgeSources(): Promise<{
  success: boolean;
  data?: Array<{ source: string; category: string; count: number; createdAt?: string }>;
  error?: string;
}> {
  try {
    const database = await getDb();
    const rows: Array<{ source: string; category: string; count: number; createdAt: string | null }> = await database.all(
      `SELECT source, category, COUNT(*) as count,
              MIN(created_at) as createdAt
       FROM knowledge_chunks
       GROUP BY source, category`
    );
    return {
      success: true,
      data: rows.map(r => ({ source: r.source, category: r.category, count: r.count, createdAt: r.createdAt || undefined })),
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getChunksBySource(
  source: string,
): Promise<{ success: boolean; data?: Array<{ chunkId: string; text: string; category: string; createdAt?: string }>; error?: string }> {
  try {
    const database = await getDb();
    const rows: Array<{ chunk_id: string; document: string; category: string; created_at: string | null }> =
      await database.all(
        `SELECT chunk_id, document, category, created_at
         FROM knowledge_chunks
         WHERE source = ?
         ORDER BY chunk_id`,
        [source],
      );
    return {
      success: true,
      data: rows.map(r => ({
        chunkId: r.chunk_id,
        text: r.document,
        category: r.category,
        createdAt: r.created_at || undefined,
      })),
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteDocumentsBySource(source: string): Promise<{ success: boolean; deletedCount?: number; error?: string }> {
  try {
    const database = await getDb();
    const result = await database.run(`DELETE FROM knowledge_chunks WHERE source = ?`, [source]);
    return { success: true, deletedCount: result.changes };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getKnowledgeStats(): Promise<{
  success: boolean;
  data?: { count: number; collections: string[] };
  error?: string;
}> {
  try {
    const database = await getDb();
    const row = await database.get<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM knowledge_chunks`);
    return { success: true, data: { count: row?.cnt || 0, collections: ['knowledge_base'] } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
