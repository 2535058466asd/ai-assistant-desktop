// ==========================================
// 第 4 层：执行层 - 任务执行器
// 负责执行具体的任务步骤，支持多意图连贯执行
// ==========================================

import type { ExecutionPlan, StructuredIntent, SingleIntent, Intent, Slots } from '../../types';
import { sendMessageToDoubao } from '../../services/doubaoApi';
import { getBrainManager } from '../layer2-brain';
import { getQiyuanSystemPrompt } from '../qiyuanSettings';
import { getMemoryService } from '../../services/memoryService';

/**
 * 任务执行器类
 * 负责执行具体的任务，支持单意图和多意图
 */
export class TaskExecutor {
  private brainManager = getBrainManager();
  private memoryService = getMemoryService();

  constructor() {
    console.log('⚙️  执行层初始化成功（支持多意图）');
  }

  /**
   * 执行计划（支持多意图连贯执行）
   * @param plan 执行计划
   * @param intent 结构化意图
   * @param sendMessage 发送消息回调
   */
  async executePlan(
    plan: ExecutionPlan,
    intent: StructuredIntent,
    sendMessage: (content: string) => Promise<void>
  ): Promise<void> {
    try {
      console.log('⚙️  开始执行计划:', plan.taskId);

      // 检查是否为多意图
      if (intent.isMultiIntent && intent.intents && intent.intents.length > 0) {
        console.log('🎯 检测到多意图，开始连贯执行');
        await this.executeMultiIntent(intent.intents, intent.rawText, sendMessage);
        return;
      }

      // 单意图处理（保持原有逻辑）
      await this.executeSingleIntent(plan, intent, sendMessage);

    } catch (error) {
      console.error('❌ 执行计划失败:', error);
      await sendMessage(plan.failureResponse || '执行失败了，请稍后重试～');
    }
  }

  /**
   * 执行多意图（连贯执行，最后统一回复）
   */
  private async executeMultiIntent(
    intents: SingleIntent[],
    rawText: string,
    sendMessage: (content: string) => Promise<void>
  ): Promise<void> {
    console.log('🎯 开始执行多意图，共', intents.length, '个步骤');

    // 先检查用户是否有情绪表达，如果有就先回应
    const hasEmotion = this.checkHasEmotion(rawText);
    if (hasEmotion) {
      await this.respondToEmotion(rawText, sendMessage);
    }

    // 收集所有执行结果
    const results: string[] = [];

    // 按顺序执行每个意图
    for (let i = 0; i < intents.length; i++) {
      const singleIntent = intents[i];
      console.log(`🎯 执行第 ${i + 1}/${intents.length} 个意图:`, singleIntent.intent);

      try {
        // 执行但不发送消息，收集结果
        const result = await this.executeSingleIntentItem(singleIntent);
        if (result) {
          results.push(result);
        }
        
        // 每个步骤之间稍微停顿一下，让体验更好
        if (i < intents.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      } catch (error) {
        console.error(`❌ 第 ${i + 1} 个意图执行失败:`, error);
        results.push(`第 ${i + 1} 步执行失败`);
      }
    }

    // 所有步骤执行完后，统一发送结果
    if (results.length > 0) {
      const finalMessage = results.join('，');
      await sendMessage(`好的，已完成：${finalMessage}😊`);
    }

    console.log('🎯 多意图执行完成');
  }

  /**
   * 执行单个意图项（用于多意图场景，不发送消息，返回结果）
   */
  private async executeSingleIntentItem(
    singleIntent: SingleIntent
  ): Promise<string | null> {
    const { intent, slots } = singleIntent;

    // 构建一个简化的StructuredIntent
    const simpleIntent: StructuredIntent = {
      intent,
      slots,
      sessionId: '',
      needAsk: false,
      confidence: singleIntent.confidence,
      rawText: '',
      isMultiIntent: false
    };

    // 对于闲聊意图
    if (intent === 'CHAT' || intent === 'UNKNOWN') {
      return '好的';
    }

    // 对于查询时间意图
    if (intent === 'CHECK_TIME') {
      const now = new Date();
      const timeStr = now.toLocaleString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit'
      });
      return `现在是${timeStr}`;
    }

    // 对于系统控制意图
    if (['OPEN_APP', 'OPEN_FOLDER', 'LOCK_SCREEN', 'ADJUST_VOLUME', 'MUTE_VOLUME', 
        'SEARCH_WEB', 'SHUTDOWN_COMPUTER', 'RESTART_COMPUTER', 'CANCEL_SHUTDOWN', 
        'SLEEP_COMPUTER', 'EMPTY_RECYCLE_BIN'].includes(intent)) {
      // 执行系统控制，但不发送消息
      const result = await this.handleSystemControlIntentNoMessage(simpleIntent);
      return result;
    }

    return null;
  }

  /**
   * 处理系统控制意图（不发送消息，返回结果）
   */
  private async handleSystemControlIntentNoMessage(
    intent: StructuredIntent
  ): Promise<string> {
    try {
      // 调用后端执行系统控制
      let result: { success: boolean; message: string } | null = null;
      
      switch (intent.intent) {
        case 'OPEN_APP':
          if (window.electronAPI?.systemOpenApp) {
            result = await window.electronAPI.systemOpenApp(intent.slots.appName as string);
          }
          break;
        case 'OPEN_FOLDER':
          if (window.electronAPI?.systemOpenFolder) {
            result = await window.electronAPI.systemOpenFolder(intent.slots.folderName as string);
          }
          break;
        case 'LOCK_SCREEN':
          if (window.electronAPI?.systemLockScreen) {
            result = await window.electronAPI.systemLockScreen();
          }
          break;
        case 'ADJUST_VOLUME':
          if (window.electronAPI?.systemAdjustVolume) {
            result = await window.electronAPI.systemAdjustVolume(
              intent.slots.volume as number | undefined,
              intent.slots.volumeDirection as 'up' | 'down' | undefined
            );
          }
          break;
        case 'MUTE_VOLUME':
          if (window.electronAPI?.systemToggleMute) {
            result = await window.electronAPI.systemToggleMute(
              intent.slots.muteAction as 'mute' | 'unmute' | undefined
            );
          }
          break;
        case 'SEARCH_WEB':
          if (window.electronAPI?.systemSearchWeb) {
            result = await window.electronAPI.systemSearchWeb(intent.slots.query as string);
          }
          break;
        case 'SHUTDOWN_COMPUTER':
          if (window.electronAPI?.systemShutdown) {
            result = await window.electronAPI.systemShutdown();
          }
          break;
        case 'RESTART_COMPUTER':
          if (window.electronAPI?.systemRestart) {
            result = await window.electronAPI.systemRestart();
          }
          break;
        case 'CANCEL_SHUTDOWN':
          if (window.electronAPI?.systemCancelShutdown) {
            result = await window.electronAPI.systemCancelShutdown();
          }
          break;
        case 'SLEEP_COMPUTER':
          if (window.electronAPI?.systemSleep) {
            result = await window.electronAPI.systemSleep();
          }
          break;
        case 'EMPTY_RECYCLE_BIN':
          if (window.electronAPI?.systemEmptyRecycleBin) {
            result = await window.electronAPI.systemEmptyRecycleBin();
          }
          break;
      }

      // 返回简化的结果描述
      if (result) {
        if (result.success) {
          switch (intent.intent) {
            case 'OPEN_APP':
              return `打开${intent.slots.appName}`;
            case 'OPEN_FOLDER':
              return '打开文件夹';
            case 'LOCK_SCREEN':
              return '锁屏';
            case 'ADJUST_VOLUME':
              return intent.slots.volumeDirection === 'up' ? '音量增大' : '音量减小';
            case 'MUTE_VOLUME':
              return intent.slots.muteAction === 'mute' ? '静音' : '取消静音';
            case 'SEARCH_WEB':
              return `搜索${intent.slots.query}`;
            case 'SHUTDOWN_COMPUTER':
              return '关机';
            case 'RESTART_COMPUTER':
              return '重启';
            case 'CANCEL_SHUTDOWN':
              return '取消关机';
            case 'SLEEP_COMPUTER':
              return '休眠';
            case 'EMPTY_RECYCLE_BIN':
              return '清空回收站';
            default:
              return '操作完成';
          }
        } else {
          return '操作失败';
        }
      }

      return '操作完成';
    } catch (error) {
      console.error('❌ 系统控制执行失败:', error);
      return '操作失败';
    }
  }

  /**
   * 执行单意图（原有逻辑）
   */
  private async executeSingleIntent(
    plan: ExecutionPlan,
    intent: StructuredIntent,
    sendMessage: (content: string) => Promise<void>
  ): Promise<void> {
    // 对于闲聊意图，直接调用豆包 API
    if (intent.intent === 'CHAT' || intent.intent === 'UNKNOWN') {
      await this.handleChatIntent(intent.rawText, sendMessage);
      return;
    }

    // 对于查询时间意图
    if (intent.intent === 'CHECK_TIME') {
      const now = new Date();
      const timeStr = now.toLocaleString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit'
      });
      await sendMessage(`现在是${timeStr}哦～`);
      return;
    }

    // 对于系统控制意图
    if (['OPEN_APP', 'OPEN_FOLDER', 'LOCK_SCREEN', 'ADJUST_VOLUME', 'MUTE_VOLUME', 
        'SEARCH_WEB', 'SHUTDOWN_COMPUTER', 'RESTART_COMPUTER', 'CANCEL_SHUTDOWN', 
        'SLEEP_COMPUTER', 'EMPTY_RECYCLE_BIN'].includes(intent.intent)) {
      
      // 先检查用户是否有情绪表达，如果有就先回应
      const hasEmotion = this.checkHasEmotion(intent.rawText);
      if (hasEmotion) {
        await this.respondToEmotion(intent.rawText, sendMessage);
      }
      
      // 然后再执行系统控制
      await this.handleSystemControlIntent(intent, sendMessage);
      return;
    }

    // 其他意图先给个提示
    const response = plan.responseTemplate || '好的，我收到了～';
    await sendMessage(response);
  }

  /**
   * 处理系统控制意图
   */
  private async handleSystemControlIntent(
    intent: StructuredIntent,
    sendMessage: (content: string) => Promise<void>
  ): Promise<void> {
    try {
      // 先发送执行中消息
      let executingMessage = '';
      switch (intent.intent) {
        case 'OPEN_APP':
          executingMessage = `好的，正在打开${intent.slots.appName}～`;
          break;
        case 'OPEN_FOLDER':
          executingMessage = '好的，正在打开文件夹～';
          break;
        case 'LOCK_SCREEN':
          executingMessage = '好的，正在锁定屏幕～';
          break;
        case 'ADJUST_VOLUME':
          if (intent.slots.volume) {
            executingMessage = `好的，正在将音量调至${intent.slots.volume}%～`;
          } else if (intent.slots.volumeDirection === 'up') {
            executingMessage = '好的，正在增大音量～';
          } else {
            executingMessage = '好的，正在减小音量～';
          }
          break;
        case 'MUTE_VOLUME':
          if (intent.slots.muteAction === 'mute') {
            executingMessage = '好的，正在静音～';
          } else if (intent.slots.muteAction === 'unmute') {
            executingMessage = '好的，正在取消静音～';
          } else {
            executingMessage = '好的，正在切换静音状态～';
          }
          break;
        case 'SEARCH_WEB':
          executingMessage = `好的，正在为你搜索"${intent.slots.query}"～`;
          break;
        case 'SHUTDOWN_COMPUTER':
          executingMessage = '好的，电脑将在60秒后关机～';
          break;
        case 'RESTART_COMPUTER':
          executingMessage = '好的，电脑将在60秒后重启～';
          break;
        case 'CANCEL_SHUTDOWN':
          executingMessage = '好的，正在取消关机/重启～';
          break;
        case 'SLEEP_COMPUTER':
          executingMessage = '好的，电脑即将休眠～';
          break;
        case 'EMPTY_RECYCLE_BIN':
          executingMessage = '好的，正在清空回收站～';
          break;
      }
      await sendMessage(executingMessage);

      // 调用后端执行系统控制
      let result: { success: boolean; message: string } | null = null;
      
      switch (intent.intent) {
        case 'OPEN_APP':
          if (window.electronAPI?.systemOpenApp) {
            result = await window.electronAPI.systemOpenApp(intent.slots.appName as string);
          }
          break;
        case 'OPEN_FOLDER':
          if (window.electronAPI?.systemOpenFolder) {
            result = await window.electronAPI.systemOpenFolder(intent.slots.folderName as string);
          }
          break;
        case 'LOCK_SCREEN':
          if (window.electronAPI?.systemLockScreen) {
            result = await window.electronAPI.systemLockScreen();
          }
          break;
        case 'ADJUST_VOLUME':
          if (window.electronAPI?.systemAdjustVolume) {
            result = await window.electronAPI.systemAdjustVolume(
              intent.slots.volume as number | undefined,
              intent.slots.volumeDirection as 'up' | 'down' | undefined
            );
          }
          break;
        case 'MUTE_VOLUME':
          if (window.electronAPI?.systemToggleMute) {
            result = await window.electronAPI.systemToggleMute(
              intent.slots.muteAction as 'mute' | 'unmute' | undefined
            );
          }
          break;
        case 'SEARCH_WEB':
          if (window.electronAPI?.systemSearchWeb) {
            result = await window.electronAPI.systemSearchWeb(intent.slots.query as string);
          }
          break;
        case 'SHUTDOWN_COMPUTER':
          if (window.electronAPI?.systemShutdown) {
            result = await window.electronAPI.systemShutdown();
          }
          break;
        case 'RESTART_COMPUTER':
          if (window.electronAPI?.systemRestart) {
            result = await window.electronAPI.systemRestart();
          }
          break;
        case 'CANCEL_SHUTDOWN':
          if (window.electronAPI?.systemCancelShutdown) {
            result = await window.electronAPI.systemCancelShutdown();
          }
          break;
        case 'SLEEP_COMPUTER':
          if (window.electronAPI?.systemSleep) {
            result = await window.electronAPI.systemSleep();
          }
          break;
        case 'EMPTY_RECYCLE_BIN':
          if (window.electronAPI?.systemEmptyRecycleBin) {
            result = await window.electronAPI.systemEmptyRecycleBin();
          }
          break;
      }

      // 发送执行结果
      if (result) {
        if (result.success) {
          await sendMessage(`✅ ${result.message}`);
        } else {
          await sendMessage(`❌ ${result.message}`);
        }
      } else {
        await sendMessage('❌ 系统控制功能暂不可用');
      }

    } catch (error) {
      console.error('❌ 系统控制执行失败:', error);
      await sendMessage('❌ 执行失败，请稍后重试');
    }
  }

  /**
   * 处理闲聊意图
   */
  private async handleChatIntent(
    rawText: string,
    sendMessage: (content: string) => Promise<void>
  ): Promise<void> {
    try {
      // 获取对话历史
      const history = this.brainManager.getHistoryForLLM(this.brainManager['sessionId'] || '');
      
      // 获取启源的系统提示词
      let systemPrompt = getQiyuanSystemPrompt();

      // 获取用户记忆并添加到系统提示词中
      const memoryPrompt = await this.memoryService.getMemoryPrompt();
      if (memoryPrompt) {
        systemPrompt = `${systemPrompt}\n\n【用户记忆（重要！请务必参考）】\n${memoryPrompt}`;
      }

      // 调用豆包 API
      const response = await sendMessageToDoubao(rawText, history, systemPrompt);

      // 发送回复
      await sendMessage(response);

      // 尝试从对话中提取重要信息并存入记忆
      await this.tryExtractAndSaveMemory(rawText, response);

    } catch (error) {
      console.error('❌ 闲聊处理失败:', error);
      await sendMessage('抱歉，我现在有点累了，等会儿再聊吧～');
    }
  }

  /**
   * 尝试从对话中提取重要信息并存入记忆
   */
  private async tryExtractAndSaveMemory(userText: string, assistantText: string): Promise<void> {
    try {
      // 简单的关键词提取（后续可以用LLM来更智能地提取）
      
      // 提取用户名字
      const nameMatch = userText.match(/我叫(.+)|我的名字是(.+)|我是(.+)/);
      if (nameMatch) {
        const userName = (nameMatch[1] || nameMatch[2] || nameMatch[3]).trim();
        if (userName && userName.length < 20) {
          await this.memoryService.setPreference('userName', userName);
          console.log('📝 已记住用户名字:', userName);
        }
      }

      // 提取用户喜好
      if (userText.includes('我喜欢') || userText.includes('我爱') || userText.includes('我讨厌') || userText.includes('我不喜欢')) {
        await this.memoryService.addMemory(userText, 'preference');
        console.log('📝 已记住用户偏好:', userText);
      }

      // 提取重要信息
      if (userText.includes('记住') || userText.includes('别忘了') || userText.includes('记得')) {
        await this.memoryService.addMemory(userText, 'important');
        console.log('📝 已记住重要信息:', userText);
      }

    } catch (error) {
      console.error('❌ 提取记忆失败:', error);
      // 提取记忆失败不影响聊天，所以不抛出错误
    }
  }

  /**
   * 检查用户是否有情绪表达
   */
  private checkHasEmotion(text: string): boolean {
    const emotionKeywords = [
      '累', '好累', '辛苦', '疲惫', '困', '好困',
      '难过', '伤心', '不开心', '郁闷', '烦', '好烦',
      '开心', '高兴', '快乐', '兴奋', '激动',
      '生气', '愤怒', '郁闷', '沮丧', '失望'
    ];
    
    for (const keyword of emotionKeywords) {
      if (text.includes(keyword)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 回应用户的情绪
   */
  private async respondToEmotion(text: string, sendMessage: (content: string) => Promise<void>): Promise<void> {
    try {
      // 先获取记忆
      const memoryPrompt = await this.memoryService.getMemoryPrompt();
      
      // 构建情绪回应的提示词
      let systemPrompt = `你是一个温暖治愈的AI助手，叫启源。
用户现在说了一句话，里面包含了一些情绪表达。
请先回应用户的情绪，给予关心和安慰，不要直接执行任务。
回复要温柔亲切，用一些可爱的表情符号（😊🥰💪✨等）。
回复不要太长，1-2句话就够了。`;

      if (memoryPrompt) {
        systemPrompt = `${systemPrompt}\n\n【用户记忆】\n${memoryPrompt}`;
      }

      // 调用豆包API生成情绪回应
      const response = await sendMessageToDoubao(text, [], systemPrompt);
      
      // 发送情绪回应
      await sendMessage(response);
      
      // 稍微停顿一下，让用户感觉到关心
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error('❌ 情绪回应失败:', error);
      // 如果失败了也没关系，继续执行任务
    }
  }
}

// 创建单例
let taskExecutorInstance: TaskExecutor | null = null;

export function getTaskExecutor(): TaskExecutor {
  if (!taskExecutorInstance) {
    taskExecutorInstance = new TaskExecutor();
  }
  return taskExecutorInstance;
}
