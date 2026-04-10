// ==========================================
// 核心协调器
// 整合四层架构，处理完整的交互流程
// 支持流式输出（打字机效果）
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
import { sendMessageToDoubao, sendMessageToDoubaoStream } from '../services/doubaoApi';
import { getOpenClawBridge } from './openclawBridge';

/**
 * 流式回调接口
 * 用于实现打字机效果
 */
export interface StreamCallbacks {
  /** 流式开始时调用，返回空的消息对象 */
  onStreamStart: (message: Message) => void;
  /** 每收到一个 token 时调用，传入当前累积的完整文本 */
  onStreamChunk: (messageId: string, content: string) => void;
  /** 流式结束时调用 */
  onStreamEnd: (messageId: string) => void;
}

/**
 * 核心协调器类
 */
export class Orchestrator {
  private voiceGateway = getVoiceGatewayManager();
  private brain = getBrainManager();
  private taskPlanner = getTaskPlannerManager();
  private taskExecutor = getTaskExecutorManager();
  private openclawBridge = getOpenClawBridge();
  private sessionId: SessionId;
  private onMessageCallback: ((message: Message) => void) | null = null;
  private streamCallbacks: StreamCallbacks | null = null; // 流式回调
  private isVoiceMode: boolean = false;
  private isOpenClawEnabled: boolean = false;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.initialize();
  }

  /**
   * 初始化所有层
   */
  private async initialize(): Promise<void> {
    console.log('🚀 启源 AI 助手启动中...');
    
    this.voiceGateway.initialize(this.sessionId);
    this.brain.initialize(this.sessionId);
    this.taskPlanner.initialize();

    const openclawAvailable = this.openclawBridge.checkAvailability();
    if (openclawAvailable) {
      this.isOpenClawEnabled = true;
      console.log('✅ OpenClaw 已启用');
      const skills = this.openclawBridge.getAvailableSkills();
      console.log(`📦 OpenClaw 可用工具：${skills.length}个`);
    } else {
      this.isOpenClawEnabled = false;
      console.warn('⚠️ OpenClaw 未启用，使用本地工具');
    }

    // 设置语音消息回调
    this.voiceGateway.onMessage((text) => {
      this.isVoiceMode = true;
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
   * 生成消息 ID
   */
  private generateMessageId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * 处理文本输入（默认使用流式输出）
   * @param text 用户输入的文本
   * @param isTextInput 是否是文字输入（默认为true）
   */
  async processTextInput(text: string, isTextInput: boolean = true): Promise<void> {
    if (!text.trim()) return;

    if (isTextInput) {
      this.isVoiceMode = false;
    }

    console.log('💬 收到用户输入:', text);

    // 1. 创建用户消息并通知 UI
    const userMessage: Message = {
      id: this.generateMessageId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
      sessionId: this.sessionId
    };

    this.brain.addMessage(this.sessionId, userMessage);

    if (this.onMessageCallback) {
      this.onMessageCallback(userMessage);
    }

    try {
      // 2. 大脑层处理 - 意图识别
      const structuredIntent = await this.brain.processInput(text, this.sessionId);

      if (!structuredIntent) {
        await this.sendAssistantMessage('抱歉，我无法理解您的请求，请尝试重新表述。');
        return;
      }

      if (structuredIntent.needAsk && structuredIntent.askQuestion) {
        await this.sendAssistantMessage(structuredIntent.askQuestion);
        return;
      }

      // 3. 清单层 - 创建执行计划
      const executionPlan = this.taskPlanner.createPlan(structuredIntent);

      // 4. 执行计划（使用流式输出）
      await this.executePlanWithStream(executionPlan, structuredIntent);
    } catch (error) {
      console.error('❌ 处理输入失败:', error);
      await this.sendAssistantMessage('处理您的请求时出现错误，请稍后重试。');
    }
  }

  /**
   * 使用流式方式执行计划并输出回复
   */
  private async executePlanWithStream(
    executionPlan: ExecutionPlan,
    structuredIntent: StructuredIntent
  ): Promise<void> {
    // 创建空的助手消息（用于流式显示）
    const messageId = this.generateMessageId();
    let accumulatedContent = '';

    const assistantMessage: Message = {
      id: messageId,
      role: 'assistant',
      content: '', // 初始为空
      timestamp: Date.now(),
      sessionId: this.sessionId,
      isTTS: true,
      isStreaming: true // 标记为流式消息
    };

    // 通知 UI：流式开始
    if (this.streamCallbacks) {
      this.streamCallbacks.onStreamStart(assistantMessage);
    } else if (this.onMessageCallback) {
      // 如果没有设置流式回退到普通回调
      this.onMessageCallback(assistantMessage);
    }

    try {
      // 获取历史消息用于 LLM 调用
      const history = this.brain.getHistory(this.sessionId)
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role, content: m.content }));

      // 使用流式 API 调用豆包
      const systemPrompt = getQiyuanSystemPrompt();
      const userInput = structuredIntent.rawText || '';

      if (!userInput.trim()) {
        throw new Error('空输入');
      }

      for await (const chunk of sendMessageToDoubaoStream(
        userInput,
        history,
        systemPrompt
      )) {
        accumulatedContent += chunk;

        // 通知 UI：收到新的 token
        if (this.streamCallbacks) {
          this.streamCallbacks.onStreamChunk(messageId, accumulatedContent);
        }
      }

      // 流式结束，保存完整消息
      if (!accumulatedContent.trim()) {
        accumulatedContent = '抱歉，我无法生成回复，请稍后重试。';
      }

      assistantMessage.content = accumulatedContent;
      delete (assistantMessage as any).isStreaming; // 移除流式标记
      
      this.brain.addMessage(this.sessionId, {
        ...assistantMessage,
        content: accumulatedContent
      });

      // 通知 UI：流式结束
      if (this.streamCallbacks) {
        this.streamCallbacks.onStreamEnd(messageId);
      }

    } catch (error) {
      console.error('❌ 流式执行失败，尝试非流式模式:', error);
      
      // 通知 UI 流式结束（出错）
      if (this.streamCallbacks) {
        this.streamCallbacks.onStreamEnd(messageId);
      }
      
      // 降级为非流式模式
      try {
        await this.taskExecutor.executePlan(
          executionPlan,
          structuredIntent,
          async (content: string) => {
            await this.sendAssistantMessage(content);
          }
        );
      } catch (execError) {
        console.error('❌ 非流式执行也失败:', execError);
        await this.sendAssistantMessage('处理您的请求时出现错误，请稍后重试。');
      }
    }
  }

  /**
   * 发送助手消息（非流式，用于追问等场景）
   */
  private async sendAssistantMessage(content: string): Promise<void> {
    const assistantMessage: Message = {
      id: this.generateMessageId(),
      role: 'assistant',
      content,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      isTTS: true
    };

    this.brain.addMessage(this.sessionId, assistantMessage);

    if (this.onMessageCallback) {
      this.onMessageCallback(assistantMessage);
    }
  }

  /**
   * 设置普通消息回调（兼容旧版）
   */
  onMessage(callback: (message: Message) => void): void {
    this.onMessageCallback = callback;
  }

  /**
   * 设置流式回调（用于打字机效果）
   */
  onStream(callbacks: StreamCallbacks): void {
    this.streamCallbacks = callbacks;
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

let orchestratorInstance: Orchestrator | null = null;

export function getOrchestrator(): Orchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new Orchestrator();
  }
  return orchestratorInstance;
}
