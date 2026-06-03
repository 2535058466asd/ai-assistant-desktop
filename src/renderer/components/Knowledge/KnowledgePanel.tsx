import React, { useState, useEffect, useCallback, useRef } from 'react';
import styles from './KnowledgePanel.module.css';
import { createLogger } from '../../../shared/logger';

const logger = createLogger('rag');

interface ImportItem {
  id: string;
  name: string;
  status: 'pending' | 'importing' | 'success' | 'error';
  chunks?: number;
  error?: string;
}

interface SearchResult {
  text: string;
  source: string;
  category: string;
  chunkId: string;
  distance: number;
}

interface KnowledgeStats {
  count: number;
  collections: string[];
}

interface KnowledgeSource {
  source: string;
  category: string;
  count: number;
  createdAt?: string;
}

const IMAGE_EXTS = /\.(jpg|jpeg|png|gif|webp|bmp)$/i;

const isImageFile = (name: string) => IMAGE_EXTS.test(name);

const formatTime = (value?: string) => {
  if (!value) return '未知时间';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
};

const KnowledgePanel: React.FC = () => {
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [importQueue, setImportQueue] = useState<ImportItem[]>([]);
  const [category, setCategory] = useState('');
  const [dragging, setDragging] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState('');
  const [searching, setSearching] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');

  const api = (window as any).electronAPI;
  const dropRef = useRef<HTMLDivElement>(null);

  const loadStats = useCallback(async () => {
    try {
      const [statsRes, sourcesRes] = await Promise.all([api.knowledgeStats(), api.knowledgeSources()]);
      if (statsRes.success) setStats(statsRes.data);
      if (sourcesRes.success) setSources(sourcesRes.data || []);
    } catch (e) {
      logger.error('加载知识库统计失败', e);
    }
  }, [api]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const importFile = async (filePath: string) => {
    const name = filePath.split(/[/\\]/).pop() || filePath;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setImportQueue(prev => [...prev, { id, name, status: 'pending' }]);

    setImportQueue(prev => prev.map(item => item.id === id ? { ...item, status: 'importing' } : item));

    try {
      const result = isImageFile(name)
        ? await api.knowledgeImportImage(filePath, category || undefined)
        : await api.knowledgeImportFile(filePath, category || undefined);

      setImportQueue(prev => prev.map(item => item.id === id ? {
        ...item,
        status: result.success ? 'success' : 'error',
        chunks: result.chunks,
        error: result.error,
      } : item));

      if (result.success) loadStats();
    } catch (e: any) {
      setImportQueue(prev => prev.map(item => item.id === id ? { ...item, status: 'error', error: e.message } : item));
    }
  };

  const importContent = async (content: string, name: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setImportQueue(prev => [...prev, { id, name, status: 'pending' }]);
    setImportQueue(prev => prev.map(item => item.id === id ? { ...item, status: 'importing' } : item));

    try {
      const meta = { source: name, category: category || 'clipboard', chunkId: `${name}#1`, created_at: new Date().toISOString() };
      const result = await api.knowledgeAdd([content], [meta]);
      setImportQueue(prev => prev.map(item => item.id === id ? {
        ...item,
        status: result.success ? 'success' : 'error',
        chunks: result.count,
        error: result.error,
      } : item));
      if (result.success) loadStats();
    } catch (e: any) {
      setImportQueue(prev => prev.map(item => item.id === id ? { ...item, status: 'error', error: e.message } : item));
    }
  };

  const handleFiles = (files: string[]) => {
    if (files.length === 0) return;
    files.forEach(f => importFile(f));
  };

  const handleOpenFilePicker = async () => {
    const result = await api.showOpenDialog();
    if (result.success && result.data?.length) handleFiles(result.data);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropRef.current && !dropRef.current.contains(e.relatedTarget as Node)) {
      setDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const files = api.getFilePaths(Array.from(e.dataTransfer.files));
    if (files.length) handleFiles(files);
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const htmlData = e.clipboardData.getData('text/html');
    if (htmlData) {
      e.preventDefault();
      try {
        const TurndownService = (await import('turndown')).default;
        const md = new TurndownService().turndown(htmlData);
        if (md.trim()) {
          importContent(md, `粘贴内容 ${new Date().toLocaleTimeString('zh-CN')}`);
          return;
        }
      } catch { /* turndown 不可用，降级到纯文本 */ }
    }

    const textData = e.clipboardData.getData('text/plain');
    if (textData) {
      e.preventDefault();
      importContent(textData, `粘贴内容 ${new Date().toLocaleTimeString('zh-CN')}`);
      return;
    }

    const fileResult = await api.clipboardReadFiles();
    if (fileResult.success && fileResult.data?.length) {
      e.preventDefault();
      handleFiles(fileResult.data);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults([]);
    setSearchError('');
    try {
      const result = await api.knowledgeSearchStructured(searchQuery, 8);
      if (result.success && result.data) {
        setSearchResults(result.data);
      } else {
        setSearchError(result.error || '搜索失败');
      }
    } catch (e: any) {
      setSearchError(e.message);
    }
    setSearching(false);
  };

  const handleDeleteSource = async (source: string) => {
    if (!window.confirm(`确定删除来源「${source}」的所有知识片段吗？`)) return;
    const result = await api.knowledgeDeleteBySource(source);
    if (result.success) loadStats();
  };

  const categories = Array.from(new Set(sources.map(s => s.category)));
  const filteredSources = selectedCategory === 'all' ? sources : sources.filter(s => s.category === selectedCategory);

  return (
    <div className={styles.panel}>
      <div className={styles.overviewBar}>
        <div className={styles.overviewItem}>
          <span className={styles.overviewValue}>{stats?.count ?? '—'}</span>
          <span className={styles.overviewLabel}>总片段</span>
        </div>
        <div className={styles.overviewItem}>
          <span className={styles.overviewValue}>{sources.length}</span>
          <span className={styles.overviewLabel}>来源文件</span>
        </div>
        <div className={styles.overviewItem}>
          <span className={styles.overviewValue}>{categories.length}</span>
          <span className={styles.overviewLabel}>分类</span>
        </div>
        <div className={styles.overviewItem}>
          <span className={styles.overviewStatus}>●</span>
          <span className={styles.overviewLabel}>ChromaDB</span>
        </div>
      </div>

      <div className={styles.topGrid}>
        <div
          ref={dropRef}
          className={`${styles.dropZone} ${dragging ? styles.dropZoneActive : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onPaste={handlePaste}
          tabIndex={0}
        >
          <div className={styles.dropIcon}>📥</div>
          <p className={styles.dropTitle}>拖拽文件到这里</p>
          <p className={styles.dropHint}>或 Ctrl+V 粘贴内容 · 从 Word、网页复制直接入库</p>
          <button type="button" className={styles.btnPrimary} onClick={handleOpenFilePicker}>选择文件</button>
          <input
            type="text"
            className={styles.categoryInput}
            placeholder="分类标签（可选）"
            value={category}
            onChange={e => setCategory(e.target.value)}
            onClick={e => e.stopPropagation()}
          />
          {importQueue.length > 0 && (
            <div className={styles.importQueue}>
              {importQueue.slice(-6).map(item => (
                <div key={item.id} className={styles.queueItem}>
                  <span className={`${styles.queueDot} ${item.status === 'success' ? styles.queueDotSuccess : item.status === 'error' ? styles.queueDotError : item.status === 'importing' ? styles.queueDotLoading : ''}`} />
                  <span className={styles.queueName}>{item.name}</span>
                  <span className={styles.queueInfo}>
                    {item.status === 'success' ? `${item.chunks} 片段` : item.status === 'error' ? item.error : item.status === 'importing' ? '处理中...' : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.searchPanel}>
          <div className={styles.searchForm}>
            <input
              type="text"
              className={styles.input}
              placeholder="搜索知识库..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
            <button type="button" className={styles.btnSecondary} onClick={handleSearch} disabled={searching || !searchQuery.trim()}>
              {searching ? '搜索中...' : '搜索'}
            </button>
          </div>
          <div className={styles.resultsArea}>
            {searchError && <div className={styles.emptyState}>{searchError}</div>}
            {!searchError && searchResults.length === 0 && (
              <div className={styles.emptyState}>输入问题后，这里会显示带来源和相似度的检索结果。</div>
            )}
            {searchResults.map((item, i) => (
              <div key={i} className={styles.resultCard}>
                <div className={styles.resultMeta}>
                  <span className={styles.resultSource}>{item.source}</span>
                  <span className={styles.resultCategory}>{item.category}</span>
                  <span className={styles.resultDistance}>{item.distance.toFixed(3)}</span>
                </div>
                <div className={styles.resultText}>{item.text}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.manageSection}>
        <div className={styles.manageHeader}>
          <div>
            <span className={styles.sectionEyebrow}>管理</span>
            <h4 className={styles.manageTitle}>文档管理</h4>
          </div>
        </div>
        <div className={styles.categoryChips}>
          <button type="button" className={`${styles.chip} ${selectedCategory === 'all' ? styles.chipActive : ''}`} onClick={() => setSelectedCategory('all')}>全部</button>
          {categories.map(cat => (
            <button key={cat} type="button" className={`${styles.chip} ${selectedCategory === cat ? styles.chipActive : ''}`} onClick={() => setSelectedCategory(cat)}>{cat}</button>
          ))}
        </div>
        {filteredSources.length === 0 ? (
          <div className={styles.emptyState}>暂无来源文件。导入文档后这里会显示来源、分类和片段数。</div>
        ) : (
          <div className={styles.sourceList}>
            {filteredSources.map(source => (
              <article key={`${source.source}-${source.category}`} className={styles.sourceItem}>
                <div className={styles.sourceInfo}>
                  <strong>{source.source}</strong>
                  <p>{source.category} · {source.count} 个片段 · {formatTime(source.createdAt)}</p>
                </div>
                <button type="button" className={styles.btnDanger} onClick={() => handleDeleteSource(source.source)}>删除</button>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default KnowledgePanel;
