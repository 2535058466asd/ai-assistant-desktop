/**
 * CostDetailPanel — 费用与用量
 *
 * 大数字 Token 消耗 + 指标行 + 使用趋势 + 请求日志（分页）
 */

import React, { useState, useMemo, useEffect } from 'react';
import { getUsageRecords, type UsageRecord } from '../../core/cost/costTracker';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import styles from './CostDetailPanel.module.css';

const COLORS = { cyan: '#22d3ee', blue: '#6366f1', green: '#22c55e', red: '#ef4444', purple: '#a78bfa' };
const fmtTokens = (n: number) => n >= 10000000 ? `${(n / 10000000).toFixed(2)} 亿` : n >= 10000 ? `${(n / 10000).toFixed(1)} 万` : String(n);
const fmtTime = (ts: number) => new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(ts));
const PAGE_SIZE = 20;

const MODEL_DISPLAY_NAMES: Record<string, string> = {
  'doubao-seed-2-0-pro-260215': '豆包 2.0 Pro',
  'doubao-seed-2-0-lite-260215': '豆包 2.0 Lite',
  'doubao-seed-2-0-mini-260215': '豆包 2.0 Mini',
  'doubao-1-5-pro-32k-250125': '豆包 1.5 Pro 32K',
  'doubao-1-5-lite-32k-250115': '豆包 1.5 Lite 32K',
  'doubao-seed-2-0-pro': '豆包 2.0 Pro',
  'doubao-1-5-pro-32k': '豆包 1.5 Pro 32K',
  'doubao-1-5-lite-32k': '豆包 1.5 Lite 32K',
  'mimo-v2.5': 'MiMo 2.5',
  'mimo-v2.5-pro': 'MiMo 2.5 Pro',
  'gpt-4': 'GPT-4',
  'gpt-4-turbo': 'GPT-4 Turbo',
  'gpt-3.5-turbo': 'GPT-3.5 Turbo',
};
const getDisplayName = (modelId: string) => MODEL_DISPLAY_NAMES[modelId] || modelId;

/* ── SVG 图标 ── */
const SvgIcon = ({ d, size = 16, color = 'currentColor', className }: { d: string; size?: number; color?: string; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d={d} />
  </svg>
);
const PATHS = {
  zap: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  down: 'M12 5v14M5 12l7 7 7-7',
  up: 'M12 19V5M5 12l7-7 7 7',
  dollar: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  layers: 'M12 2l10 6.5v7L12 22 2 15.5v-7L12 2zM2 9l10 6.5L22 9',
};

const CostDetailPanel: React.FC = () => {
  const [timeRange, setTimeRange] = useState<'today' | '7d' | '30d' | 'all'>('all');
  const [modelFilter, setModelFilter] = useState('all');
  const [allRecords, setAllRecords] = useState<UsageRecord[]>(() => getUsageRecords());
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = window.setInterval(() => setAllRecords(getUsageRecords()), 5000);
    return () => window.clearInterval(t);
  }, []);

  const filteredRecords = useMemo(() => {
    const since = timeRange === 'today' ? (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })()
      : timeRange === '7d' ? Date.now() - 7 * 86400000
      : timeRange === '30d' ? Date.now() - 30 * 86400000
      : 0;
    return allRecords.filter((r) => {
      if (since && r.timestamp < since) return false;
      if (modelFilter !== 'all' && r.model !== modelFilter) return false;
      return true;
    });
  }, [allRecords, timeRange, modelFilter]);

  const stats = useMemo(() => {
    let totalTokens = 0, totalCost = 0, totalInput = 0, totalOutput = 0;
    for (const r of filteredRecords) {
      totalTokens += r.totalTokens;
      totalCost += r.cost;
      totalInput += r.promptTokens;
      totalOutput += r.completionTokens;
    }
    return { total: filteredRecords.length, totalTokens, totalCost: Math.round(totalCost * 100) / 100, totalInput, totalOutput };
  }, [filteredRecords]);

  const models = useMemo(() => Array.from(new Set(allRecords.map((r) => r.model))), [allRecords]);

  const trendData = useMemo(() => {
    const map = new Map<string, { date: string; tokens: number; cost: number; count: number }>();
    for (const r of filteredRecords) {
      const d = new Date(r.timestamp);
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      if (!map.has(key)) map.set(key, { date: key, tokens: 0, cost: 0, count: 0 });
      const e = map.get(key)!;
      e.tokens += r.totalTokens;
      e.cost += r.cost;
      e.count++;
    }
    return Array.from(map.values());
  }, [filteredRecords]);

  // 分页
  const sortedRecords = useMemo(() => [...filteredRecords].reverse(), [filteredRecords]);
  const totalPages = Math.max(1, Math.ceil(sortedRecords.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRecords = sortedRecords.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [timeRange, modelFilter]);

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const start = Math.max(1, safePage - 2);
    const end = Math.min(totalPages, start + 4);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }, [safePage, totalPages]);

  return (
    <section className={styles.page}>
      {/* 大数字 */}
      <div className={styles.heroCard}>
        <div className={styles.heroLeft}>
          <div className={styles.heroLabel}>
            <SvgIcon d={PATHS.zap} size={14} color={COLORS.cyan} className={styles.labelIcon} />
            总 Token 消耗
          </div>
          <div className={styles.heroNumber}>{fmtTokens(stats.totalTokens)}</div>
        </div>
        <div className={styles.heroRight}>
          <div className={styles.heroStat}>
            <span>请求数</span>
            <strong>{stats.total}</strong>
          </div>
          <div className={styles.heroStat}>
            <span>总成本</span>
            <strong>${stats.totalCost.toFixed(2)}</strong>
          </div>
        </div>
      </div>

      {/* 指标行 */}
      <div className={styles.metricsRow}>
        <div className={styles.metricBox}>
          <div className={styles.metricIcon}><SvgIcon d={PATHS.down} size={15} color={COLORS.cyan} /></div>
          <div className={styles.metricInfo}>
            <div className={styles.metricLabel}>新增输入</div>
            <div className={styles.metricValue}>{fmtTokens(stats.totalInput)}</div>
          </div>
        </div>
        <div className={styles.metricBox}>
          <div className={styles.metricIcon}><SvgIcon d={PATHS.up} size={15} color={COLORS.purple} /></div>
          <div className={styles.metricInfo}>
            <div className={styles.metricLabel}>生成输出</div>
            <div className={styles.metricValue}>{fmtTokens(stats.totalOutput)}</div>
          </div>
        </div>
        <div className={styles.metricBox}>
          <div className={styles.metricIcon}><SvgIcon d={PATHS.dollar} size={15} color={COLORS.green} /></div>
          <div className={styles.metricInfo}>
            <div className={styles.metricLabel}>总费用</div>
            <div className={styles.metricValue}>${stats.totalCost.toFixed(4)}</div>
          </div>
        </div>
        <div className={styles.metricBox}>
          <div className={styles.metricIcon}><SvgIcon d={PATHS.layers} size={15} color={COLORS.blue} /></div>
          <div className={styles.metricInfo}>
            <div className={styles.metricLabel}>模型种类</div>
            <div className={styles.metricValue}>{models.length}</div>
          </div>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className={styles.filterBar}>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>模型</span>
          <select value={modelFilter} onChange={(e) => setModelFilter(e.target.value)} className={styles.filterSelect}>
            <option value="all">全部模型</option>
            {models.map((m) => <option key={m} value={m}>{getDisplayName(m)}</option>)}
          </select>
        </div>
        <div className={styles.filterGroup}>
          {(['today', '7d', '30d', 'all'] as const).map((r) => (
            <button key={r} onClick={() => setTimeRange(r)} className={`${styles.filterBtn} ${timeRange === r ? styles.filterBtnActive : ''}`}>
              {r === 'today' ? '当天' : r === '7d' ? '7天' : r === '30d' ? '30天' : '全部'}
            </button>
          ))}
        </div>
      </div>

      {/* 使用趋势 */}
      {trendData.length > 0 && (
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <div className={styles.chartTitle}>使用趋势</div>
            <span className={styles.chartSubtitle}>{trendData.length} 天</span>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={trendData} margin={{ top: 4, left: -10, right: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="tokenGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.cyan} stopOpacity={0.25} />
                  <stop offset="50%" stopColor={COLORS.cyan} stopOpacity={0.08} />
                  <stop offset="95%" stopColor={COLORS.cyan} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} dy={4} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtTokens(Number(v))} dx={-4} />
              <Tooltip
                contentStyle={{ background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(148,163,184,0.15)', borderRadius: 8, fontSize: 12, backdropFilter: 'blur(8px)' }}
                labelStyle={{ color: '#94a3b8', fontSize: 11, marginBottom: 4 }}
                itemStyle={{ padding: 0 }}
                formatter={(v, name) => [name === 'tokens' ? fmtTokens(Number(v)) : name === 'cost' ? `$${Number(v).toFixed(4)}` : String(v), name === 'tokens' ? 'Token' : name === 'cost' ? '费用' : String(name)]}
              />
              <Area type="monotone" dataKey="tokens" stroke={COLORS.cyan} strokeWidth={2} fill="url(#tokenGrad)" dot={false} activeDot={{ r: 4, fill: COLORS.cyan, stroke: '#0f172a', strokeWidth: 2 }} name="tokens" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 请求日志表格 */}
      <div className={styles.chartCard}>
        <div className={styles.chartHeader}>
          <div className={styles.chartTitle}>请求日志</div>
          <span className={styles.chartSubtitle}>{filteredRecords.length} 条记录</span>
        </div>
        {sortedRecords.length === 0 ? (
          <div className={styles.empty}>暂无请求记录</div>
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>模型</th>
                    <th style={{ textAlign: 'right' }}>输入</th>
                    <th style={{ textAlign: 'right' }}>输出</th>
                    <th style={{ textAlign: 'right' }}>总 Token</th>
                    <th style={{ textAlign: 'right' }}>费用</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRecords.map((r) => (
                    <tr key={r.id} className={styles.tableRow}>
                      <td className={styles.cellTime}>{fmtTime(r.timestamp)}</td>
                      <td className={styles.cellModel}>{getDisplayName(r.model)}</td>
                      <td className={styles.cellNum}>{r.promptTokens.toLocaleString()}</td>
                      <td className={styles.cellNum}>{r.completionTokens.toLocaleString()}</td>
                      <td className={styles.cellNum} style={{ fontWeight: 500 }}>{r.totalTokens.toLocaleString()}</td>
                      <td className={styles.cellCost}>${r.cost.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className={styles.pagination}>
                <button className={styles.pageBtn} disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
                </button>
                {pageNumbers[0] > 1 && <span className={styles.pageEllipsis}>…</span>}
                {pageNumbers.map((p) => (
                  <button key={p} className={`${styles.pageBtn} ${p === safePage ? styles.pageBtnActive : ''}`} onClick={() => setPage(p)}>{p}</button>
                ))}
                {pageNumbers[pageNumbers.length - 1] < totalPages && <span className={styles.pageEllipsis}>…</span>}
                <button className={styles.pageBtn} disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
                </button>
                <span className={styles.pageInfo}>{safePage} / {totalPages}</span>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
};

export default CostDetailPanel;
