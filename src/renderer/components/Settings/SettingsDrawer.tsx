import React, { useState } from 'react';
import styles from './SettingsDrawer.module.css';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = 'models' | 'api' | 'memory' | 'voice' | 'search' | 'shortcuts' | 'about';

const SettingsDrawer: React.FC<SettingsDrawerProps> = ({ isOpen, onClose }) => {
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

  const renderTabContent = () => {
    switch (activeTab) {
      case 'models':
        return (
          <div className={styles.tabContent}>
            <h3>模型管理</h3>
            <p>模型列表增删排序、默认模型设置</p>
          </div>
        );
      case 'api':
        return (
          <div className={styles.tabContent}>
            <h3>API 配置</h3>
            <p>各平台 API Key 管理</p>
          </div>
        );
      case 'memory':
        return (
          <div className={styles.tabContent}>
            <h3>记忆管理</h3>
            <p>记忆列表查看/搜索/删除/导入导出</p>
          </div>
        );
      case 'voice':
        return (
          <div className={styles.tabContent}>
            <h3>语音设置</h3>
            <p>ASR/TTS 引擎选择、语速、音色</p>
          </div>
        );
      case 'search':
        return (
          <div className={styles.tabContent}>
            <h3>搜索设置</h3>
            <p>搜索引擎配置</p>
          </div>
        );
      case 'shortcuts':
        return (
          <div className={styles.tabContent}>
            <h3>快捷键</h3>
            <p>自定义快捷键</p>
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

  return (
    <>
      {/* 背景遮罩 */}
      {isOpen && (
        <div className={styles.overlay} onClick={onClose} />
      )}
      
      {/* 抽屉面板 */}
      <div className={`${styles.drawer} ${isOpen ? styles.open : ''}`}>
        <div className={styles.drawerHeader}>
          <h2>⚙️ 设置</h2>
          <button className={styles.closeBtn} onClick={onClose} title="关闭">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        
        <div className={styles.drawerBody}>
          {/* 左侧标签栏 */}
          <nav className={styles.tabs}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`${styles.tab} ${activeTab === tab.id ? styles.active : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className={styles.tabIcon}>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
          
          {/* 右侧内容区 */}
          <div className={styles.content}>
            {renderTabContent()}
          </div>
        </div>
      </div>
    </>
  );
};

export default SettingsDrawer;
