/**
 * 启源 AI - RAG 知识库服务
 *
 * 基于 ChromaDB 实现向量检索增强生成（RAG）
 * 数据存储在本地 chroma_db/ 目录，与 SQLite 记忆系统互不冲突
 */

import { ChromaClient, Collection } from 'chromadb';
import * as path from 'path';
import * as fs from 'fs';

// 知识库存储路径（项目根目录下）
const CHROMA_PATH = path.join(__dirname, '../../chroma_db');
const DEFAULT_COLLECTION = 'knowledge_base';

let client: any | null = null;
let collection: any | null = null;

/**
 * 初始化 ChromaDB 客户端
 */
async function getClient(): Promise<any> {
  if (!client) {
    // 确保目录存在
    if (!fs.existsSync(CHROMA_PATH)) {
      fs.mkdirSync(CHROMA_PATH, { recursive: true });
    }
    client = new ChromaClient({
      path: CHROMA_PATH,
    });
    console.log('📚 [RAG] ChromaDB 客户端初始化完成');
  }
  return client;
}

/**
 * 获取或创建知识库集合
 */
async function getCollection(name: string = DEFAULT_COLLECTION): Promise<any> {
  const chroma = await getClient();
  // 先尝试获取已有集合
  const existingCollections = await chroma.listCollections();
  const exists = existingCollections.some(c => c.name === name);
  if (exists) {
    collection = await chroma.getCollection({ name });
  } else {
    collection = await chroma.createCollection({
      name,
      metadata: { description: '启源AI知识库' },
    });
    console.log(`📚 [RAG] 创建知识库集合: ${name}`);
  }
  return collection;
}

/**
 * 添加文档到知识库
 * @param documents 文档内容数组
 * @param metadatas 元数据数组（可选，如 {category, source}）
 * @param ids 文档ID数组（可选，不传则自动生成）
 */
export async function addDocuments(
  documents: string[],
  metadatas?: Record<string, string>[],
  ids?: string[]
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const col = await getCollection();

    // 自动生成ID
    const docIds = ids || documents.map((_, i) => `doc_${Date.now()}_${i}`);

    // 自动生成元数据
    const docMetas = metadatas || documents.map(() => ({
      source: 'manual',
      created_at: new Date().toISOString(),
    }));

    await col.add({
      documents,
      metadatas: docMetas,
      ids: docIds,
    });

    console.log(`📚 [RAG] 添加 ${documents.length} 条文档到知识库`);
    return { success: true, count: documents.length };
  } catch (error: any) {
    console.error('📚 [RAG] 添加文档失败:', error.message);
    return { success: false, count: 0, error: error.message };
  }
}

/**
 * 从知识库检索相关内容
 * @param query 查询文本
 * @param nResults 返回结果数量（默认3）
 */
export async function searchKnowledge(
  query: string,
  nResults: number = 3
): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    const col = await getCollection();

    // 先检查知识库是否为空
    const count = await col.count();
    if (count === 0) {
      return {
        success: false,
        error: '知识库为空，请先添加文档',
      };
    }

    const results = await col.query({
      queryTexts: [query],
      nResults: Math.min(nResults, count),
    });

    // 格式化检索结果
    const documents = results.documents[0] || [];
    const metadatas = results.metadatas[0] || [];
    const distances = results.distances[0] || [];

    let formatted = '';
    documents.forEach((doc: string, i: number) => {
      const meta = metadatas[i] || {};
      const distance = (distances[i] || 0).toFixed(4);
      formatted += `--- 相关内容 ${i + 1}（相似度: ${distance}）---\n`;
      formatted += `来源: ${meta.source || '未知'} | 分类: ${meta.category || '未分类'}\n`;
      formatted += `${doc}\n\n`;
    });

    console.log(`📚 [RAG] 检索到 ${documents.length} 条相关内容`);
    return { success: true, data: formatted };
  } catch (error: any) {
    console.error('📚 [RAG] 检索失败:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 获取知识库统计信息
 */
export async function getKnowledgeStats(): Promise<{
  success: boolean;
  data?: { count: number; collections: string[] };
  error?: string;
}> {
  try {
    const chroma = await getClient();
    const collections = await chroma.listCollections();
    const col = await getCollection();
    const count = await col.count();

    return {
      success: true,
      data: {
        count,
        collections: collections.map(c => c.name),
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * 删除知识库中的文档
 */
export async function deleteDocuments(ids: string[]): Promise<{ success: boolean; error?: string }> {
  try {
    const col = await getCollection();
    await col.delete({ ids });
    console.log(`📚 [RAG] 删除 ${ids.length} 条文档`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * 从文本文件批量导入知识库
 * 支持 .txt, .md 文件
 */
export async function importFromFile(
  filePath: string,
  category: string = 'imported'
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, count: 0, error: `文件不存在: ${filePath}` };
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const fileName = path.basename(filePath);

    // 按空行分段，每段作为一个文档
    const chunks = content
      .split(/\n{2,}/)
      .map(chunk => chunk.trim())
      .filter(chunk => chunk.length > 10); // 过滤太短的段落

    if (chunks.length === 0) {
      return { success: false, count: 0, error: '文件内容为空或分段后无有效内容' };
    }

    const metadatas = chunks.map(() => ({
      source: fileName,
      category,
      created_at: new Date().toISOString(),
    }));

    const result = await addDocuments(chunks, metadatas);
    return result;
  } catch (error: any) {
    return { success: false, count: 0, error: error.message };
  }
}
