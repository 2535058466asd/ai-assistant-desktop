// ==========================================
// 启源 AI 助手 - 类型定义文件
// 定义四层架构的所有数据结构
// ==========================================

// ==========================================
// 1. 基础类型
// ==========================================

/**
 * 会话 ID 类型
 */
export type SessionId = string;

/**
 * 时间戳类型
 */
export type Timestamp = number;

// ==========================================
// 2. 第 1 层：交互层（Voice Gateway）相关类型
// ==========================================

/**
 * 语音识别状态
 */
export type ASRStatus = 'idle' | 'listening' | 'processing' | 'error';

/**
 * 语音合成状态
 */
export type TTSStatus = 'idle' | 'speaking' | 'error';

/**
 * 交互层状态
 */
export interface VoiceGatewayState {
  asrStatus: ASRStatus;
  ttsStatus: TTSStatus;
  isWakeWordDetected: boolean;
  currentSessionId: SessionId | null;
}

/**
 * 语音识别结果
 */
export interface ASRResult {
  text: string;
  isFinal: boolean;
  confidence: number;
}

/**
 * 语音合成请求
 */
export interface TTSRequest {
  text: string;
  sessionId: SessionId;
}

/**
 * 语音合成结果
 */
export interface TTSResult {
  success: boolean;
  audioUrl?: string;
  error?: string;
}

// ==========================================
// 3. 第 2 层：大脑层（NLP Brain）相关类型
// ==========================================

/**
 * 意图类型
 */
export type Intent =
  | 'CHAT'              // 闲聊、情感交流
  | 'OPEN_APP'          // 打开应用
  | 'OPEN_FOLDER'       // 打开文件夹
  | 'LOCK_SCREEN'       // 锁定屏幕
  | 'ADJUST_VOLUME'     // 调节音量
  | 'MUTE_VOLUME'       // 静音
  | 'CHECK_TIME'        // 查询时间
  | 'PLAY_MUSIC'        // 播放音乐
  | 'SEARCH_WEB'        // 搜索网页
  | 'CHECK_WEATHER'     // 查询天气
  | 'SET_REMINDER'      // 设置提醒
  | 'SHUTDOWN_COMPUTER' // 关机
  | 'RESTART_COMPUTER'  // 重启
  | 'CANCEL_SHUTDOWN'   // 取消关机/重启
  | 'SLEEP_COMPUTER'    // 休眠
  | 'EMPTY_RECYCLE_BIN' // 清空回收站
  | 'UNKNOWN';          // 未知意图

/**
 * 槽位（关键信息）
 */
export interface Slots {
  [key: string]: string | number | boolean | null;
}

/**
 * 单个意图（用于多意图场景）
 */
export interface SingleIntent {
  intent: Intent;
  slots: Slots;
  confidence: number;
  order: number;              // 执行顺序（从1开始）
}

/**
 * 结构化意图对象（大脑层输出）
 * 支持单意图和多意图两种模式
 */
export interface StructuredIntent {
  intent: Intent;             // 主意图（兼容旧版）
  slots: Slots;               // 主槽位（兼容旧版）
  intents?: SingleIntent[];   // 多意图列表（新版）
  sessionId: SessionId;
  needAsk: boolean;           // 是否需要追问
  askQuestion?: string;       // 追问的问题
  confidence: number;         // 主意图置信度
  rawText: string;            // 原始用户文本
  isMultiIntent: boolean;     // 是否为多意图
}

/**
 * 对话上下文
 */
export interface ConversationContext {
  sessionId: SessionId;
  history: Message[];
  currentIntent?: Intent;
  pendingSlots: Slots;        // 待填充的槽位
  lastActiveTime: Timestamp;
}

/**
 * 大脑层状态
 */
export interface BrainState {
  currentContext: ConversationContext | null;
  activeSessions: Map<SessionId, ConversationContext>;
}

// ==========================================
// 4. 第 3 层：清单层（Task Plan）相关类型
// ==========================================

/**
 * 执行步骤
 */
export interface ExecutionStep {
  step: number;               // 步骤序号
  service: string;            // 服务名称
  func: string;               // 方法名称
  params?: Record<string, any>; // 参数
  retryCount: number;         // 重试次数
  maxRetries: number;         // 最大重试次数
  skipOnFailure: boolean;     // 失败时是否跳过
}

/**
 * 执行清单（清单层输出）
 */
export interface ExecutionPlan {
  taskId: string;
  sessionId: SessionId;
  intent: Intent;
  steps: ExecutionStep[];
  responseTemplate: string;   // 回复模板
  failureResponse: string;    // 失败回复
}

/**
 * 意图注册表项
 */
export interface IntentRegistryItem {
  intent: Intent;
  description: string;
  planner: (intent: StructuredIntent) => ExecutionPlan;
  examples: string[];
}

// ==========================================
// 5. 第 4 层：执行层（Task Execute）相关类型
// ==========================================

/**
 * 执行状态
 */
export type ExecutionStatus = 'pending' | 'running' | 'success' | 'failure' | 'skipped';

/**
 * 步骤执行结果
 */
export interface StepResult {
  step: number;
  status: ExecutionStatus;
  result?: any;
  error?: string;
  startTime: Timestamp;
  endTime: Timestamp;
}

/**
 * 执行结果（执行层输出）
 */
export interface ExecutionResult {
  taskId: string;
  sessionId: SessionId;
  status: ExecutionStatus;
  stepResults: StepResult[];
  finalResponse: string;       // 最终回复文本
  startTime: Timestamp;
  endTime: Timestamp;
}

/**
 * 系统控制服务接口
 */
export interface SystemControlService {
  openApp(appName: string): Promise<boolean>;
  closeApp(appName: string): Promise<boolean>;
  listApps(): Promise<string[]>;
}

/**
 * 音乐播放服务接口
 */
export interface MusicService {
  playSong(songName: string, artist?: string): Promise<boolean>;
  pause(): Promise<boolean>;
  resume(): Promise<boolean>;
  stop(): Promise<boolean>;
  setVolume(volume: number): Promise<boolean>;
}

/**
 * 数据存储服务接口
 */
export interface StorageService {
  saveConversation(sessionId: SessionId, messages: Message[]): Promise<void>;
  loadConversation(sessionId: SessionId): Promise<Message[] | null>;
  saveUserPreferences(prefs: UserPreferences): Promise<void>;
  loadUserPreferences(): Promise<UserPreferences | null>;
}

/**
 * 定时任务服务接口
 */
export interface SchedulerService {
  setReminder(time: Date, content: string): Promise<string>;
  cancelReminder(reminderId: string): Promise<boolean>;
  listReminders(): Promise<Reminder[]>;
}

// ==========================================
// 6. 启源人设相关类型
// ==========================================

/**
 * 性格特质
 */
export type PersonalityTrait = '体贴' | '有耐心' | '幽默感' | '积极向上' | '温柔' | '活泼';

/**
 * 性格设定
 */
export interface Personality {
  type: string;
  traits: PersonalityTrait[];
  speechStyle: string;
  emotionalSupport: boolean;
}

/**
 * 用户偏好
 */
export interface UserPreferences {
  musicGenre?: string;
  favoriteArtist?: string;
  wakeWord: string;
  voiceSpeed: number;       // 语速：0.5-2.0
  voicePitch: number;       // 音调：0.5-2.0
  theme: 'light' | 'dark';
}

/**
 * 提醒
 */
export interface Reminder {
  id: string;
  time: Date;
  content: string;
  isCompleted: boolean;
}

/**
 * 启源设定
 */
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

/**
 * 重要日子
 */
export interface ImportantDay {
  date: Date;
  title: string;
  description?: string;
  repeat: 'never' | 'yearly' | 'monthly';
}

// ==========================================
// 7. 消息相关类型
// ==========================================

/**
 * 消息角色
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * 消息
 */
export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Timestamp;
  sessionId: SessionId;
  isTTS?: boolean;          // 是否需要语音合成
  intent?: Intent;           // 关联的意图
}

// ==========================================
// 8. 整体流程类型
// ==========================================

/**
 * 完整的交互请求（从前端到交互层）
 */
export interface InteractionRequest {
  audioData?: Blob;          // 音频数据（可选）
  text?: string;              // 文本（可选，如果直接输入文字）
  sessionId: SessionId;
}

/**
 * 完整的交互响应（从交互层到前端）
 */
export interface InteractionResponse {
  success: boolean;
  message?: Message;          // 回复消息
  audioUrl?: string;          // 语音音频 URL
  error?: string;
}

/**
 * 应用全局状态
 */
export interface AppState {
  voiceGateway: VoiceGatewayState;
  brain: BrainState;
  qiyuanSettings: QiyuanSettings;
  messages: Message[];
  isInitialized: boolean;
}

// ==========================================
// 9. 工具类型
// ==========================================

/**
 * 可取消的 Promise
 */
export interface CancellablePromise<T> extends Promise<T> {
  cancel: () => void;
}

/**
 * 事件回调类型
 */
export type EventCallback<T = any> = (data: T) => void;
