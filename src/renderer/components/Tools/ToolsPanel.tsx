/**
 * ToolsPanel — 工具与调用
 *
 * Tab 1: 工具管理（工具列表 + 技能）
 * Tab 2: 仪表盘（统计 + 图表 + 日志）
 */

import React, { useState, useMemo, useEffect } from 'react';
import { TOOLS } from '../../core/tools/toolRegistry';
import { getToolLogs, type ToolCallLog } from '../../core/history/workspaceStore';
import styles from './ToolsPanel.module.css';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

const CATEGORIES = [
  { id: 'file', label: '文件', icon: '📁', skill: 'file_manager' },
  { id: 'web', label: '网络', icon: '🌐' },
  { id: 'knowledge', label: '知识库', icon: '📚', skill: 'knowledge_manager' },
  { id: 'memory', label: '记忆', icon: '🧠' },
  { id: 'clipboard', label: '剪贴板', icon: '📋' },
  { id: 'system', label: '系统', icon: '🔧', skill: 'system_tools' },
  { id: 'app', label: '应用', icon: '🖥️' },
];

const RISK_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  read: { label: '只读', color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
  low_write: { label: '写入', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
  system: { label: '系统', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  destructive: { label: '危险', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  external_send: { label: '外部', color: '#a855f7', bg: 'rgba(168,85,247,0.1)' },
};

const COLORS = { cyan: '#22d3ee', green: '#22c55e', red: '#ef4444', blue: '#6366f1', amber: '#f59e0b' };
const fmtDuration = (ms: number) => ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
const fmtTime = (ts: number) => new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(ts));
const PAGE_SIZE = 20;

const SvgIcon = ({ d, size = 16, color = 'currentColor' }: { d: string; size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const ICONS = {
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  check: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3',
  clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6v6l4 2',
  xCircle: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM15 9l-6 6M9 9l6 6',
};

const ToolsPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'tools' | 'dashboard'>('tools');
  const [logs, setLogs] = useState<ToolCallLog[]>([]);
  const [logSearch, setLogSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'error'>('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [logPage, setLogPage] = useState(1);

  useEffect(() => {
    const refresh = () => setLogs(getToolLogs());
    refresh();
    const t = window.setInterval(refresh, 3000);
    return () => window.clearInterval(t);
  }, []);

  const failedCount = logs.filter((l) => l.status === 'error').length;
  const successRate = logs.length ? Math.round(((logs.length - failedCount) / logs.length) * 100) : 100;
  const avgDuration = logs.length ? Math.round(logs.reduce((s, l) => s + l.durationMs, 0) / logs.length) : 0;

  const ranking = useMemo(() => {
    const map = new Map<string, { count: number; totalMs: number; errors: number }>();
    for (const l of logs) {
      const e = map.get(l.name) || { count: 0, totalMs: 0, errors: 0 };
      e.count++; e.totalMs += l.durationMs; if (l.status === 'error') e.errors++;
      map.set(l.name, e);
    }
    return Array.from(map.entries())
      .map(([name, d]) => ({
        name: name.length > 14 ? name.slice(0, 12) + '…' : name,
        成功: d.count - d.errors,
        失败: d.errors,
      }))
      .sort((a, b) => (b.成功 + b.失败) - (a.成功 + a.失败)).slice(0, 10);
  }, [logs]);

  const filteredLogs = useMemo(() => {
    let result = [...logs].sort((a, b) => b.createdAt - a.createdAt);
    if (statusFilter !== 'all') result = result.filter((l) => l.status === statusFilter);
    if (logSearch.trim()) {
      const q = logSearch.toLowerCase();
      result = result.filter((l) => l.name.toLowerCase().includes(q));
    }
    return result;
  }, [logs, logSearch, statusFilter]);

  const totalLogPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const safeLogPage = Math.min(logPage, totalLogPages);
  const pageLogs = filteredLogs.slice((safeLogPage - 1) * PAGE_SIZE, safeLogPage * PAGE_SIZE);
  useEffect(() => { setLogPage(1); }, [statusFilter, logSearch]);

  const logPageNumbers = useMemo(() => {
    const pages: number[] = [];
    const start = Math.max(1, safeLogPage - 2);
    const end = Math.min(totalLogPages, start + 4);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }, [safeLogPage, totalLogPages]);

  const totalTools = Object.keys(TOOLS).length;
  const categorizedTools = useMemo(() => {
    const map = new Map<string, Array<{ name: string; desc: string; risk: string; readOnly: boolean; count: number; errors: number }>>();
    // 统计每个工具的调用次数和错误数
    const toolStats = new Map<string, { count: number; errors: number }>();
    for (const l of logs) {
      const s = toolStats.get(l.name) || { count: 0, errors: 0 };
      s.count++; if (l.status === 'error') s.errors++;
      toolStats.set(l.name, s);
    }
    for (const cat of CATEGORIES) {
      const tools = Object.entries(TOOLS)
        .filter(([, t]) => (t.category || 'other') === cat.id)
        .map(([name, t]) => {
          const s = toolStats.get(name) || { count: 0, errors: 0 };
          return { name, desc: t.schema.function.description, risk: t.riskLevel, readOnly: t.isReadOnly, count: s.count, errors: s.errors };
        });
      if (tools.length > 0) map.set(cat.id, tools);
    }
    return map;
  }, [logs]);

  const statCards = [
    { label: '总调用', value: String(logs.length), icon: ICONS.activity, iconColor: COLORS.cyan },
    { label: '成功率', value: `${successRate}%`, icon: ICONS.check, iconColor: successRate >= 90 ? COLORS.green : COLORS.red, valueColor: successRate >= 90 ? COLORS.green : COLORS.red },
    { label: '平均耗时', value: fmtDuration(avgDuration), icon: ICONS.clock, iconColor: COLORS.amber },
    { label: '失败', value: String(failedCount), icon: ICONS.xCircle, iconColor: failedCount > 0 ? COLORS.red : COLORS.green, valueColor: failedCount > 0 ? COLORS.red : COLORS.green },
  ];

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <h1>工具与调用</h1>
        <p>{totalTools} 个工具 · {logs.length} 次调用 · 成功率 {successRate}%</p>
      </header>

      {/* Tab 切换 */}
      <div className={styles.tabBar}>
        <button className={`${styles.tab} ${activeTab === 'tools' ? styles.tabActive : ''}`} onClick={() => setActiveTab('tools')}>
          🧩 工具管理
        </button>
        <button className={`${styles.tab} ${activeTab === 'dashboard' ? styles.tabActive : ''}`} onClick={() => setActiveTab('dashboard')}>
          📊 仪表盘
        </button>
      </div>

      {/* Tab 1: 工具管理 */}
      {activeTab === 'tools' && (
        <div className={styles.capsSection}>
          {CATEGORIES.filter((cat) => categorizedTools.has(cat.id)).map((cat) => {
            const tools = categorizedTools.get(cat.id) || [];
            const isOpen = expandedCat === cat.id;
            const catErrors = tools.reduce((s, t) => s + t.errors, 0);
            return (
              <div key={cat.id} className={styles.catGroup}>
                <button className={styles.catHeader} onClick={() => setExpandedCat(isOpen ? null : cat.id)}>
                  <span>{cat.icon} {cat.label}</span>
                  <span className={styles.catCount}>{tools.length} 个工具{catErrors > 0 ? ` · ${catErrors} 个失败` : ''}</span>
                  <span className={styles.catArrow}>{isOpen ? '▾' : '▸'}</span>
                </button>
                {isOpen && (
                  <div className={styles.catTools}>
                    {tools.map((tool) => {
                      const risk = RISK_CONFIG[tool.risk] || RISK_CONFIG.read;
                      return (
                        <div key={tool.name} className={styles.capToolRow}>
                          <span className={styles.capToolName}>{tool.name}</span>
                          <span className={styles.capRiskTag} style={{ color: risk.color, background: risk.bg }}>{risk.label}</span>
                          {tool.readOnly && <span className={styles.capRoTag}>RO</span>}
                          {tool.count > 0 && (
                            <span className={styles.capToolStats}>
                              <span style={{ color: COLORS.green }}>{tool.count - tool.errors}</span>
                              {tool.errors > 0 && <span style={{ color: COLORS.red }}> / {tool.errors}</span>}
                            </span>
                          )}
                          <span className={styles.capToolDesc}>{tool.desc}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tab 2: 仪表盘 */}
      {activeTab === 'dashboard' && (
        <div className={styles.statsSection}>
          <div className={styles.statsRow}>
            {statCards.map((s) => (
              <div key={s.label} className={styles.statCard}>
                <div className={styles.statIconWrap} style={{ background: `${s.iconColor}12` }}>
                  <SvgIcon d={s.icon} size={16} color={s.iconColor} />
                </div>
                <div className={styles.statBody}>
                  <div className={styles.statLabel}>{s.label}</div>
                  <div className={styles.statValue} style={{ color: s.valueColor }}>{s.value}</div>
                </div>
              </div>
            ))}
          </div>

          {logs.length === 0 ? (
            <div className={styles.empty}>暂无调用记录。开始对话后会自动记录。</div>
          ) : (
            <>
              <div className={styles.chartCard}>
                <div className={styles.chartTitle}>工具调用详情 <span style={{ fontSize: 11, color: '#64748b', fontWeight: 400, marginLeft: 8 }}>🟢 成功 🔴 失败</span></div>
                <ResponsiveContainer width="100%" height={Math.max(200, ranking.length * 32 + 20)}>
                  <BarChart data={ranking} layout="vertical" margin={{ left: 10, right: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12, fill: '#94a3b8', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(148,163,184,0.15)', borderRadius: 8, fontSize: 12, backdropFilter: 'blur(8px)' }}
                      formatter={(value: any, name: any) => [`${value} 次`, name]}
                    />
                    <Bar dataKey="成功" stackId="a" fill="#22c55e" />
                    <Bar dataKey="失败" stackId="a" fill="#ef4444" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className={styles.logSection}>
                <div className={styles.logHeader}>
                  <span className={styles.logTitle}>请求日志</span>
                  <div className={styles.logFilters}>
                    <input value={logSearch} onChange={(e) => setLogSearch(e.target.value)} placeholder="搜索工具名…" className={styles.logSearchInput} />
                    {(['all', 'success', 'error'] as const).map((f) => (
                      <button key={f} onClick={() => setStatusFilter(f)} className={`${styles.logFilterBtn} ${statusFilter === f ? styles.logFilterActive : ''}`}>
                        {f === 'all' ? '全部' : f === 'success' ? '成功' : '失败'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={styles.logTableWrap}>
                  <table className={styles.logTable}>
                    <thead>
                      <tr><th>状态</th><th>工具</th><th>耗时</th><th>时间</th><th></th></tr>
                    </thead>
                    <tbody>
                      {pageLogs.map((log) => (
                        <React.Fragment key={log.id}>
                          <tr onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)} className={styles.logRow}>
                            <td><span className={`${styles.logDot} ${log.status === 'success' ? styles.dotGreen : styles.dotRed}`} /></td>
                            <td className={styles.logName}>{log.name}</td>
                            <td className={styles.logDuration}>{fmtDuration(log.durationMs)}</td>
                            <td className={styles.logTime}>{fmtTime(log.createdAt)}</td>
                            <td className={styles.logExpand}>{expandedLogId === log.id ? '▾' : '▸'}</td>
                          </tr>
                          {expandedLogId === log.id && (
                            <tr><td colSpan={5} className={styles.logDetail}>{log.resultPreview || log.argsPreview || '无详情'}</td></tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                  {filteredLogs.length === 0 && <div className={styles.empty}>无匹配记录</div>}
                </div>
                {totalLogPages > 1 && (
                  <div className={styles.pagination}>
                    <button className={styles.pageBtn} disabled={safeLogPage <= 1} onClick={() => setLogPage(safeLogPage - 1)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
                    </button>
                    {logPageNumbers[0] > 1 && <span className={styles.pageEllipsis}>…</span>}
                    {logPageNumbers.map((p) => (
                      <button key={p} className={`${styles.pageBtn} ${p === safeLogPage ? styles.pageBtnActive : ''}`} onClick={() => setLogPage(p)}>{p}</button>
                    ))}
                    {logPageNumbers[logPageNumbers.length - 1] < totalLogPages && <span className={styles.pageEllipsis}>…</span>}
                    <button className={styles.pageBtn} disabled={safeLogPage >= totalLogPages} onClick={() => setLogPage(safeLogPage + 1)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
                    </button>
                    <span className={styles.pageInfo}>{safeLogPage} / {totalLogPages}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
};

export default ToolsPanel;
