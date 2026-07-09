/**
 * ToolDetailPanel — 工具调用详情页
 *
 * 这里重点保留能排查问题的数据：概览、工具成功/失败排行、可搜索的调用日志。
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getToolLogs, type ToolCallLog } from '../../core/history/workspaceStore';

const COLORS = {
  cyan: '#22d3ee',
  green: '#22c55e',
  red: '#ef4444',
  slate: '#8ea0bc',
};

const PAGE_SIZE = 20;

const fmtDuration = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`);

const fmtTime = (ts: number) => new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
}).format(new Date(ts));

const Card: React.FC<{ title: string; extra?: React.ReactNode; children: React.ReactNode }> = ({ title, extra, children }) => (
  <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden' }}>
    <div style={{ minHeight: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', borderBottom: '1px solid var(--border-color)', background: 'var(--card-nested-bg)' }}>
      <div style={{ fontSize: 14, fontWeight: 750, color: 'var(--text-primary)' }}>{title}</div>
      {extra}
    </div>
    <div style={{ padding: 14 }}>{children}</div>
  </div>
);

const DetailBlock: React.FC<{ title: string; value?: string }> = ({ title, value }) => (
  <div style={{ display: 'grid', gap: 6 }}>
    <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 750 }}>{title}</span>
    <pre style={{ maxHeight: 150, margin: 0, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.55 }}>
      {value || '无记录'}
    </pre>
  </div>
);

const ToolDetailPanel: React.FC = () => {
  const [logs, setLogs] = useState<ToolCallLog[]>(() => getToolLogs());
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'error'>('all');
  const [page, setPage] = useState(1);
  const [pageJump, setPageJump] = useState('');

  useEffect(() => {
    const timer = window.setInterval(() => setLogs(getToolLogs()), 3000);
    return () => window.clearInterval(timer);
  }, []);

  const failedCount = useMemo(() => logs.filter((log) => log.status === 'error').length, [logs]);
  const avgDuration = useMemo(() => (
    logs.length ? Math.round(logs.reduce((sum, log) => sum + log.durationMs, 0) / logs.length) : 0
  ), [logs]);

  const ranking = useMemo(() => {
    const map = new Map<string, { count: number; totalMs: number; errors: number }>();
    for (const log of logs) {
      const item = map.get(log.name) || { count: 0, totalMs: 0, errors: 0 };
      item.count += 1;
      item.totalMs += log.durationMs;
      if (log.status === 'error') item.errors += 1;
      map.set(log.name, item);
    }

    return Array.from(map.entries())
      .map(([name, item]) => ({
        name: name.length > 18 ? `${name.slice(0, 16)}...` : name,
        fullName: name,
        成功: item.count - item.errors,
        失败: item.errors,
        平均耗时: Math.round(item.totalMs / Math.max(1, item.count)),
      }))
      .sort((a, b) => (b.成功 + b.失败) - (a.成功 + a.失败))
      .slice(0, 12);
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...logs]
      .sort((a, b) => b.createdAt - a.createdAt)
      .filter((log) => {
        if (statusFilter !== 'all' && log.status !== statusFilter) return false;
        if (!q) return true;
        return [
          log.name,
          log.category || '',
          log.riskLevel || '',
          log.argsPreview || '',
          log.resultPreview || '',
        ].some((text) => text.toLowerCase().includes(q));
      });
  }, [logs, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageLogs = filteredLogs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
    setPageJump('');
  }, [search, statusFilter]);

  const jumpToPage = () => {
    const next = Number(pageJump);
    if (!Number.isFinite(next)) return;
    setPage(Math.min(totalPages, Math.max(1, Math.trunc(next))));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
        {[
          { label: '总调用', value: String(logs.length), sub: '本地保留最多 1000 条', color: 'var(--text-primary)' },
          { label: '失败次数', value: String(failedCount), sub: logs.length ? `失败率 ${Math.round((failedCount / logs.length) * 100)}%` : '暂无失败', color: failedCount > 0 ? COLORS.red : COLORS.green },
          { label: '平均耗时', value: fmtDuration(avgDuration), sub: '按当前日志统计', color: COLORS.cyan },
          { label: '工具种类', value: String(new Set(logs.map((log) => log.name)).size), sub: `${ranking.length} 个有排行数据`, color: 'var(--text-primary)' },
        ].map((item) => (
          <div key={item.label} style={{ minHeight: 108, display: 'grid', gap: 7, padding: 14, border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--card-bg)' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 750 }}>{item.label}</span>
            <strong style={{ overflow: 'hidden', color: item.color, fontSize: 28, lineHeight: 1.1, textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.value}</strong>
            <small style={{ overflow: 'hidden', color: 'var(--text-secondary)', fontSize: 12, textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.sub}</small>
          </div>
        ))}
      </div>

      {logs.length === 0 ? (
        <div style={{ minHeight: 280, display: 'grid', placeItems: 'center', padding: 36, border: '1px dashed var(--border-color)', borderRadius: 8, color: 'var(--text-muted)', background: 'var(--card-bg)', textAlign: 'center' }}>
          暂无工具调用记录。开始对话后会自动记录。
        </div>
      ) : (
        <>
          <Card title="工具调用详情" extra={<span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }}>按工具汇总成功 / 失败次数</span>}>
            <ResponsiveContainer width="100%" height={Math.max(240, ranking.length * 34)}>
              <BarChart data={ranking} layout="vertical" margin={{ left: 18, right: 24, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: COLORS.slate }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: COLORS.slate, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 12 }}
                  formatter={(value, name) => [`${value} 次`, String(name)]}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''}
                />
                <Bar dataKey="成功" stackId="calls" fill={COLORS.green} radius={[0, 0, 0, 0]} />
                <Bar dataKey="失败" stackId="calls" fill={COLORS.red} radius={[0, 5, 5, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card
            title="工具调用日志"
            extra={
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6 }}>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜索工具、参数、结果"
                  style={{ width: 210, minHeight: 30, padding: '5px 10px', border: '1px solid var(--border-color)', borderRadius: 7, outline: 0, color: 'var(--text-primary)', background: 'var(--bg-tertiary)', fontSize: 12, fontFamily: 'inherit' }}
                />
                {(['all', 'success', 'error'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setStatusFilter(filter)}
                    type="button"
                    style={{
                      minHeight: 30,
                      padding: '5px 10px',
                      border: '1px solid var(--border-color)',
                      borderRadius: 7,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: 12,
                      fontWeight: 650,
                      background: statusFilter === filter ? 'rgba(34,211,238,0.08)' : 'var(--bg-tertiary)',
                      color: statusFilter === filter ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                      borderColor: statusFilter === filter ? 'rgba(34,211,238,0.36)' : 'var(--border-color)',
                    }}
                  >
                    {filter === 'all' ? '全部' : filter === 'success' ? '成功' : '失败'}
                  </button>
                ))}
              </div>
            }
          >
            <div style={{ display: 'grid', gridTemplateColumns: '78px minmax(170px, 1fr) 94px 88px 148px', gap: 10, padding: '8px 10px', color: 'var(--text-muted)', background: 'var(--bg-tertiary)', borderRadius: 7, fontSize: 11, fontWeight: 750 }}>
              <span>状态</span>
              <span>工具</span>
              <span>分类</span>
              <span style={{ textAlign: 'right' }}>耗时</span>
              <span style={{ textAlign: 'right' }}>时间</span>
            </div>
            <div style={{ marginTop: 6, border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden' }}>
              {pageLogs.length === 0 ? (
                <div style={{ padding: 18, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>无匹配记录</div>
              ) : pageLogs.map((log) => {
                const isExpanded = expandedId === log.id;
                return (
                  <div key={log.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                      style={{ width: '100%', display: 'grid', gridTemplateColumns: '78px minmax(170px, 1fr) 94px 88px 148px', alignItems: 'center', gap: 10, minHeight: 42, padding: '9px 10px', border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: log.status === 'success' ? COLORS.green : COLORS.red, fontSize: 12, fontWeight: 750 }}>
                        <i style={{ width: 7, height: 7, borderRadius: '50%', background: log.status === 'success' ? COLORS.green : COLORS.red }} />
                        {log.status === 'success' ? '成功' : '失败'}
                      </span>
                      <span style={{ minWidth: 0, overflow: 'hidden', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 650, textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.name}</span>
                      <span style={{ overflow: 'hidden', color: 'var(--text-muted)', fontSize: 12, textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.category || log.riskLevel || '-'}</span>
                      <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 12, textAlign: 'right' }}>{fmtDuration(log.durationMs)}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtTime(log.createdAt)}</span>
                    </button>
                    {isExpanded && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '10px 12px 12px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-tertiary)' }}>
                        <DetailBlock title="调用参数" value={log.argsPreview} />
                        <DetailBlock title="返回结果" value={log.resultPreview} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 7, paddingTop: 12, color: 'var(--text-muted)', fontSize: 12, fontWeight: 650 }}>
              <span>共 {filteredLogs.length} 条</span>
              <span>每页 {PAGE_SIZE} 条</span>
              <button type="button" onClick={() => setPage(Math.max(1, safePage - 1))} disabled={safePage === 1} style={{ minHeight: 30, padding: '5px 11px', border: '1px solid var(--border-color)', borderRadius: 7, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: 12, cursor: safePage === 1 ? 'not-allowed' : 'pointer', opacity: safePage === 1 ? 0.45 : 1 }}>上一页</button>
              <span>{safePage} / {totalPages}</span>
              <button type="button" onClick={() => setPage(Math.min(totalPages, safePage + 1))} disabled={safePage === totalPages} style={{ minHeight: 30, padding: '5px 11px', border: '1px solid var(--border-color)', borderRadius: 7, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: 12, cursor: safePage === totalPages ? 'not-allowed' : 'pointer', opacity: safePage === totalPages ? 0.45 : 1 }}>下一页</button>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input value={pageJump} placeholder="页码" onChange={(event) => setPageJump(event.target.value.replace(/\D/g, ''))} onKeyDown={(event) => { if (event.key === 'Enter') jumpToPage(); }} style={{ width: 58, minHeight: 30, padding: '5px 8px', border: '1px solid var(--border-color)', borderRadius: 7, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: 12, textAlign: 'center' }} />
              </label>
              <button type="button" onClick={jumpToPage} style={{ minHeight: 30, padding: '5px 11px', border: '1px solid var(--border-color)', borderRadius: 7, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer' }}>跳转</button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
};

export default ToolDetailPanel;
