import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import styles from './KnowledgePanel.module.css';
import { createLogger } from '../../../shared/logger';

const logger = createLogger('rag');

/* ─── Types ─── */
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

interface ChunkItem {
  chunkId: string;
  text: string;
  category: string;
  createdAt?: string;
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

const getFileIcon = (name: string) => {
  if (/\.(xlsx|xls)$/i.test(name)) return { emoji: '📊', color: '#22c55e' };
  if (/\.pdf$/i.test(name)) return { emoji: '📄', color: '#ef4444' };
  if (/\.(docx|doc)$/i.test(name)) return { emoji: '📝', color: '#3b82f6' };
  if (/\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(name)) return { emoji: '🖼️', color: '#f59e0b' };
  if (/\.(txt|md)$/i.test(name)) return { emoji: '📋', color: '#8b5cf6' };
  return { emoji: '📁', color: '#6b7280' };
};

const formatTime = (value?: string) => {
  if (!value) return '未知';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
};

const SEARCH_PAGE_SIZE = 10;
const IMPORT_DISMISS_MS = 3000;

/** 从 chunkId 中提取切片序号（如 "FAQ.xlsx#3" → "#3"） */
const getChunkIndex = (chunkId: string): string => {
  const hashIdx = chunkId.lastIndexOf('#');
  if (hashIdx >= 0) {
    const num = chunkId.slice(hashIdx + 1);
    if (/^\d+$/.test(num)) return `#${num}`;
  }
  return '';
};

/* ─── Component ─── */
const KnowledgePanel: React.FC = () => {
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [importQueue, setImportQueue] = useState<ImportItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [embeddingWarning, setEmbeddingWarning] = useState(false);

  // 搜索状态
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const [debugMode, setDebugMode] = useState(false);
  const [debugTopK, setDebugTopK] = useState(8);

  // 文件浏览状态
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [sourceChunks, setSourceChunks] = useState<Record<string, ChunkItem[]>>({});
  const [loadingChunks, setLoadingChunks] = useState<string | null>(null);
  const [expandedChunks, setExpandedChunks] = useState<Set<string>>(new Set());

  // 右侧面板视图：'search' | 'detail'
  const [rightPanel, setRightPanel] = useState<'search' | 'detail'>('detail');

  // 搜索结果跳转：目标切片自动展开+滚动
  const [targetChunkId, setTargetChunkId] = useState<string | null>(null);
  const chunkRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const api = (window as any).electronAPI;
  const dropRef = useRef<HTMLDivElement>(null);

  /* ─── Derived: 搜索命中的文件集合 ─── */
  const matchedSources = useMemo(() => {
    if (searchResults.length === 0) return new Set<string>();
    return new Set(searchResults.map(r => r.source));
  }, [searchResults]);

  const isSearchActive = rightPanel === 'search' || searching;

  /* ─── Data Loading ─── */
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

  /* ─── 导入队列自动清除成功项 ─── */
  useEffect(() => {
    const successItems = importQueue.filter(item => item.status === 'success' || item.status === 'error');
    if (successItems.length === 0) return;
    const timer = setTimeout(() => {
      const ids = new Set(successItems.map(i => i.id));
      setImportQueue(prev => prev.filter(item => !ids.has(item.id)));
    }, IMPORT_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [importQueue]);

  /* ─── Escape 键退出搜索 ─── */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSearchActive) {
        e.preventDefault();
        handleClearSearch();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchActive]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── 自动滚动到目标切片 ─── */
  useEffect(() => {
    if (!targetChunkId || rightPanel !== 'detail') return;
    // 等 DOM 渲染
    const timer = setTimeout(() => {
      const el = chunkRefs.current.get(targetChunkId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // 闪烁高亮
        el.classList.add(styles.chunkHighlight);
        setTimeout(() => el.classList.remove(styles.chunkHighlight), 1500);
      }
      setTargetChunkId(null);
    }, 100);
    return () => clearTimeout(timer);
  }, [targetChunkId, rightPanel, expandedChunks]);

  /* ─── File Operations ─── */
  const selectSource = useCallback(async (source: string) => {
    if (selectedSource === source && rightPanel === 'detail') return;
    setSelectedSource(source);
    setExpandedChunks(new Set());
    setRightPanel('detail');
    setTargetChunkId(null);
    if (!sourceChunks[source]) {
      setLoadingChunks(source);
      try {
        const result = await api.knowledgeChunksBySource(source);
        if (result.success && result.data) {
          setSourceChunks(prev => ({ ...prev, [source]: result.data }));
        }
      } catch (e) {
        logger.error('加载切片失败', e);
      }
      setLoadingChunks(null);
    }
  }, [api, selectedSource, sourceChunks, rightPanel]);

  const toggleChunk = useCallback((chunkId: string) => {
    setExpandedChunks(prev => {
      const next = new Set(prev);
      if (next.has(chunkId)) next.delete(chunkId);
      else next.add(chunkId);
      return next;
    });
  }, []);

  const expandAllChunks = useCallback(() => {
    const chunks = selectedSource ? sourceChunks[selectedSource] : null;
    if (chunks) setExpandedChunks(new Set(chunks.map(c => c.chunkId)));
  }, [selectedSource, sourceChunks]);

  const collapseAllChunks = useCallback(() => {
    setExpandedChunks(new Set());
  }, []);

  /* ─── Search Operations ─── */
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults([]);
    setSearchError('');
    setSearchPage(1);
    setRightPanel('search');
    try {
      const result = await api.knowledgeSearchStructured(searchQuery, debugMode ? debugTopK : 20);
      if (result.success && result.data) {
        setSearchResults(result.data);
      } else {
        setSearchError(result.error || '搜索失败');
      }
    } catch (e: any) {
      setSearchError(e.message);
    }
    setSearching(false);
  }, [api, searchQuery, debugMode, debugTopK]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    setSearchError('');
    setSearchPage(1);
    setRightPanel('detail');
    setTargetChunkId(null);
  }, []);

  /** 从搜索结果跳转到源文件并定位切片 */
  const goToSource = useCallback(async (source: string, chunkId?: string) => {
    setSelectedSource(source);
    setRightPanel('detail');
    setExpandedChunks(new Set());

    // 先加载切片数据
    let chunks = sourceChunks[source];
    if (!chunks) {
      setLoadingChunks(source);
      try {
        const result = await api.knowledgeChunksBySource(source);
        if (result.success && result.data) {
          chunks = result.data;
          setSourceChunks(prev => ({ ...prev, [source]: result.data }));
        }
      } catch (e) {
        logger.error('加载切片失败', e);
      }
      setLoadingChunks(null);
    }

    // 展开目标切片并标记滚动
    if (chunkId && chunks) {
      setExpandedChunks(new Set([chunkId]));
      setTargetChunkId(chunkId);
    }
  }, [api, sourceChunks]);

  /* ─── File Import ─── */
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
      if (result.embeddingReady === false) setEmbeddingWarning(true);
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

  const handleDeleteSource = async (source: string) => {
    if (!window.confirm(`确定删除来源「${source}」的所有知识片段吗？`)) return;
    const result = await api.knowledgeDeleteBySource(source);
    if (result.success) {
      loadStats();
      if (selectedSource === source) {
        setSelectedSource(null);
        setRightPanel('detail');
        setSourceChunks(prev => {
          const next = { ...prev };
          delete next[source];
          return next;
        });
      }
    }
  };

  /* ─── Derived State ─── */
  const hasSearchResults = searchResults.length > 0;
  const hasSearchInput = searchQuery.trim().length > 0;

  // 搜索分页
  const totalSearchPages = Math.max(1, Math.ceil(searchResults.length / SEARCH_PAGE_SIZE));
  const safeSearchPage = Math.min(searchPage, totalSearchPages);
  const pagedResults = searchResults.slice((safeSearchPage - 1) * SEARCH_PAGE_SIZE, safeSearchPage * SEARCH_PAGE_SIZE);

  const searchPageNumbers = useMemo(() => {
    const pages: number[] = [];
    const start = Math.max(1, safeSearchPage - 2);
    const end = Math.min(totalSearchPages, start + 4);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }, [safeSearchPage, totalSearchPages]);

  const distanceToScore = (distance: number) => {
    return Math.max(0, Math.min(100, Math.round((1 - Math.min(distance, 1.2) / 1.2) * 100)));
  };

  const bestDistance = searchResults.length > 0 ? Math.min(...searchResults.map(item => item.distance)) : null;
  const averageDistance = searchResults.length > 0
    ? searchResults.reduce((sum, item) => sum + item.distance, 0) / searchResults.length
    : null;
  const totalResultChars = searchResults.reduce((sum, item) => sum + item.text.length, 0);

  const selectedChunks = selectedSource ? sourceChunks[selectedSource] : null;

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

      {/* ─── Top Bar ─── */}
      <div className={styles.topBar}>
        <div className={styles.topLeft}>
          <h2 className={styles.title}>知识库</h2>
          <span className={styles.stat}>{stats?.count ?? '—'} 片段 · {sources.length} 来源</span>
        </div>
        <div className={styles.searchBar}>
          <svg className={styles.searchIcon} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="搜索知识库... (Esc 退出)"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          {hasSearchInput && (
            <button type="button" className={styles.searchClear} onClick={handleClearSearch} title="清空搜索">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
          <button
            type="button"
            className={styles.btnSearch}
            onClick={handleSearch}
            disabled={searching || !hasSearchInput}
          >
            {searching ? '...' : '搜索'}
          </button>
        </div>
      </div>

      {embeddingWarning && (
        <div className={styles.embeddingWarning}>
          <span>⚠️ 向量模型加载失败，当前仅支持关键词搜索，语义检索不可用。重启应用可重试。</span>
          <button type="button" className={styles.warningDismiss} onClick={() => setEmbeddingWarning(false)}>×</button>
        </div>
      )}

      {/* ─── Import Queue ─── */}
      {importQueue.length > 0 && (
        <div className={styles.importQueueBar}>
          <div className={styles.importQueue}>
            {importQueue.map(item => (
              <div key={item.id} className={styles.queueItem}>
                <span className={`${styles.queueDot} ${item.status === 'success' ? styles.queueDotSuccess : item.status === 'error' ? styles.queueDotError : item.status === 'importing' ? styles.queueDotLoading : ''}`} />
                <span className={styles.queueName}>{item.name}</span>
                <span className={styles.queueInfo}>
                  {item.status === 'success' ? `${item.chunks} 片段 ✓` : item.status === 'error' ? item.error : item.status === 'importing' ? '处理中...' : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Main Content: Always Split Layout ─── */}
      <div className={styles.mainContent}>
        {sources.length === 0 ? (
          <div className={styles.emptyDropZone} onClick={handleOpenFilePicker}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.35"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <p className={styles.emptyDropTitle}>拖拽文件到这里，或点击选择文件</p>
            <p className={styles.emptyDropHint}>支持 PDF、DOCX、XLS/XLSX、TXT、MD、JPG、PNG、WEBP、GIF、BMP</p>
          </div>
        ) : (
          <div className={styles.splitLayout}>
            {/* ─── Left: File List ─── */}
            <div className={styles.fileList}>
              {sources.map(source => {
                const isSelected = selectedSource === source.source && rightPanel === 'detail';
                const isLoading = loadingChunks === source.source;
                const icon = getFileIcon(source.source);
                const isMatched = matchedSources.has(source.source);
                return (
                  <div
                    key={`${source.source}-${source.category}`}
                    className={`${styles.fileCard} ${isSelected ? styles.fileCardActive : ''}`}
                    onClick={() => selectSource(source.source)}
                  >
                    <div className={styles.fileCardIcon} style={{ backgroundColor: `${icon.color}18`, color: icon.color }}>
                      <span>{icon.emoji}</span>
                    </div>
                    <div className={styles.fileCardBody}>
                      <div className={styles.fileCardName}>
                        {source.source}
                        {isMatched && <span className={styles.fileMatchDot} title="搜索命中" />}
                      </div>
                      <div className={styles.fileCardMeta}>
                        <span className={styles.fileCardChunks}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                          {source.count} 片段
                        </span>
                        <span className={styles.fileCardTime}>{formatTime(source.createdAt)}</span>
                      </div>
                    </div>
                    {isLoading && <span className={styles.fileCardSpinner} />}
                    <button
                      type="button"
                      className={styles.fileCardDelete}
                      onClick={(e) => { e.stopPropagation(); handleDeleteSource(source.source); }}
                      title="删除"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    </button>
                  </div>
                );
              })}
            </div>

            {/* ─── Right Panel ─── */}
            <div className={styles.detailPanel}>
              {rightPanel === 'search' ? (
                /* ─── Search Results ─── */
                <div className={styles.searchScroll}>
                  {/* 搜索结果头 */}
                  <div className={styles.searchResultHeader}>
                    {searching ? (
                      <span className={styles.searchResultCount}>
                        <span className={styles.detailSpinner} style={{ width: 14, height: 14, borderWidth: 1.5 }} />
                        搜索中...
                      </span>
                    ) : hasSearchResults ? (
                      <span className={styles.searchResultCount}>找到 {searchResults.length} 个相关片段</span>
                    ) : searchError ? (
                      <span className={styles.searchResultCount}>{searchError}</span>
                    ) : (
                      <span className={styles.searchResultCount}>没有找到相关结果</span>
                    )}
                    <div className={styles.searchHeaderActions}>
                      <button type="button" className={styles.btnClearSearch} onClick={handleClearSearch} title="退出搜索">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  </div>

                  {/* 调试信息：折叠面板 */}
                  {hasSearchResults && (
                    <details className={styles.debugDetails}>
                      <summary className={styles.debugSummaryToggle}>调试信息</summary>
                      <div className={styles.debugSummary}>
                        <div><span>Query</span><strong>{searchQuery}</strong></div>
                        <div><span>命中</span><strong>{searchResults.length}</strong></div>
                        <div><span>最佳距离</span><strong>{bestDistance === null ? '—' : bestDistance.toFixed(4)}</strong></div>
                        <div><span>平均距离</span><strong>{averageDistance === null ? '—' : averageDistance.toFixed(4)}</strong></div>
                        <div><span>总字符</span><strong>{totalResultChars}</strong></div>
                      </div>
                      <label className={styles.debugControl}>
                        <span>返回条数</span>
                        <select value={debugTopK} onChange={e => setDebugTopK(Number(e.target.value))}>
                          <option value={3}>3</option>
                          <option value={5}>5</option>
                          <option value={8}>8</option>
                          <option value={12}>12</option>
                        </select>
                      </label>
                    </details>
                  )}

                  {/* 结果列表 */}
                  {pagedResults.map((item, i) => {
                    const globalIdx = (safeSearchPage - 1) * SEARCH_PAGE_SIZE + i;
                    const score = distanceToScore(item.distance);
                    const chunkNum = getChunkIndex(item.chunkId);
                    return (
                      <div
                        key={`${item.source}-${item.chunkId}-${globalIdx}`}
                        className={styles.resultCard}
                        onClick={() => goToSource(item.source, item.chunkId)}
                      >
                        <div className={styles.resultMeta}>
                          <span className={styles.resultRank}>#{globalIdx + 1}</span>
                          <div className={styles.resultSourceInfo}>
                            <span className={styles.resultSource}>{item.source}</span>
                            {chunkNum && <span className={styles.resultChunkPos}>切片 {chunkNum}</span>}
                          </div>
                          <div className={styles.resultScoreBar}>
                            <div className={styles.resultScoreFill} style={{ width: `${score}%` }} />
                            <span className={styles.resultScoreText}>{score}%</span>
                          </div>
                        </div>
                        {debugMode && (
                          <div className={styles.debugMetaRow}>
                            <span>chunkId: {item.chunkId}</span>
                            <span>distance: {item.distance.toFixed(4)}</span>
                            <span>chars: {item.text.length}</span>
                          </div>
                        )}
                        <div className={styles.resultText}>{item.text}</div>
                      </div>
                    );
                  })}

                  {totalSearchPages > 1 && (
                    <div className={styles.pagination}>
                      <button className={styles.pageBtn} disabled={safeSearchPage <= 1} onClick={() => setSearchPage(safeSearchPage - 1)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
                      </button>
                      {searchPageNumbers[0] > 1 && <span className={styles.pageEllipsis}>…</span>}
                      {searchPageNumbers.map(p => (
                        <button key={p} className={`${styles.pageBtn} ${p === safeSearchPage ? styles.pageBtnActive : ''}`} onClick={() => setSearchPage(p)}>{p}</button>
                      ))}
                      {searchPageNumbers[searchPageNumbers.length - 1] < totalSearchPages && <span className={styles.pageEllipsis}>…</span>}
                      <button className={styles.pageBtn} disabled={safeSearchPage >= totalSearchPages} onClick={() => setSearchPage(safeSearchPage + 1)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
                      </button>
                      <span className={styles.pageInfo}>{safeSearchPage} / {totalSearchPages}</span>
                    </div>
                  )}
                </div>
              ) : (
                /* ─── File Detail ─── */
                <>
                  {!selectedSource ? (
                    <div className={styles.detailEmpty}>
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.25">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                      </svg>
                      <p>点击左侧文件查看切片</p>
                    </div>
                  ) : loadingChunks === selectedSource ? (
                    <div className={styles.detailEmpty}>
                      <div className={styles.detailSpinner} />
                      <p>加载切片中...</p>
                    </div>
                  ) : selectedChunks ? (
                    selectedChunks.length === 0 ? (
                      <div className={styles.detailEmpty}>
                        <p>该文件没有切片内容</p>
                      </div>
                    ) : (
                      <div className={styles.detailContent}>
                        <div className={styles.detailHeader}>
                          <div className={styles.detailTitle}>
                            <span>{getFileIcon(selectedSource).emoji}</span>
                            <h3>{selectedSource}</h3>
                            <span className={styles.detailStatChip}>{selectedChunks.length} 切片 · {selectedChunks.reduce((s, c) => s + c.text.length, 0).toLocaleString()} 字</span>
                          </div>
                          <div className={styles.detailActions}>
                            <button type="button" className={styles.detailActionBtn} onClick={expandAllChunks} title="展开全部">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 9l6 6 6-6"/></svg>
                            </button>
                            <button type="button" className={styles.detailActionBtn} onClick={collapseAllChunks} title="折叠全部">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 15l-6-6-6 6"/></svg>
                            </button>
                          </div>
                        </div>
                        <div className={styles.detailChunks}>
                          {selectedChunks.map((chunk, idx) => {
                            const isOpen = expandedChunks.has(chunk.chunkId);
                            return (
                              <div
                                key={chunk.chunkId}
                                ref={el => { if (el) chunkRefs.current.set(chunk.chunkId, el); }}
                                className={`${styles.chunkCard} ${isOpen ? styles.chunkCardOpen : ''}`}
                                onClick={() => toggleChunk(chunk.chunkId)}
                              >
                                <div className={styles.chunkCardHeader}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={`${styles.chunkChevron} ${isOpen ? styles.chunkChevronOpen : ''}`}><path d="M9 18l6-6-6-6"/></svg>
                                  <span className={styles.chunkBadge}>#{idx + 1}</span>
                                  <span className={styles.chunkIdText}>{chunk.chunkId}</span>
                                  <span className={styles.chunkCharCount}>{chunk.text.length} 字</span>
                                </div>
                                {isOpen && <div className={styles.chunkCardBody}>{chunk.text}</div>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )
                  ) : (
                    <div className={styles.detailEmpty}>
                      <p>切片加载失败</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default KnowledgePanel;
