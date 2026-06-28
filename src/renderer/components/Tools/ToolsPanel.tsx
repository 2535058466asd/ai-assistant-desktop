/**
 * ToolsPanel 工具与技能展示面板
 *
 * 简洁的分组列表，技能类别用左侧色条标识。
 */

import React, { useState } from 'react';
import { TOOLS, SKILLS } from '../../core/tools/toolRegistry';
import styles from './ToolsPanel.module.css';

const CATEGORY_LABELS: Record<string, string> = {
  file: '文件',
  web: '网络',
  knowledge: '知识库',
  memory: '记忆',
  clipboard: '剪贴板',
  system: '系统',
  app: '应用',
};

const SKILL_MAP: Record<string, string> = {
  file: 'file_manager',
  knowledge: 'knowledge_manager',
  system: 'system_tools',
};

const categoryOrder = ['file', 'web', 'knowledge', 'memory', 'clipboard', 'system', 'app'];

const ToolsPanel: React.FC = () => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (cat: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <h1>工具与技能</h1>
        <p>技能是工具的组合入口，展开可查看每个工具的说明。</p>
      </header>

      {categoryOrder.map((cat) => {
        const tools = Object.entries(TOOLS)
          .filter(([, t]) => (t.category || 'other') === cat)
          .map(([name, t]) => ({ name, desc: t.schema.function.description }));
        if (tools.length === 0) return null;

        const skillKey = SKILL_MAP[cat];
        const skill = skillKey ? SKILLS[skillKey] : undefined;
        const isOpen = expanded.has(cat);

        return (
          <div key={cat} className={`${styles.group} ${skill ? styles.groupSkill : ''}`}>
            <button type="button" className={styles.groupHeader} onClick={() => toggle(cat)}>
              <span className={isOpen ? styles.chevronOpen : styles.chevron}>▸</span>
              <strong>{CATEGORY_LABELS[cat]}</strong>
              {skill && <span className={styles.skillTag}>技能</span>}
              <span className={styles.count}>{tools.length}</span>
            </button>
            {isOpen && (
              <div className={styles.toolList}>
                {tools.map((tool) => (
                  <div key={tool.name} className={styles.toolRow}>
                    <span className={styles.toolName}>{tool.name}</span>
                    <span className={styles.toolDesc}>{tool.desc}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
};

export default ToolsPanel;
