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
  /** 语音对话模式是否开启 */
  isVoiceChatEnabled?: boolean;
  /** 切换语音对话模式回调 */
  onToggleVoiceChat?: () => void;
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
  isVoiceChatEnabled = false,
  onToggleVoiceChat,
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
    const selected = models.find(m => m.id === modelId);
    showToast(`已切换到 ${selected?.name || modelId}`, 'success');
  };

  /**
   * 切换更多菜单
   */
  const toggleMoreMenu = () => {
    setMoreMenuOpen((prev) => !prev);
    setModelDropdownOpen(false); /* 同时关闭模型菜单 */
  };

  /**
   * 处理分享按钮点击
   * 尝试复制当前页面 URL 到剪贴板
   */
  const handleShare = async () => {
    try {
      if (navigator.clipboard && window.location.href) {
        await navigator.clipboard.writeText(window.location.href);
        showToast('已复制链接到剪贴板', 'success');
      } else {
        showToast('您的浏览器不支持自动复制', 'error');
      }
    } catch {
      showToast('复制失败，请手动复制地址栏链接', 'error');
    }
  };

  /**
   * 更多菜单项：设置
   */
  const handleSettings = () => {
    setMoreMenuOpen(false);
    showToast('设置面板开发中...', 'info');
  };

  /**
   * 更多菜单项：关于
   */
  const handleAbout = () => {
    setMoreMenuOpen(false);
    showToast('启源 AI v1.0.0 - 基于 Electron + React + 豆包大模型', 'info');
  };

  /**
   * 更多菜单项：切换主题
   */
  const handleToggleTheme = () => {
    setMoreMenuOpen(false);
    onToggleTheme();
    showToast(`已切换到${theme === 'dark' ? '☀️ 亮色' : '🌙 暗色'}主题`, 'success');
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
        <div className={styles.logo} title="启源 AI">
          <svg
            className={styles.logoSvg}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        </div>

        {/* 3. 品牌名称 */}
        <span className={styles.brandName}>启源 AI</span>

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
        {/* 分享按钮 */}
        <button
          className={styles.headerBtn}
          title="分享对话"
          onClick={handleShare}
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
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
        </button>

        {/* 语音对话模式开关按钮 */}
        {onToggleVoiceChat && (
          <button
            className={`${styles.headerBtn} ${isVoiceChatEnabled ? styles.voiceChatActive : ''}`}
            title={isVoiceChatEnabled ? '关闭语音对话模式' : '开启语音对话模式'}
            onClick={onToggleVoiceChat}
          >
            {isVoiceChatEnabled ? (
              <svg
                className={styles.headerBtnSvg}
                viewBox="0 0 24 24"
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
                <circle cx="18" cy="6" r="3" fill="var(--accent-blue)" stroke="none" />
              </svg>
            ) : (
              <svg
                className={styles.headerBtnSvg}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
          </button>
        )}

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
              <button className={styles.moreMenuItem} onClick={handleToggleTheme}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {theme === 'dark' ? (
                    <>
                      <circle cx="12" cy="12" r="5"/>
                      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                    </>
                  ) : (
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                  )}
                </svg>
                {theme === 'dark' ? '切换到亮色' : '切换到暗色'}
              </button>
              <button className={styles.moreMenuItem} onClick={handleAbout}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                关于启源
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
