/**
 * DebugPanel 诊断台组件
 *
 * 精简为 3 个核心功能：
 * 1. 工具调用统计（成功率、平均耗时）— DevTools 没有
 * 2. 模型上下文快照（清洗/丢弃计数）— 独特价值
 * 3. 健康状态指示（一个小 badge）
 */

import React, { useEffect, useMemo, useState } from 'react';
import styles from './DebugPanel.module.css';
import ToolLogPanel from '../Observability/ToolLogPanel';
import {
  clearModelContextSnapshots,
  getModelContextSnapshots,
  getToolLogs,
  type ModelContextSnapshot,
  type ToolCallLog,
} from '../../core/history/workspaceStore';
import type { Message } from '../../types';
import { clearBufferedLogs, getBufferedLogs, type BufferedLogEntry } from '../../../shared/logger';

type DebugTab = 'tools' | 'context';

interface DebugPanelProps {
  messages: Message[];
}

const tabs: Array<{ id: DebugTab; label: string }> = [
  { id: 'tools', label: '工具调用' },
  { id: 'context', label: '模型上下文' },
];

const formatDuration = (durationMs: number) => {
  if (!durationMs) return '0ms';
  return durationMs >= 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${durationMs}ms`;
};

const previewText = (text: string, maxLength = 160) => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
};

const DebugPanel: React.FC<DebugPanelProps> = ({ messages }) => {
  const [activeTab, setActiveTab] = useState<DebugTab>('tools');
  const [toolLogs, setToolLogs] = useState<ToolCallLog[]>([]);
  const [contextSnapshots, setContextSnapshots] = useState<ModelContextSnapshot[]>([]);
  const [logs, setLogs] = useState<BufferedLogEntry[]>([]);

  useEffect(() => {
    const refresh = () => {
      setToolLogs(getToolLogs());
      setContextSnapshots(getModelContextSnapshots());
      setLogs(getBufferedLogs());
    };
    refresh();
    window.addEventListener('nova-log-buffer-updated', refresh);
    window.addEventListener('nova-model-context-snapshot-updated', refresh);
    const timer = window.setInterval(refresh, 2000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('nova-log-buffer-updated', refresh);
      window.removeEventListener('nova-model-context-snapshot-updated', refresh);
    };
  }, []);

  const failedToolCount = toolLogs.filter((log) => log.status === 'error').length;
  const averageToolDuration = toolLogs.length
    ? Math.round(toolLogs.reduce((sum, log) => sum + log.durationMs, 0) / toolLogs.length)
    : 0;
  const errorLogs = logs.filter((log) => log.level === 'error');
  const warnLogs = logs.filter((log) => log.level === 'warn');
  const healthState = errorLogs.length > 0 ? '需要排查' : warnLogs.length > 0 || failedToolCount > 0 ? '有告警' : '正常';
  const latestContext = contextSnapshots[0];

  const renderContext = () => (
    <div className={styles.contextPanel}>
      {!latestContext ? (
        <div className={styles.contextFallback}>
          <div className={styles.placeholderPanel}>
            <span>模型上下文</span>
            <h3>还没有模型请求快照</h3>
            <p>发送一条新消息后，这里会显示清洗后的真实快照。</p>
          </div>
          <div className={styles.placeholderMetrics}>
            <div><strong>{messages.length}</strong><span>当前会话消息</span></div>
            <div><strong>50</strong><span>默认上下文窗口</span></div>
            <div><strong>暂无</strong><span>清洗结果快照</span></div>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.contextHeader}>
            <div>
              <span>最近一次模型上下文</span>
              <h3>{latestContext.provider} / {latestContext.model}</h3>
              <p>{latestContext.traceId || '无 traceId'}</p>
            </div>
            <button type="button" onClick={() => clearModelContextSnapshots()}>清空快照</button>
          </div>

          <div className={styles.placeholderMetrics}>
            <div><strong>{latestContext.rawCount}</strong><span>原始消息</span></div>
            <div><strong>{latestContext.normalizedCount}</strong><span>归一化后</span></div>
            <div><strong>{latestContext.sanitizedCount}</strong><span>发送窗口</span></div>
            <div><strong>{latestContext.droppedCount}</strong><span>丢弃消息</span></div>
          </div>

          {Object.keys(latestContext.droppedReasonCounts).length > 0 && (
            <section className={styles.contextSection}>
              <h4>丢弃原因</h4>
              <div className={styles.dropGrid}>
                {Object.entries(latestContext.droppedReasonCounts).map(([reason, count]) => (
                  <div key={reason}><strong>{count}</strong><span>{reason}</span></div>
                ))}
              </div>
            </section>
          )}

          <section className={styles.contextSection}>
            <h4>消息预览</h4>
            <div className={styles.messagePreviewList}>
              {latestContext.messagesPreview.map((message) => (
                <article key={message.index} className={styles.messagePreview}>
                  <div>
                    <strong>#{message.index} {message.role}</strong>
                    <span>
                      图片 {message.imageCount} · reasoning {message.hasReasoning ? '有' : '无'} · toolCalls {message.toolCallCount}
                    </span>
                  </div>
                  <p>{message.textPreview || '无文本内容'}</p>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );

  return (
    <section className={styles.debugPanel}>
      <header className={styles.hero}>
        <div>
          <h1>诊断</h1>
          <p>工具调用统计和模型上下文快照。</p>
        </div>
        <span className={healthState === '正常' ? styles.badgeOk : healthState === '有告警' ? styles.badgeWarn : styles.badgeDanger}>
          {healthState}
        </span>
      </header>

      <nav className={styles.tabs} aria-label="诊断分类">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`${styles.tabButton} ${activeTab === tab.id ? styles.tabButtonActive : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      <div className={styles.content}>
        {activeTab === 'tools' ? <ToolLogPanel /> : renderContext()}
      </div>
    </section>
  );
};

export default DebugPanel;
