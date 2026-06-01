import React, { useEffect, useMemo, useState } from 'react';
import styles from './WorkspaceDashboard.module.css';
import type { Message } from '../../types';
import { getProjects, getTasks, getToolLogs, type WorkspaceProject, type WorkspaceTask } from '../../services/workspaceStore';
import { createLogger } from '../../../shared/logger';

const logger = createLogger('ui');

interface MemoryItem {
  id: string;
  content: string;
  category: string;
  updated_at: number;
}

interface WorkspaceDashboardProps {
  messages: Message[];
  onSuggestionClick?: (prompt: string) => void;
}

const statusLabel: Record<WorkspaceProject['status'], string> = {
  active: '推进中',
  blocked: '有阻塞',
  planning: '规划中',
  done: '已完成',
};

const taskLabel: Record<WorkspaceTask['status'], string> = {
  todo: '待办',
  doing: '进行中',
  done: '完成',
};

const formatTime = (timestamp: number) => {
  if (!timestamp) return '未知';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
};

const WorkspaceDashboard: React.FC<WorkspaceDashboardProps> = ({ messages, onSuggestionClick }) => {
  const api = (window as any).electronAPI;
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [tasks, setTasks] = useState<WorkspaceTask[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [toolLogCount, setToolLogCount] = useState(0);

  const refreshLocalState = () => {
    setProjects(getProjects());
    setTasks(getTasks());
    setToolLogCount(getToolLogs().length);
  };

  useEffect(() => {
    refreshLocalState();

    const loadMemories = async () => {
      try {
        const memoryResult = await api?.memoryGetAllMemories?.();
        if (Array.isArray(memoryResult)) {
          setMemories(memoryResult.filter((memory: any) => !memory.status || memory.status === 'active'));
        }
      } catch (error) {
        logger.error('加载记忆数据失败', error);
      }
    };

    loadMemories();
    const timer = window.setInterval(refreshLocalState, 3000);
    return () => window.clearInterval(timer);
  }, [api]);

  const activeProject = useMemo(() => {
    return projects.find((project) => project.status === 'active') || projects[0];
  }, [projects]);

  const blockedProjects = projects.filter((project) => project.status === 'blocked');
  const openTasks = tasks.filter((task) => task.status !== 'done');
  const doingTasks = tasks.filter((task) => task.status === 'doing');
  const recentTasks = openTasks.slice(0, 5);
  const recentMemories = [...memories].sort((a, b) => b.updated_at - a.updated_at).slice(0, 4);

  const metrics = [
    { label: '项目', value: projects.length },
    { label: '未完成任务', value: openTasks.length },
    { label: '长期记忆', value: memories.length },
    { label: '工具日志', value: toolLogCount },
  ];

  return (
    <section className={styles.dashboard}>
      <div className={styles.hero}>
        <h1 className={styles.title}>项目总览</h1>
        <p className={styles.subtitle}>集中查看项目、任务、记忆和工具轨迹，优先暴露需要处理的事项。</p>
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
            <span>当前焦点</span>
            <small>{activeProject ? formatTime(activeProject.updatedAt) : '未初始化'}</small>
          </div>
          {activeProject ? (
            <>
              <div className={styles.focusHeader}>
                <div>
                  <h2>{activeProject.name}</h2>
                  <p>{activeProject.goal}</p>
                </div>
                <span className={`${styles.statusPill} ${styles[activeProject.status]}`}>
                  {statusLabel[activeProject.status]}
                </span>
              </div>

              <div className={styles.nextStepCard}>
                <span className={styles.cardEyebrow}>下一步</span>
                <p>{activeProject.nextStep}</p>
              </div>

              <div className={styles.focusSplit}>
                <div className={styles.miniBlock}>
                  <span>阻塞点</span>
                  {blockedProjects.length === 0 ? (
                    <p>当前没有阻塞项。</p>
                  ) : (
                    blockedProjects.map((project) => (
                      <div key={project.id} className={styles.inlineIssue}>
                        <strong>{project.name}</strong>
                        <p>{project.blocker || '未填写阻塞原因'}</p>
                      </div>
                    ))
                  )}
                </div>

                <div className={styles.miniBlock}>
                  <span>进行中任务</span>
                  {doingTasks.length === 0 ? (
                    <p>当前没有标记为进行中的任务。</p>
                  ) : (
                    doingTasks.slice(0, 3).map((task) => (
                      <div key={task.id} className={styles.inlineIssue}>
                        <strong>{task.title}</strong>
                        <p>{task.priority} 优先级</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className={styles.emptyState}>还没有项目数据，先在工作区建立主项目。</div>
          )}
        </article>

        <div className={styles.secondarySplit}>
          <article className={styles.queuePanel}>
            <div className={styles.panelTopline}>
              <span>任务队列</span>
              <small>{openTasks.length} 项待处理</small>
            </div>
            {recentTasks.length === 0 ? (
              <div className={styles.emptyState}>当前没有待办任务。</div>
            ) : (
              <div className={styles.listStack}>
                {recentTasks.map((task) => (
                  <div key={task.id} className={styles.listRow}>
                    <div>
                      <strong>{task.title}</strong>
                      <p>{taskLabel[task.status]} · {task.priority} 优先级</p>
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
