import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  AppWindow,
  BarChart3,
  CheckCircle2,
  Clipboard,
  Clock3,
  Database,
  FileText,
  Gauge,
  Globe2,
  HardDrive,
  Layers3,
  MemoryStick,
  Search,
  Shield,
  SlidersHorizontal,
  TerminalSquare,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TOOLS, type ToolCategory, type ToolRiskLevel } from '../../core/tools/toolRegistry';
import { getToolLogs, type ToolCallLog } from '../../core/history/workspaceStore';
import styles from './ToolsPanel.module.css';

type ViewMode = 'catalog' | 'dashboard';
type StatusFilter = 'all' | 'success' | 'error';
type TimeUnit = 'hour' | 'day' | 'all';

const PAGE_SIZE = 18;

const CATEGORY_META: Array<{
  id: ToolCategory | 'all';
  label: string;
  desc: string;
  icon: LucideIcon;
}> = [
  { id: 'all', label: '全部工具', desc: '完整工具目录', icon: Layers3 },
  { id: 'file', label: '文件', desc: '读写、搜索、目录操作', icon: FileText },
  { id: 'web', label: '网络', desc: '搜索和网页抓取', icon: Globe2 },
  { id: 'knowledge', label: '知识库', desc: '检索、导入、写入知识', icon: Database },
  { id: 'memory', label: '记忆', desc: '长期记忆写入与治理', icon: MemoryStick },
  { id: 'clipboard', label: '剪贴板', desc: '读取和写入剪贴板', icon: Clipboard },
  { id: 'system', label: '系统', desc: '命令、通知、系统信息', icon: TerminalSquare },
  { id: 'app', label: '应用', desc: '打开应用或链接', icon: AppWindow },
];

const RISK_META: Record<ToolRiskLevel, { label: string; tone: string; desc: string }> = {
  read: { label: '只读', tone: 'safe', desc: '不会写入本地状态' },
  low_write: { label: '写入', tone: 'write', desc: '会修改本地状态' },
  system: { label: '系统', tone: 'system', desc: '可能调用系统能力' },
  destructive: { label: '危险', tone: 'danger', desc: '删除或不可逆操作' },
  external_send: { label: '外发', tone: 'external', desc: '可能发送到外部服务' },
};

function fmtDuration(ms: number) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function fmtTime(ts: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts));
}

function getSchemaFields(toolName: string) {
  const params = TOOLS[toolName]?.schema.function.parameters;
  const properties = params?.properties || {};
  const required = new Set((params?.required || []) as string[]);
  return Object.entries(properties).map(([name, value]) => {
    const config = value as { type?: string; description?: string };
    return {
      name,
      type: config.type || 'unknown',
      description: config.description || '',
      required: required.has(name),
    };
  });
}

const ToolsPanel: React.FC = () => {
  const [viewMode] = useState<ViewMode>('catalog');
  const [selectedCat, setSelectedCat] = useState<ToolCategory | 'all'>('all');
  const [toolSearch, setToolSearch] = useState('');
  const [logSearch, setLogSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<ToolRiskLevel | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [timeAmount, setTimeAmount] = useState(24);
  const [timeUnit, setTimeUnit] = useState<TimeUnit>('hour');
  const [logs, setLogs] = useState<ToolCallLog[]>([]);
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [logPage, setLogPage] = useState(1);

  useEffect(() => {
    const refresh = () => setLogs(getToolLogs());
    refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => window.clearInterval(timer);
  }, []);

  const visibleLogs = useMemo(() => {
    const safeAmount = Math.max(1, Number.isFinite(timeAmount) ? timeAmount : 24);
    const windowMs = timeUnit === 'all'
      ? Infinity
      : safeAmount * (timeUnit === 'hour' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000);
    const minTs = windowMs === Infinity ? 0 : Date.now() - windowMs;
    return logs.filter((log) => log.createdAt >= minTs);
  }, [logs, timeAmount, timeUnit]);

  const toolStats = useMemo(() => {
    const map = new Map<string, { count: number; errors: number; totalMs: number; last?: ToolCallLog }>();
    for (const log of visibleLogs) {
      const current = map.get(log.name) || { count: 0, errors: 0, totalMs: 0 };
      current.count += 1;
      current.totalMs += log.durationMs;
      if (log.status === 'error') current.errors += 1;
      if (!current.last || log.createdAt > current.last.createdAt) current.last = log;
      map.set(log.name, current);
    }
    return map;
  }, [visibleLogs]);

  const tools = useMemo(() => {
    return Object.entries(TOOLS).map(([name, tool]) => {
      const stats = toolStats.get(name) || { count: 0, errors: 0, totalMs: 0 };
      const fields = getSchemaFields(name);
      return {
        name,
        desc: tool.schema.function.description,
        category: tool.category,
        risk: tool.riskLevel,
        readOnly: tool.isReadOnly,
        timeoutMs: tool.timeoutMs,
        requiresConfirmation: Boolean(tool.requiresConfirmation),
        fields,
        count: stats.count,
        errors: stats.errors,
        avgMs: stats.count ? Math.round(stats.totalMs / stats.count) : 0,
        last: stats.last,
      };
    });
  }, [toolStats]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<ToolCategory | 'all', { tools: number; calls: number; errors: number }>();
    counts.set('all', { tools: tools.length, calls: visibleLogs.length, errors: visibleLogs.filter((l) => l.status === 'error').length });
    for (const tool of tools) {
      const item = counts.get(tool.category) || { tools: 0, calls: 0, errors: 0 };
      item.tools += 1;
      item.calls += tool.count;
      item.errors += tool.errors;
      counts.set(tool.category, item);
    }
    return counts;
  }, [tools, visibleLogs]);

  const filteredTools = useMemo(() => {
    const query = toolSearch.trim().toLowerCase();
    return tools
      .filter((tool) => selectedCat === 'all' || tool.category === selectedCat)
      .filter((tool) => riskFilter === 'all' || tool.risk === riskFilter)
      .filter((tool) => {
        if (!query) return true;
        return tool.name.toLowerCase().includes(query) || tool.desc.toLowerCase().includes(query);
      })
      .sort((a, b) => {
        if (a.errors !== b.errors) return b.errors - a.errors;
        if (a.count !== b.count) return b.count - a.count;
        return a.name.localeCompare(b.name);
      });
  }, [riskFilter, selectedCat, toolSearch, tools]);

  const failedCount = visibleLogs.filter((log) => log.status === 'error').length;
  const successCount = visibleLogs.length - failedCount;
  const successRate = visibleLogs.length ? Math.round((successCount / visibleLogs.length) * 100) : 100;
  const avgDuration = visibleLogs.length ? Math.round(visibleLogs.reduce((sum, log) => sum + log.durationMs, 0) / visibleLogs.length) : 0;
  const slowCalls = visibleLogs.filter((log) => log.durationMs >= 3000).length;

  const ranking = useMemo(() => {
    const map = new Map<string, { success: number; error: number; totalMs: number }>();
    for (const log of visibleLogs) {
      const item = map.get(log.name) || { success: 0, error: 0, totalMs: 0 };
      if (log.status === 'error') item.error += 1;
      else item.success += 1;
      item.totalMs += log.durationMs;
      map.set(log.name, item);
    }
    return Array.from(map.entries())
      .map(([name, item]) => ({
        name: name.length > 18 ? `${name.slice(0, 16)}...` : name,
        fullName: name,
        成功: item.success,
        失败: item.error,
        平均耗时: fmtDuration(Math.round(item.totalMs / Math.max(1, item.success + item.error))),
      }))
      .sort((a, b) => b.成功 + b.失败 - (a.成功 + a.失败))
      .slice(0, 10);
  }, [visibleLogs]);

  const latencyBuckets = useMemo(() => {
    const buckets = [
      { range: '<100ms', min: 0, max: 100, count: 0 },
      { range: '100-500ms', min: 100, max: 500, count: 0 },
      { range: '0.5-1s', min: 500, max: 1000, count: 0 },
      { range: '1-3s', min: 1000, max: 3000, count: 0 },
      { range: '3-10s', min: 3000, max: 10000, count: 0 },
      { range: '>10s', min: 10000, max: Infinity, count: 0 },
    ];
    for (const log of visibleLogs) {
      const bucket = buckets.find((item) => log.durationMs >= item.min && log.durationMs < item.max);
      if (bucket) bucket.count += 1;
    }
    return buckets.map(({ range, count }) => ({ range, 次数: count }));
  }, [visibleLogs]);

  const filteredLogs = useMemo(() => {
    let result = [...visibleLogs].sort((a, b) => b.createdAt - a.createdAt);
    if (statusFilter !== 'all') result = result.filter((log) => log.status === statusFilter);
    const query = logSearch.trim().toLowerCase();
    if (query) {
      result = result.filter((log) =>
        log.name.toLowerCase().includes(query) ||
        log.argsPreview?.toLowerCase().includes(query) ||
        log.resultPreview?.toLowerCase().includes(query)
      );
    }
    return result;
  }, [logSearch, statusFilter, visibleLogs]);

  const totalLogPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const safeLogPage = Math.min(logPage, totalLogPages);
  const pageLogs = filteredLogs.slice((safeLogPage - 1) * PAGE_SIZE, safeLogPage * PAGE_SIZE);

  useEffect(() => {
    setLogPage(1);
  }, [logSearch, statusFilter, timeAmount, timeUnit]);

  const activeCategory = CATEGORY_META.find((cat) => cat.id === selectedCat) || CATEGORY_META[0];
  const ActiveIcon = viewMode === 'catalog' ? activeCategory.icon : BarChart3;

  return (
    <section className={styles.panel}>
      <aside className={styles.sidebar}>
        <div className={styles.sideSection}>
            <div className={styles.sideLabel}>分类</div>
            <div className={styles.categoryList}>
              {CATEGORY_META.filter((cat) => cat.id === 'all' || categoryCounts.has(cat.id)).map((cat) => {
                const Icon = cat.icon;
                const count = categoryCounts.get(cat.id);
                return (
                  <button
                    key={cat.id}
                    className={`${styles.categoryItem} ${selectedCat === cat.id ? styles.categoryItemActive : ''}`}
                    onClick={() => setSelectedCat(cat.id)}
                    type="button"
                  >
                    <Icon size={16} />
                    <span className={styles.categoryText}>
                      <span>{cat.label}</span>
                      <small>{count?.tools || 0} 个工具</small>
                    </span>
                    {Boolean(count?.errors) && <span className={styles.errorPill}>{count?.errors}</span>}
                  </button>
                );
              })}
            </div>
          </div>
      </aside>

      <main className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.titleBlock}>
            <span className={styles.titleIcon}>
              <ActiveIcon size={18} />
            </span>
            <div>
              <h2>{viewMode === 'catalog' ? activeCategory.label : '工具仪表盘'}</h2>
              <p>{viewMode === 'catalog' ? activeCategory.desc : '观察调用量、失败、耗时和最近执行记录'}</p>
            </div>
          </div>
          {viewMode === 'catalog' && (
            <div className={styles.searchBox}>
              <Search size={15} />
              <input
                value={toolSearch}
                onChange={(event) => setToolSearch(event.target.value)}
                placeholder="搜索工具名称或说明"
              />
            </div>
          )}
          {viewMode === 'dashboard' && (
            <div className={styles.topbarControls}>
              <div className={styles.rangeControl}>
                <span>时间范围</span>
                <input
                  className={styles.numberInput}
                  type="number"
                  min={1}
                  max={999}
                  value={timeAmount}
                  disabled={timeUnit === 'all'}
                  onChange={(event) => setTimeAmount(Number(event.target.value) || 1)}
                />
                {(['hour', 'day', 'all'] as const).map((unit) => (
                  <button
                    key={unit}
                    className={`${styles.miniButton} ${timeUnit === unit ? styles.miniButtonActive : ''}`}
                    onClick={() => setTimeUnit(unit)}
                    type="button"
                  >
                    {unit === 'hour' ? '小时' : unit === 'day' ? '天' : '全部'}
                  </button>
                ))}
              </div>
              <span className={styles.rangeSummary}>{visibleLogs.length} / {logs.length} 条</span>
            </div>
          )}
        </header>

        {viewMode === 'catalog' ? (
          <div className={styles.catalog}>
            <div className={styles.catalogToolbar}>
              <div className={styles.resultSummary}>
                <SlidersHorizontal size={15} />
                <span>{filteredTools.length} 个匹配工具</span>
              </div>
              <div className={styles.riskFilters}>
                {(['all', 'read', 'low_write', 'system', 'destructive', 'external_send'] as const).map((risk) => (
                  <button
                    key={risk}
                    className={`${styles.riskFilter} ${riskFilter === risk ? styles.riskFilterActive : ''}`}
                    onClick={() => setRiskFilter(risk)}
                    type="button"
                  >
                    {risk === 'all' ? '全部风险' : RISK_META[risk].label}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.toolList}>
              {filteredTools.map((tool) => {
                const risk = RISK_META[tool.risk];
                const isExpanded = expandedTool === tool.name;
                const status = tool.last?.status;
                return (
                  <article key={tool.name} className={`${styles.toolCard} ${tool.errors > 0 ? styles.toolCardWarn : ''}`}>
                    <button
                      className={styles.toolCardMain}
                      onClick={() => setExpandedTool(isExpanded ? null : tool.name)}
                      type="button"
                    >
                      <div className={styles.toolIdentity}>
                        <span className={`${styles.statusMark} ${status === 'error' ? styles.statusError : status === 'success' ? styles.statusSuccess : ''}`}>
                          {status === 'error' ? <XCircle size={15} /> : status === 'success' ? <CheckCircle2 size={15} /> : <Shield size={15} />}
                        </span>
                        <div>
                          <div className={styles.toolName}>{tool.name}</div>
                          <div className={styles.toolDesc}>{tool.desc}</div>
                        </div>
                      </div>
                      <div className={styles.toolMeta}>
                        <span className={`${styles.riskBadge} ${styles[`risk_${risk.tone}`]}`}>{risk.label}</span>
                        <span className={styles.metricChip}>{tool.count} 次</span>
                        {tool.errors > 0 && <span className={styles.metricChipDanger}>{tool.errors} 失败</span>}
                        {tool.count > 0 && <span className={styles.metricChip}>{fmtDuration(tool.avgMs)}</span>}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className={styles.toolDetails}>
                        <div className={styles.detailGrid}>
                          <div>
                            <span className={styles.detailLabel}>安全边界</span>
                            <p>{risk.desc}{tool.requiresConfirmation ? '，触发高风险条件时需要确认。' : '。'}</p>
                          </div>
                          <div>
                            <span className={styles.detailLabel}>执行策略</span>
                            <p>{tool.readOnly ? '只读工具' : '可写工具'}，超时 {fmtDuration(tool.timeoutMs)}。</p>
                          </div>
                          <div>
                            <span className={styles.detailLabel}>最近调用</span>
                            <p>{tool.last ? `${fmtTime(tool.last.createdAt)} · ${tool.last.status === 'success' ? '成功' : '失败'} · ${fmtDuration(tool.last.durationMs)}` : '暂无记录'}</p>
                          </div>
                        </div>
                        <div className={styles.schemaBlock}>
                          <span className={styles.detailLabel}>参数</span>
                          {tool.fields.length > 0 ? (
                            <div className={styles.schemaList}>
                              {tool.fields.map((field) => (
                                <div key={field.name} className={styles.schemaItem}>
                                  <code>{field.name}</code>
                                  <span>{field.type}</span>
                                  {field.required && <b>必填</b>}
                                  <small>{field.description || '无说明'}</small>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className={styles.noSchema}>无参数</p>
                          )}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
              {filteredTools.length === 0 && (
                <div className={styles.emptyState}>
                  <Search size={28} />
                  <span>没有匹配的工具</span>
                  <p>调整搜索词、分类或风险筛选后再查看。</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className={styles.dashboard}>
            <section className={styles.statGrid}>
              {[
                { label: '调用总数', value: visibleLogs.length, icon: Activity, tone: 'blue' },
                { label: '成功率', value: `${successRate}%`, icon: CheckCircle2, tone: successRate >= 90 ? 'green' : 'red' },
                { label: '平均耗时', value: fmtDuration(avgDuration), icon: Gauge, tone: 'purple' },
                { label: '慢调用', value: slowCalls, icon: Clock3, tone: slowCalls > 0 ? 'yellow' : 'green' },
              ].map((stat) => {
                const Icon = stat.icon;
                return (
                  <div key={stat.label} className={styles.statCard}>
                    <span className={`${styles.statIcon} ${styles[`tone_${stat.tone}`]}`}>
                      <Icon size={17} />
                    </span>
                    <span className={styles.statLabel}>{stat.label}</span>
                    <strong>{stat.value}</strong>
                  </div>
                );
              })}
            </section>

            {visibleLogs.length === 0 ? (
              <div className={styles.emptyState}>
                <HardDrive size={30} />
                <span>暂无调用记录</span>
                <p>开始对话并触发工具后，这里会显示执行质量和日志。</p>
              </div>
            ) : (
              <>
                <section className={styles.chartGrid}>
                  <div className={styles.chartPanel}>
                    <div className={styles.panelHeader}>
                      <h3>调用排名</h3>
                      <span>成功 / 失败</span>
                    </div>
                    <ResponsiveContainer width="100%" height={Math.max(220, ranking.length * 34 + 24)}>
                      <BarChart data={ranking} layout="vertical" margin={{ left: 8, right: 24 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11, fill: '#8e99b0' }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" width={132} tick={{ fontSize: 11, fill: '#8e99b0', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 12 }}
                          formatter={(value, name) => [`${value ?? 0} 次`, String(name)]}
                        />
                        <Bar dataKey="成功" stackId="a" fill="#34d399" />
                        <Bar dataKey="失败" stackId="a" fill="#ef4444" radius={[0, 5, 5, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className={styles.chartPanel}>
                    <div className={styles.panelHeader}>
                      <h3>执行健康度</h3>
                      <span>{failedCount} 次失败</span>
                    </div>
                    <div className={styles.healthBody}>
                      <ResponsiveContainer width="45%" height={170}>
                        <PieChart>
                          <Pie
                            data={[
                              { name: '成功', value: successCount },
                              { name: '失败', value: failedCount },
                            ].filter((item) => item.value > 0)}
                            innerRadius={48}
                            outerRadius={70}
                            dataKey="value"
                            stroke="none"
                          >
                            <Cell fill="#34d399" />
                            <Cell fill="#ef4444" />
                          </Pie>
                          <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 12 }} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className={styles.healthLegend}>
                        <span><i className={styles.legendGreen} />成功 {successCount}</span>
                        <span><i className={styles.legendRed} />失败 {failedCount}</span>
                        <span><AlertTriangle size={14} />慢调用 {slowCalls}</span>
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={150}>
                      <BarChart data={latencyBuckets} margin={{ left: -16, right: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" vertical={false} />
                        <XAxis dataKey="range" tick={{ fontSize: 10, fill: '#8e99b0' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#8e99b0' }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 12 }} />
                        <Bar dataKey="次数" fill="#6366f1" radius={[5, 5, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>

                <section className={styles.logPanel}>
                  <div className={styles.panelHeader}>
                    <h3>调用日志</h3>
                    <div className={styles.logControls}>
                      <div className={styles.logSearchBox}>
                        <Search size={14} />
                        <input
                          value={logSearch}
                          onChange={(event) => setLogSearch(event.target.value)}
                          placeholder="搜索工具名、参数或结果"
                        />
                      </div>
                      <div className={styles.statusFilters}>
                        {(['all', 'success', 'error'] as const).map((status) => (
                          <button
                            key={status}
                            className={`${styles.statusButton} ${statusFilter === status ? styles.statusButtonActive : ''}`}
                            onClick={() => setStatusFilter(status)}
                            type="button"
                          >
                            {status === 'all' ? '全部' : status === 'success' ? '成功' : '失败'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className={styles.logTable}>
                    <div className={styles.logHead}>
                      <span>状态</span>
                      <span>工具</span>
                      <span>耗时</span>
                      <span>时间</span>
                    </div>
                    {pageLogs.map((log) => {
                      const isExpanded = expandedLogId === log.id;
                      return (
                        <button
                          key={log.id}
                          className={`${styles.logRow} ${isExpanded ? styles.logRowActive : ''}`}
                          onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                          type="button"
                        >
                          <span className={`${styles.logStatus} ${log.status === 'success' ? styles.logStatusOk : styles.logStatusErr}`}>
                            {log.status === 'success' ? '成功' : '失败'}
                          </span>
                          <span className={styles.logName}>{log.name}</span>
                          <span className={styles.logDuration}>{fmtDuration(log.durationMs)}</span>
                          <span className={styles.logTime}>{fmtTime(log.createdAt)}</span>
                          {isExpanded && (
                            <span className={styles.logDetail}>
                              {log.resultPreview || log.argsPreview || '无详情'}
                            </span>
                          )}
                        </button>
                      );
                    })}
                    {filteredLogs.length === 0 && <div className={styles.logEmpty}>没有匹配的调用记录</div>}
                  </div>
                  {totalLogPages > 1 && (
                    <div className={styles.paging}>
                      <button type="button" onClick={() => setLogPage(Math.max(1, safeLogPage - 1))} disabled={safeLogPage === 1}>上一页</button>
                      <span>{safeLogPage} / {totalLogPages}</span>
                      <button type="button" onClick={() => setLogPage(Math.min(totalLogPages, safeLogPage + 1))} disabled={safeLogPage === totalLogPages}>下一页</button>
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        )}
      </main>
    </section>
  );
};

export default ToolsPanel;
