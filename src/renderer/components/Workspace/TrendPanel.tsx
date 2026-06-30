import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { getUsageRecords } from '../../core/cost/costTracker';

const formatTokens = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

const TrendPanel: React.FC = () => {
  const [records, setRecords] = useState(() => getUsageRecords());

  const refresh = useCallback(() => {
    setRecords(getUsageRecords());
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 8000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  // 按天聚合
  const dailyData = useMemo(() => {
    const map = new Map<string, { tokens: number; cost: number; count: number }>();
    for (const r of records) {
      const date = new Date(r.timestamp);
      const key = `${date.getMonth() + 1}/${date.getDate()}`;
      if (!map.has(key)) map.set(key, { tokens: 0, cost: 0, count: 0 });
      const d = map.get(key)!;
      d.tokens += r.totalTokens;
      d.cost += r.cost;
      d.count += 1;
    }
    // 取最近 14 天
    return Array.from(map.entries()).slice(-14);
  }, [records]);

  const maxTokens = Math.max(...dailyData.map(([, d]) => d.tokens), 1);

  // 按模型聚合
  const modelData = useMemo(() => {
    const map = new Map<string, { tokens: number; cost: number }>();
    for (const r of records) {
      if (!map.has(r.model)) map.set(r.model, { tokens: 0, cost: 0 });
      const d = map.get(r.model)!;
      d.tokens += r.totalTokens;
      d.cost += r.cost;
    }
    return Array.from(map.entries()).sort((a, b) => b[1].tokens - a[1].tokens);
  }, [records]);

  const maxModelTokens = Math.max(...modelData.map(([, d]) => d.tokens), 1);

  // 按小时聚合（今日）
  const hourlyData = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayRecords = records.filter((r) => r.timestamp >= todayStart.getTime());
    const map = new Map<number, { tokens: number; count: number }>();
    for (const r of todayRecords) {
      const hour = new Date(r.timestamp).getHours();
      if (!map.has(hour)) map.set(hour, { tokens: 0, count: 0 });
      const d = map.get(hour)!;
      d.tokens += r.totalTokens;
      d.count += 1;
    }
    return Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      ...map.get(i) || { tokens: 0, count: 0 },
    }));
  }, [records]);

  const maxHourlyTokens = Math.max(...hourlyData.map((d) => d.tokens), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 每日 Token 消耗柱状图 */}
      <div style={{
        background: 'var(--card-bg)',
        border: '1px solid rgba(148,163,184,0.14)',
        borderRadius: 8,
        padding: 16,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>每日 Token 消耗</div>
        {dailyData.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 20, textAlign: 'center' }}>暂无数据</div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 140 }}>
            {dailyData.map(([date, d]) => (
              <div key={date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{formatTokens(d.tokens)}</span>
                <div style={{
                  width: '100%',
                  maxWidth: 40,
                  height: `${(d.tokens / maxTokens) * 100}%`,
                  minHeight: 2,
                  background: 'linear-gradient(to top, var(--accent-cyan), var(--accent-blue))',
                  borderRadius: '4px 4px 0 0',
                  transition: 'height 0.4s ease',
                }} />
                <span style={{ fontSize: 9, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{date}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* 今日时段分布 */}
        <div style={{
          background: 'var(--card-bg)',
          border: '1px solid rgba(148,163,184,0.14)',
          borderRadius: 8,
          padding: 16,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>今日时段分布</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 100 }}>
            {hourlyData.map((d) => (
              <div key={d.hour} style={{
                flex: 1,
                height: `${(d.tokens / maxHourlyTokens) * 100}%`,
                minHeight: d.tokens > 0 ? 2 : 0,
                background: d.count > 0 ? 'var(--accent-blue)' : 'transparent',
                borderRadius: '2px 2px 0 0',
                opacity: 0.7,
                transition: 'height 0.3s ease',
              }} title={`${d.hour}:00 - ${d.count} 次 · ${formatTokens(d.tokens)} tokens`} />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>0:00</span>
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>12:00</span>
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>23:00</span>
          </div>
        </div>

        {/* 模型消耗对比 */}
        <div style={{
          background: 'var(--card-bg)',
          border: '1px solid rgba(148,163,184,0.14)',
          borderRadius: 8,
          padding: 16,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>模型消耗对比</div>
          {modelData.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>暂无数据</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {modelData.map(([model, d]) => (
                <div key={model}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 500 }}>{model}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{formatTokens(d.tokens)}</span>
                  </div>
                  <div style={{
                    height: 6,
                    borderRadius: 3,
                    background: 'var(--bg-tertiary)',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${(d.tokens / maxModelTokens) * 100}%`,
                      background: 'linear-gradient(90deg, var(--accent-green), var(--accent-cyan))',
                      borderRadius: 3,
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TrendPanel;
