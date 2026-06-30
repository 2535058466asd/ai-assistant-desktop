/**
 * ToolDetailPanel — 工具调用详情页（recharts 可视化）
 *
 * 展示：
 * 1. 概览指标（总调用、成功率、平均耗时、工具种类）
 * 2. 工具调用排名（横向柱状图）
 * 3. 延迟分布（柱状图）+ 成功/失败饼图
 * 4. 最近调用日志（可搜索过滤）
 */

import React, { useState, useMemo } from 'react';
import { getToolLogs, type ToolCallLog } from '../../core/history/workspaceStore';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';

const COLORS = {
  cyan: '#22d3ee',
  blue: '#6366f1',
  green: '#22c55e',
  red: '#ef4444',
  yellow: '#f59e0b',
};

const fmtDuration = (ms: number) => ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
const fmtTime = (ts: number) => new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(ts));

const Card: React.FC<{ title: string; extra?: React.ReactNode; children: React.ReactNode }> = ({ title, extra, children }) => (
  <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 10, padding: 18 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
      {extra}
    </div>
    {children}
  </div>
);

const ToolDetailPanel: React.FC = () => {
  const [logs, setLogs] = useState<ToolCallLog[]>(() => getToolLogs());
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'error'>('all');

  useMemo(() => {
    const timer = window.setInterval(() => setLogs(getToolLogs()), 3000);
    return () => window.clearInterval(timer);
  }, []);

  const failedCount = logs.filter((l) => l.status === 'error').length;

  // 工具调用排名
  const ranking = useMemo(() => {
    const map = new Map<string, { count: number; totalMs: number; errors: number }>();
    for (const l of logs) {
      const e = map.get(l.name) || { count: 0, totalMs: 0, errors: 0 };
      e.count++; e.totalMs += l.durationMs; if (l.status === 'error') e.errors++;
      map.set(l.name, e);
    }
    return Array.from(map.entries())
      .map(([name, d]) => ({ name: name.length > 14 ? name.slice(0, 12) + '…' : name, fullName: name, 调用次数: d.count, 平均延迟: Math.round(d.totalMs / d.count) }))
      .sort((a, b) => b.调用次数 - a.调用次数)
      .slice(0, 8);
  }, [logs]);

  // 延迟分布
  const latencyBuckets = useMemo(() => {
    const buckets = [
      { range: '<100ms', min: 0, max: 100, count: 0 },
      { range: '100-500', min: 100, max: 500, count: 0 },
      { range: '500ms-1s', min: 500, max: 1000, count: 0 },
      { range: '1-3s', min: 1000, max: 3000, count: 0 },
      { range: '3-10s', min: 3000, max: 10000, count: 0 },
      { range: '>10s', min: 10000, max: Infinity, count: 0 },
    ];
    for (const l of logs) {
      for (const b of buckets) {
        if (l.durationMs >= b.min && l.durationMs < b.max) { b.count++; break; }
      }
    }
    return buckets.map(({ range, count }) => ({ range, 次数: count }));
  }, [logs]);

  // 成功/失败饼图
  const pieData = useMemo(() => {
    const s = logs.filter((l) => l.status === 'success').length;
    const e = logs.filter((l) => l.status === 'error').length;
    return [{ name: '成功', value: s }, { name: '失败', value: e }].filter((d) => d.value > 0);
  }, [logs]);

  // 过滤日志
  const filteredLogs = useMemo(() => {
    let result = [...logs].sort((a, b) => b.createdAt - a.createdAt);
    if (statusFilter !== 'all') result = result.filter((l) => l.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((l) => l.name.toLowerCase().includes(q) || l.resultPreview?.toLowerCase().includes(q));
    }
    return result;
  }, [logs, search, statusFilter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 概览指标 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {[
          { label: '总调用', value: String(logs.length), color: 'var(--text-primary)' },
          { label: '成功率', value: `${logs.length ? Math.round(((logs.length - failedCount) / logs.length) * 100) : 100}%`, color: failedCount === 0 ? COLORS.green : COLORS.red },
          { label: '平均耗时', value: fmtDuration(logs.length ? Math.round(logs.reduce((s, l) => s + l.durationMs, 0) / logs.length) : 0) },
          { label: '工具种类', value: String(new Set(logs.map((l) => l.name)).size), color: COLORS.cyan },
        ].map((s) => (
          <div key={s.label} style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 10, padding: 16 }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>{s.label}</div>
            <div style={{ color: s.color || 'var(--text-primary)', fontSize: 28, fontWeight: 300, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {logs.length === 0 ? (
        <div style={{ background: 'var(--card-bg)', border: '1px dashed var(--border-color)', borderRadius: 10, padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          暂无工具调用记录。开始对话后会自动记录。
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* 工具调用排名 */}
            <Card title="工具调用排名">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={ranking} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11, fill: '#94a3b8', fontFamily: 'var(--font-mono)' }} />
                  <Tooltip
                    contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 6, fontSize: 12 }}
                  />
                  <Bar dataKey="调用次数" fill={COLORS.cyan} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* 成功/失败 + 延迟分布 */}
            <Card title="执行状态">
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, height: 200 }}>
                <ResponsiveContainer width="40%" height={180}>
                  <PieChart>
                    <Pie data={pieData} innerRadius={45} outerRadius={70} dataKey="value" stroke="none">
                      {pieData.map((e) => <Cell key={e.name} fill={e.name === '成功' ? COLORS.green : COLORS.red} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 6, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pieData.map((d) => (
                    <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: d.name === '成功' ? COLORS.green : COLORS.red }} />
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{d.name}: {d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          {/* 延迟分布 */}
          <Card title="延迟分布">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={latencyBuckets} margin={{ left: -10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                <XAxis dataKey="range" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 6, fontSize: 12 }} />
                <Bar dataKey="次数" fill={COLORS.blue} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* 调用日志 */}
          <Card
            title="调用日志"
            extra={
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索…"
                  style={{ padding: '5px 10px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 20, color: 'var(--text-primary)', fontSize: 12, outline: 'none', fontFamily: 'inherit', width: 140 }}
                />
                {(['all', 'success', 'error'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    style={{
                      padding: '4px 10px', border: '1px solid var(--border-color)', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 600,
                      background: statusFilter === f ? 'rgba(34,211,238,0.08)' : 'transparent',
                      color: statusFilter === f ? 'var(--accent-cyan)' : 'var(--text-muted)',
                      borderColor: statusFilter === f ? 'rgba(34,211,238,0.2)' : 'var(--border-color)',
                    }}
                  >
                    {f === 'all' ? '全部' : f === 'success' ? '成功' : '失败'}
                  </button>
                ))}
              </div>
            }
          >
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {filteredLogs.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>无匹配结果</div>
              ) : (
                filteredLogs.slice(0, 50).map((log) => {
                  const isExpanded = expandedId === log.id;
                  return (
                    <div
                      key={log.id}
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                      style={{ padding: '8px 10px', borderBottom: '1px solid rgba(148,163,184,0.06)', cursor: 'pointer', transition: 'background 0.15s ease' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--card-nested-bg)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: log.status === 'success' ? COLORS.green : COLORS.red, flexShrink: 0 }} />
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.name}</span>
                        <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 11, flexShrink: 0 }}>{fmtDuration(log.durationMs)}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>{fmtTime(log.createdAt)}</span>
                      </div>
                      {isExpanded && (
                        <div style={{ marginTop: 6, padding: 8, background: 'var(--bg-tertiary)', borderRadius: 6, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                          {log.resultPreview || log.argsPreview || '无详情'}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
};

export default ToolDetailPanel;
