import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './MemoryPanel.module.css';

type MemoryCategory = 'preference' | 'fact' | 'project' | 'decision' | 'belief' | 'event';

interface MemoryItem {
  id: string;
  content: string;
  category: MemoryCategory;
  importance: number;
  created_at: number;
  updated_at: number;
  access_count: number;
  source_conversation?: string;
}

const categoryLabels: Record<MemoryCategory, string> = {
  preference: '偏好',
  fact: '事实',
  project: '项目',
  decision: '决策',
  belief: '观点',
  event: '事件',
};

const formatDate = (timestamp: number) => {
  if (!timestamp) return '未知';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
};

const MemoryPanel: React.FC = () => {
  const api = (window as any).electronAPI;
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadMemories = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.memoryGetAllMemories();
      setMemories(Array.isArray(result) ? result : []);
    } catch (e: any) {
      setError(e.message || '加载记忆失败');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  const filteredMemories = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const sorted = [...memories].sort((a, b) => b.updated_at - a.updated_at);
    if (!keyword) return sorted;

    return sorted.filter((memory) => {
      const categoryLabel = categoryLabels[memory.category] || memory.category;
      return (
        memory.content.toLowerCase().includes(keyword) ||
        memory.category.toLowerCase().includes(keyword) ||
        categoryLabel.includes(keyword)
      );
    });
  }, [memories, query]);

  const categoryCounts = useMemo(() => {
    return memories.reduce<Record<string, number>>((acc, memory) => {
      acc[memory.category] = (acc[memory.category] || 0) + 1;
      return acc;
    }, {});
  }, [memories]);

  const averageImportance = useMemo(() => {
    if (memories.length === 0) return 0;
    const total = memories.reduce((sum, memory) => sum + memory.importance, 0);
    return Math.round((total / memories.length) * 10) / 10;
  }, [memories]);

  const handleDelete = async (id: string) => {
    setBusyId(id);
    setError('');
    try {
      await api.memoryDeleteMemory(id);
      await loadMemories();
    } catch (e: any) {
      setError(e.message || '删除记忆失败');
    } finally {
      setBusyId(null);
    }
  };

  const handleClearAll = async () => {
    if (memories.length === 0) return;
    const confirmed = window.confirm('确定清空所有长期记忆吗？这个操作不可撤销。');
    if (!confirmed) return;

    setLoading(true);
    setError('');
    try {
      await api.memoryClearAllMemories();
      await loadMemories();
    } catch (e: any) {
      setError(e.message || '清空记忆失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{memories.length}</div>
          <div className={styles.statLabel}>长期记忆</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{Object.keys(categoryCounts).length}</div>
          <div className={styles.statLabel}>记忆类别</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{averageImportance}</div>
          <div className={styles.statLabel}>平均重要性</div>
        </div>
      </div>

      <div className={styles.toolbar}>
        <input
          className={styles.searchInput}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索内容、类别"
        />
        <button className={styles.iconButton} onClick={loadMemories} disabled={loading} title="刷新">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
            <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
          </svg>
        </button>
        <button
          className={styles.iconButton}
          onClick={handleClearAll}
          disabled={loading || memories.length === 0}
          title="清空"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
            <path d="M9 6V4h6v2" />
          </svg>
        </button>
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      <div className={styles.sectionHeader}>
        <span>记忆列表</span>
        <span>{filteredMemories.length} 条</span>
      </div>

      <div className={styles.memoryList}>
        {loading && <div className={styles.emptyState}>正在加载记忆...</div>}

        {!loading && filteredMemories.length === 0 && (
          <div className={styles.emptyState}>
            {query.trim() ? '没有匹配的记忆' : '暂无长期记忆'}
          </div>
        )}

        {!loading && filteredMemories.map((memory) => (
          <article key={memory.id} className={styles.memoryCard}>
            <div className={styles.memoryHeader}>
              <span className={`${styles.categoryPill} ${styles[memory.category] || ''}`}>
                {categoryLabels[memory.category] || memory.category}
              </span>
              <button
                className={styles.deleteButton}
                onClick={() => handleDelete(memory.id)}
                disabled={busyId === memory.id}
                title="删除"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18" />
                  <path d="M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className={styles.memoryContent}>{memory.content}</p>
            <div className={styles.memoryMeta}>
              <span>重要性 {memory.importance}/10</span>
              <span>访问 {memory.access_count}</span>
              <span>更新 {formatDate(memory.updated_at || memory.created_at)}</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};

export default MemoryPanel;
