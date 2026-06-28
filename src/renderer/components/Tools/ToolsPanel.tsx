/**
 * ToolsPanel 工具与技能展示面板
 *
 * 展示 Nova 所有可用工具和技能，帮助用户了解系统能力。
 * 数据来源：toolRegistry.ts 的 TOOLS 和 SKILLS。
 */

import React, { useMemo } from 'react';
import { TOOLS, SKILLS } from '../../core/tools/toolRegistry';
import type { ToolSpec } from '../../core/tools/toolRegistry';
import styles from './ToolsPanel.module.css';

const RISK_LABELS: Record<string, { label: string; color: string }> = {
  read: { label: '只读', color: '#22c55e' },
  low_write: { label: '低风险', color: '#3b82f6' },
  system: { label: '系统级', color: '#f59e0b' },
  destructive: { label: '高风险', color: '#ef4444' },
  external_send: { label: '外部发送', color: '#a855f7' },
};

const CATEGORY_LABELS: Record<string, string> = {
  file: '文件',
  system: '系统',
  web: '网络',
  clipboard: '剪贴板',
  knowledge: '知识库',
  memory: '记忆',
  app: '应用',
};

const ToolsPanel: React.FC = () => {
  const toolsByCategory = useMemo(() => {
    const map: Record<string, Array<{ name: string } & ToolSpec>> = {};

    for (const [name, tool] of Object.entries(TOOLS)) {
      const cat = tool.category || 'other';
      if (!map[cat]) map[cat] = [];
      map[cat].push({ name, ...tool });
    }

    return map;
  }, []);

  const categoryOrder = ['file', 'web', 'knowledge', 'memory', 'clipboard', 'system', 'app'];

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <h1>工具与技能</h1>
        <p>Nova 当前可用的工具和技能。工具由模型自动调用，技能是工具的组合入口。</p>
      </header>

      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <strong>{Object.keys(TOOLS).length}</strong>
          <span>工具</span>
        </div>
        <div className={styles.statCard}>
          <strong>{Object.keys(SKILLS).length}</strong>
          <span>技能</span>
        </div>
      </div>

      <div className={styles.skillsSection}>
        <h2>技能</h2>
        <p className={styles.sectionDesc}>技能是工具的组合入口。模型调用技能后，解锁对应的子工具集。</p>
        <div className={styles.skillsGrid}>
          {Object.entries(SKILLS).map(([key, skill]) => (
            <article key={key} className={styles.skillCard}>
              <div className={styles.skillHeader}>
                <h3>{skill.name}</h3>
              </div>
              <p className={styles.skillDesc}>{skill.description}</p>
              <div className={styles.skillTools}>
                {skill.tools.map((toolName) => (
                  <span key={toolName} className={styles.toolTag}>{toolName}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className={styles.toolsSection}>
        <h2>工具</h2>
        <p className={styles.sectionDesc}>模型可直接调用的原子工具。按类别分组。</p>
        {categoryOrder.map((cat) => {
          const tools = toolsByCategory[cat];
          if (!tools || tools.length === 0) return null;
          return (
            <div key={cat} className={styles.categoryGroup}>
              <h3 className={styles.categoryTitle}>{CATEGORY_LABELS[cat] || cat}</h3>
              <div className={styles.toolsGrid}>
                {tools.map((tool) => {
                  const risk = RISK_LABELS[tool.riskLevel] || { label: tool.riskLevel, color: '#94a3b8' };
                  return (
                    <article key={tool.name} className={styles.toolCard}>
                      <div className={styles.toolHeader}>
                        <strong>{tool.name}</strong>
                        <span className={styles.riskBadge} style={{ color: risk.color, borderColor: risk.color }}>
                          {risk.label}
                        </span>
                      </div>
                      <p className={styles.toolDesc}>{tool.schema.function.description}</p>
                    </article>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default ToolsPanel;
