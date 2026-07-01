/**
 * ToolsPanel — 全新工具管理界面
 *
 * 设计理念：左侧分类导航 + 右侧内容
 * 不设 Header，Tab 导航直接显示
 */

import React, { useState, useMemo, useEffect } from 'react';
import { TOOLS } from '../../core/tools/toolRegistry';
import { getToolLogs, type ToolCallLog } from '../../core/history/workspaceStore';
import styles from './ToolsPanel.module.css';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

const CATEGORIES = [
  { id: 'file', label: '文件', icon: '📁' },
  { id: 'web', label: '网络', icon: '🌐' },
  { id: 'knowledge', label: '知识库', icon: '📚' },
  { id: 'memory', label: '记忆', icon: '🧠' },
  { id: 'clipboard', label: '剪贴板', icon: '📋' },
  { id: 'system', label: '系统', icon: '🔧' },
  { id: 'app', label: '应用', icon: '🖥️' },
];

const RISK_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  read: { label: '只读', color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
  low_write: { label: '写入', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
  system: { label: '系统', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  destructive: { label: '危险', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  external_send: { label: '外部', color: '#a855f7', bg: 'rgba(168,85,247,0.1)' },
};

const fmtDuration = (ms: number) => ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
const fmtTime = (ts: number) => new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(ts));
const PAGE_SIZE = 20;

const ToolsPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'tools' | 'dashboard'>('tools');
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [logs, setLogs] = useState<ToolCallLog[]>([]);
  const [logSearch, setLogSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'error'>('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [logPage, setLogPage] = useState(1);

  useEffect(() => {
    const refresh = () => setLogs(getToolLogs());
    refresh();
    const t = window.setInterval(refresh, 3000);
    return () => window.clearInterval(t);
  }, []);

  const failedCount = logs.filter(l => l.status === 'error').length;
  const successRate = logs.length ? Math.round(((logs.length - failedCount) / logs.length) * 100) : 100;
  const avgDuration = logs.length ? Math.round(logs.reduce((s, l) => s + l.durationMs, 0) / logs.length) : 0;

  // 工具按分类统计
  const categorizedTools = useMemo(() => {
    const toolStats = new Map<string, { count: number; errors: number }>();
    for (const l of logs) {
      const s = toolStats.get(l.name) || { count: 0, errors: 0 };
      s.count++; if (l.status === 'error') s.errors++;
      toolStats.set(l.name, s);
    }

    const map = new Map<string, Array<{ name: string; desc: string; risk: string; readOnly: boolean; count: number; errors: number }>>();
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

  // 堆叠柱状图数据
  const ranking = useMemo(() => {
    const map = new Map<string, { count: number; errors: number }>();
    for (const l of logs) {
      const e = map.get(l.name) || { count: 0, errors: 0 };
      e.count++; if (l.status === 'error') e.errors++;
      map.set(l.name, e);
    }
    return Array.from(map.entries())
      .map(([name, d]) => ({
        name: name.length > 14 ? name.slice(0, 12) + '…' : name,
        成功: d.count - d.errors,
        失败: d.errors,
      }))
      .sort((a, b) => (b.成功 + b.失败) - (a.成功 + a.失败))
      .slice(0, 10);
  }, [logs]);

  // 过滤日志
  const filteredLogs = useMemo(() => {
    let result = [...logs].sort((a, b) => b.createdAt - a.createdAt);
    if (statusFilter !== 'all') result = result.filter(l => l.status === statusFilter);
    if (logSearch.trim()) {
      const q = logSearch.toLowerCase();
      result = result.filter(l => l.name.toLowerCase().includes(q));
    }
    return result;
  }, [logs, logSearch, statusFilter]);

  const totalLogPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const safeLogPage = Math.min(logPage, totalLogPages);
  const pageLogs = filteredLogs.slice((safeLogPage - 1) * PAGE_SIZE, safeLogPage * PAGE_SIZE);
  useEffect(() => { setLogPage(1); }, [statusFilter, logSearch]);

  // 概览数据
  const statCards = [
    { label: '总调用', value: logs.length, color: 'var(--accent-blue)' },
    { label: '成功率', value: `${successRate}%`, color: successRate >= 90 ? 'var(--accent-green)' : '#ef4444' },
    { label: '平均耗时', value: fmtDuration(avgDuration), color: 'var(--accent-purple)' },
    { label: '失败', value: failedCount, color: failedCount > 0 ? '#ef4444' : 'var(--accent-green)' },
  ];

  return (
    <section className={styles.panel}>
      <div className={styles.layout}>
        {/* ── Left Sidebar ── */}
        <nav className={styles.sidebar}>
          {/* 概览数据 */}
          <div className={styles.stats}>
            {statCards.map(s => (
              <div key={s.label} className={styles.statItem}>
                <span className={styles.statLabel}>{s.label}</span>
                <span className={styles.statValue} style={{ color: s.color }}>{s.value}</span>
              </div>
            ))}
          </div>

          {/* Tab 切换 */}
          <div className={styles.tabs}>
            <button className={`${styles.tab} ${activeTab === 'tools' ? styles.tabActive : ''}`} onClick={() => setActiveTab('tools')}>
              🧩 工具管理
            </button>
            <button className={`${styles.tab} ${activeTab === 'dashboard' ? styles.tabActive : ''}`} onClick={() => setActiveTab('dashboard')}>
              📊 仪表盘
            </button>
          </div>

          {/* 工具分类列表 */}
          {activeTab === 'tools' && (
            <div className={styles.catList}>
              {CATEGORIES.filter(cat => categorizedTools.has(cat.id)).map(cat => {
                const tools = categorizedTools.get(cat.id) || [];
                const catErrors = tools.reduce((s, t) => s + t.errors, 0);
                return (
                  <button
                    key={cat.id}
                    className={`${styles.catItem} ${selectedCat === cat.id ? styles.catItemActive : ''}`}
                    onClick={() => setSelectedCat(selectedCat === cat.id ? null : cat.id)}
                  >
                    <span className={styles.catIcon}>{cat.icon}</span>
                    <span className={styles.catName}>{cat.label}</span>
                    <span className={styles.catCount}>
                      {tools.length}
                      {catErrors > 0 && <span className={styles.catErr}> · {catErrors} 错误</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </nav>

        {/* ── Right Content ── */}
        <main className={styles.main}>
          {activeTab === 'tools' ? (
            <div className={styles.toolsContent}>
              {selectedCat ? (
                <>
                  <div className={styles.catHeader}>
                    <h3 className={styles.catTitle}>
                      {CATEGORIES.find(c => c.id === selectedCat)?.icon} {CATEGORIES.find(c => c.id === selectedCat)?.label}工具
                    </h3>
                    <span className={styles.catInfo}>{categorizedTools.get(selectedCat)?.length || 0} 个工具</span>
                  </div>
                  <div className={styles.toolGrid}>
                    {(categorizedTools.get(selectedCat) || []).map(tool => {
                      const risk = RISK_CONFIG[tool.risk] || RISK_CONFIG.read;
                      return (
                        <div key={tool.name} className={styles.toolCard}>
                          <div className={styles.toolHead}>
                            <span className={styles.toolName}>{tool.name}</span>
                            <span className={styles.toolRisk} style={{ color: risk.color, background: risk.bg }}>{risk.label}</span>
                            {tool.readOnly && <span className={styles.toolRo}>RO</span>}
                          </div>
                          <div className={styles.toolDesc}>{tool.desc}</div>
                          {tool.count > 0 && (
                            <div className={styles.toolStats}>
                              <span className={styles.toolStatOk}>{tool.count - tool.errors} 成功</span>
                              {tool.errors > 0 && <span className={styles.toolStatErr}>{tool.errors} 失败</span>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className={styles.placeholder}>
                  <p>选择左侧分类查看工具</p>
                </div>
              )}
            </div>
          ) : (
            <div className={styles.dashboardContent}>
              {logs.length === 0 ? (
                <div className={styles.placeholder}>
                  <p>暂无调用记录</p>
                </div>
              ) : (
                <>
                  {/* 堆叠柱状图 */}
                  <div className={styles.chartCard}>
                    <div className={styles.chartTitle}>工具调用详情</div>
                    <ResponsiveContainer width="100%" height={Math.max(200, ranking.length * 32 + 20)}>
                      <BarChart data={ranking} layout="vertical" margin={{ left: 10, right: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12, fill: '#94a3b8', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(148,163,184,0.15)', borderRadius: 8, fontSize: 12 }} />
                        <Bar dataKey="成功" stackId="a" fill="#22c55e" />
                        <Bar dataKey="失败" stackId="a" fill="#ef4444" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* 调用日志 */}
                  <div className={styles.logSection}>
                    <div className={styles.logHeader}>
                      <span className={styles.logTitle}>调用日志</span>
                      <div className={styles.logFilters}>
                        <input value={logSearch} onChange={e => setLogSearch(e.target.value)} placeholder="搜索工具名…" className={styles.logSearch} />
                        {(['all', 'success', 'error'] as const).map(f => (
                          <button key={f} className={`${styles.logFilter} ${statusFilter === f ? styles.logFilterActive : ''}`} onClick={() => setStatusFilter(f)}>
                            {f === 'all' ? '全部' : f === 'success' ? '成功' : '失败'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className={styles.logTable}>
                      {pageLogs.map(log => (
                        <div key={log.id} className={styles.logRow} onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}>
                          <div className={styles.logRowMain}>
                            <span className={`${styles.logDot} ${log.status === 'success' ? styles.logDotOk : styles.logDotErr}`} />
                            <span className={styles.logName}>{log.name}</span>
                            <span className={styles.logDuration}>{fmtDuration(log.durationMs)}</span>
                            <span className={styles.logTime}>{fmtTime(log.createdAt)}</span>
                          </div>
                          {expandedLogId === log.id && (
                            <div className={styles.logDetail}>{log.resultPreview || log.argsPreview || '无详情'}</div>
                          )}
                        </div>
                      ))}
                      {filteredLogs.length === 0 && <div className={styles.logEmpty}>无匹配记录</div>}
                    </div>
                    {totalLogPages > 1 && (
                      <div className={styles.paging}>
                        {Array.from({ length: totalLogPages }, (_, i) => i + 1).map(p => (
                          <button key={p} className={`${styles.pageNum} ${p === safeLogPage ? styles.pageNumActive : ''}`} onClick={() => setLogPage(p)}>{p}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </main>
      </div>
    </section>
  );
};

export default ToolsPanel;
