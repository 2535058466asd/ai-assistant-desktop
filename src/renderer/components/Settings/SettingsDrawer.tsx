import React, { useState } from 'react';
import styles from './SettingsDrawer.module.css';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = 'models' | 'api' | 'memory' | 'voice' | 'search' | 'shortcuts' | 'about';

type SettingsView = 'menu' | 'subpanel';

const SettingsDrawer: React.FC<SettingsDrawerProps> = ({ isOpen, onClose }) => {
  const [currentView, setCurrentView] = useState<SettingsView>('menu');
  const [activeTab, setActiveTab] = useState<SettingsTab>('models');

  const tabs: { id: SettingsTab; label: string; icon: string }[] = [
    { id: 'models', label: '模型管理', icon: '🤖' },
    { id: 'api', label: 'API 配置', icon: '🔑' },
    { id: 'memory', label: '记忆管理', icon: '🧠' },
    { id: 'voice', label: '语音设置', icon: '🎤' },
    { id: 'search', label: '搜索设置', icon: '🔍' },
    { id: 'shortcuts', label: '快捷键', icon: '⌨️' },
    { id: 'about', label: '关于', icon: 'ℹ️' },
  ];

  const renderSubpanelContent = () => {
    switch (activeTab) {
      case 'models':
        return (
          <div className={styles.tabContent}>
            <h3>模型管理</h3>
            <p>模型列表展示、添加/删除模型入口</p>
          </div>
        );
      case 'api':
        return (
          <div className={styles.tabContent}>
            <h3>API 配置</h3>
            <p>API Key 输入框（火山引擎）</p>
          </div>
        );
      case 'memory':
        return (
          <div className={styles.tabContent}>
            <h3>记忆管理</h3>
            <p>记忆数量统计、清空记忆按钮</p>
          </div>
        );
      case 'voice':
        return (
          <div className={styles.tabContent}>
            <h3>语音设置</h3>
            <p>ASR/TTS 引擎选择下拉</p>
          </div>
        );
      case 'search':
        return (
          <div className={styles.tabContent}>
            <h3>搜索设置</h3>
            <p>搜索引擎 URL 配置</p>
          </div>
        );
      case 'shortcuts':
        return (
          <div className={styles.tabContent}>
            <h3>快捷键</h3>
            <p>快捷键列表展示</p>
          </div>
        );
      case 'about':
        return (
          <div className={styles.tabContent}>
            <h3>关于 Nova</h3>
            <p>版本信息、更新日志</p>
            <div className={styles.aboutInfo}>
              <p><strong>版本：</strong>1.0.0</p>
              <p><strong>技术栈：</strong>Electron + React + 豆包大模型</p>
            </div>
          </div>
        );
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
