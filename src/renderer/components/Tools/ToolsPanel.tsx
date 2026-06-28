/**
 * ToolsPanel 工具与技能展示面板
 *
 * 设计方向：工具柜风格 — 每个类别像一个独立的工具箱，
 * 技能用品牌色强调，散装工具用中性色。
 * 展开/收起有滑入动画，工具名用等宽字体。
 */

import React, { useState } from 'react';
import { TOOLS, SKILLS } from '../../core/tools/toolRegistry';
import styles from './ToolsPanel.module.css';

const CATEGORIES = [
  { id: 'file', label: '文件', icon: '📁', skill: 'file_manager', desc: '文件管理' },
  { id: 'web', label: '网络', icon: '🌐', desc: '搜索与抓取' },
  { id: 'knowledge', label: '知识库', icon: '📚', skill: 'knowledge_manager', desc: '知识库管理' },
  { id: 'memory', label: '记忆', icon: '🧠', desc: '长期记忆' },
  { id: 'clipboard', label: '剪贴板', icon: '📋', desc: '剪贴板读写' },
  { id: 'system', label: '系统', icon: '🔧', skill: 'system_tools', desc: '系统工具' },
  { id: 'app', label: '应用', icon: '🖥️', desc: '打开应用' },
];

const ToolsPanel: React.FC = () => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['file', 'web']));

  const toggle = (cat: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const toolsByCat = (catId: string) =>
    Object.entries(TOOLS)
      .filter(([, t]) => (t.category || 'other') === catId)
      .map(([name, t]) => ({ name, desc: t.schema.function.description }));

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <h1>工具与技能</h1>
        <p className={styles.subtitle}>工具由模型自动调用，技能是相关工具的组合入口</p>
      </header>

      <div className={styles.grid}>
        {CATEGORIES.map((cat) => {
          const tools = toolsByCat(cat.id);
          if (tools.length === 0) return null;
          const isOpen = expanded.has(cat.id);
          const isSkill = Boolean(cat.skill);

          return (
            <div
              key={cat.id}
              className={`${styles.drawer} ${isSkill ? styles.drawerSkill : ''} ${isOpen ? styles.drawerOpen : ''}`}
            >
              <button
                type="button"
                className={styles.drawerHeader}
                onClick={() => toggle(cat.id)}
              >
                <span className={styles.drawerIcon}>{cat.icon}</span>
                <div className={styles.drawerMeta}>
                  <span className={styles.drawerTitle}>{cat.label}</span>
                  <span className={styles.drawerDesc}>{cat.desc}</span>
                </div>
                <span className={styles.drawerCount}>{tools.length}</span>
                <span className={isOpen ? styles.chevOpen : styles.chev}>›</span>
              </button>

              {isOpen && (
                <div className={styles.drawerBody}>
                  {tools.map((tool) => (
                    <div key={tool.name} className={styles.toolItem}>
                      <code className={styles.toolName}>{tool.name}</code>
                      <span className={styles.toolDot} />
                      <span className={styles.toolDesc}>{tool.desc}</span>
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
