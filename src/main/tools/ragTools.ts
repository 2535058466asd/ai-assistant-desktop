/**
 * 启源 AI - RAG 知识库工具
 *
 * 注册知识库相关的 IPC Handler
 * 遵循项目现有工具的注册模式
 */

import { ipcMain } from 'electron';
import {
  addDocuments,
  searchKnowledge,
  getKnowledgeStats,
  deleteDocuments,
} from '../services/ragService';
import { parseFile, chunkText } from '../services/documentParser';
import { recognizeImage } from '../services/imageRecognizer';

/**
 * 注册知识库搜索工具
 * AI 通过此工具从知识库中检索相关内容
 */
export function registerKnowledgeSearch() {
  ipcMain.handle('knowledge-search', async (_event, query: string, nResults: number = 3) => {
    return await searchKnowledge(query, nResults);
  });
}

/**
 * 注册知识库添加工具
 * AI 通过此工具向知识库添加新知识
 */
export function registerKnowledgeAdd() {
  ipcMain.handle('knowledge-add', async (_event, documents: string[], metadatas?: Record<string, string>[]) => {
    return await addDocuments(documents, metadatas);
  });
}

/**
 * 注册知识库统计工具
 * 查看知识库中有多少条文档
 */
export function registerKnowledgeStats() {
  ipcMain.handle('knowledge-stats', async () => {
    return await getKnowledgeStats();
  });
}

/**
 * 注册知识库删除工具
 */
export function registerKnowledgeDelete() {
  ipcMain.handle('knowledge-delete', async (_event, ids: string[]) => {
    return await deleteDocuments(ids);
  });
}

/**
 * 注册文件导入知识库工具
 * 支持 PDF/Word/Excel/TXT/MD 文件
 * 自动解析 → 切分 → 存入向量数据库
 */
export function registerKnowledgeImportFile() {
  ipcMain.handle('knowledge-import-file', async (_event, filePath: string, category?: string) => {
    try {
      // 1. 解析文件
      const parseResult = await parseFile(filePath);
      if (!parseResult.success || !parseResult.text) {
        return { success: false, error: parseResult.error || '文件解析失败' };
      }

      // 2. 切分文本
      const chunks = chunkText(parseResult.text, 500, 50);
      if (chunks.length === 0) {
        return { success: false, error: '文件内容为空' };
      }

      // 3. 构建元数据
      const fileName = filePath.split(/[/\\]/).pop() || 'unknown';
      const metadatas = chunks.map(() => ({
        source: fileName,
        category: category || 'imported',
        created_at: new Date().toISOString(),
      }));

      // 4. 存入知识库
      const result = await addDocuments(chunks, metadatas);

      return {
        success: true,
        count: result.count,
        chunks: chunks.length,
        info: `文件 "${fileName}" 已导入知识库，切分为 ${chunks.length} 个片段`,
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}

/**
 * 注册图片识别并导入知识库工具
 * 调用豆包多模态API识别图片 → 提取内容 → 存入知识库
 */
export function registerKnowledgeImportImage() {
  ipcMain.handle('knowledge-import-image', async (_event, imagePath: string, category?: string) => {
    try {
      // 1. 调用豆包视觉模型识别图片
      const recognizeResult = await recognizeImage(imagePath);
      if (!recognizeResult.success || !recognizeResult.text) {
        return { success: false, error: recognizeResult.error || '图片识别失败' };
      }

      // 2. 切分识别结果
      const chunks = chunkText(recognizeResult.text, 500, 50);
      const fileName = imagePath.split(/[/\\]/).pop() || 'unknown';

      // 3. 存入知识库
      const metadatas = chunks.map(() => ({
        source: fileName,
        category: category || 'image',
        type: 'image_recognition',
        created_at: new Date().toISOString(),
      }));

      const result = await addDocuments(chunks, metadatas);

      return {
        success: true,
        count: result.count,
        info: `图片 "${fileName}" 已识别并导入知识库`,
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}
