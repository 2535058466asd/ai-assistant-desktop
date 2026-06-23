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
export interface NovaSettings {
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

/** 已保存到 Nova 本地目录的图片附件。聊天历史只保存引用，不保存 Base64。 */
export interface ImageAttachment {
  id: string;
  type: 'image';
  name: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  sizeBytes: number;
  relativePath: string;
}

/** 输入框中的临时图片。发送成功后会转换为 ImageAttachment。 */
export interface PendingImageAttachment {
  id: string;
  type: 'image';
  name: string;
  mimeType: ImageAttachment['mimeType'];
  sizeBytes: number;
  dataUrl: string;
}

/** 所有已保存附件的联合类型 */
export type Attachment = ImageAttachment;

/** 所有待发送附件的联合类型 */
export type PendingAttachment = PendingImageAttachment;

/** 工具调用摘要（给 UI 展示用） */
export interface ToolCallSummary {
  name: string;
  argsPreview: string;
  resultPreview: string;
  durationMs: number;
  status: 'success' | 'error';
}

/** 消息 */
export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  attachments?: Attachment[];
  timestamp: Timestamp;
  sessionId: SessionId;
  /** AgentLoop 内部上下文消息。需要归档给模型恢复，但不允许展示为聊天气泡。 */
  isInternal?: boolean;
  isTTS?: boolean;
  isStreaming?: boolean;
  reasoning_content?: string;
  tool_calls?: MessageToolCall[];
  tool_call_id?: string;
  // 简化后的思考面板数据
  reasoningContent?: string;
  toolCallSummary?: ToolCallSummary[];
  // 分段的推理内容（按工具调用轮次）
  reasoningSegments?: Array<{ round: number; content: string; timestamp: number }>;
  // Token 用量
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  // 使用的模型
  model?: string;
  // Agent 循环总耗时（毫秒），从开始回复到完成
  durationMs?: number;
  // 调试链路 ID，仅用于日志排查，不进入模型上下文
  traceId?: string;
}

/** SQLite 原始存档消息：保留完整字段，不能直接当模型上下文使用。 */
export type ArchiveMessage = Message;

/** 聊天展示消息：只面向 UI，可包含折叠后的工具摘要。 */
export type DisplayMessage = Message;

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
  error?: string;
  toolName?: string;
  toolCallId?: string;
  argsPreview?: string;
  resultPreview?: string;
  durationMs?: number;
  traceId?: string;
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
