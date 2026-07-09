import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './MemoryPanel.module.css';
import ConfirmDialog from '../common/ConfirmDialog';

type MemoryCategory = 'preference' | 'fact' | 'project' | 'decision' | 'belief' | 'event';
type MemoryStatus = 'active' | 'superseded' | 'archived';
type SortMode = 'updated' | 'importance' | 'access';

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

const sourceKindLabels: Record<string, string> = {
  explicit: '用户',
  inferred: 'AI推断',
  manual: '手动',
};

const sourceKindColors: Record<string, string> = {
  explicit: '#22c55e',
  inferred: '#a78bfa',
  manual: '#f59e0b',
};

const importanceColor = (imp: number) => {
  if (imp >= 8) return '#22d3ee';
  if (imp >= 6) return '#6366f1';
  if (imp >= 4) return '#a78bfa';
  return '#64748b';
};

const importanceBg = (imp: number) => {
  if (imp >= 8) return 'rgba(34,211,238,0.1)';
  if (imp >= 6) return 'rgba(99,102,241,0.1)';
  if (imp >= 4) return 'rgba(167,139,250,0.1)';
  return 'rgba(100,116,139,0.08)';
};

const formatDate = (timestamp: number) => {
  if (!timestamp) return '未知';
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
};

const daysUntil = (timestamp: number) => {
  if (!timestamp) return Infinity;
  return Math.ceil((timestamp - Date.now()) / 86400000);
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
  const [sortMode, setSortMode] = useState<SortMode>('updated');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<MemoryCategory>('fact');
  const [newImportance, setNewImportance] = useState(5);
  const [confirmAction, setConfirmAction] = useState<{ type: 'delete'; memory: MemoryItem } | { type: 'clearAll' } | null>(null);

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

  useEffect(() => { loadMemories(); }, [loadMemories]);

  const filteredMemories = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    const sorted = [...memories].sort((a, b) => {
      if (sortMode === 'importance') return b.importance - a.importance;
      if (sortMode === 'access') return b.access_count - a.access_count;
      return b.updated_at - a.updated_at;
    });

    return sorted.filter((memory) => {
      const categoryLabel = categoryLabels[memory.category] || memory.category;
      const status = memory.status || 'active';
      if (status !== selectedStatus) return false;
      if (selectedCategories.size > 0 && !selectedCategories.has(categoryLabel)) return false;
      if (!keyword) return true;
      return (
        memory.content.toLowerCase().includes(keyword) ||
        memory.category.toLowerCase().includes(keyword) ||
        categoryLabel.includes(keyword) ||
        (memory.memory_key || '').toLowerCase().includes(keyword)
      );
    });
  }, [memories, query, selectedCategories, selectedStatus, sortMode]);

  const categoryCounts = useMemo(() => {
    return memories.filter(m => (m.status || 'active') === 'active').reduce<Record<string, number>>((acc, m) => {
      acc[m.category] = (acc[m.category] || 0) + 1;
      return acc;
    }, {});
  }, [memories]);

  const statusCounts = useMemo(() => {
    return memories.reduce<Record<MemoryStatus, number>>((acc, m) => {
      const status = m.status || 'active';
      acc[status] += 1;
      return acc;
    }, { active: 0, superseded: 0, archived: 0 });
  }, [memories]);

  const averageImportance = useMemo(() => {
    const activeMemories = memories.filter(m => (m.status || 'active') === 'active');
    if (activeMemories.length === 0) return 0;
    return Math.round((activeMemories.reduce((s, m) => s + m.importance, 0) / activeMemories.length) * 10) / 10;
  }, [memories]);

  const deleteMemory = async (id: string) => {
    setBusyId(id);
    setError('');
    try {
      await api.memoryDeleteMemory(id);
      await loadMemories();
    } catch (e: any) {
      setError(e.message || '删除记忆失败');
    } finally {
      setBusyId(null);
      setConfirmAction(null);
    }
  };

  const handleDelete = (memory: MemoryItem) => {
    setConfirmAction({ type: 'delete', memory });
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
    setConfirmAction({ type: 'clearAll' });
  };

  const clearAllMemories = async () => {
    setLoading(true);
    setError('');
    try {
      await api.memoryClearAllMemories();
      await loadMemories();
    } catch (e: any) {
      setError(e.message || '清空记忆失败');
    } finally {
      setLoading(false);
      setConfirmAction(null);
    }
  };

  const handleAddMemory = async () => {
    if (!newContent.trim()) return;
    setBusyId('new');
    setError('');
    try {
      await api.memoryAddMemory(newContent.trim(), newCategory, newImportance, { sourceKind: 'manual' });
      setNewContent('');
      setShowAddForm(false);
      await loadMemories();
    } catch (e: any) {
      setError(e.message || '添加记忆失败');
    } finally {
      setBusyId(null);
    }
  };

  const renderMemoryCard = (memory: MemoryItem) => {
    const status = memory.status || 'active';
    const daysLeft = memory.valid_until ? daysUntil(memory.valid_until) : null;
    const isExpiring = daysLeft !== null && daysLeft <= 7 && daysLeft > 0;
    const isExpired = daysLeft !== null && daysLeft <= 0;
    const kindColor = sourceKindColors[memory.source_kind || 'inferred'] || sourceKindColors.inferred;

    return (
      <article key={memory.id} className={`${styles.memoryCard} ${isExpiring ? styles.memoryCardExpiring : ''} ${isExpired ? styles.memoryCardExpired : ''}`}>
        <div className={styles.memoryHeader}>
          <div className={styles.memoryLead}>
            <span className={styles.importanceDot} style={{ background: importanceColor(memory.importance), boxShadow: `0 0 6px ${importanceColor(memory.importance)}40` }} title={`重要性 ${memory.importance}/10`} />
            <span className={`${styles.categoryPill} ${styles[memory.category] || ''}`}>
              {categoryLabels[memory.category] || memory.category}
            </span>
            <span className={`${styles.statusPill} ${styles[status] || ''}`}>
              {statusLabels[status]}
            </span>
            {memory.source_kind && (
              <span className={styles.sourceKindTag} style={{ color: kindColor, borderColor: `${kindColor}30`, background: `${kindColor}10` }}>
                {sourceKindLabels[memory.source_kind] || memory.source_kind}
              </span>
            )}
            {memory.memory_key && <span className={styles.memoryKeyTag}>{memory.memory_key}</span>}
            <span className={styles.memoryTime}>{formatDate(memory.updated_at || memory.created_at)}</span>
          </div>
          <div className={styles.memoryActions}>
            {status !== 'superseded' && (
              <button
                className={styles.deleteButton}
                onClick={() => handleStatusChange(memory.id, status === 'archived' ? 'active' : 'archived')}
                disabled={busyId === memory.id}
                title={status === 'archived' ? '恢复' : '归档'}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {status === 'archived' ? (
                    <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
                  ) : (
                    <><path d="M4 7h16"/><path d="M5 7l1 13h12l1-13"/><path d="M9 11h6"/><path d="M8 4h8l1 3H7l1-3z"/></>
                  )}
                </svg>
              </button>
            )}
            <button
              className={styles.deleteButton}
              onClick={() => handleDelete(memory)}
              disabled={busyId === memory.id}
              title="永久删除"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18" /><path d="M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <p className={styles.memoryContent}>{memory.content}</p>
        <div className={styles.memoryMeta}>
          <span className={styles.metaItem} style={{ color: importanceColor(memory.importance), background: importanceBg(memory.importance) }}>
            重要性 {memory.importance}/10
          </span>
          <span className={styles.metaItem}>可信度 {Math.round((memory.confidence ?? 0.7) * 100)}%</span>
          <span className={styles.metaItem}>访问 {memory.access_count}</span>
          {memory.valid_until && (
            <span className={`${styles.metaItem} ${isExpiring ? styles.metaExpiring : ''} ${isExpired ? styles.metaExpired : ''}`}>
              {isExpired ? '已过期' : isExpiring ? `${daysLeft}天后过期` : `有效至 ${formatDate(memory.valid_until)}`}
            </span>
          )}
          <span className={styles.metaItem}>{memory.source_conversation ? '来源已记录' : '无来源'}</span>
        </div>
      </article>
    );
  };

  const categorySummary = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => `${categoryLabels[category as MemoryCategory] || category} ${count}`);

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
            <strong style={{ color: importanceColor(Math.round(averageImportance)) }}>{averageImportance}</strong>
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
            <button className={styles.iconButton} onClick={() => setShowAddForm(!showAddForm)} title="手动添加" style={{ color: '#22d3ee' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <button className={styles.iconButton} onClick={loadMemories} disabled={loading} title="刷新">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></svg>
            </button>
            <button className={styles.iconButton} onClick={handleClearAll} disabled={loading || memories.length === 0} title="清空">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          </div>
        </div>

        {showAddForm && (
          <div className={styles.addForm}>
            <textarea
              className={styles.addInput}
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              placeholder="输入要记住的内容..."
              rows={3}
            />
            <div className={styles.addFormRow}>
              <select className={styles.addSelect} value={newCategory} onChange={e => setNewCategory(e.target.value as MemoryCategory)}>
                {Object.entries(categoryLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <label className={styles.addLabel}>
                重要性
                <input type="range" min={1} max={10} value={newImportance} onChange={e => setNewImportance(Number(e.target.value))} className={styles.addRange} />
                <span style={{ color: importanceColor(newImportance), fontWeight: 600 }}>{newImportance}</span>
              </label>
              <button className={styles.addBtn} onClick={handleAddMemory} disabled={!newContent.trim() || busyId === 'new'}>
                {busyId === 'new' ? '添加中...' : '添加'}
              </button>
              <button className={styles.addCancelBtn} onClick={() => setShowAddForm(false)}>取消</button>
            </div>
          </div>
        )}

        <input
          className={styles.searchInput}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索内容、类别、键名或关键词"
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

        <div className={styles.filterRow}>
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
                      if (next.has(label)) next.delete(label);
                      else next.add(label);
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
          <div className={styles.sortButtons}>
            {([['updated', '时间'], ['importance', '重要性'], ['access', '访问量']] as const).map(([mode, label]) => (
              <button key={mode} className={`${styles.sortBtn} ${sortMode === mode ? styles.sortBtnActive : ''}`} onClick={() => setSortMode(mode)}>
                {label}
              </button>
            ))}
          </div>
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
            <div className={styles.emptyState}>{query.trim() ? '没有匹配的记忆' : '暂无长期记忆'}</div>
          )}

          {!loading && filteredMemories.map(renderMemoryCard)}
        </div>
      </section>
      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.type === 'clearAll' ? '清空长期记忆' : '永久删除记忆'}
        message={confirmAction?.type === 'clearAll'
          ? `确定清空全部 ${memories.length} 条长期记忆吗？这个操作无法撤销。`
          : `确定永久删除这条记忆吗？\n${confirmAction?.type === 'delete' ? confirmAction.memory.content.slice(0, 90) : ''}`}
        confirmLabel={confirmAction?.type === 'clearAll' ? '清空' : '删除'}
        tone="danger"
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (confirmAction?.type === 'clearAll') void clearAllMemories();
          if (confirmAction?.type === 'delete') void deleteMemory(confirmAction.memory.id);
        }}
      />
    </div>
  );
};

export default MemoryPanel;
