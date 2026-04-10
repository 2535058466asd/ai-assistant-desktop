// ==========================================
// 第 2 层：大脑层整合入口
// 语义理解中枢，只负责 "听懂用户想干嘛"
// ==========================================

export { IntentClassifier, getIntentClassifier } from './intentClassifier';
export { ContextManager, getContextManager } from './contextManager';

import type { StructuredIntent, Message, SessionId } from '../../types';
import { getIntentClassifier } from './intentClassifier';
import { getContextManager } from './contextManager';

/**
 * 大脑层管理器
 * 协调意图分类和上下文管理
 */
export class BrainManager {
  private intentClassifier = getIntentClassifier();
  private contextManager = getContextManager();

  /**
   * 初始化大脑层
   */
  initialize(sessionId: SessionId): void {
    this.contextManager.getOrCreateContext(sessionId);
    console.log('🧠 大脑层已初始化，会话 ID:', sessionId);
  }

  /**
   * 处理用户输入，返回结构化意图（异步版）
   */
  async processInput(text: string, sessionId: SessionId): Promise<StructuredIntent> {
    // 1. 检查是否有正在进行的任务
    const hasPendingTask = this.contextManager.hasPendingTask(sessionId);
    
    if (hasPendingTask) {
      // 如果有正在进行的任务，继续处理
      return await this.continuePendingTask(text, sessionId);
    }

    // 2. 否则，进行新的意图识别（使用LLM）
    const structuredIntent = await this.intentClassifier.analyze(text, sessionId);

    // 3. 更新上下文
    this.contextManager.setCurrentIntent(sessionId, structuredIntent.intent);
    
    if (structuredIntent.needAsk) {
      // 如果需要追问，保存待填充的槽位
      this.contextManager.setPendingSlots(sessionId, structuredIntent.slots);
    } else {
      // 否则，清除待填充槽位
      this.contextManager.clearPendingSlots(sessionId);
    }

    console.log('🧠 意图识别结果:', {
      intent: structuredIntent.intent,
      slots: structuredIntent.slots,
      confidence: structuredIntent.confidence
    });

    return structuredIntent;
  }

  /**
   * 继续处理待完成的任务
   */
  private async continuePendingTask(text: string, sessionId: SessionId): Promise<StructuredIntent> {
    const currentIntent = this.contextManager.getCurrentIntent(sessionId);
    const pendingSlots = this.contextManager.getPendingSlots(sessionId);

    if (!currentIntent) {
      // 如果没有当前意图，重新分析
      return await this.intentClassifier.analyze(text, sessionId);
    }

    // 简单处理：把用户输入当作槽位值补充
    // 实际项目中可以用更智能的方式
    const newSlots = { ...pendingSlots };
    
    // 根据意图类型补充槽位
    switch (currentIntent) {
      case 'open_app':
        newSlots.appName = text;
        break;
      case 'open_folder':
        newSlots.folderName = text;
        break;
      case 'search_web':
        newSlots.query = text;
        break;
      case 'adjust_volume':
        // 尝试提取音量
        const volumeMatch = text.match(/(\d{1,3})%?/);
        if (volumeMatch) {
          newSlots.volume = Math.max(0, Math.min(100, parseInt(volumeMatch[1])));
        } else if (text.includes('大') || text.includes('增加')) {
          newSlots.volumeDirection = 'up';
        } else if (text.includes('小') || text.includes('减小')) {
          newSlots.volumeDirection = 'down';
        }
        break;
    }

    const mergedSlots = this.contextManager.mergeSlots(sessionId, newSlots);

    // 检查是否还需要追问
    const needAsk = this.checkNeedMoreInfo(currentIntent, mergedSlots);

    if (!needAsk) {
      // 信息足够了，清除待填充槽位
      this.contextManager.clearPendingSlots(sessionId);
    }

    return {
      intent: currentIntent,
      slots: mergedSlots,
      sessionId,
      needAsk,
      askQuestion: needAsk ? this.generateAskQuestion(currentIntent, mergedSlots) : undefined,
      confidence: 1.0,
      rawText: text,
      isMultiIntent: false
    };
  }

  /**
   * 检查是否还需要更多信息
   */
  private checkNeedMoreInfo(intent: string, slots: any): boolean {
    switch (intent) {
      case 'OPEN_APP':
        return !slots.appName;
      case 'OPEN_FOLDER':
        return !slots.folderName;
      case 'ADJUST_VOLUME':
        return !slots.volume && !slots.volumeDirection;
      case 'SEARCH_WEB':
        return !slots.query;
      default:
        return false;
    }
  }

  /**
   * 生成追问问题
   */
  private generateAskQuestion(intent: string, slots: any): string {
    switch (intent) {
      case 'OPEN_APP':
        return '你想打开哪个应用呢？';
      case 'OPEN_FOLDER':
        return '你想打开哪个文件夹呢？（桌面/文档/下载/图片/音乐/视频）';
      case 'ADJUST_VOLUME':
        return '你想把音量调到多少呢？（例如：音量调到50%）';
      case 'SEARCH_WEB':
        return '你想搜索什么呢？';
      default:
        return '我需要更多信息才能帮到你~';
    }
  }

  /**
   * 添加消息到历史
   */
  addMessage(sessionId: SessionId, message: Message): void {
    this.contextManager.addMessage(sessionId, message);
  }

  /**
   * 获取对话历史
   */
  getHistory(sessionId: SessionId): Message[] {
    return this.contextManager.getHistory(sessionId);
  }

  /**
   * 获取用于 LLM 的历史格式
   */
  getHistoryForLLM(sessionId: SessionId): Array<{ role: string; content: string }> {
    return this.contextManager.formatHistoryForLLM(sessionId);
  }

  /**
   * 重置会话
   */
  resetSession(sessionId: SessionId): void {
    this.contextManager.resetContext(sessionId);
    console.log('🧠 会话已重置');
  }

  /**
   * 清除会话
   */
  clearSession(sessionId: SessionId): void {
    this.contextManager.clearContext(sessionId);
    console.log('🧠 会话已清除');
  }
}

// 创建单例
let brainManagerInstance: BrainManager | null = null;

export function getBrainManager(): BrainManager {
  if (!brainManagerInstance) {
    brainManagerInstance = new BrainManager();
  }
  return brainManagerInstance;
}
