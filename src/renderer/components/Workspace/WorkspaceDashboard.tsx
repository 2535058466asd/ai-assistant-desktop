import React, { useEffect, useMemo, useState } from 'react';
import styles from './WorkspaceDashboard.module.css';
import type { Message } from '../../types';
import { getProjects, getTasks, getToolLogs, type WorkspaceProject, type WorkspaceTask } from '../../services/workspaceStore';

interface KnowledgeStats {
  count: number;
  collections: string[];
}

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
  const [knowledgeStats, setKnowledgeStats] = useState<KnowledgeStats | null>(null);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [toolLogCount, setToolLogCount] = useState(0);

  const refreshLocalState = () => {
    setProjects(getProjects());
    setTasks(getTasks());
    setToolLogCount(getToolLogs().length);
  };

  useEffect(() => {
    refreshLocalState();

    const loadRemoteStats = async () => {
      try {
        const [knowledgeResult, memoryResult] = await Promise.all([
          api?.knowledgeStats?.(),
          api?.memoryGetAllMemories?.(),
        ]);
        if (knowledgeResult?.success) setKnowledgeStats(knowledgeResult.data);
        if (Array.isArray(memoryResult)) setMemories(memoryResult);
      } catch (error) {
        console.error('加载工作台统计失败:', error);
      }
    };

    loadRemoteStats();
    const timer = window.setInterval(refreshLocalState, 3000);
    return () => window.clearInterval(timer);
  }, [api]);

  const activeProject = useMemo(() => {
    return projects.find((project) => project.status === 'active') || projects[0];
  }, [projects]);

  const blockedProjects = projects.filter((project) => project.status === 'blocked');
  const openTasks = tasks.filter((task) => task.status !== 'done');
  const recentTasks = openTasks.slice(0, 5);
  const recentMemories = [...memories].sort((a, b) => b.updated_at - a.updated_at).slice(0, 3);
  const recentConversation = [...messages].reverse().find((message) => message.role === 'user')?.content || '还没有新的用户输入';

  const suggestions = [
    '基于当前项目状态，给我今天最该做的 3 件事',
    '检查我的知识库是否足够支撑 RAG 面试展示',
    '为这个项目生成 20 个 eval 测试问题',
    '总结最近记忆，并指出哪些应该删除或合并',
  ];

  return (
    <section className={styles.dashboard}>
      <div className={styles.hero}>
        <div>
          <p className={styles.kicker}>Agentic Personal Workspace</p>
          <h1 className={styles.title}>项目驾驶舱</h1>
          <p className={styles.subtitle}>
            用项目状态、长期记忆、知识库、工具日志和评估集管理个人 AI 工作流。
          </p>
        </div>
        <div className={styles.heroStats}>
          <div className={styles.statBox}>
            <strong>{projects.length}</strong>
            <span>项目</span>
          </div>
          <div className={styles.statBox}>
            <strong>{openTasks.length}</strong>
            <span>待办任务</span>
          </div>
          <div className={styles.statBox}>
            <strong>{knowledgeStats?.count ?? '-'}</strong>
            <span>知识片段</span>
          </div>
          <div className={styles.statBox}>
            <strong>{toolLogCount}</strong>
            <span>工具日志</span>
          </div>
        </div>
      </div>

      <div className={styles.grid}>
        <article className={styles.primaryPanel}>
          <div className={styles.panelHeader}>
            <span>当前重点</span>
            <small>{activeProject ? formatTime(activeProject.updatedAt) : '未初始化'}</small>
          </div>
          {activeProject && (
            <>
              <div className={styles.projectTitleRow}>
                <h2>{activeProject.name}</h2>
                <span className={`${styles.statusPill} ${styles[activeProject.status]}`}>
                  {statusLabel[activeProject.status]}
                </span>
              </div>
              <p className={styles.projectGoal}>{activeProject.goal}</p>
              <div className={styles.nextStep}>
                <span>下一步</span>
                <p>{activeProject.nextStep}</p>
              </div>
            </>
          )}
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <span>阻塞点</span>
            <small>{blockedProjects.length} 项</small>
          </div>
          {blockedProjects.length === 0 ? (
            <p className={styles.emptyText}>当前没有阻塞项目。</p>
          ) : (
            blockedProjects.map((project) => (
              <div key={project.id} className={styles.blockerItem}>
                <strong>{project.name}</strong>
                <span>{project.blocker || '未填写阻塞原因'}</span>
              </div>
            ))
          )}
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <span>今日建议</span>
            <small>可点击填入输入框</small>
          </div>
          <div className={styles.suggestionList}>
            {suggestions.map((suggestion) => (
              <button key={suggestion} onClick={() => onSuggestionClick?.(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <span>任务队列</span>
            <small>{openTasks.length} 个未完成</small>
          </div>
          <div className={styles.taskList}>
            {recentTasks.map((task) => (
              <div key={task.id} className={styles.taskItem}>
                <span className={styles.taskTitle}>{task.title}</span>
                <span className={styles.taskMeta}>{taskLabel[task.status]} · {task.priority}</span>
              </div>
            ))}
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <span>最近记忆</span>
            <small>{memories.length} 条</small>
          </div>
          {recentMemories.length === 0 ? (
            <p className={styles.emptyText}>暂无长期记忆。</p>
          ) : (
            recentMemories.map((memory) => (
              <div key={memory.id} className={styles.memoryItem}>
                <span>{memory.category}</span>
                <p>{memory.content}</p>
              </div>
            ))
          )}
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <span>系统可观测性</span>
            <small>面试展示点</small>
          </div>
          <div className={styles.signalList}>
            <div><strong>RAG</strong><span>{knowledgeStats?.collections?.join(', ') || '等待导入文档'}</span></div>
            <div><strong>Memory</strong><span>{memories.length} 条可查看、可删除的长期记忆</span></div>
            <div><strong>Agent</strong><span>{toolLogCount} 条工具调用记录</span></div>
            <div><strong>Latest</strong><span>{recentConversation}</span></div>
          </div>
        </article>
      </div>
    </section>
  );
};

export default WorkspaceDashboard;
