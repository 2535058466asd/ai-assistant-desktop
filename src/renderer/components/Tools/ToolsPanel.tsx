/**
 * ToolsPanel 工具能力目录
 *
 * 两栏布局：
 * - 左栏：技能入口（顶部）+ 分类列表
 * - 右栏：选中分类的工具表格（名称/说明/风险/只读/超时/技能）
 */

import React, { useState } from 'react';
import { TOOLS, SKILLS } from '../../core/tools/toolRegistry';
import styles from './ToolsPanel.module.css';

const CATEGORIES = [
  { id: 'file', label: '文件', icon: '📁', skill: 'file_manager' },
  { id: 'web', label: '网络', icon: '🌐' },
  { id: 'knowledge', label: '知识库', icon: '📚', skill: 'knowledge_manager' },
  { id: 'memory', label: '记忆', icon: '🧠' },
  { id: 'clipboard', label: '剪贴板', icon: '📋' },
  { id: 'system', label: '系统', icon: '🔧', skill: 'system_tools' },
  { id: 'app', label: '应用', icon: '🖥️' },
];

const RISK_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  read: { label: '只读', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.1)' },
  low_write: { label: '写入', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' },
  system: { label: '系统', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' },
  destructive: { label: '危险', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' },
  external_send: { label: '外部', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.1)' },
};

const ToolsPanel: React.FC = () => {
  const [selectedCat, setSelectedCat] = useState('file');

  const getTools = (catId: string) =>
    Object.entries(TOOLS)
      .filter(([, t]) => (t.category || 'other') === catId)
      .map(([name, t]) => ({
        name,
        desc: t.schema.function.description,
        risk: t.riskLevel,
        readOnly: t.isReadOnly,
        timeout: t.timeoutMs,
      }));

  const selectedCatInfo = CATEGORIES.find((c) => c.id === selectedCat);
  const selectedTools = getTools(selectedCat);
  const selectedSkill = selectedCatInfo?.skill ? SKILLS[selectedCatInfo.skill] : undefined;

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <h1>工具与技能</h1>
        <p>Nova 的能力目录。左侧选分类，右侧查看工具详情。</p>
      </header>

      <div className={styles.layout}>
        {/* 左栏：技能入口 + 分类列表 */}
        <aside className={styles.sidebar}>
          {/* 技能入口 */}
          <div className={styles.skillSection}>
            <h3 className={styles.skillSectionTitle}>技能</h3>
            {Object.entries(SKILLS).map(([key, skill]) => (
              <div key={key} className={styles.skillEntry}>
                <span className={styles.skillDot} />
                <div>
                  <strong>{skill.name}</strong>
                  <p>{skill.description}</p>
                </div>
              </div>
            ))}
          </div>

          {/* 分类列表 */}
          <div className={styles.catSection}>
            <h3 className={styles.skillSectionTitle}>分类</h3>
            {CATEGORIES.map((cat) => {
              const count = getTools(cat.id).length;
              if (count === 0) return null;
              return (
                <button
                  key={cat.id}
                  type="button"
                  className={`${styles.catItem} ${selectedCat === cat.id ? styles.catItemActive : ''}`}
                  onClick={() => setSelectedCat(cat.id)}
                >
                  <span className={styles.catIcon}>{cat.icon}</span>
                  <span className={styles.catLabel}>{cat.label}</span>
                  <span className={styles.catCount}>{count}</span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* 右栏：工具表格 */}
        <main className={styles.detail}>
          <div className={styles.detailHeader}>
            <h2>{selectedCatInfo?.icon} {selectedCatInfo?.label}</h2>
            {selectedSkill && (
              <span className={styles.detailSkill}>技能：{selectedSkill.name}</span>
            )}
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>工具名</th>
                  <th>说明</th>
                  <th>风险</th>
                  <th>只读</th>
                  <th>超时</th>
                  <th>所属技能</th>
                </tr>
              </thead>
              <tbody>
                {selectedTools.map((tool) => {
                  const risk = RISK_CONFIG[tool.risk] || RISK_CONFIG.read;
                  const skillName = selectedCatInfo?.skill || '—';
                  return (
                    <tr key={tool.name}>
                      <td className={styles.cellName}>{tool.name}</td>
                      <td className={styles.cellDesc}>{tool.desc}</td>
                      <td>
                        <span
                          className={styles.riskTag}
                          style={{ color: risk.color, background: risk.bg }}
                        >
                          {risk.label}
                        </span>
                      </td>
                      <td className={styles.cellBool}>{tool.readOnly ? '✓' : ''}</td>
                      <td className={styles.cellTimeout}>{tool.timeout >= 1000 ? `${tool.timeout / 1000}s` : `${tool.timeout}ms`}</td>
                      <td className={styles.cellSkill}>{skillName}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </section>
  );
};

export default ToolsPanel;
