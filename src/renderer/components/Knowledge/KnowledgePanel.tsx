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

const formatSourceTime = (value?: string) => {
  if (!value) return '未知时间';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const KnowledgePanel: React.FC = () => {
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<string>('');
  const [searching, setSearching] = useState(false);
  const [sources, setSources] = useState<KnowledgeSource[]>([]);

  const api = (window as any).electronAPI;

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

  const handleImportFile = async () => {
    setImportResult(null);
    setLoading(true);
    try {
      const result = await api.knowledgeImportFile(importFilePath, importCategory);
      setImportResult(result);
      if (result.success) {
        loadStats();
      }
    } catch (e: any) {
      setImportResult({ success: false, error: e.message });
    }
    setLoading(false);
  };

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

  const [importFilePath, setImportFilePath] = useState('');
  const [importCategory, setImportCategory] = useState('imported');

  const getFileType = (filePath: string) => {
    const ext = filePath.toLowerCase();
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
      <div className={styles.grid}>
        <section className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.sectionEyebrow}>导入</span>
              <h4>导入知识</h4>
            </div>
            <span>{isImage ? '图片识别' : '文档切片'}</span>
          </div>

          <p className={styles.sectionDesc}>支持 PDF、Word、Excel、TXT、MD 和图片导入。</p>

          <div className={styles.importForm}>
            <input
              type="text"
              className={styles.input}
              placeholder="粘贴文件路径，如 D:\\产品目录.pdf"
              value={importFilePath}
              onChange={(e) => setImportFilePath(e.target.value)}
            />
            <input
              type="text"
              className={styles.input}
              placeholder="分类标签，如 interview / product / notes"
              value={importCategory}
              onChange={(e) => setImportCategory(e.target.value)}
            />
            <button
              className={styles.btnPrimary}
              onClick={isImage ? handleImportImage : handleImportFile}
              disabled={loading || !importFilePath.trim()}
            >
              {loading ? '处理中...' : isImage ? '识别图片并导入' : '解析文件并导入'}
            </button>
          </div>

          {importResult && (
            <div className={`${styles.resultBox} ${importResult.success ? styles.success : styles.error}`}>
              {importResult.success ? `✅ ${importResult.info}` : `❌ ${importResult.error}`}
            </div>
          )}
        </section>

        <section className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.sectionEyebrow}>检索</span>
              <h4>搜索知识库</h4>
            </div>
            <span>来源可追溯</span>
          </div>

          <div className={styles.searchForm}>
            <input
              type="text"
              className={styles.input}
              placeholder="输入问题或关键词，如 RAG 展示、报价参数、产品差异"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button
              className={styles.btnSecondary}
              onClick={handleSearch}
              disabled={searching || !searchQuery.trim()}
            >
              {searching ? '搜索中...' : '搜索'}
            </button>
          </div>

          <div className={styles.searchSurface}>
            {searchResult ? (
              <pre className={styles.searchPre}>{searchResult}</pre>
            ) : (
              <div className={styles.emptyState}>输入问题后，这里会显示带来源和片段编号的检索结果。</div>
            )}
          </div>
        </section>

        <section className={styles.sourcesCard}>
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.sectionEyebrow}>来源</span>
              <h4>来源文件</h4>
            </div>
            <span>{sources.length} 个来源</span>
          </div>

          {sources.length === 0 ? (
            <div className={styles.emptyState}>暂无来源文件。导入文档后这里会显示来源、分类和片段数。</div>
          ) : (
            <div className={styles.sourceList}>
              {sources.map((source) => (
                <article key={`${source.source}-${source.category}`} className={styles.sourceItem}>
                  <div>
                    <strong>{source.source}</strong>
                    <p>{source.category} · {source.count} 个片段 · 首次记录 {formatSourceTime(source.createdAt)}</p>
                  </div>
                  <button className={styles.btnSecondary} onClick={() => handleDeleteSource(source.source)}>
                    删除来源
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

      </div>
    </div>
  );
};

export default KnowledgePanel;
