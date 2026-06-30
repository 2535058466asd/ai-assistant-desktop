import React, { useEffect, useState, useCallback } from 'react';
import { getUsageStats, getUsageRecords, type UsageRecord } from '../../core/cost/costTracker';

const formatCost = (cost: number) => `$${cost.toFixed(4)}`;
const formatTokens = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

const formatTime = (ts: number) =>
  new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(ts));

const CostPanel: React.FC = () => {
  const [totalStats, setTotalStats] = useState(() => getUsageStats());
  const [todayStats, setTodayStats] = useState(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return getUsageStats({ since: todayStart.getTime() });
  });
  const [recentRecords, setRecentRecords] = useState<UsageRecord[]>([]);

  const refresh = useCallback(() => {
    setTotalStats(getUsageStats());
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    setTodayStats(getUsageStats({ since: todayStart.getTime() }));
    setRecentRecords(getUsageRecords().slice(-20).reverse());
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const models = Object.entries(totalStats.byModel).sort((a, b) => b[1].cost - a[1].cost);
  const maxCost = Math.max(...models.map(([, v]) => v.cost), 0.001);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 概览卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {[
          { label: '累计花费', value: formatCost(totalStats.totalCost), sub: `${totalStats.totalRecords} 次调用` },
          { label: '今日花费', value: formatCost(todayStats.totalCost), sub: `${todayStats.totalRecords} 次调用` },
          { label: '累计 Token', value: formatTokens(totalStats.totalTokens), sub: '所有模型' },
          { label: '今日 Token', value: formatTokens(todayStats.totalTokens), sub: `${Object.keys(todayStats.byModel).length} 个模型` },
        ].map((card) => (
          <div key={card.label} style={{
            background: 'var(--card-bg)',
            border: '1px solid rgba(148,163,184,0.14)',
            borderRadius: 8,
            padding: '14px 16px',
          }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>{card.label}</div>
            <div style={{ color: 'var(--text-primary)', fontSize: 26, fontWeight: 300, letterSpacing: '-0.02em', marginTop: 4 }}>{card.value}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* 各模型占比 */}
      <div style={{
        background: 'var(--card-bg)',
        border: '1px solid rgba(148,163,184,0.14)',
        borderRadius: 8,
        padding: 16,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>各模型消耗</div>
        {models.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>暂无调用记录</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {models.map(([model, stats]) => (
              <div key={model}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{model}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {stats.count} 次 · {formatTokens(stats.tokens)} tokens · {formatCost(stats.cost)}
                  </span>
                </div>
                <div style={{
                  height: 6,
                  borderRadius: 3,
                  background: 'var(--bg-tertiary)',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${(stats.cost / maxCost) * 100}%`,
                    background: 'linear-gradient(90deg, var(--accent-cyan), var(--accent-blue))',
                    borderRadius: 3,
                    transition: 'width 0.3s ease',
                  }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 最近调用记录 */}
      <div style={{
        background: 'var(--card-bg)',
        border: '1px solid rgba(148,163,184,0.14)',
        borderRadius: 8,
        padding: 16,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>最近调用</div>
        {recentRecords.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>暂无记录</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {recentRecords.map((r) => (
              <div key={r.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 6,
                fontSize: 12,
                background: 'var(--card-nested-bg)',
              }}>
                <span style={{ color: 'var(--accent-cyan)', fontWeight: 600, minWidth: 140, fontSize: 11 }}>{r.model}</span>
                <span style={{ color: 'var(--text-secondary)', flex: 1 }}>
                  输入 {r.promptTokens} / 输出 {r.completionTokens}
                </span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 500, minWidth: 60, textAlign: 'right' }}>{formatCost(r.cost)}</span>
                <span style={{ color: 'var(--text-muted)', minWidth: 90, textAlign: 'right' }}>{formatTime(r.timestamp)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CostPanel;
