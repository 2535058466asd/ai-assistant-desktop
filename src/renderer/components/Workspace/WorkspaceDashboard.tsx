/**
 * WorkspaceDashboard — 运维总览（纯展示，不跳转）
 *
 * 一眼看完系统状态：指标卡片 + 费用概要 + 工具调用 + 记忆 + 知识库
 * 详情请到侧边栏对应的独立页面查看。
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import styles from './WorkspaceDashboard.module.css';
import type { Message } from '../../types';
import { getToolLogs, type ToolCallLog } from '../../core/history/workspaceStore';
import { createLogger } from '../../../shared/logger';
import { TOOLS } from '../../core/tools/toolRegistry';
import { getUsageStats } from '../../core/cost/costTracker';

const logger = createLogger('ui');

interface KnowledgeStats { count: number; collections: string[]; }
interface KnowledgeSource { source: string; category: string; count: number; createdAt?: string; }
interface MemoryItem { id: string; content: string; category: string; updated_at: number; }
interface WorkspaceDashboardProps { messages: Message[]; }

const fmtTime = (ts: number) =>
  new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(ts));

const fmtDuration = (ms: number) => ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;

const WorkspaceDashboard: React.FC<WorkspaceDashboardProps> = ({ messages }) => {
  const api = (window as any).electronAPI;
  const [knowledgeStats, setKnowledgeStats] = useState<KnowledgeStats | null>(null);
  const [knowledgeSources, setKnowledgeSources] = useState<KnowledgeSource[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [toolLogs, setToolLogs] = useState<ToolCallLog[]>([]);

  const refresh = useCallback(() => setToolLogs(getToolLogs()), []);

  useEffect(() => {
    refresh();
    const load = async () => {
      try {
        const [mem, stats, src] = await Promise.all([
          api?.memoryGetAllMemories?.(), api?.knowledgeStats?.(), api?.knowledgeSources?.(),
        ]);
        if (Array.isArray(mem)) setMemories(mem.filter((m: any) => !m.status || m.status === 'active'));
        if (stats?.success) setKnowledgeStats(stats.data);
        if (src?.success && Array.isArray(src.data)) setKnowledgeSources(src.data);
      } catch (e) { logger.error('加载工作台统计失败', e); }
    };
    load();
    const t = window.setInterval(refresh, 3000);
    return () => window.clearInterval(t);
  }, [api, refresh]);

  const recentMemories = useMemo(() => [...memories].sort((a, b) => b.updated_at - a.updated_at).slice(0, 3), [memories]);
  const recentLogs = useMemo(() => [...toolLogs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6), [toolLogs]);
  const failedCount = toolLogs.filter((l) => l.status === 'error').length;
  const costStats = useMemo(() => getUsageStats(), [toolLogs]);
  const todayCost = useMemo(() => {
    const s = new Date(); s.setHours(0, 0, 0, 0);
    return getUsageStats({ since: s.getTime() });
  }, [toolLogs]);
  const avgDuration = useMemo(() =>
    toolLogs.length ? Math.round(toolLogs.reduce((s, l) => s + l.durationMs, 0) / toolLogs.length) : 0
  , [toolLogs]);
  const successRate = useMemo(() =>
    toolLogs.length ? Math.round(((toolLogs.length - failedCount) / toolLogs.length) * 100) : 100
  , [toolLogs, failedCount]);

  return (
    <section className={styles.dashboard}>
      {/* 指标卡片 */}
      <div className={styles.metricsGrid}>
        {[
          { icon: '📚', label: '知识库', value: knowledgeStats?.count ?? 0, sub: `${knowledgeSources.length} 个来源` },
          { icon: '🧠', label: '记忆', value: memories.length, sub: '条生效' },
          { icon: '🔧', label: '工具', value: toolLogs.length, sub: failedCount > 0 ? `${failedCount} 次失败` : '全部成功', accent: failedCount > 0 ? '#ef4444' : undefined },
          { icon: '💰', label: '今日费用', value: `$${todayCost.totalCost.toFixed(2)}`, sub: `${todayCost.totalRecords} 次` },
          { icon: '💬', label: '消息', value: messages.length, sub: '当前对话' },
        ].map((c) => (
          <div key={c.label} className={styles.metricCard}>
            <div className={styles.metricIcon}>{c.icon}</div>
            <div className={styles.metricValue} style={c.accent ? { color: c.accent } : undefined}>{c.value}</div>
            <div className={styles.metricLabel}>{c.label}</div>
            <div className={styles.metricSub}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* 费用与耗时 + 工具调用 */}
      <div className={styles.activityGrid}>
        {/* 费用与耗时 */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>💰 费用与耗时</div>
          </div>
          <div className={styles.panelSummary}>
            <div className={styles.summaryItem}>
              <span>累计费用</span>
              <strong>${costStats.totalCost.toFixed(2)}</strong>
            </div>
            <div className={styles.summaryItem}>
              <span>今日费用</span>
              <strong>${todayCost.totalCost.toFixed(2)}</strong>
            </div>
            <div className={styles.summaryItem}>
              <span>平均耗时</span>
              <strong>{fmtDuration(avgDuration)}</strong>
            </div>
            <div className={styles.summaryItem}>
              <span>成功率</span>
              <strong style={{ color: successRate >= 90 ? '#22c55e' : '#ef4444' }}>{successRate}%</strong>
            </div>
          </div>
        </div>

        {/* 工具调用 */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>🔧 工具调用</div>
            <span className={styles.panelBadge}>{toolLogs.length} 次</span>
          </div>
          <div className={styles.panelSummary}>
            <div className={styles.summaryItem}>
              <span>总调用</span>
              <strong>{toolLogs.length}</strong>
            </div>
            <div className={styles.summaryItem}>
              <span>工具种类</span>
              <strong>{new Set(toolLogs.map((l) => l.name)).size}</strong>
            </div>
            <div className={styles.summaryItem}>
              <span>失败</span>
              <strong style={{ color: failedCount > 0 ? '#ef4444' : '#22c55e' }}>{failedCount}</strong>
            </div>
          </div>
          {recentLogs.length > 0 && (
            <div className={styles.panelPreview}>
              {recentLogs.slice(0, 4).map((log) => (
                <div key={log.id} className={styles.previewItem}>
                  <span className={`${styles.statusDot} ${log.status === 'success' ? styles.dotGreen : styles.dotRed}`} />
                  <span className={styles.previewName}>{log.name}</span>
                  <span className={styles.previewTime}>{fmtDuration(log.durationMs)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 底部：记忆 + 知识库 */}
      <div className={styles.bottomGrid}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>🧠 最近记忆</div>
            <span className={styles.panelBadge}>{memories.length} 条</span>
          </div>
          {recentMemories.length === 0 ? (
            <div className={styles.emptyState}>暂无记忆</div>
          ) : (
            <div className={styles.memoryList}>
              {recentMemories.map((m) => (
                <div key={m.id} className={styles.memoryItem}>
                  <span className={styles.memoryTag}>{m.category}</span>
                  <span className={styles.memoryContent}>{m.content}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>📚 知识库</div>
            <span className={styles.panelBadge}>{knowledgeSources.length} 个来源</span>
          </div>
          <div className={styles.panelSummary}>
            <div className={styles.summaryItem}>
              <span>文档片段</span>
              <strong>{knowledgeStats?.count ?? 0}</strong>
            </div>
            <div className={styles.summaryItem}>
              <span>来源数</span>
              <strong>{knowledgeSources.length}</strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WorkspaceDashboard;
