import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Clock3,
  Coins,
  DollarSign,
  Gauge,
  RefreshCw,
  Search,
  Zap,
} from 'lucide-react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getUsageRecords, type UsageRecord } from '../../core/cost/costTracker';
import styles from './CostDetailPanel.module.css';

type TimeRange = 'today' | '7d' | '30d' | 'all';
type Granularity = 'day' | 'hour';

const PAGE_SIZE = 20;

const MODEL_DISPLAY_NAMES: Record<string, string> = {
  'doubao-seed-2-0-pro-260215': '豆包 2.0 Pro',
  'doubao-seed-2-0-lite-260215': '豆包 2.0 Lite',
  'doubao-seed-2-0-mini-260215': '豆包 2.0 Mini',
  'doubao-1-5-pro-32k-250125': '豆包 1.5 Pro 32K',
  'doubao-1-5-lite-32k-250115': '豆包 1.5 Lite 32K',
  'doubao-seed-2-0-pro': '豆包 2.0 Pro',
  'doubao-seed-2-0-lite': '豆包 2.0 Lite',
  'doubao-seed-2-0-mini': '豆包 2.0 Mini',
  'doubao-1-5-pro-32k': '豆包 1.5 Pro 32K',
  'doubao-1-5-lite-32k': '豆包 1.5 Lite 32K',
  'mimo-v2.5': 'MiMo 2.5',
  'mimo-v2.5-pro': 'MiMo 2.5 Pro',
  'gpt-4': 'GPT-4',
  'gpt-4-turbo': 'GPT-4 Turbo',
  'gpt-3.5-turbo': 'GPT-3.5 Turbo',
};

const getDisplayName = (modelId: string) => MODEL_DISPLAY_NAMES[modelId] || modelId;

function fmtTokens(n: number) {
  if (n >= 10000000) return `${(n / 10000000).toFixed(2)} 亿`;
  if (n >= 10000) return `${(n / 10000).toFixed(1)} 万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function fmtCost(n: number, digits = 4) {
  return `$${n.toFixed(digits)}`;
}

function fmtTime(ts: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts));
}

function getSince(range: TimeRange) {
  if (range === 'today') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (range === '7d') return Date.now() - 7 * 86400000;
  if (range === '30d') return Date.now() - 30 * 86400000;
  return 0;
}

function getTrendKey(timestamp: number, granularity: Granularity) {
  const date = new Date(timestamp);
  if (granularity === 'hour') {
    return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:00`;
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

const CostDetailPanel: React.FC = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [modelFilter, setModelFilter] = useState('all');
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [refreshInterval, setRefreshInterval] = useState<number>(5000);
  const [records, setRecords] = useState<UsageRecord[]>(() => getUsageRecords());
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageJump, setPageJump] = useState('');

  useEffect(() => {
    if (refreshInterval === 0) return;
    const timer = window.setInterval(() => setRecords(getUsageRecords()), refreshInterval);
    return () => window.clearInterval(timer);
  }, [refreshInterval]);

  const models = useMemo(() => Array.from(new Set(records.map((record) => record.model))).sort(), [records]);

  const filteredRecords = useMemo(() => {
    const since = getSince(timeRange);
    const lowerQuery = query.trim().toLowerCase();
    return records.filter((record) => {
      if (since && record.timestamp < since) return false;
      if (modelFilter !== 'all' && record.model !== modelFilter) return false;
      if (lowerQuery && !record.model.toLowerCase().includes(lowerQuery) && !getDisplayName(record.model).toLowerCase().includes(lowerQuery)) return false;
      return true;
    });
  }, [modelFilter, query, records, timeRange]);

  const stats = useMemo(() => {
    let totalTokens = 0;
    let totalCost = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let latest: UsageRecord | null = null;

    for (const record of filteredRecords) {
      totalTokens += record.totalTokens;
      totalCost += record.cost;
      inputTokens += record.promptTokens;
      outputTokens += record.completionTokens;
      if (!latest || record.timestamp > latest.timestamp) latest = record;
    }

    return {
      totalRequests: filteredRecords.length,
      totalTokens,
      totalCost,
      inputTokens,
      outputTokens,
      avgCost: filteredRecords.length ? totalCost / filteredRecords.length : 0,
      avgTokens: filteredRecords.length ? Math.round(totalTokens / filteredRecords.length) : 0,
      latest,
    };
  }, [filteredRecords]);

  const trendData = useMemo(() => {
    const map = new Map<string, { date: string; input: number; output: number; tokens: number; cost: number; count: number }>();
    for (const record of filteredRecords) {
      const key = getTrendKey(record.timestamp, granularity);
      const item = map.get(key) || { date: key, input: 0, output: 0, tokens: 0, cost: 0, count: 0 };
      item.input += record.promptTokens;
      item.output += record.completionTokens;
      item.tokens += record.totalTokens;
      item.cost += record.cost;
      item.count += 1;
      map.set(key, item);
    }
    return Array.from(map.values());
  }, [filteredRecords, granularity]);

  const sortedRecords = useMemo(() => [...filteredRecords].sort((a, b) => b.timestamp - a.timestamp), [filteredRecords]);
  const totalPages = Math.max(1, Math.ceil(sortedRecords.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRecords = sortedRecords.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
    setPageJump('');
  }, [modelFilter, query, timeRange]);

  const jumpToPage = () => {
    const next = Number(pageJump);
    if (!Number.isFinite(next)) return;
    setPage(Math.min(totalPages, Math.max(1, Math.trunc(next))));
  };

  return (
    <section className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.titleBlock}>
          <span className={styles.titleIcon}><Coins size={19} /></span>
          <div>
            <h2>费用 Token</h2>
            <p>同图查看输入、输出、总 Token、费用和模型调用日志</p>
          </div>
        </div>
      </header>

      <div className={styles.filterBar}>
        <div className={styles.filterGroup}>
          {([
            ['today', '今天'],
            ['7d', '7 天'],
            ['30d', '30 天'],
            ['all', '全部'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              className={`${styles.filterButton} ${timeRange === value ? styles.filterButtonActive : ''}`}
              onClick={() => setTimeRange(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <div className={styles.filterGroup}>
          <select value={modelFilter} onChange={(event) => setModelFilter(event.target.value)} className={styles.select}>
            <option value="all">全部模型</option>
            {models.map((model) => <option key={model} value={model}>{getDisplayName(model)}</option>)}
          </select>
          <button className={styles.refreshButton} onClick={() => setRecords(getUsageRecords())} type="button">
            <RefreshCw size={14} />
            刷新
          </button>
          <select value={refreshInterval} onChange={(event) => setRefreshInterval(Number(event.target.value))} className={styles.select}>
            <option value={5000}>5 秒自动</option>
            <option value={30000}>30 秒自动</option>
            <option value={60000}>1 分钟自动</option>
            <option value={0}>关闭自动</option>
          </select>
        </div>
      </div>

      <section className={styles.usageOverview}>
        <div className={styles.overviewTopline}>
          <div className={styles.primaryMetric}>
            <span className={`${styles.statIcon} ${styles.tone_blue}`}><Zap size={18} /></span>
            <div>
              <span className={styles.statLabel}>真实消耗 Tokens</span>
              <strong>{stats.totalTokens.toLocaleString()} <small>约 {fmtTokens(stats.totalTokens)}</small></strong>
            </div>
          </div>
          <div className={styles.compactTotals}>
            <div>
              <span>总请求数</span>
              <strong><Activity size={15} /> {stats.totalRequests}</strong>
            </div>
            <div>
              <span>总成本</span>
              <strong><DollarSign size={15} /> {fmtCost(stats.totalCost, stats.totalCost >= 1 ? 2 : 4)}</strong>
            </div>
          </div>
        </div>
        <div className={styles.overviewCards}>
          {[
            { label: '新增输入', value: fmtTokens(stats.inputTokens), icon: Activity, tone: 'blue' },
            { label: 'Output', value: fmtTokens(stats.outputTokens), icon: Gauge, tone: 'purple' },
            { label: '缓存创建', value: 'N/A', icon: Coins, tone: 'yellow' },
            { label: '单次均价', value: fmtCost(stats.avgCost), icon: DollarSign, tone: 'green' },
            { label: '最近请求', value: stats.latest ? getDisplayName(stats.latest.model) : '无记录', icon: Clock3, tone: 'yellow' },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className={styles.overviewCard}>
                <span><Icon size={16} /> {item.label}</span>
                <strong>{item.value}</strong>
              </div>
            );
          })}
        </div>
      </section>

      {filteredRecords.length === 0 ? (
        <div className={styles.emptyState}>
          <BarChart3 size={30} />
          <span>暂无费用记录</span>
          <p>开始与模型对话并返回 usage 后，这里会显示 Token、费用趋势和模型调用日志。</p>
        </div>
      ) : (
        <>
          <div className={styles.chartCard}>
            <div className={styles.chartHeader}>
              <div>
                <div className={styles.chartTitle}>使用趋势</div>
                <span className={styles.chartSubtitle}>{trendData.length} 个时间点 · 左轴 Token / 右轴费用</span>
              </div>
              <div className={styles.panelControls}>
                {(['day', 'hour'] as const).map((value) => (
                  <button
                    key={value}
                    className={`${styles.miniButton} ${granularity === value ? styles.miniButtonActive : ''}`}
                    onClick={() => setGranularity(value)}
                    type="button"
                  >
                    {value === 'day' ? '天' : '小时'}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={trendData} margin={{ top: 8, left: -4, right: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="tokenTotalGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#8e99b0' }} axisLine={false} tickLine={false} dy={6} />
                <YAxis
                  yAxisId="tokens"
                  tick={{ fontSize: 10, fill: '#8e99b0' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => fmtTokens(Number(value))}
                />
                <YAxis
                  yAxisId="cost"
                  orientation="right"
                  tick={{ fontSize: 10, fill: '#8e99b0' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => fmtCost(Number(value), 3)}
                />
                <Tooltip
                  contentStyle={{ background: 'rgba(15, 23, 42, 0.96)', border: '1px solid rgba(148,163,184,0.18)', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#94a3b8', fontSize: 11, marginBottom: 4 }}
                  formatter={(value, name) => {
                    if (name === '费用') return [fmtCost(Number(value)), name];
                    return [fmtTokens(Number(value)), name];
                  }}
                />
                <Legend verticalAlign="bottom" height={28} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Area yAxisId="tokens" type="monotone" dataKey="tokens" name="总 Token" stroke="#a78bfa" strokeWidth={2} fill="url(#tokenTotalGradient)" dot={false} activeDot={{ r: 4 }} />
                <Line yAxisId="tokens" type="monotone" dataKey="input" name="输入" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                <Line yAxisId="tokens" type="monotone" dataKey="output" name="输出" stroke="#22c55e" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                <Line yAxisId="cost" type="monotone" dataKey="cost" name="费用" stroke="#ef4444" strokeDasharray="5 5" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <section className={styles.logPanel}>
            <div className={styles.panelHeader}>
              <div>
                <h3>模型调用日志</h3>
                <span>{filteredRecords.length} 条模型请求 · 按时间倒序</span>
              </div>
              <div className={styles.logControls}>
                <div className={styles.searchBox}>
                  <Search size={15} />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索模型" />
                </div>
                {stats.latest && (
                  <div className={styles.latestChip}>
                    <Clock3 size={14} />
                    最近 {fmtTime(stats.latest.timestamp)}
                  </div>
                )}
              </div>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.detailTable}>
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>模型</th>
                    <th>输入</th>
                    <th>输出</th>
                    <th>总量</th>
                    <th>费用</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRecords.map((record) => (
                    <tr key={record.id}>
                      <td>{fmtTime(record.timestamp)}</td>
                      <td>{getDisplayName(record.model)}</td>
                      <td>{record.promptTokens.toLocaleString()}</td>
                      <td>{record.completionTokens.toLocaleString()}</td>
                      <td>{record.totalTokens.toLocaleString()}</td>
                      <td>{fmtCost(record.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={styles.paging}>
              <span>共 {filteredRecords.length} 条</span>
              <span>每页 {PAGE_SIZE} 条</span>
              <button type="button" onClick={() => setPage(Math.max(1, safePage - 1))} disabled={safePage === 1}>上一页</button>
              <span>{safePage} / {totalPages}</span>
              <button type="button" onClick={() => setPage(Math.min(totalPages, safePage + 1))} disabled={safePage === totalPages}>下一页</button>
              <label className={styles.jumpBox}>
                <input value={pageJump} onChange={(event) => setPageJump(event.target.value.replace(/\D/g, ''))} onKeyDown={(event) => { if (event.key === 'Enter') jumpToPage(); }} />
              </label>
              <button type="button" onClick={jumpToPage}>跳转</button>
            </div>
          </section>
        </>
      )}
    </section>
  );
};

export default CostDetailPanel;
