import React, { useState, useEffect } from 'react';
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

type SettingsView = 'menu' | 'subpanel';

const SettingsDrawer: React.FC<SettingsDrawerProps> = ({ isOpen, onClose }) => {
  const [currentView, setCurrentView] = useState<SettingsView>('menu');
  const [activeTab, setActiveTab] = useState<SettingsTab>('model-api');

  // 每次打开设置时重置状态到主菜单
  useEffect(() => {
    if (isOpen) {
      setCurrentView('menu');
      setActiveTab('model-api');
    }
  }, [isOpen]);

  const tabs: { id: SettingsTab; label: string; icon: string }[] = [
    { id: 'model-api', label: '模型与 API', icon: '🤖' },
    { id: 'memory', label: '记忆管理', icon: '🧠' },
    { id: 'knowledge', label: '知识库', icon: '📚' },
    { id: 'observability', label: 'Agent 日志', icon: '📈' },
    { id: 'eval', label: '评估面板', icon: '✅' },
    { id: 'voice', label: '语音设置', icon: '🎤' },
    { id: 'search', label: '搜索设置', icon: '🔍' },
    { id: 'shortcuts', label: '快捷键', icon: '⌨️' },
  ];

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

  const handleTabClick = (tabId: SettingsTab) => {
    setActiveTab(tabId);
    setCurrentView('subpanel');
  };

  const handleBack = () => {
    setCurrentView('menu');
  };

  return (
    <>
      {/* 背景遮罩 */}
      {isOpen && (
        <div className={styles.overlay} onClick={onClose} />
      )}
      
      {/* 抽屉面板 */}
      <div className={`${styles.drawer} ${isOpen ? styles.open : ''}`}>
        {/* 标题栏 */}
        <div className={styles.drawerHeader}>
          {currentView === 'menu' ? (
            <h2>⚙️ 设置</h2>
          ) : (
            <div className={styles.subpanelHeader}>
              <button className={styles.backBtn} onClick={handleBack} title="返回">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
              </button>
              <h3>{tabs.find(tab => tab.id === activeTab)?.label}</h3>
            </div>
          )}
          <button className={styles.closeBtn} onClick={onClose} title="关闭">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        
        {/* 内容区 */}
        <div className={styles.drawerBody}>
          {currentView === 'menu' ? (
            /* 一级菜单列表 */
            <div className={styles.menuList}>
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  className={styles.menuItem}
                  onClick={() => handleTabClick(tab.id)}
                >
                  <span className={styles.menuIcon}>{tab.icon}</span>
                  <span className={styles.menuLabel}>{tab.label}</span>
                  <span className={styles.menuArrow}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            /* 二级子面板 */
            <div className={styles.subpanel}>
              {renderSubpanelContent()}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default SettingsDrawer;
