import { ipcMain, dialog, BrowserWindow } from 'electron';
import {
  addDocuments,
  searchKnowledge,
  searchKnowledgeStructured,
  getKnowledgeStats,
  listKnowledgeSources,
  deleteDocumentsBySource,
  cleanText,
  isEmbeddingReady,
  getChunksBySource,
} from '../services/ragService';
import { parseFile, chunkText } from '../services/documentParser';
import { recognizeImage } from '../services/imageRecognizer';
import { createLogger } from '../../shared/logger';

const logger = createLogger('tool');
const DOCUMENT_EXTENSIONS = ['pdf', 'docx', 'xlsx', 'xls', 'txt', 'md'];
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
const KNOWLEDGE_EXTENSIONS = [...DOCUMENT_EXTENSIONS, ...IMAGE_EXTENSIONS];

export function registerKnowledgeSearch() {
  ipcMain.handle('knowledge-search', async (_event, query: string, nResults: number = 3) => {
    try {
      return await searchKnowledge(query, nResults);
    } catch (error: any) {
      logger.error('知识库搜索失败', { error: error.message });
      return { success: false, error: error.message };
    }
  });
}

export function registerKnowledgeAdd() {
  ipcMain.handle('knowledge-add', async (_event, documents: string[], metadatas?: Record<string, string>[]) => {
    try {
      const MAX_CHUNK = 800;
      const needsChunking = documents.some(d => d.length > MAX_CHUNK);
      if (!needsChunking) {
        return await addDocuments(documents, metadatas);
      }

      const chunkedDocs: string[] = [];
      const chunkedMetas: Record<string, string>[] = [];
      documents.forEach((doc, i) => {
        if (doc.length > MAX_CHUNK) {
          const chunks = chunkText(doc, MAX_CHUNK, 150);
          chunks.forEach((chunk, j) => {
            chunkedDocs.push(chunk);
            chunkedMetas.push(metadatas?.[i] ? { ...metadatas[i], chunkId: `${metadatas[i].chunkId || i}#${j + 1}` } : { source: 'ai-add', chunkId: `${i}#${j + 1}` });
          });
        } else {
          chunkedDocs.push(doc);
          if (metadatas?.[i]) chunkedMetas.push(metadatas[i]);
        }
      });

      return await addDocuments(chunkedDocs, chunkedMetas.length > 0 ? chunkedMetas : undefined);
    } catch (error: any) {
      logger.error('知识库添加失败', { error: error.message });
      return { success: false, error: error.message };
    }
  });
}

export function registerKnowledgeStats() {
  ipcMain.handle('knowledge-stats', async () => {
    try {
      return await getKnowledgeStats();
    } catch (error: any) {
      logger.error('知识库统计失败', { error: error.message });
      return { success: false, error: error.message };
    }
  });
}

export function registerKnowledgeSources() {
  ipcMain.handle('knowledge-sources', async () => {
    try {
      return await listKnowledgeSources();
    } catch (error: any) {
      logger.error('知识库来源列表失败', { error: error.message });
      return { success: false, error: error.message };
    }
  });
}

export function registerKnowledgeDeleteBySource() {
  ipcMain.handle('knowledge-delete-by-source', async (_event, source: string) => {
    try {
      return await deleteDocumentsBySource(source);
    } catch (error: any) {
      logger.error('知识库删除失败', { source, error: error.message });
      return { success: false, error: error.message };
    }
  });
}

export function registerKnowledgeImportFile() {
  ipcMain.handle('knowledge-import-file', async (_event, filePath: string, category?: string) => {
    try {
      const parseResult = await parseFile(filePath);
      if (!parseResult.success || !parseResult.text) {
        return { success: false, error: parseResult.error || '文件解析失败' };
      }

      const chunks = chunkText(cleanText(parseResult.text));
      if (chunks.length === 0) {
        return { success: false, error: '文件内容为空' };
      }

      const fileName = filePath.split(/[/\\]/).pop() || 'unknown';
      await deleteDocumentsBySource(fileName);

      const importedAt = new Date().toISOString();
      const metadatas = chunks.map((_, index) => ({
        source: fileName,
        category: category || 'imported',
        chunkId: `${fileName}#${index + 1}`,
        created_at: importedAt,
      }));

      const result = await addDocuments(chunks, metadatas);

      return {
        success: true,
        data: `文件 "${fileName}" 已导入知识库，切分为 ${chunks.length} 个片段`,
        count: result.count,
        chunks: chunks.length,
        embeddingReady: isEmbeddingReady(),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}

export function registerKnowledgeImportImage() {
  ipcMain.handle('knowledge-import-image', async (_event, imagePath: string, category?: string) => {
    try {
      const recognizeResult = await recognizeImage(imagePath);
      if (!recognizeResult.success || !recognizeResult.text) {
        return { success: false, error: recognizeResult.error || '图片识别失败' };
      }

      const chunks = chunkText(cleanText(recognizeResult.text));
      const fileName = imagePath.split(/[/\\]/).pop() || 'unknown';

      await deleteDocumentsBySource(fileName);

      const importedAt = new Date().toISOString();
      const metadatas = chunks.map((_, index) => ({
        source: fileName,
        category: category || 'image',
        chunkId: `${fileName}#${index + 1}`,
        type: 'image_recognition',
        created_at: importedAt,
      }));

      const result = await addDocuments(chunks, metadatas);

      return {
        success: true,
        data: `图片 "${fileName}" 已识别并导入知识库`,
        count: result.count,
        embeddingReady: isEmbeddingReady(),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}

export function registerParseFileToText() {
  ipcMain.handle('parse-file-to-text', async (_event, filePath: string) => {
    try {
      const result = await parseFile(filePath);
      if (!result.success || !result.text) {
        return { success: false, error: result.error || '文件解析失败' };
      }
      return { success: true, text: cleanText(result.text), fileName: filePath.split(/[/\\]/).pop() || filePath };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}

export function registerKnowledgeChunksBySource() {
  ipcMain.handle('knowledge-chunks-by-source', async (_event, source: string) => {
    try {
      return await getChunksBySource(source);
    } catch (error: any) {
      logger.error('知识库获取切片失败', { error: error.message });
      return { success: false, error: error.message };
    }
  });
}

export function registerKnowledgeSearchStructured() {
  ipcMain.handle('knowledge-search-structured', async (_event, query: string, nResults: number = 5) => {
    try {
      const result = await searchKnowledgeStructured(query, nResults);
      return result;
    } catch (error: any) {
      logger.error('知识库结构化搜索失败', { error: error.message });
      return { success: false, error: error.message };
    }
  });
}

export function registerShowOpenDialog() {
  ipcMain.handle('show-open-dialog', async (_event, options?: { filters?: string[] }) => {
    try {
      const win = BrowserWindow.getFocusedWindow();
      const filterNames = options?.filters || [];
      const filters = filterNames.length > 0
        ? [{ name: '文件', extensions: filterNames }]
        : [
            { name: '支持的知识库文件', extensions: KNOWLEDGE_EXTENSIONS },
            { name: '文档', extensions: DOCUMENT_EXTENSIONS },
            { name: '图片', extensions: IMAGE_EXTENSIONS },
          ];
      const result = await dialog.showOpenDialog(win!, {
        properties: ['openFile', 'multiSelections'],
        filters,
      });
      if (result.canceled) return { success: true, data: [] };
      return { success: true, data: result.filePaths };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}
