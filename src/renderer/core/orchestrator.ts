// ==========================================
// 核心协调器
// 整合四层架构，处理完整的交互流程
// ==========================================

import type {
  Message,
  SessionId,
  StructuredIntent,
  ExecutionPlan
} from '../types';

import { getVoiceGatewayManager } from './layer1-gateway';
import { getBrainManager } from './layer2-brain';
import { getTaskPlannerManager } from './layer3-planner';
import { getTaskExecutorManager } from './layer4-executor';
import { getQiyuanSystemPrompt, DEFAULT_QIYUAN_SETTINGS } from './qiyuanSettings';
import { sendMessageToDoubao } from '../services/doubaoApi';

/**
 * 核心协调器类
 */
export class Orchestrator {
  private voiceGateway = getVoiceGatewayManager();
  private brain = getBrainManager();
  private taskPlanner = getTaskPlannerManager();
  private taskExecutor = getTaskExecutorManager();
  private sessionId: SessionId;
  private onMessageCallback: ((message: Message) => void) | null = null;
  private isVoiceMode: boolean = false; // 标记当前是否是语音模式

  constructor() {
    this.sessionId = this.generateSessionId();
    this.initialize();
  }

  /**
   * 初始化所有层
   */
  private initialize(): void {
    console.log('🚀 启源 AI 助手启动中...');
    
    this.voiceGateway.initialize(this.sessionId);
    this.brain.initialize(this.sessionId);
    this.taskPlanner.initialize();

    // 设置语音消息回调
    this.voiceGateway.onMessage((text) => {
      this.isVoiceMode = true; // 标记为语音模式
      this.processTextInput(text);
    });

    console.log('✅ 启源 AI 助手启动完成！');
  }

  /**
   * 生成会话 ID
   */
  private generateSessionId(): SessionId {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * 处理文本输入
   * @param text 用户输入的文本
   * @param isTextInput 是否是文字输入（默认为true）
   */
  async processTextInput(text: string, isTextInput: boolean = true): Promise<void> {
    if (!text.trim()) return;

    // 如果是文字输入，确保不是语音模式
    if (isTextInput) {
      this.isVoiceMode = false;
    }

    console.log('💬 收到用户输入:', text);

    // 1. 创建用户消息
    const userMessage: Message = {
      id: this.generateMessageId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
      sessionId: this.sessionId
    };

    // 添加到历史
    this.brain.addMessage(this.sessionId, userMessage);

    // 通知 UI
    if (this.onMessageCallback) {
      this.onMessageCallback(userMessage);
    }

    // 2. 大脑层处理 - 意图识别（使用LLM，异步）
    const structuredIntent = await this.brain.processInput(text, this.sessionId);

    // 如果需要追问，直接回复
    if (structuredIntent.needAsk && structuredIntent.askQuestion) {
      await this.sendAssistantMessage(structuredIntent.askQuestion);
      return;
    }

    // 3. 清单层 - 创建执行计划
    const executionPlan = this.taskPlanner.createPlan(structuredIntent);

    // 4. 执行层 - 执行计划
    await this.taskExecutor.executePlan(
      executionPlan, 
      structuredIntent,
      async (content: string) => {
        await this.sendAssistantMessage(content);
      }
    );
  }

  /**
   * 发送助手消息
   */
  private async sendAssistantMessage(content: string): Promise<void> {
    const assistantMessage: Message = {
      id: this.generateMessageId(),
      role: 'assistant',
      content,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      isTTS: true // 总是标记为TTS，让启源总是说话
    };

    // 添加到历史
    this.brain.addMessage(this.sessionId, assistantMessage);

    // 通知 UI
    if (this.onMessageCallback) {
      this.onMessageCallback(assistantMessage);
    }

    // 暂时禁用TTS，纯文字聊天
    // try {
    //   await this.voiceGateway.speak(content);
    // } catch (error) {
    //   console.error('❌ 语音合成失败:', error);
    //   // 语音合成失败不影响文字显示，所以不抛出错误
    // }
  }

  /**
   * 生成消息 ID
   */
  private generateMessageId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * 设置消息回调
   */
  onMessage(callback: (message: Message) => void): void {
    this.onMessageCallback = callback;
  }

  /**
   * 开始语音监听
   */
  async startVoiceListening(): Promise<boolean> {
    return this.voiceGateway.startListening();
  }

  /**
   * 停止语音监听
   */
  stopVoiceListening(): void {
    this.voiceGateway.stopListening();
  }

  /**
   * 手动唤醒
   */
  wakeUp(): void {
    this.voiceGateway.wakeUp();
  }

  /**
   * 获取欢迎消息
   */
  getWelcomeMessage(): string {
    return DEFAULT_QIYUAN_SETTINGS.welcomeMessage;
  }

  /**
   * 获取历史消息
   */
  getHistory(): Message[] {
    return this.brain.getHistory(this.sessionId);
  }
}

// 创建单例
let orchestratorInstance: Orchestrator | null = null;

export function getOrchestrator(): Orchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new Orchestrator();
  }
  return orchestratorInstance;
}
