/**
 * 聊天界面专用类型定义
 * 定义侧边栏、对话列表、模型选择等 UI 相关数据结构
 */

import type { AgentProcessEvent, ToolProcessEvent, ToolCallSummary } from './index';

// ==========================================
// 1. 对话/会话相关类型
// ==========================================

/** 对话项 - 侧边栏中显示的单个对话 */
export interface ChatItem {
  /** 唯一标识 */
  id: string;
  /** 对话标题 */
  title: string;
  /** 预览文本（最后一条消息摘要） */
  preview: string;
  /** 图标 emoji */
  icon: string;
  /** 创建时间戳 */
  createdAt: number;
  /** 最后更新时间戳 */
  updatedAt: number;
  /** 是否为当前激活的对话 */
  isActive?: boolean;
  /** 是否置顶 */
  isPinned?: boolean;
}

/** 对话分组标签（今天、昨天、更早） */
export type ChatGroupLabel = 'today' | 'yesterday' | 'earlier';

/** 带分组的对话列表 */
export interface ChatGroup {
  /** 分组标签 */
  label: ChatGroupLabel;
  /** 该分组下的对话列表 */
  items: ChatItem[];
}

// ==========================================
// 2. 模型相关类型
// ==========================================

/** 可用的 AI 模型选项 */
export interface ModelOption {
  /** 模型标识符 */
  id: string;
  /** 显示名称 */
  name: string;
  /** 是否在线可用 */
  isOnline: boolean;
}

// ==========================================
// 3. 消息 UI 扩展类型
// ==========================================

/** 消息在 UI 中的展示状态 */
export type MessageStatus = 'sending' | 'sent' | 'error';

/** UI 消息 - 继承基础 Message 类型，增加 UI 所需字段 */
export interface UIMessage {
  /** 基础消息 ID */
  id: string;
  /** 消息角色 */
  role: 'user' | 'assistant' | 'system';
  /** 消息内容（支持 HTML 或纯文本） */
  content: string;
  /** 时间戳 */
  timestamp: number;
  /** 发送状态（用户消息专用） */
  status?: MessageStatus;
  /** 是否正在流式输出（打字机效果） */
  isStreaming?: boolean;
  /** 这条助手消息关联的 Agent 处理过程 */
  processEvents?: AgentProcessEvent[];
  /** 兼容旧字段：这条助手消息关联的工具执行过程 */
  toolEvents?: ToolProcessEvent[];
  /** 推理内容（模型的思考过程） */
  reasoningContent?: string;
  /** 工具调用摘要列表 */
  toolCallSummary?: ToolCallSummary[];
  /** 分段的推理内容（按工具调用轮次） */
  reasoningSegments?: Array<{ round: number; content: string; timestamp: number }>;
  /** Token 用量 */
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  /** 使用的模型 */
  model?: string;
}

// ==========================================
// 4. 侧边栏状态类型
// ==========================================

/** 侧边栏用户信息 */
export interface UserInfo {
  /** 用户名 */
  name: string;
  /** 头像字母 */
  avatar: string;
  /** 套餐等级 */
  plan: string;
}

// ==========================================
// 7. 组件回调函数类型
// ==========================================

/** 发送消息回调 */
export type SendMessageHandler = (content: string) => Promise<void>;

/** 新建对话回调 */
export type NewChatHandler = () => void;

/** 切换对话回调 */
export type SelectChatHandler = (chatId: string) => void;

/** 搜索对话回调 */
export type SearchChatsHandler = (keyword: string) => void;

/** 重命名对话回调 */
export type RenameChatHandler = (chatId: string, newTitle: string) => void;

/** 删除对话回调 */
export type DeleteChatHandler = (chatId: string) => void;

/** 置顶对话回调 */
export type PinChatHandler = (chatId: string) => void;

/** 模型切换回调 */
export type ModelChangeHandler = (modelId: string) => void;

/** 侧边栏切换回调 */
export type SidebarToggleHandler = () => void;
