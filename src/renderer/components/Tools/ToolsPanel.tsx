/**
 * ToolsPanel 工具与技能展示面板
 *
 * 展示 Nova 所有可用工具和技能。
 * - 技能卡片突出展示，包含子工具列表
 * - 工具按类别折叠，点击展开
 * - 不显示风险等级（给模型看的，不是给用户看的）
 */

import React, { useMemo, useState } from 'react';
import { TOOLS, SKILLS } from '../../core/tools/toolRegistry';
import type { ToolSpec } from '../../core/tools/toolRegistry';
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

const categoryOrder = ['file', 'web', 'knowledge', 'memory', 'clipboard', 'system', 'app'];

const ToolsPanel: React.FC = () => {
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  const toolsByCategory = useMemo(() => {
    const map: Record<string, Array<{ name: string } & ToolSpec>> = {};
    for (const [name, tool] of Object.entries(TOOLS)) {
      const cat = tool.category || 'other';
      if (!map[cat]) map[cat] = [];
      map[cat].push({ name, ...tool });
    }
    return map;
  }, []);

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
        <p>技能是工具的组合入口，工具由模型自动调用。</p>
      </header>

      <div className={styles.skillsSection}>
        <h2>技能</h2>
        <div className={styles.skillsGrid}>
          {Object.entries(SKILLS).map(([key, skill]) => (
            <article key={key} className={styles.skillCard}>
              <h3>{skill.name}</h3>
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
        {categoryOrder.map((cat) => {
          const tools = toolsByCategory[cat];
          if (!tools || tools.length === 0) return null;
          const expanded = expandedCats.has(cat);
          return (
            <div key={cat} className={styles.categoryGroup}>
              <button
                type="button"
                className={styles.categoryToggle}
                onClick={() => toggleCat(cat)}
              >
                <span className={expanded ? styles.chevronOpen : styles.chevron}>▸</span>
                <strong>{CATEGORY_LABELS[cat] || cat}</strong>
                <span className={styles.toolCount}>{tools.length}</span>
              </button>
              {expanded && (
                <div className={styles.toolsList}>
                  {tools.map((tool) => (
                    <div key={tool.name} className={styles.toolRow}>
                      <span className={styles.toolName}>{tool.name}</span>
                      <span className={styles.toolDesc}>{tool.schema.function.description}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default ToolsPanel;
