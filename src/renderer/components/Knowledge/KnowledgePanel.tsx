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
  const [dragging, setDragging] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState('');
  const [searching, setSearching] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [hasSearched, setHasSearched] = useState(false);

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
        ? await api.knowledgeImportImage(filePath)
        : await api.knowledgeImportFile(filePath);

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

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults([]);
    setSearchError('');
    setHasSearched(true);
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

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSearchError('');
    setHasSearched(false);
  };

  const handleDeleteSource = async (source: string) => {
    if (!window.confirm(`确定删除来源「${source}」的所有知识片段吗？`)) return;
    const result = await api.knowledgeDeleteBySource(source);
    if (result.success) loadStats();
  };

  const categories = Array.from(new Set(sources.map(s => s.category)));
  const filteredSources = selectedCategory === 'all' ? sources : sources.filter(s => s.category === selectedCategory);

  return (
    <div
      ref={dropRef}
      className={styles.panel}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragging && (
        <div className={styles.dragOverlay}>
          <div className={styles.dragOverlayIcon}>+</div>
          <div className={styles.dragOverlayText}>释放文件，导入知识库</div>
        </div>
      )}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h2 className={styles.title}>知识库</h2>
          <span className={styles.stat}>{stats?.count ?? '—'} 片段</span>
          <span className={styles.statDivider} />
          <span className={styles.stat}>{sources.length} 来源</span>
        </div>
        <div className={styles.headerRight}>
          <button type="button" className={styles.btnUpload} onClick={handleOpenFilePicker}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            上传文件
          </button>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchBar}>
          <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="搜索知识库..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          {hasSearched && (
            <button type="button" className={styles.searchClear} onClick={handleClearSearch}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
          <button type="button" className={styles.btnSearch} onClick={handleSearch} disabled={searching || !searchQuery.trim()}>
            {searching ? '...' : '搜索'}
          </button>
        </div>
        <div className={styles.categoryChips}>
          <button type="button" className={`${styles.chip} ${selectedCategory === 'all' ? styles.chipActive : ''}`} onClick={() => setSelectedCategory('all')}>全部</button>
          {categories.map(cat => (
            <button key={cat} type="button" className={`${styles.chip} ${selectedCategory === cat ? styles.chipActive : ''}`} onClick={() => setSelectedCategory(cat)}>{cat}</button>
          ))}
        </div>
      </div>

      {importQueue.length > 0 && (
        <div className={styles.importQueueBar}>
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
        </div>
      )}

      <div className={styles.mainContent}>
        {hasSearched ? (
          <>
            {searchError && <div className={styles.emptyState}>{searchError}</div>}
            {!searchError && searchResults.length === 0 && !searching && (
              <div className={styles.emptyState}>没有找到相关结果，试试换个关键词？</div>
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
          </>
        ) : (
          <>
            {filteredSources.length === 0 ? (
              <div className={styles.emptyDropZone} onClick={handleOpenFilePicker}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.35"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                <p className={styles.emptyDropTitle}>拖拽文件到这里，或点击选择文件</p>
                <p className={styles.emptyDropHint}>支持 PDF、Word、Excel、TXT、MD 和图片</p>
              </div>
            ) : (
              <div className={styles.sourceList}>
                {filteredSources.map(source => (
                  <article key={`${source.source}-${source.category}`} className={styles.sourceItem}>
                    <div className={styles.sourceIcon}>
                      {/\.(xlsx|xls)$/i.test(source.source) ? '📊' : /\.(pdf)$/i.test(source.source) ? '📄' : /\.(docx|doc)$/i.test(source.source) ? '📝' : /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(source.source) ? '🖼️' : '📋'}
                    </div>
                    <div className={styles.sourceInfo}>
                      <strong>{source.source}</strong>
                      <p>{source.category} · {source.count} 个片段 · {formatTime(source.createdAt)}</p>
                    </div>
                    <button type="button" className={styles.btnDelete} onClick={() => handleDeleteSource(source.source)} title="删除">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    </button>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default KnowledgePanel;
