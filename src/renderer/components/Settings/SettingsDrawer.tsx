import React, { useMemo, useState, useEffect } from 'react';
import styles from './SettingsDrawer.module.css';
import KnowledgePanel from '../Knowledge/KnowledgePanel';
import MemoryPanel from '../Memory/MemoryPanel';
import ToolLogPanel from '../Observability/ToolLogPanel';
import EvalPanel from '../Eval/EvalPanel';
import ModelApiPanel from './ModelApiPanel';
import VoicePanel from './VoicePanel';
import SearchPanel from './SearchPanel';
import ShortcutsPanel from './ShortcutsPanel';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = 'model-api' | 'memory' | 'knowledge' | 'observability' | 'eval' | 'voice' | 'search' | 'shortcuts';

const SettingsDrawer: React.FC<SettingsDrawerProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('model-api');

  useEffect(() => {
    if (isOpen) {
      setActiveTab('model-api');
    }
  }, [isOpen]);

  const tabs: { id: SettingsTab; label: string; icon: string; description: string; section: string }[] = [
    { id: 'model-api', label: '模型与 API', icon: '◎', description: '管理 provider、主模型与 compact 模型', section: '核心能力' },
    { id: 'voice', label: '语音设置', icon: '◉', description: '火山 ASR、TTS 与 MiMo 合成配置', section: '核心能力' },
    { id: 'search', label: '搜索设置', icon: '◇', description: '搜索策略、入口与网络偏好', section: '核心能力' },
    { id: 'memory', label: '记忆管理', icon: '↘', description: '查看、搜索和整理长期记忆', section: '知识系统' },
    { id: 'knowledge', label: '知识库', icon: '▣', description: '导入文档、检索来源并管理片段', section: '知识系统' },
    { id: 'observability', label: 'Agent 日志', icon: '≈', description: '跟踪工具调用、过程日志与输出', section: '运行与诊断' },
    { id: 'eval', label: '评估面板', icon: '✓', description: '跑 eval、看失败点和回归结果', section: '运行与诊断' },
    { id: 'shortcuts', label: '快捷键', icon: '⌘', description: '整理常用操作的快捷键入口', section: '运行与诊断' },
  ];

  const groupedTabs = useMemo(() => {
    return tabs.reduce<Record<string, typeof tabs>>((acc, tab) => {
      acc[tab.section] = acc[tab.section] || [];
      acc[tab.section].push(tab);
      return acc;
    }, {});
  }, []);

  const renderSubpanelContent = () => {
    switch (activeTab) {
      case 'model-api':
        return <ModelApiPanel />;
      case 'memory':
        return <MemoryPanel />;
      case 'knowledge':
        return <KnowledgePanel />;
      case 'observability':
        return <ToolLogPanel />;
      case 'eval':
        return <EvalPanel />;
      case 'voice':
        return <VoicePanel />;
      case 'search':
        return <SearchPanel />;
      case 'shortcuts':
        return <ShortcutsPanel />;
      default:
        return null;
    }
  };

  const activeTabMeta = tabs.find((tab) => tab.id === activeTab);

  return (
    <>
      {isOpen && (
        <div className={styles.overlay} onClick={onClose} />
      )}
      
      <div className={`${styles.drawer} ${isOpen ? styles.open : ''}`}>
        <div className={styles.drawerHeader}>
          <div>
            <p className={styles.drawerEyebrow}>设置</p>
            <h2>设置工作台</h2>
          </div>
          <button className={styles.closeBtn} onClick={onClose} title="关闭">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        
        <div className={styles.drawerBody}>
          <aside className={styles.menuList}>
            {Object.entries(groupedTabs).map(([section, sectionTabs]) => (
              <div key={section} className={styles.menuSection}>
                <div className={styles.menuSectionTitle}>{section}</div>
                {sectionTabs.map((tab) => (
                  <button
                    key={tab.id}
                    className={`${styles.menuItem} ${activeTab === tab.id ? styles.menuItemActive : ''}`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <span className={styles.menuIcon}>{tab.icon}</span>
                    <span className={styles.menuLabelWrap}>
                      <span className={styles.menuLabel}>{tab.label}</span>
                      <span className={styles.menuDescription}>{tab.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </aside>

          <div className={styles.subpanel}>
            <div className={styles.subpanelIntro}>
              <p>{activeTabMeta?.section}</p>
              <h3>{activeTabMeta?.label}</h3>
              <span>{activeTabMeta?.description}</span>
            </div>
            <div className={styles.subpanelContent}>
              {renderSubpanelContent()}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default SettingsDrawer;
