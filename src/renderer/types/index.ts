// ==========================================
// 启源 AI 助手 - 类型定义文件
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
// 4. 启源人设相关类型
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

/** 启源设定 */
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
export type MessageRole = 'user' | 'assistant' | 'system';

/** 消息 */
export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Timestamp;
  sessionId: SessionId;
  isTTS?: boolean;
  isStreaming?: boolean;
}

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
