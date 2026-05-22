import React, { useState, useEffect, useCallback } from 'react';
import styles from './KnowledgePanel.module.css';
import { createLogger } from '../../../shared/logger';

const logger = createLogger('rag');

interface KnowledgeStats {
  count: number;
  collections: string[];
}

interface ImportResult {
  success: boolean;
  info?: string;
  error?: string;
  count?: number;
  chunks?: number;
}

interface KnowledgeSource {
  source: string;
  category: string;
  count: number;
  createdAt?: string;
}

const KnowledgePanel: React.FC = () => {
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<string>('');
  const [searching, setSearching] = useState(false);
  const [sources, setSources] = useState<KnowledgeSource[]>([]);

  const api = (window as any).electronAPI;

  // 加载统计信息
  const loadStats = useCallback(async () => {
    try {
      const result = await api.knowledgeStats();
      if (result.success) {
        setStats(result.data);
      }
      const sourceResult = await api.knowledgeSources();
      if (sourceResult.success) {
        setSources(sourceResult.data || []);
      }
    } catch (e) {
      logger.error('加载知识库统计失败', e);
    }
  }, [api]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // 导入文件
  const handleImportFile = async () => {
    setImportResult(null);
    setLoading(true);
    try {
      const result = await api.knowledgeImportFile(importFilePath, importCategory);
      setImportResult(result);
      if (result.success) {
        loadStats(); // 刷新统计
      }
    } catch (e: any) {
      setImportResult({ success: false, error: e.message });
    }
    setLoading(false);
  };

  // 识别图片并导入
  const handleImportImage = async () => {
    setImportResult(null);
    setLoading(true);
    try {
      const result = await api.knowledgeImportImage(importFilePath, importCategory);
      setImportResult(result);
      if (result.success) {
        loadStats();
      }
    } catch (e: any) {
      setImportResult({ success: false, error: e.message });
    }
    setLoading(false);
  };

  // 搜索知识库
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResult('');
    try {
      const result = await api.knowledgeSearch(searchQuery, 5);
      if (result.success) {
        setSearchResult(result.data || '（无结果）');
      } else {
        setSearchResult(`❌ ${result.error}`);
      }
    } catch (e: any) {
      setSearchResult(`❌ ${e.message}`);
    }
    setSearching(false);
  };

  const handleDeleteSource = async (source: string) => {
    if (!window.confirm(`确定删除来源「${source}」的所有知识片段吗？`)) return;
    const result = await api.knowledgeDeleteBySource(source);
    if (result.success) {
      setImportResult({ success: true, info: `已删除 ${result.deletedCount || 0} 个片段` });
      loadStats();
    } else {
      setImportResult({ success: false, error: result.error });
    }
  };

  // 文件路径和分类
  const [importFilePath, setImportFilePath] = useState('');
  const [importCategory, setImportCategory] = useState('imported');

  // 判断文件类型
  const getFileType = (path: string) => {
    const ext = path.toLowerCase();
    if (ext.endsWith('.pdf')) return 'pdf';
    if (ext.endsWith('.docx') || ext.endsWith('.doc')) return 'word';
    if (ext.endsWith('.xlsx') || ext.endsWith('.xls')) return 'excel';
    if (ext.endsWith('.jpg') || ext.endsWith('.jpeg') || ext.endsWith('.png') || ext.endsWith('.gif') || ext.endsWith('.webp') || ext.endsWith('.bmp')) return 'image';
    if (ext.endsWith('.txt') || ext.endsWith('.md')) return 'text';
    return 'unknown';
  };

  const isImage = getFileType(importFilePath) === 'image';

  return (
    <div className={styles.panel}>
      {/* 统计卡片 */}
      <div className={styles.statsCard}>
        <div className={styles.statsIcon}>📚</div>
        <div className={styles.statsInfo}>
          <div className={styles.statsCount}>{stats?.count ?? '...'}</div>
          <div className={styles.statsLabel}>知识库文档数</div>
        </div>
      </div>

      {/* 导入区域 */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>📥 导入知识</h4>
        <p className={styles.sectionDesc}>
          支持 PDF、Word(.docx)、Excel(.xlsx)、TXT、MD 文件和图片
        </p>

        <div className={styles.importForm}>
          <input
            type="text"
            className={styles.input}
            placeholder="粘贴文件路径，如 D:\产品目录.pdf"
            value={importFilePath}
            onChange={e => setImportFilePath(e.target.value)}
          />
          <input
            type="text"
            className={styles.inputSmall}
            placeholder="分类（可选）"
            value={importCategory}
            onChange={e => setImportCategory(e.target.value)}
          />
          <div className={styles.btnGroup}>
            <button
              className={styles.btnPrimary}
              onClick={isImage ? handleImportImage : handleImportFile}
              disabled={loading || !importFilePath.trim()}
            >
              {loading ? '⏳ 处理中...' : isImage ? '🖼️ 识别图片并导入' : '📄 导入文件'}
            </button>
          </div>
        </div>

        {importResult && (
          <div className={`${styles.resultBox} ${importResult.success ? styles.success : styles.error}`}>
            {importResult.success ? `✅ ${importResult.info}` : `❌ ${importResult.error}`}
          </div>
        )}
      </div>

      {/* 搜索区域 */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>🔍 搜索知识库</h4>
        <div className={styles.searchForm}>
          <input
            type="text"
            className={styles.input}
            placeholder="输入关键词搜索知识库"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          <button
            className={styles.btnSecondary}
            onClick={handleSearch}
            disabled={searching || !searchQuery.trim()}
          >
            {searching ? '⏳ 搜索中...' : '搜索'}
          </button>
        </div>

        {searchResult && (
          <div className={styles.searchResult}>
            <pre className={styles.searchPre}>{searchResult}</pre>
          </div>
        )}
      </div>

      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>🗂️ 来源文件</h4>
        {sources.length === 0 ? (
          <p className={styles.sectionDesc}>暂无来源文件。导入文档后这里会显示来源、分类和片段数。</p>
        ) : (
          <div className={styles.searchResult}>
            {sources.map((source) => (
              <div key={`${source.source}-${source.category}`}>
                <strong>{source.source}</strong>
                <span> · {source.category} · {source.count} 个片段</span>
                <button className={styles.btnSecondary} onClick={() => handleDeleteSource(source.source)}>
                  删除来源
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 使用提示 */}
      <div className={styles.tips}>
        <h4 className={styles.sectionTitle}>💡 使用提示</h4>
        <ul className={styles.tipsList}>
          <li>你也可以直接在对话中对AI说"学习这个文件 D:\xxx.pdf"</li>
          <li>导入的文档会自动切分为知识片段并建立向量索引</li>
          <li>图片会通过AI视觉模型识别内容后存入知识库</li>
          <li>知识库数据存储在项目目录的 chroma_db/ 文件夹中</li>
        </ul>
      </div>
    </div>
  );
};

export default KnowledgePanel;
