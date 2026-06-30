import React, { useEffect, useMemo, useState } from 'react';
import styles from './ToolLogPanel.module.css';
import { clearToolLogs, getToolLogs, type ToolCallLog } from '../../core/history/workspaceStore';

const formatTime = (timestamp: number) => new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
}).format(new Date(timestamp));

const ToolLogPanel: React.FC = () => {
  const [logs, setLogs] = useState<ToolCallLog[]>([]);
  const [query, setQuery] = useState('');

  const refresh = () => setLogs(getToolLogs());

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 2000);
    return () => window.clearInterval(timer);
  }, []);

  const filteredLogs = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return logs;
    return logs.filter((log) =>
      log.name.toLowerCase().includes(keyword) ||
      log.argsPreview.toLowerCase().includes(keyword) ||
      log.resultPreview.toLowerCase().includes(keyword)
    );
  }, [logs, query]);

  const successCount = logs.filter((log) => log.status === 'success').length;
  const successRate = logs.length ? Math.round((successCount / logs.length) * 100) : 0;
  const averageDuration = logs.length
    ? Math.round(logs.reduce((sum, log) => sum + log.durationMs, 0) / logs.length)
    : 0;

  const handleClear = () => {
    clearToolLogs();
    refresh();
  };

  const exportJson = () => {
    navigator.clipboard.writeText(JSON.stringify(logs, null, 2));
  };

  return (
    <div className={styles.panel}>
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <strong>{logs.length}</strong>
          <span>调用次数</span>
        </div>
        <div className={styles.statCard}>
          <strong>{successRate}%</strong>
          <span>成功率</span>
        </div>
        <div className={styles.statCard}>
          <strong>{averageDuration}ms</strong>
          <span>平均耗时</span>
        </div>
      </div>

      <div className={styles.toolbar}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索工具名、参数、结果"
        />
        <button onClick={refresh}>刷新</button>
        <button onClick={exportJson} disabled={logs.length === 0}>复制 JSON</button>
        <button onClick={handleClear} disabled={logs.length === 0}>清空</button>
      </div>

      <div className={styles.logList}>
        {filteredLogs.length === 0 && (
          <div className={styles.emptyState}>暂无工具调用记录。发起一次需要工具的对话后，这里会显示完整链路。</div>
        )}

        {filteredLogs.map((log) => (
          <article key={log.id} className={styles.logCard}>
            <div className={styles.logHeader}>
              <strong>{log.name}</strong>
              <span className={log.status === 'success' ? styles.success : styles.error}>
                {log.status === 'success' ? '成功' : '失败'} · {log.durationMs}ms
              </span>
            </div>
            <pre>{log.argsPreview}</pre>
            <p>{log.resultPreview}</p>
            <small>{formatTime(log.createdAt)}</small>
          </article>
        ))}
      </div>
    </div>
  );
};

export default ToolLogPanel;
