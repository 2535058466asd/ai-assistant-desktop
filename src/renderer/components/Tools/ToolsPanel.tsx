/**
 * ToolsPanel 工具与技能展示面板
 *
 * 按类别分组展示所有工具，技能作为类别标题高亮。
 * 有技能标签的类别是工具包，没有的是散装工具。
 */

import React, { useState } from 'react';
import { TOOLS, SKILLS } from '../../core/tools/toolRegistry';
import styles from './ToolsPanel.module.css';

interface CategoryGroup {
  id: string;
  label: string;
  emoji: string;
  skillName?: string;
  skillDesc?: string;
  tools: Array<{ name: string; desc: string }>;
}

const CATEGORY_ICONS: Record<string, string> = {
  file: '📁',
  web: '🌐',
  knowledge: '📚',
  memory: '🧠',
  clipboard: '📋',
  system: '🔧',
  app: '🖥️',
};

const CATEGORY_LABELS: Record<string, string> = {
  file: '文件',
  web: '网络',
  knowledge: '知识库',
  memory: '记忆',
  clipboard: '剪贴板',
  system: '系统',
  app: '应用',
};

const categoryOrder = ['file', 'web', 'knowledge', 'memory', 'clipboard', 'system', 'app'];

const ToolsPanel: React.FC = () => {
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  const categories: CategoryGroup[] = categoryOrder.map((cat) => {
    const skillKey = cat === 'file' ? 'file_manager' : cat === 'knowledge' ? 'knowledge_manager' : cat === 'system' ? 'system_tools' : undefined;
    const skill = skillKey ? SKILLS[skillKey] : undefined;
    const tools = Object.entries(TOOLS)
      .filter(([, t]) => (t.category || 'other') === cat)
      .map(([name, t]) => ({ name, desc: t.schema.function.description }));

    return {
      id: cat,
      label: CATEGORY_LABELS[cat] || cat,
      emoji: CATEGORY_ICONS[cat] || '📦',
      skillName: skill?.name,
      skillDesc: skill?.description,
      tools,
    };
  }).filter((c) => c.tools.length > 0);

  const toggleCat = (cat: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <h1>工具与技能</h1>
        <p>按类别分组展示。有技能标签的是工具包，没有的是散装工具。</p>
      </header>

      {categories.map((cat) => {
        const expanded = expandedCats.has(cat.id);
        return (
          <div key={cat.id} className={styles.category}>
            <button
              type="button"
              className={styles.categoryHeader}
              onClick={() => toggleCat(cat.id)}
            >
              <span className={styles.categoryEmoji}>{cat.emoji}</span>
              <div className={styles.categoryInfo}>
                <div className={styles.categoryTitleRow}>
                  <strong>{cat.label}</strong>
                  {cat.skillName && (
                    <span className={styles.skillBadge}>{cat.skillName}</span>
                  )}
                </div>
                {cat.skillDesc && (
                  <p className={styles.categoryDesc}>{cat.skillDesc}</p>
                )}
              </div>
              <span className={expanded ? styles.chevronOpen : styles.chevron}>▸</span>
            </button>
            {expanded && (
              <div className={styles.toolList}>
                {cat.tools.map((tool) => (
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
