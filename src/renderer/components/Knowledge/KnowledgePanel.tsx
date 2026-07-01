/**
 * KnowledgePanel — 全新知识库管理界面
 *
 * 设计理念：干净、高效、现代
 * 布局：左侧文件导航 + 右侧内容区
 */

import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
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
  if (/\.(xlsx|xls)$/i.test(name)) return { emoji: '📊', color: '#10b981' };
  if (/\.pdf$/i.test(name)) return { emoji: '📄', color: '#ef4444' };
  if (/\.(docx|doc)$/i.test(name)) return { emoji: '📝', color: '#3b82f6' };
  if (/\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(name)) return { emoji: '🖼️', color: '#f59e0b' };
  if (/\.(txt|md)$/i.test(name)) return { emoji: '📋', color: '#8b5cf6' };
  return { emoji: '📁', color: '#6b7280' };
};

const formatTime = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(date);
};

const SEARCH_PAGE_SIZE = 10;
const IMPORT_DISMISS_MS = 3000;

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

  // 搜索
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchPage, setSearchPage] = useState(1);

  // 文件浏览
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [sourceChunks, setSourceChunks] = useState<Record<string, ChunkItem[]>>({});
  const [loadingChunks, setLoadingChunks] = useState<string | null>(null);
  const [expandedChunks, setExpandedChunks] = useState<Set<string>>(new Set());
  const [rightPanel, setRightPanel] = useState<'search' | 'detail'>('detail');
  const [targetChunkId, setTargetChunkId] = useState<string | null>(null);
  const chunkRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const api = (window as any).electronAPI;
  const dropRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const successItems = importQueue.filter(item => item.status === 'success' || item.status === 'error');
    if (successItems.length === 0) return;
    const timer = setTimeout(() => {
      const ids = new Set(successItems.map(i => i.id));
      setImportQueue(prev => prev.filter(item => !ids.has(item.id)));
    }, IMPORT_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [importQueue]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSearchActive) {
        e.preventDefault();
        handleClearSearch();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchActive]);

  useEffect(() => {
    if (!targetChunkId || rightPanel !== 'detail') return;
    const timer = setTimeout(() => {
      const el = chunkRefs.current.get(targetChunkId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

  /* ─── Search ─── */
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults([]);
    setSearchError('');
    setSearchPage(1);
    setRightPanel('search');
    try {
      const result = await api.knowledgeSearchStructured(searchQuery, 5);
      if (result.success && result.data) {
        setSearchResults(result.data);
      } else {
        setSearchError(result.error || '搜索失败');
      }
    } catch (e: any) {
      setSearchError(e.message);
    }
    setSearching(false);
  }, [api, searchQuery]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    setSearchError('');
    setSearchPage(1);
    setRightPanel('detail');
    setTargetChunkId(null);
  }, []);

  const goToSource = useCallback(async (source: string, chunkId?: string) => {
    setSelectedSource(source);
    setRightPanel('detail');
    setExpandedChunks(new Set());

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

    if (chunkId && chunks) {
      setExpandedChunks(new Set([chunkId]));
      setTargetChunkId(chunkId);
    }
  }, [api, sourceChunks]);

  /* ─── Import ─── */
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

  const handleDeleteSource = async (source: string) => {
    if (!window.confirm(`确定删除「${source}」的所有知识片段吗？`)) return;
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

  /* ─── Derived ─── */
  const hasSearchResults = searchResults.length > 0;
  const hasSearchInput = searchQuery.trim().length > 0;
  const totalSearchPages = Math.max(1, Math.ceil(searchResults.length / SEARCH_PAGE_SIZE));
  const safeSearchPage = Math.min(searchPage, totalSearchPages);
  const pagedResults = searchResults.slice((safeSearchPage - 1) * SEARCH_PAGE_SIZE, safeSearchPage * SEARCH_PAGE_SIZE);
  const selectedChunks = selectedSource ? sourceChunks[selectedSource] : null;

  return (
    <div ref={dropRef} className={styles.panel} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      {dragging && (
        <div className={styles.dragOverlay}>
          <div className={styles.dragOverlayIcon}>+</div>
          <div className={styles.dragOverlayText}>释放文件导入知识库</div>
        </div>
      )}

      {/* ─── Header ─── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.headerTitle}>知识库</h1>
          <span className={styles.headerStat}>{stats?.count ?? 0} 片段 · {sources.length} 来源</span>
        </div>
        <div className={styles.searchBox}>
          <svg className={styles.searchIcon} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="搜索知识库..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          {hasSearchInput && (
            <button type="button" className={styles.searchClear} onClick={handleClearSearch} title="清空">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          )}
          <button type="button" className={styles.btnSearch} onClick={handleSearch} disabled={searching || !hasSearchInput}>
            {searching ? '...' : '搜索'}
          </button>
        </div>
      </header>

      {/* ─── Import Queue ─── */}
      {importQueue.length > 0 && (
        <div className={styles.importBar}>
          {importQueue.map(item => (
            <div key={item.id} className={styles.importItem}>
              <span className={`${styles.importDot} ${item.status === 'success' ? styles.importDotOk : item.status === 'error' ? styles.importDotErr : styles.importDotWait}`} />
              <span className={styles.importName}>{item.name}</span>
              <span className={styles.importStatus}>
                {item.status === 'success' ? `${item.chunks} 片段 ✓` : item.status === 'error' ? item.error : '处理中...'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ─── Content ─── */}
      <div className={styles.content}>
        {sources.length === 0 ? (
          <div className={styles.empty} onClick={handleOpenFilePicker}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.3">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p>拖拽文件到这里，或点击选择</p>
            <span>支持 PDF、DOCX、XLS、TXT、MD、图片</span>
          </div>
        ) : (
          <div className={styles.split}>
            {/* ─── Left: File List ─── */}
            <nav className={styles.nav}>
              {sources.map(src => {
                const isActive = selectedSource === src.source && rightPanel === 'detail';
                const isLoading = loadingChunks === src.source;
                const icon = getFileIcon(src.source);
                const isMatch = matchedSources.has(src.source);
                return (
                  <div
                    key={`${src.source}-${src.category}`}
                    className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                    onClick={() => selectSource(src.source)}
                  >
                    <div className={styles.navIcon} style={{ color: icon.color }}>
                      {icon.emoji}
                    </div>
                    <div className={styles.navInfo}>
                      <div className={styles.navName}>
                        {src.source}
                        {isMatch && <span className={styles.navDot} />}
                      </div>
                      <div className={styles.navMeta}>
                        {src.count} 片段 {formatTime(src.createdAt) && `· ${formatTime(src.createdAt)}`}
                      </div>
                    </div>
                    {isLoading && <span className={styles.spinner} />}
                    <button type="button" className={styles.navDel} onClick={e => { e.stopPropagation(); handleDeleteSource(src.source); }} title="删除">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                    </button>
                  </div>
                );
              })}
            </nav>

            {/* ─── Right: Detail / Search ─── */}
            <main className={styles.main}>
              {rightPanel === 'search' ? (
                <div className={styles.searchResults}>
                  <div className={styles.searchHeader}>
                    {searching ? (
                      <span className={styles.searchCount}><span className={styles.spinner} /> 搜索中...</span>
                    ) : hasSearchResults ? (
                      <span className={styles.searchCount}>找到 {searchResults.length} 个相关片段</span>
                    ) : searchError ? (
                      <span className={styles.searchCount}>{searchError}</span>
                    ) : (
                      <span className={styles.searchCount}>没有结果</span>
                    )}
                    <button type="button" className={styles.btnExitSearch} onClick={handleClearSearch} title="退出搜索">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  </div>

                  {pagedResults.map((item, i) => {
                    const globalIdx = (safeSearchPage - 1) * SEARCH_PAGE_SIZE + i;
                    const score = Math.round((1 - Math.min(item.distance, 1.2) / 1.2) * 100);
                    const chunkNum = getChunkIndex(item.chunkId);
                    return (
                      <div key={`${item.source}-${item.chunkId}-${globalIdx}`} className={styles.resultCard} onClick={() => goToSource(item.source, item.chunkId)}>
                        <div className={styles.resultTop}>
                          <span className={styles.resultRank}>#{globalIdx + 1}</span>
                          <span className={styles.resultSource}>{item.source}</span>
                          {chunkNum && <span className={styles.resultChunk}>切片 {chunkNum}</span>}
                          <span className={styles.resultScore}>{score}%</span>
                        </div>
                        <div className={styles.resultText}>{item.text}</div>
                      </div>
                    );
                  })}

                  {totalSearchPages > 1 && (
                    <div className={styles.paging}>
                      {Array.from({ length: totalSearchPages }, (_, i) => i + 1).map(p => (
                        <button key={p} className={`${styles.pageNum} ${p === safeSearchPage ? styles.pageNumActive : ''}`} onClick={() => setSearchPage(p)}>{p}</button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {!selectedSource ? (
                    <div className={styles.mainEmpty}>
                      <p>选择左侧文件查看内容</p>
                    </div>
                  ) : loadingChunks === selectedSource ? (
                    <div className={styles.mainEmpty}>
                      <span className={styles.spinner} />
                      <p>加载中...</p>
                    </div>
                  ) : selectedChunks && selectedChunks.length > 0 ? (
                    <div className={styles.detailView}>
                      <div className={styles.detailHeader}>
                        <h3 className={styles.detailTitle}>{getFileIcon(selectedSource).emoji} {selectedSource}</h3>
                        <span className={styles.detailInfo}>{selectedChunks.length} 切片 · {selectedChunks.reduce((s, c) => s + c.text.length, 0).toLocaleString()} 字</span>
                      </div>
                      <div className={styles.chunksList}>
                        {selectedChunks.map((chunk, idx) => {
                          const isOpen = expandedChunks.has(chunk.chunkId);
                          return (
                            <div key={chunk.chunkId} ref={el => { if (el) chunkRefs.current.set(chunk.chunkId, el); }} className={`${styles.chunk} ${isOpen ? styles.chunkOpen : ''}`}>
                              <div className={styles.chunkHead} onClick={() => toggleChunk(chunk.chunkId)}>
                                <span className={styles.chunkArrow}>{isOpen ? '▾' : '▸'}</span>
                                <span className={styles.chunkNum}>#{idx + 1}</span>
                                <span className={styles.chunkId}>{chunk.chunkId}</span>
                                <span className={styles.chunkLen}>{chunk.text.length} 字</span>
                              </div>
                              {isOpen && <div className={styles.chunkBody}>{chunk.text}</div>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className={styles.mainEmpty}>
                      <p>该文件没有切片内容</p>
                    </div>
                  )}
                </>
              )}
            </main>
          </div>
        )}
      </div>
    </div>
  );
};

export default KnowledgePanel;
