import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { getBufferedLogs, clearBufferedLogs, type BufferedLogEntry } from '../../../shared/logger';

const MODULE_COLORS: Record<string, string> = {
  agent: '#8b5cf6', mainAgent: '#7c3aed', model: '#10b981', modelProvider: '#059669',
  tool: '#f59e0b', rag: '#06b6d4', memory: '#ec4899', memoryAgent: '#db2777',
  memoryStore: '#be185d', asr: '#eab308', tts: '#f97316', ipc: '#64748b',
  ui: '#3b82f6', voice: '#a855f7', history: '#38bdf8',
};

const LEVEL_BADGE: Record<string, { bg: string; text: string }> = {
  debug: { bg: 'rgba(148,163,184,0.12)', text: '#94a3b8' },
  info: { bg: 'rgba(59,130,246,0.12)', text: '#3b82f6' },
  warn: { bg: 'rgba(245,158,11,0.15)', text: '#f59e0b' },
  error: { bg: 'rgba(239,68,68,0.15)', text: '#ef4444' },
};

const ALL_MODULES = ['全部', 'agent', 'mainAgent', 'model', 'modelProvider', 'tool', 'rag', 'memory', 'ipc', 'ui'];
const ALL_LEVELS = ['全部', 'debug', 'info', 'warn', 'error'];

const formatTime = (ts: number) =>
  new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(ts));

const truncate = (s: string, len: number) => s.length > len ? s.slice(0, len) + '…' : s;

const LogViewer: React.FC = () => {
  const [logs, setLogs] = useState<BufferedLogEntry[]>([]);
  const [search, setSearch] = useState('');
  const [filterModule, setFilterModule] = useState('全部');
  const [filterLevel, setFilterLevel] = useState('全部');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLogs(getBufferedLogs());
  }, []);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener('nova-log-buffer-updated', handler);
    const timer = window.setInterval(refresh, 2000);
    return () => {
      window.removeEventListener('nova-log-buffer-updated', handler);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const filtered = useMemo(() => {
    return logs.filter((log) => {
      if (filterModule !== '全部' && log.module !== filterModule) return false;
      if (filterLevel !== '全部' && log.level !== filterLevel) return false;
      if (search) {
        const q = search.toLowerCase();
        return log.message.toLowerCase().includes(q) || log.label.toLowerCase().includes(q);
      }
      return true;
    });
  }, [logs, search, filterModule, filterLevel]);

  const handleClear = () => {
    clearBufferedLogs();
    setLogs([]);
  };

  const stats = useMemo(() => ({
    total: logs.length,
    errors: logs.filter((l) => l.level === 'error').length,
    warns: logs.filter((l) => l.level === 'warn').length,
  }), [logs]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 统计概览 */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {[
          { label: '全部', value: stats.total, color: 'var(--text-primary)' },
          { label: '错误', value: stats.errors, color: '#ef4444' },
          { label: '警告', value: stats.warns, color: '#f59e0b' },
        ].map((s) => (
          <div key={s.label} style={{
            background: 'var(--card-bg)',
            border: '1px solid rgba(148,163,184,0.14)',
            borderRadius: 8,
            padding: '10px 16px',
            flex: 1,
          }}>
            <div style={{ color: s.color, fontSize: 22, fontWeight: 300 }}>{s.value}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* 过滤器 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索日志…"
          style={{
            flex: 1,
            padding: '7px 12px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            borderRadius: 20,
            color: 'var(--text-primary)',
            fontSize: 13,
            outline: 'none',
            fontFamily: 'inherit',
          }}
        />
        <select
          value={filterModule}
          onChange={(e) => setFilterModule(e.target.value)}
          style={{
            padding: '6px 8px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            borderRadius: 6,
            color: 'var(--text-primary)',
            fontSize: 12,
            fontFamily: 'inherit',
          }}
        >
          {ALL_MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select
          value={filterLevel}
          onChange={(e) => setFilterLevel(e.target.value)}
          style={{
            padding: '6px 8px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            borderRadius: 6,
            color: 'var(--text-primary)',
            fontSize: 12,
            fontFamily: 'inherit',
          }}
        >
          {ALL_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <button
          onClick={handleClear}
          style={{
            padding: '6px 12px',
            background: 'transparent',
            border: '1px solid var(--border-color)',
            borderRadius: 6,
            color: 'var(--text-muted)',
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          清空
        </button>
      </div>

      {/* 日志列表 */}
      <div style={{
        background: 'var(--card-bg)',
        border: '1px solid rgba(148,163,184,0.14)',
        borderRadius: 8,
        maxHeight: 420,
        overflowY: 'auto',
      }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            {logs.length === 0 ? '暂无日志' : '无匹配结果'}
          </div>
        ) : (
          filtered.slice(0, 200).map((log) => {
            const isExpanded = expandedId === log.id;
            const badge = LEVEL_BADGE[log.level] || LEVEL_BADGE.info;
            const moduleColor = MODULE_COLORS[log.module] || '#64748b';
            const metaStr = log.meta ? (typeof log.meta === 'string' ? log.meta : JSON.stringify(log.meta, null, 2)) : '';

            return (
              <div
                key={log.id}
                onClick={() => setExpandedId(isExpanded ? null : log.id)}
                style={{
                  padding: '8px 12px',
                  borderBottom: '1px solid rgba(148,163,184,0.08)',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '1px 6px',
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 700,
                    background: badge.bg,
                    color: badge.text,
                    textTransform: 'uppercase',
                    minWidth: 36,
                    textAlign: 'center',
                  }}>
                    {log.level}
                  </span>
                  <span style={{ color: moduleColor, fontWeight: 600, minWidth: 70, fontSize: 11 }}>{log.label}</span>
                  <span style={{ color: 'var(--text-primary)', flex: 1 }}>{truncate(log.message, 80)}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{formatTime(log.createdAt)}</span>
                </div>
                {isExpanded && metaStr && (
                  <pre style={{
                    marginTop: 6,
                    padding: 8,
                    background: 'var(--bg-tertiary)',
                    borderRadius: 6,
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-secondary)',
                    overflowX: 'auto',
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}>
                    {metaStr}
                  </pre>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default LogViewer;
