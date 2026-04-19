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

import React, { useState, useRef, useEffect } from 'react';
import styles from './Sidebar.module.css';
import type {
  ChatGroup,
  UserInfo,
  NewChatHandler,
  SelectChatHandler,
  SearchChatsHandler,
  RenameChatHandler,
  DeleteChatHandler,
  PinChatHandler,
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
  /** 重命名对话回调 */
  onRenameChat?: RenameChatHandler;
  /** 删除对话回调 */
  onDeleteChat?: DeleteChatHandler;
  /** 置顶对话回调 */
  onPinChat?: PinChatHandler;
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
  onRenameChat,
  onDeleteChat,
  onPinChat,
}) => {
  /* 搜索框输入状态 */
  const [searchKeyword, setSearchKeyword] = useState('');

  /* 右键菜单状态 */
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    x: number;
    y: number;
    chatId: string;
  }>({ isOpen: false, x: 0, y: 0, chatId: '' });

  /* 重命名状态 */
  const [renameMode, setRenameMode] = useState<{
    isActive: boolean;
    chatId: string;
    newTitle: string;
  }>({ isActive: false, chatId: '', newTitle: '' });

  /* 删除确认状态 */
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    chatId: string;
  }>({ isOpen: false, chatId: '' });

  /* 菜单 ref */
  const contextMenuRef = useRef<HTMLDivElement>(null);

  /**
   * 处理搜索输入变化
   */
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchKeyword(value);
    onSearch(value);
  };

  /**
   * 点击外部关闭右键菜单
   */
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu({ isOpen: false, x: 0, y: 0, chatId: '' });
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  /**
   * 处理对话项右键点击
   */
  const handleChatItemContextMenu = (e: React.MouseEvent, chatId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ isOpen: true, x: e.clientX, y: e.clientY, chatId });
  };

  /**
   * 打开三点菜单（与右键菜单共享逻辑）
   */
  const handleMoreClick = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setContextMenu({ isOpen: true, x: rect.left, y: rect.bottom + 4, chatId });
  };

  /**
   * 关闭右键/三点菜单
   */
  const closeContextMenu = () => {
    setContextMenu({ isOpen: false, x: 0, y: 0, chatId: '' });
  };

  /**
   * 处理重命名 - 进入编辑模式
   */
  const handleRename = (chatId: string) => {
    closeContextMenu();
    const chat = chatGroups.flatMap(group => group.items).find(c => c.id === chatId);
    if (chat) {
      setRenameMode({ isActive: true, chatId, newTitle: chat.title });
    }
  };

  /**
   * 处理置顶
   */
  const handlePin = (chatId: string) => {
    closeContextMenu();
    onPinChat?.(chatId);
  };

  /**
   * 处理删除 - 弹出确认框
   */
  const handleDelete = (chatId: string) => {
    closeContextMenu();
    setDeleteConfirm({ isOpen: true, chatId });
  };

  /**
   * 确认删除
   */
  const confirmDelete = () => {
    const chatId = deleteConfirm.chatId;
    setDeleteConfirm({ isOpen: false, chatId: '' });
    onDeleteChat?.(chatId);
  };

  /**
   * 取消删除
   */
  const cancelDelete = () => {
    setDeleteConfirm({ isOpen: false, chatId: '' });
  };

  /**
   * 保存重命名
   */
  const saveRename = () => {
    const { chatId, newTitle } = renameMode;
    if (newTitle.trim()) {
      onRenameChat?.(chatId, newTitle.trim());
    }
    setRenameMode({ isActive: false, chatId: '', newTitle: '' });
  };

  /**
   * 取消重命名
   */
  const cancelRename = () => {
    setRenameMode({ isActive: false, chatId: '', newTitle: '' });
  };

  /**
   * 分组标签中文映射
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
          <svg className={styles.newChatBtnIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          新建对话
        </button>
      </div>

      {/* ===== 2. 搜索区域 ===== */}
      <div className={styles.sidebarSearch}>
        <div className={styles.searchWrapper}>
          <svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
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
            <div className={styles.chatGroupLabel}>
              {groupLabelMap[group.label] || group.label}
            </div>
            {group.items.map((chat) => (
              <div key={chat.id}>
                {renameMode.isActive && renameMode.chatId === chat.id ? (
                  <div className={styles.chatItemRename}>
                    <div className={styles.chatItemIcon}>{chat.icon}</div>
                    <div className={styles.chatItemContent}>
                      <input
                        type="text"
                        className={styles.renameInput}
                        value={renameMode.newTitle}
                        onChange={(e) => setRenameMode(prev => ({ ...prev, newTitle: e.target.value }))}
                        onKeyPress={(e) => e.key === 'Enter' && saveRename()}
                        onBlur={saveRename}
                        autoFocus
                      />
                    </div>
                    <div className={styles.renameActions}>
                      <button className={styles.renameSave} onClick={saveRename}>✓</button>
                      <button className={styles.renameCancel} onClick={cancelRename}>✕</button>
                    </div>
                  </div>
                ) : (
                  <button
                    className={`${styles.chatItem} ${
                      chat.id === activeChatId ? styles.chatItemActive : ''
                    }`}
                    onClick={() => onSelectChat(chat.id)}
                    onContextMenu={(e) => handleChatItemContextMenu(e, chat.id)}
                    title={chat.title}
                  >
                    <div className={styles.chatItemIcon}>{chat.icon}</div>
                    <div className={styles.chatItemContent}>
                      <div className={styles.chatItemTitle}>
                        {chat.isPinned && <span style={{ marginRight: 4 }}>📌</span>}
                        {chat.title}
                      </div>
                      <div className={styles.chatItemPreview}>{chat.preview}</div>
                    </div>
                    {/* 三点按钮 */}
                    <div
                      className={styles.chatItemMore}
                      onClick={(e) => handleMoreClick(e, chat.id)}
                      title="更多操作"
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                        <circle cx="12" cy="5" r="1.5" />
                        <circle cx="12" cy="12" r="1.5" />
                        <circle cx="12" cy="19" r="1.5" />
                      </svg>
                    </div>
                  </button>
                )}
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>

      {/* ===== 4. 底部：用户信息 ===== */}
      <div className={styles.sidebarFooter}>
        <div className={styles.userAvatar}>{userInfo.avatar}</div>
        <div className={styles.userInfo}>
          <div className={styles.userName}>{userInfo.name}</div>
          <div className={styles.userPlan}>{userInfo.plan}</div>
        </div>
      </div>

      {/* ===== 右键/三点菜单 ===== */}
      {contextMenu.isOpen && (
        <div
          ref={contextMenuRef}
          className={styles.contextMenu}
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
        >
          <button className={styles.contextMenuItem} onClick={() => handleRename(contextMenu.chatId)}>
            重命名
          </button>
          <button className={styles.contextMenuItem} onClick={() => handlePin(contextMenu.chatId)}>
            {chatGroups.flatMap(g => g.items).find(c => c.id === contextMenu.chatId)?.isPinned ? '取消置顶' : '置顶'}
          </button>
          <button className={styles.contextMenuItemDelete} onClick={() => handleDelete(contextMenu.chatId)}>
            删除
          </button>
        </div>
      )}

      {/* ===== 删除确认弹窗 ===== */}
      {deleteConfirm.isOpen && (
        <div className={styles.deleteConfirmOverlay}>
          <div className={styles.deleteConfirmDialog}>
            <h3>确认删除</h3>
            <p>确定要删除这个对话吗？此操作无法撤销。</p>
            <div className={styles.deleteConfirmActions}>
              <button className={styles.deleteConfirmCancel} onClick={cancelDelete}>取消</button>
              <button className={styles.deleteConfirmDelete} onClick={confirmDelete}>删除</button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
