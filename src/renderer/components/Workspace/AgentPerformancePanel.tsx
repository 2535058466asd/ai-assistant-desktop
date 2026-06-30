/**
 * AgentPerformancePanel — Agent 运行性能可视化（recharts）
 *
 * 展示：
 * 1. 工具调用 Top 排名（横向柱状图）
 * 2. 成功 vs 失败占比（饼图）
 * 3. 工具延迟分布（柱状图）
 * 4. 最近调用时间线（折线图）
 */

import React, { useEffect, useState, useMemo } from 'react';
import { getToolLogs, type ToolCallLog } from '../../core/history/workspaceStore';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  LineChart, Line,
} from 'recharts';

const COLORS = {
  cyan: '#22d3ee',
  blue: '#6366f1',
  green: '#22c55e',
  red: '#ef4444',
  yellow: '#f59e0b',
  muted: '#4a5568',
};

const formatDuration = (ms: number) => ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;

const ChartCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{
    background: 'var(--card-bg)',
    border: '1px solid rgba(148,163,184,0.14)',
    borderRadius: 8,
    padding: 16,
  }}>
    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>{title}</div>
    {children}
  </div>
);

const AgentPerformancePanel: React.FC = () => {
  const [logs, setLogs] = useState<ToolCallLog[]>([]);

  useEffect(() => {
    setLogs(getToolLogs());
    const timer = window.setInterval(() => setLogs(getToolLogs()), 3000);
    return () => window.clearInterval(timer);
  }, []);

  // 工具调用次数排名
  const toolRanking = useMemo(() => {
    const map = new Map<string, { count: number; avgDuration: number; errors: number }>();
    for (const log of logs) {
      const existing = map.get(log.name) || { count: 0, avgDuration: 0, errors: 0 };
      existing.count++;
      existing.avgDuration += log.durationMs;
      if (log.status === 'error') existing.errors++;
      map.set(log.name, existing);
    }
    return Array.from(map.entries())
      .map(([name, data]) => ({
        name: name.length > 14 ? name.slice(0, 12) + '…' : name,
        fullName: name,
        调用次数: data.count,
        平均延迟: Math.round(data.avgDuration / data.count),
        失败数: data.errors,
      }))
      .sort((a, b) => b.调用次数 - a.调用次数)
      .slice(0, 8);
  }, [logs]);

  // 成功/失败饼图数据
  const pieData = useMemo(() => {
    const success = logs.filter((l) => l.status === 'success').length;
    const error = logs.filter((l) => l.status === 'error').length;
    return [
      { name: '成功', value: success },
      { name: '失败', value: error },
    ].filter((d) => d.value > 0);
  }, [logs]);

  // 延迟分布
  const latencyBuckets = useMemo(() => {
    const buckets = [
      { range: '<100ms', count: 0, min: 0, max: 100 },
      { range: '100-500ms', count: 0, min: 100, max: 500 },
      { range: '500ms-1s', count: 0, min: 500, max: 1000 },
      { range: '1-3s', count: 0, min: 1000, max: 3000 },
      { range: '3-10s', count: 0, min: 3000, max: 10000 },
      { range: '>10s', count: 0, min: 10000, max: Infinity },
    ];
    for (const log of logs) {
      for (const b of buckets) {
        if (log.durationMs >= b.min && log.durationMs < b.max) {
          b.count++;
          break;
        }
      }
    }
    return buckets.map(({ range, count }) => ({ range, 次数: count }));
  }, [logs]);

  // 最近 20 次调用的时间线
  const timeline = useMemo(() => {
    return logs.slice(-20).map((log, i) => ({
      index: i + 1,
      延迟: log.durationMs,
      时间: new Date(log.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    }));
  }, [logs]);

  const stats = useMemo(() => ({
    total: logs.length,
    successRate: logs.length ? Math.round((logs.filter((l) => l.status === 'success').length / logs.length) * 100) : 100,
    avgDuration: logs.length ? Math.round(logs.reduce((s, l) => s + l.durationMs, 0) / logs.length) : 0,
    toolTypes: new Set(logs.map((l) => l.name)).size,
  }), [logs]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 概览 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {[
          { label: '总调用', value: String(stats.total), color: 'var(--text-primary)' },
          { label: '成功率', value: `${stats.successRate}%`, color: stats.successRate >= 90 ? COLORS.green : COLORS.red },
          { label: '平均延迟', value: formatDuration(stats.avgDuration), color: 'var(--text-primary)' },
          { label: '工具种类', value: String(stats.toolTypes), color: COLORS.cyan },
        ].map((s) => (
          <div key={s.label} style={{
            background: 'var(--card-bg)',
            border: '1px solid rgba(148,163,184,0.14)',
            borderRadius: 8,
            padding: '14px 16px',
          }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>{s.label}</div>
            <div style={{ color: s.color, fontSize: 26, fontWeight: 300, letterSpacing: '-0.02em', marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {logs.length === 0 ? (
        <div style={{
          background: 'var(--card-bg)',
          border: '1px solid rgba(148,163,184,0.14)',
          borderRadius: 8,
          padding: 40,
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: 13,
        }}>
          暂无工具调用数据。开始对话后，这里会展示实时性能数据。
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* 工具调用排名 */}
            <ChartCard title="工具调用排名">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={toolRanking} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11, fill: '#94a3b8', fontFamily: 'var(--font-mono)' }} />
                  <Tooltip
                    contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 6, fontSize: 12 }}
                    formatter={(value, name) => [String(value), String(name)]}
                  />
                  <Bar dataKey="调用次数" fill={COLORS.cyan} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* 成功/失败饼图 */}
            <ChartCard title="执行状态">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, height: 240 }}>
                <ResponsiveContainer width="50%" height={180}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      innerRadius={50}
                      outerRadius={75}
                      dataKey="value"
                      stroke="none"
                    >
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={entry.name === '成功' ? COLORS.green : COLORS.red} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 6, fontSize: 12 }}
                    />
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
            </ChartCard>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* 延迟分布 */}
            <ChartCard title="延迟分布">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={latencyBuckets} margin={{ left: -10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                  <XAxis dataKey="range" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip
                    contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 6, fontSize: 12 }}
                  />
                  <Bar dataKey="次数" fill={COLORS.blue} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* 延迟时间线 */}
            <ChartCard title="最近调用延迟趋势">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={timeline} margin={{ left: -10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                  <XAxis dataKey="index" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => formatDuration(Number(v))} />
                  <Tooltip
                    contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 6, fontSize: 12 }}
                    formatter={(value) => [formatDuration(Number(value)), '延迟']}
                    labelFormatter={(label) => `#${label}`}
                  />
                  <Line type="monotone" dataKey="延迟" stroke={COLORS.cyan} strokeWidth={2} dot={{ fill: COLORS.cyan, r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
};

export default AgentPerformancePanel;
