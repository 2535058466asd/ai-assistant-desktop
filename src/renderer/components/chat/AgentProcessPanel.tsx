// ==========================================
// Agent 处理过程面板 — 推理内容 + 工具调用展示
// ==========================================

import React from 'react';
import styles from './ChatArea.module.css';
import type { UIMessage } from '../../types/chat';

type ProcessEvent = NonNullable<UIMessage['processEvents']>[number];

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  exec_command: '执行命令',
  open_app: '打开应用',
  read_file: '读取文件',
  write_file: '写入文件',
  web_search: '搜索网页',
  web_fetch: '读取网页',
  clipboard_read: '读取剪贴板',
  clipboard_write: '写入剪贴板',
  knowledge_search: '检索知识库',
  knowledge_import_file: '导入知识库',
  add_memory: '写入记忆',
};

const getToolDisplayName = (toolName: string): string => TOOL_DISPLAY_NAMES[toolName] || toolName;

const formatDuration = (durationMs?: number): string => {
  if (typeof durationMs !== 'number') return '';
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
};

interface AgentProcessPanelProps {
  message: UIMessage;
  isExpanded: boolean;
  onToggle: () => void;
}

const AgentProcessPanel: React.FC<AgentProcessPanelProps> = ({ message, isExpanded, onToggle }) => {
  const hasReasoning = !!message.reasoningContent;
  const hasToolCalls = message.toolCallSummary && message.toolCallSummary.length > 0;

  if (!hasReasoning && !hasToolCalls) return null;

  const expanded = message.isStreaming || isExpanded;
  const toolCount = message.toolCallSummary?.length || 0;
  const summaryText = message.isStreaming
    ? '思考中'
    : toolCount > 0
      ? `思考过程 · ${toolCount} 个工具调用`
      : '思考过程';

  return (
    <div className={styles.agentProcessPanel}>
      <button
        type="button"
        className={styles.agentProcessToggle}
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className={`${styles.agentProcessSummaryDot} ${message.isStreaming ? styles.processSummaryRunning : ''}`} />
        <span className={styles.agentProcessSummaryText}>{summaryText}</span>
        <span className={styles.agentProcessSummaryHint}>{expanded ? '收起' : '展开'}</span>
        <svg
          className={`${styles.agentProcessChevron} ${expanded ? styles.agentProcessChevronOpen : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {expanded && (
        <div className={styles.agentProcessList}>
          {/* 推理内容 */}
          {hasReasoning && message.reasoningSegments && message.reasoningSegments.length > 0 ? (
            message.reasoningSegments.map((segment, index) => (
              <div key={index} className={styles.agentProcessItem}>
                <span className={styles.agentProcessDot} />
                <div className={styles.agentProcessBody}>
                  <div className={styles.agentProcessHeader}>
                    <span className={styles.agentProcessName}>第{segment.round}轮思考</span>
                  </div>
                  <div className={styles.agentProcessResult}>{segment.content}</div>
                </div>
              </div>
            ))
          ) : hasReasoning ? (
            <div className={styles.agentProcessItem}>
              <span className={styles.agentProcessDot} />
              <div className={styles.agentProcessBody}>
                <div className={styles.agentProcessHeader}>
                  <span className={styles.agentProcessName}>推理内容</span>
                </div>
                <div className={styles.agentProcessResult}>{message.reasoningContent}</div>
              </div>
            </div>
          ) : null}

          {/* 工具调用列表 */}
          {hasToolCalls && message.toolCallSummary?.map((tool, index) => (
            <div
              key={index}
              className={`${styles.agentProcessItem} ${styles.processKind_tool} ${styles[`processStatus_${tool.status}`] || ''}`}
            >
              <span className={styles.agentProcessDot} />
              <div className={styles.agentProcessBody}>
                <div className={styles.agentProcessHeader}>
                  <span className={styles.agentProcessName}>{getToolDisplayName(tool.name)}</span>
                  <span className={styles.agentProcessStatus}>{tool.status === 'success' ? '完成' : '失败'}</span>
                  <span className={styles.agentProcessDuration}>{formatDuration(tool.durationMs)}</span>
                </div>
                {tool.argsPreview && <div className={styles.agentProcessMeta}>{tool.argsPreview}</div>}
                {tool.resultPreview && <div className={styles.agentProcessResult}>{tool.resultPreview}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AgentProcessPanel;
