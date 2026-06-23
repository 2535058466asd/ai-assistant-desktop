import React, { useEffect, useState } from 'react';
import styles from './WorkspaceDashboard.module.css';
import type { Message } from '../../types';
import { getEvalCases, getToolLogs, type EvalCase, type ToolCallLog } from '../../services/workspaceStore';
import { createLogger } from '../../../shared/logger';

const logger = createLogger('ui');

interface KnowledgeStats {
  count: number;
  collections: string[];
}

interface KnowledgeSource {
  source: string;
  category: string;
  count: number;
  createdAt?: string;
}

interface MemoryItem {
  id: string;
  content: string;
  category: string;
  updated_at: number;
}

interface WorkspaceDashboardProps {
  messages: Message[];
}

const formatTime = (timestamp: number) => {
  if (!timestamp) return '未知';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
};

const WorkspaceDashboard: React.FC<WorkspaceDashboardProps> = ({ messages }) => {
  const api = (window as any).electronAPI;
  const [knowledgeStats, setKnowledgeStats] = useState<KnowledgeStats | null>(null);
  const [knowledgeSources, setKnowledgeSources] = useState<KnowledgeSource[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [toolLogs, setToolLogs] = useState<ToolCallLog[]>([]);
  const [evalCases, setEvalCases] = useState<EvalCase[]>([]);

  const refreshLocalState = () => {
    setToolLogs(getToolLogs());
    setEvalCases(getEvalCases());
  };

  useEffect(() => {
    refreshLocalState();

    const loadSystemData = async () => {
      try {
        const [memoryResult, statsResult, sourcesResult] = await Promise.all([
          api?.memoryGetAllMemories?.(),
          api?.knowledgeStats?.(),
          api?.knowledgeSources?.(),
        ]);

        if (Array.isArray(memoryResult)) {
          setMemories(memoryResult.filter((memory: any) => !memory.status || memory.status === 'active'));
        }

        if (statsResult?.success) {
          setKnowledgeStats(statsResult.data);
        }

        if (sourcesResult?.success && Array.isArray(sourcesResult.data)) {
          setKnowledgeSources(sourcesResult.data);
        }
      } catch (error) {
        logger.error('加载工作台统计失败', error);
      }
    };

    loadSystemData();
    const timer = window.setInterval(refreshLocalState, 3000);
    return () => window.clearInterval(timer);
  }, [api]);

  const recentMemories = [...memories].sort((a, b) => b.updated_at - a.updated_at).slice(0, 4);
  const recentToolLogs = [...toolLogs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
  const failedToolLogs = toolLogs.filter((log) => log.status === 'error');
  const testedEvalCases = evalCases.filter((item) => item.status !== 'untested');
  const failedEvalCases = evalCases.filter((item) => item.status === 'fail');
  const passRate = testedEvalCases.length
    ? Math.round(((testedEvalCases.length - failedEvalCases.length) / testedEvalCases.length) * 100)
    : 0;

  const metrics = [
    { label: '知识来源', value: knowledgeSources.length },
    { label: '知识片段', value: knowledgeStats?.count ?? 0 },
    { label: '长期记忆', value: memories.length },
    { label: '工具日志', value: toolLogs.length },
    { label: 'Eval 失败', value: failedEvalCases.length },
  ];

  return (
    <section className={styles.dashboard}>
      <div className={styles.hero}>
        <h1 className={styles.title}>运行总览</h1>
        <p className={styles.subtitle}>集中查看知识库、长期记忆、工具日志和评估状态，快速判断 Nova 当前是否健康。</p>
      </div>

      <div className={styles.metricsGrid}>
        {metrics.map((metric) => (
          <div key={metric.label} className={styles.metricCard}>
            <strong>{metric.value}</strong>
            <span>{metric.label}</span>
          </div>
        ))}
      </div>

      <div className={styles.mainGrid}>
        <article className={styles.focusPanel}>
          <div className={styles.panelTopline}>
            <span>系统状态</span>
            <small>{messages.length} 条当前会话消息</small>
          </div>
          <div className={styles.focusHeader}>
            <div>
              <h2>Nova 桌面 AI Agent</h2>
              <p>核心能力集中在多模型对话、RAG 知识库、长期记忆、工具调用和可观测日志。</p>
            </div>
            <span className={`${styles.statusPill} ${styles.active}`}>运行中</span>
          </div>

          <div className={styles.focusSplit}>
            <div className={styles.miniBlock}>
              <span>知识库</span>
              <p>{knowledgeSources.length} 个来源，{knowledgeStats?.count ?? 0} 个片段。</p>
            </div>

            <div className={styles.miniBlock}>
              <span>长期记忆</span>
              <p>{memories.length} 条生效记忆，会在对话前按相关性注入。</p>
            </div>

            <div className={styles.miniBlock}>
              <span>工具调用</span>
              <p>{toolLogs.length} 条日志，最近失败 {failedToolLogs.length} 条。</p>
            </div>

            <div className={styles.miniBlock}>
              <span>质量评估</span>
              <p>{evalCases.length} 条用例，已测 {testedEvalCases.length} 条，通过率 {passRate}%。</p>
            </div>
          </div>
        </article>

        <div className={styles.secondarySplit}>
          <article className={styles.queuePanel}>
            <div className={styles.panelTopline}>
              <span>最近工具日志</span>
              <small>{failedToolLogs.length} 条失败</small>
            </div>
            {recentToolLogs.length === 0 ? (
              <div className={styles.emptyState}>暂无工具调用日志。</div>
            ) : (
              <div className={styles.listStack}>
                {recentToolLogs.map((log) => (
                  <div key={log.id} className={styles.listRow}>
                    <div>
                      <strong>{log.name}</strong>
                      <p>{log.status === 'success' ? '成功' : '失败'} · {log.durationMs}ms · {formatTime(log.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className={styles.memoryPanel}>
            <div className={styles.panelTopline}>
              <span>最近记忆</span>
              <small>{memories.length} 条长期记忆</small>
            </div>
            {recentMemories.length === 0 ? (
              <div className={styles.emptyState}>暂无长期记忆。</div>
            ) : (
              <div className={styles.memoryGrid}>
                {recentMemories.map((memory) => (
                  <div key={memory.id} className={styles.memoryCard}>
                    <span>{memory.category}</span>
                    <p>{memory.content}</p>
                  </div>
                ))}
              </div>
            )}
          </article>
        </div>
      </div>
    </section>
  );
};

export default WorkspaceDashboard;
