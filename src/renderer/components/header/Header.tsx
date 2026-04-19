/**
 * Header 顶栏组件
 * 功能：品牌展示、侧边栏切换、模型选择器（下拉）、分享、更多菜单
 *
 * 布局结构：
 * - 左侧：侧边栏切换 | Logo | 品牌名「启源 AI」| 模型选择器（可点击展开）
 * - 右侧：分享按钮 | 更多按钮（三点，点击展开菜单）
 */

import React, { useState, useRef, useEffect } from 'react';
import styles from './Header.module.css';
import type {
  ModelOption,
  ModelChangeHandler,
  SidebarToggleHandler,
} from '../../types/chat';

/* ==========================================
   组件 Props 类型定义
   ========================================== */
interface HeaderProps {
  /** 当前选中的模型 */
  currentModel: ModelOption;
  /** 可选模型列表 */
  models: ModelOption[];
  /** 模型切换回调 */
  onModelChange: ModelChangeHandler;
  /** 侧边栏展开/收起回调 */
  onSidebarToggle: SidebarToggleHandler;
  /** 显示 Toast 提示 */
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  /** 当前主题 */
  theme: 'dark' | 'light';
  /** 切换主题回调 */
  onToggleTheme: () => void;
  /** 打开设置回调 */
  onOpenSettings?: () => void;
}

/**
 * Header 顶栏组件
 * @param props - 组件属性
 * @returns JSX 顶栏元素
 */
const Header: React.FC<HeaderProps> = ({
  currentModel,
  models,
  onModelChange,
  onSidebarToggle,
  showToast,
  theme,
  onToggleTheme,
  onOpenSettings,
}) => {
  /* ===== 状态管理 ===== */

  /** 模型选择器下拉是否展开 */
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);

  /** 更多菜单是否展开 */
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  /* ===== Ref 引用 ===== */

  /** 模型下拉容器 ref（用于点击外部关闭）*/
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  /** 更多菜单容器 ref */
  const moreMenuRef = useRef<HTMLDivElement>(null);

  /* ===== 点击外部关闭下拉菜单 ===== */
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
        setModelDropdownOpen(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  /**
   * 切换模型选择器下拉
   */
  const toggleModelDropdown = () => {
    setModelDropdownOpen((prev) => !prev);
    setMoreMenuOpen(false); /* 同时关闭更多菜单 */
  };

  /**
   * 选择某个模型
   */
  const handleSelectModel = (modelId: string) => {
    onModelChange(modelId);
    setModelDropdownOpen(false);
  };

  /**
   * 切换更多菜单
   */
  const toggleMoreMenu = () => {
    setMoreMenuOpen((prev) => !prev);
    setModelDropdownOpen(false); /* 同时关闭模型菜单 */
  };



  /**
   * 更多菜单项：设置
   */
  const handleSettings = () => {
    setMoreMenuOpen(false);
    onOpenSettings?.();
  };

  /**
   * 独立主题切换按钮处理
   */
  const handleThemeBtnClick = () => {
    onToggleTheme();
  };

  return (
    <header className={styles.header}>
      {/* ===== 左侧区域 ===== */}
      <div className={styles.headerLeft}>
        {/* 1. 侧边栏切换按钮 */}
        <button
          className={styles.sidebarToggleBtn}
          onClick={onSidebarToggle}
          title="切换侧边栏"
        >
          <svg
            className={styles.sidebarToggleBtnSvg}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        </button>

        {/* 2. Logo 图标 */}
        <div className={styles.logo} title="Nova">
          <svg
            className={styles.logoSvg}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </div>

        {/* 3. 品牌名称 */}
        <span className={styles.brandName}>Nova</span>

        {/* 4. 模型选择器（带下拉菜单） */}
        <div className={styles.modelSelectorWrapper} ref={modelDropdownRef}>
          <div
            className={styles.modelSelector}
            onClick={toggleModelDropdown}
            title={`当前模型: ${currentModel.name}（点击切换）`}
          >
            <span className={styles.modelDot}></span>
            <span>{currentModel.name}</span>
            <svg
              className={`${styles.modelSelectorArrow} ${modelDropdownOpen ? styles.modelSelectorArrowOpen : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>

          {/* 下拉菜单列表 */}
          {modelDropdownOpen && (
            <div className={styles.modelDropdown}>
              {models.map((model) => (
                <button
                  key={model.id}
                  className={`${styles.modelDropdownItem} ${model.id === currentModel.id ? styles.modelDropdownItemActive : ''}`}
                  onClick={() => handleSelectModel(model.id)}
                >
                  <span className={`${styles.modelDot} ${model.isOnline ? '' : styles.modelDotOffline}`}></span>
                  <span className={styles.modelDropdownItemName}>{model.name}</span>
                  {model.id === currentModel.id && (
                    <svg className={styles.modelCheckIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ===== 右侧区域：操作按钮组 ===== */}
      <div className={styles.headerRight}>
        {/* 主题切换按钮 */}
        <button
          className={styles.themeToggleBtn}
          title={theme === 'dark' ? '切换到亮色主题' : '切换到暗色主题'}
          onClick={handleThemeBtnClick}
        >
          <span className={styles.themeIcon}>{theme === 'dark' ? '☀️' : '🌙'}</span>
        </button>



        {/* 更多按钮 */}
        <div className={styles.moreMenuWrapper} ref={moreMenuRef}>
          <button
            className={styles.headerBtn}
            title="更多"
            onClick={toggleMoreMenu}
          >
            <svg
              className={styles.headerBtnSvg}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="1" />
              <circle cx="19" cy="12" r="1" />
              <circle cx="5" cy="12" r="1" />
            </svg>
          </button>

          {/* 更多菜单下拉 */}
          {moreMenuOpen && (
            <div className={styles.moreMenu}>
              <button className={styles.moreMenuItem} onClick={handleSettings}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                设置
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
