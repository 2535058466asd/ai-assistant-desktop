import React, { useState } from 'react';
import { Activity, Coins, type LucideIcon } from 'lucide-react';
import ToolDetailPanel from '../Workspace/ToolDetailPanel';
import CostDetailPanel from '../Workspace/CostDetailPanel';
import styles from './RuntimePanel.module.css';

type RuntimeTab = 'tools' | 'cost';

const tabs: Array<{
  id: RuntimeTab;
  label: string;
  desc: string;
  icon: LucideIcon;
}> = [
  { id: 'tools', label: '工具调用', desc: '成功失败、慢调用、调用排行和工具日志', icon: Activity },
  { id: 'cost', label: '费用 Token', desc: '模型请求、Token 消耗、费用趋势和成本排行', icon: Coins },
];

const RuntimePanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<RuntimeTab>('tools');
  const active = tabs.find((tab) => tab.id === activeTab) || tabs[0];
  const ActiveIcon = active.icon;

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <span className={styles.titleIcon}><ActiveIcon size={18} /></span>
          <div>
            <h2>运行</h2>
            <p>{active.desc}</p>
          </div>
        </div>
        <div className={styles.tabs} role="tablist" aria-label="运行分析分类">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
                onClick={() => setActiveTab(tab.id)}
                type="button"
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>
      <div className={styles.content}>
        {activeTab === 'tools' ? <ToolDetailPanel /> : <CostDetailPanel />}
      </div>
    </section>
  );
};

export default RuntimePanel;
