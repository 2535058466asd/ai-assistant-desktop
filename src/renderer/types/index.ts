// ==========================================
// Nova AI 助手 - 类型定义文件
// 定义核心数据结构
// ==========================================

// ==========================================
// 1. 基础类型
// ==========================================

/** 会话 ID 类型 */
export type SessionId = string;

/** 时间戳类型 */
export type Timestamp = number;

// ==========================================
// 2. 第 1 层：交互层（Voice Gateway）相关类型
// ==========================================

/** 语音识别结果 */
export interface ASRResult {
  text: string;
  isFinal: boolean;
  confidence: number;
}

/** 对话上下文 */
export interface ConversationContext {
  sessionId: SessionId;
  history: Message[];
  lastActiveTime: Timestamp;
}

// ==========================================
// 4. Nova人设相关类型
// ==========================================

/** 性格特质 */
export type PersonalityTrait = '体贴' | '有耐心' | '幽默感' | '积极向上' | '温柔' | '活泼';

/** 性格设定 */
export interface Personality {
  type: string;
  traits: PersonalityTrait[];
  speechStyle: string;
  emotionalSupport: boolean;
}

/** 用户偏好 */
export interface UserPreferences {
  musicGenre?: string;
  favoriteArtist?: string;
  wakeWord: string;
  voiceSpeed: number;
  voicePitch: number;
  theme: 'light' | 'dark';
}

/** 重要日子 */
export interface ImportantDay {
  date: Date;
  title: string;
  description?: string;
  repeat: 'never' | 'yearly' | 'monthly';
}

/** Nova设定 */
export interface QiyuanSettings {
  name: string;
  personality: Personality;
  memories: {
    userPreferences: UserPreferences;
    importantDays: ImportantDay[];
    conversationHistory: Message[];
  };
  welcomeMessage: string;
}

// ==========================================
// 5. 消息相关类型
// ==========================================

/** 消息角色 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/** 工具调用 */
export interface MessageToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/** 消息 */
export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Timestamp;
  sessionId: SessionId;
  isTTS?: boolean;
  isStreaming?: boolean;
  reasoning_content?: string;
  tool_calls?: MessageToolCall[];
  tool_call_id?: string;
}

/** Agent 处理过程分类 */
export type AgentProcessKind = 'analysis' | 'memory' | 'model' | 'tool' | 'response';

/** Agent 处理过程状态 */
export type AgentProcessStatus = 'pending' | 'running' | 'success' | 'error' | 'cancelled';

/** 聊天消息内展示的 Agent 处理过程 */
export interface AgentProcessEvent {
  id: string;
  kind: AgentProcessKind;
  title: string;
  status: AgentProcessStatus;
  detail?: string;
  toolName?: string;
  argsPreview?: string;
  resultPreview?: string;
  durationMs?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** 兼容旧命名：工具执行过程也是 Agent 处理过程的一部分 */
export type ToolProcessStatus = AgentProcessStatus;
export type ToolProcessEvent = AgentProcessEvent;

// ==========================================
// 6. 整体流程类型
// ==========================================

/** 完整的交互请求（从前端到交互层） */
export interface InteractionRequest {
  audioData?: Blob;
  text?: string;
  sessionId: SessionId;
}

/** 完整的交互响应（从交互层到前端） */
export interface InteractionResponse {
  success: boolean;
  message?: Message;
  audioUrl?: string;
  error?: string;
}
