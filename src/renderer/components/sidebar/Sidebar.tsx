/**
 * Sidebar 侧边栏组件
 * 功能：新建对话、搜索对话、切换对话、显示用户信息
 * 
 * 组件结构：
 * - 顶部：新建对话按钮（虚线风格）
 * - 中上：搜索框（带图标）
 * - 中间：对话列表（按时间分组：今天/昨天/更早）
 * - 底部：用户信息 + 设置按钮
 */

import React, { useState, useMemo } from 'react';
import styles from './Sidebar.module.css';
import type {
  ChatItem as ChatItemType,
  ChatGroup,
  UserInfo,
  NewChatHandler,
  SelectChatHandler,
  SearchChatsHandler,
} from '../../types/chat';

/* ==========================================
   组件 Props 类型定义
   ========================================== */
interface SidebarProps {
  /** 对话列表数据 */
  chatGroups: ChatGroup[];
  /** 当前选中的对话 ID */
  activeChatId: string | null;
  /** 用户信息 */
  userInfo: UserInfo;
  /** 是否展开（移动端用） */
  isOpen: boolean;
  /** 新建对话回调 */
  onNewChat: NewChatHandler;
  /** 选择对话回调 */
  onSelectChat: SelectChatHandler;
  /** 搜索对话回调 */
  onSearch: SearchChatsHandler;
  /** 打开设置面板回调 */
  onOpenSettings?: () => void;
}

/* ==========================================
   默认用户信息（兜底数据）
   ========================================== */
const defaultUserInfo: UserInfo = {
  name: 'lzh',
  avatar: 'L',
  plan: '免费版',
};

/**
 * Sidebar 侧边栏组件
 * @param props - 组件属性
 * @returns JSX 侧边栏元素
 */
const Sidebar: React.FC<SidebarProps> = ({
  chatGroups,
  activeChatId,
  userInfo = defaultUserInfo,
  isOpen,
  onNewChat,
  onSelectChat,
  onSearch,
  onOpenSettings,
}) => {
  /* 搜索框输入状态 */
  const [searchKeyword, setSearchKeyword] = useState('');

  /**
   * 处理搜索输入变化
   * 实时调用父组件的搜索回调
   * @param e - React 输入事件
   */
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchKeyword(value);
    onSearch(value);
  };

  /**
   * 分组标签中文映射
   * 将英文标签转为中文显示
   */
  const groupLabelMap: Record<string, string> = {
    today: '今天',
    yesterday: '昨天',
    earlier: '更早',
  };

  return (
    <aside className={`${styles.sidebar} ${!isOpen ? styles.collapsed : ''}`}>
      {/* ===== 1. 头部：新建对话按钮 ===== */}
      <div className={styles.sidebarHeader}>
        <button
          className={styles.newChatBtn}
          onClick={onNewChat}
          title="新建对话"
        >
          {/* 加号图标 SVG */}
          <svg
            className={styles.newChatBtnIcon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          新建对话
        </button>
      </div>

      {/* ===== 2. 搜索区域 ===== */}
      <div className={styles.sidebarSearch}>
        <div className={styles.searchWrapper}>
          {/* 搜索图标（放大镜） */}
          <svg
            className={styles.searchIcon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          {/* 搜索输入框 */}
          <input
            type="text"
            className={styles.searchInput}
            placeholder="搜索对话..."
            value={searchKeyword}
            onChange={handleSearchChange}
          />
        </div>
      </div>

      {/* ===== 3. 对话列表（按时间分组） ===== */}
      <div className={`${styles.chatList} sidebar-scrollbar`}>
        {chatGroups.map((group) => (
          <React.Fragment key={group.label}>
            {/* 分组标签 */}
            <div className={styles.chatGroupLabel}>
              {groupLabelMap[group.label] || group.label}
            </div>
            {/* 该分组下的对话项列表 */}
            {group.items.map((chat) => (
              <button
                key={chat.id}
                className={`${styles.chatItem} ${
                  chat.id === activeChatId ? styles.chatItemActive : ''
                }`}
                onClick={() => onSelectChat(chat.id)}
                title={chat.title}
              >
                {/* 对话图标 emoji */}
                <div className={styles.chatItemIcon}>{chat.icon}</div>
                {/* 对话文字信息 */}
                <div className={styles.chatItemContent}>
                  <div className={styles.chatItemTitle}>{chat.title}</div>
                  <div className={styles.chatItemPreview}>{chat.preview}</div>
                </div>
              </button>
            ))}
          </React.Fragment>
        ))}
      </div>

      {/* ===== 4. 底部：用户信息 + 设置按钮 ===== */}
      <div className={styles.sidebarFooter}>
        {/* 用户头像（渐变圆形，显示首字母） */}
        <div className={styles.userAvatar}>{userInfo.avatar}</div>
        {/* 用户名和套餐 */}
        <div className={styles.userInfo}>
          <div className={styles.userName}>{userInfo.name}</div>
          <div className={styles.userPlan}>{userInfo.plan}</div>
        </div>
        {/* 设置按钮（齿轮图标） */}
        <button
          className={styles.settingsBtn}
          title="设置"
          onClick={onOpenSettings}
        >
          <svg
            className={styles.settingsBtnSvg}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
