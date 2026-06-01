import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './MemoryPanel.module.css';

type MemoryCategory = 'preference' | 'fact' | 'project' | 'decision' | 'belief' | 'event';
type MemoryStatus = 'active' | 'superseded' | 'archived';

interface MemoryItem {
  id: string;
  content: string;
  category: MemoryCategory;
  importance: number;
  created_at: number;
  updated_at: number;
  access_count: number;
  source_conversation?: string;
  source_message?: string;
  source_kind?: 'explicit' | 'inferred' | 'manual';
  memory_key?: string;
  confidence?: number;
  status?: MemoryStatus;
  valid_until?: number;
}

const categoryLabels: Record<MemoryCategory, string> = {
  preference: '偏好',
  fact: '事实',
  project: '项目',
  decision: '决策',
  belief: '观点',
  event: '事件',
};

const statusLabels: Record<MemoryStatus, string> = {
  active: '生效中',
  superseded: '已替换',
  archived: '已归档',
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
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedStatus, setSelectedStatus] = useState<MemoryStatus>('active');

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

    return sorted.filter((memory) => {
      const categoryLabel = categoryLabels[memory.category] || memory.category;
      const status = memory.status || 'active';

      if (status !== selectedStatus) return false;
      if (selectedCategories.size > 0 && !selectedCategories.has(categoryLabel)) {
        return false;
      }

      if (!keyword) return true;

      return (
        memory.content.toLowerCase().includes(keyword) ||
        memory.category.toLowerCase().includes(keyword) ||
        categoryLabel.includes(keyword)
      );
    });
  }, [memories, query, selectedCategories, selectedStatus]);

  const categoryCounts = useMemo(() => {
    return memories.filter(memory => (memory.status || 'active') === 'active').reduce<Record<string, number>>((acc, memory) => {
      acc[memory.category] = (acc[memory.category] || 0) + 1;
      return acc;
    }, {});
  }, [memories]);

  const statusCounts = useMemo(() => {
    return memories.reduce<Record<MemoryStatus, number>>((acc, memory) => {
      const status = memory.status || 'active';
      acc[status] += 1;
      return acc;
    }, { active: 0, superseded: 0, archived: 0 });
  }, [memories]);

  const averageImportance = useMemo(() => {
    const activeMemories = memories.filter(memory => (memory.status || 'active') === 'active');
    if (activeMemories.length === 0) return 0;
    const total = activeMemories.reduce((sum, memory) => sum + memory.importance, 0);
    return Math.round((total / activeMemories.length) * 10) / 10;
  }, [memories]);

  const categorySummary = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => `${categoryLabels[category as MemoryCategory] || category} ${count}`);

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

  const handleStatusChange = async (id: string, status: 'active' | 'archived') => {
    setBusyId(id);
    setError('');
    try {
      await api.memorySetStatus(id, status);
      await loadMemories();
    } catch (e: any) {
      setError(e.message || '更新记忆状态失败');
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
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>记忆管理</p>
          <h3>记忆库</h3>
          <p>管理跨对话保留的信息。过期事件会归档，发生变化的事实会保留替换记录。</p>
        </div>
        <div className={styles.metrics}>
          <div className={styles.metricCard}>
            <strong>{statusCounts.active}</strong>
            <span>生效记忆</span>
          </div>
          <div className={styles.metricCard}>
            <strong>{Object.keys(categoryCounts).length}</strong>
            <span>记忆类别</span>
          </div>
          <div className={styles.metricCard}>
            <strong>{averageImportance}</strong>
            <span>平均重要性</span>
          </div>
        </div>
      </section>

      <section className={styles.toolbarCard}>
        <div className={styles.toolbarTop}>
          <div>
            <span className={styles.sectionEyebrow}>检索与整理</span>
            <h4>筛查长期记忆</h4>
          </div>
          <div className={styles.toolbarActions}>
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
        </div>

        <input
          className={styles.searchInput}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索内容、类别、偏好或项目关键词"
        />

        <div className={styles.statusTabs} role="tablist" aria-label="记忆状态">
          {(Object.keys(statusLabels) as MemoryStatus[]).map(status => (
            <button
              key={status}
              type="button"
              role="tab"
              aria-selected={selectedStatus === status}
              className={`${styles.statusTab} ${selectedStatus === status ? styles.statusTabActive : ''}`}
              onClick={() => setSelectedStatus(status)}
            >
              {statusLabels[status]} {statusCounts[status]}
            </button>
          ))}
        </div>

        <div className={styles.categoryRail}>
          {categorySummary.length > 0 ? categorySummary.map((item) => {
            const spaceIdx = item.lastIndexOf(' ');
            const label = spaceIdx > 0 ? item.slice(0, spaceIdx) : item;
            const isActive = selectedCategories.has(label);
            return (
              <button
                key={item}
                type="button"
                className={`${styles.categoryChip} ${isActive ? styles.categoryChipActive : ''}`}
                onClick={() => {
                  setSelectedCategories((prev) => {
                    const next = new Set(prev);
                    if (next.has(label)) {
                      next.delete(label);
                    } else {
                      next.add(label);
                    }
                    return next;
                  });
                }}
              >
                {item}
              </button>
            );
          }) : (
            <span className={styles.categoryChip}>还没有记忆类别</span>
          )}
        </div>
      </section>

      {error && <div className={styles.errorBox}>{error}</div>}

      <section className={styles.listCard}>
        <div className={styles.listHeader}>
          <div>
            <span className={styles.sectionEyebrow}>记录</span>
            <h4>记忆条目</h4>
          </div>
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
                <div className={styles.memoryLead}>
                  <span className={`${styles.categoryPill} ${styles[memory.category] || ''}`}>
                    {categoryLabels[memory.category] || memory.category}
                  </span>
                  <span className={`${styles.statusPill} ${styles[memory.status || 'active'] || ''}`}>
                    {statusLabels[memory.status || 'active']}
                  </span>
                  <span className={styles.memoryTime}>{formatDate(memory.updated_at || memory.created_at)}</span>
                </div>
                <div className={styles.memoryActions}>
                  {(memory.status || 'active') !== 'superseded' && (
                    <button
                      className={styles.deleteButton}
                      onClick={() => handleStatusChange(memory.id, (memory.status || 'active') === 'archived' ? 'active' : 'archived')}
                      disabled={busyId === memory.id}
                      title={(memory.status || 'active') === 'archived' ? '恢复' : '归档'}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        {(memory.status || 'active') === 'archived' ? (
                          <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
                        ) : (
                          <>
                            <path d="M4 7h16" />
                            <path d="M5 7l1 13h12l1-13" />
                            <path d="M9 11h6" />
                            <path d="M8 4h8l1 3H7l1-3z" />
                          </>
                        )}
                      </svg>
                    </button>
                  )}
                  <button
                    className={styles.deleteButton}
                    onClick={() => handleDelete(memory.id)}
                    disabled={busyId === memory.id}
                    title="永久删除"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18" />
                      <path d="M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              <p className={styles.memoryContent}>{memory.content}</p>
              <div className={styles.memoryMeta}>
                <span>重要性 {memory.importance}/10</span>
                <span>可信度 {Math.round((memory.confidence ?? 0.7) * 100)}%</span>
                <span>访问 {memory.access_count}</span>
                {memory.memory_key && <span>键 {memory.memory_key}</span>}
                {memory.valid_until && <span>有效至 {formatDate(memory.valid_until)}</span>}
                <span>{memory.source_conversation ? '来源对话已记录' : '无来源对话信息'}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};

export default MemoryPanel;
