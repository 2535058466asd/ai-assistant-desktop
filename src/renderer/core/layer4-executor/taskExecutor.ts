// ==========================================
// 第 4 层：执行层 - 任务执行器
// 负责执行具体的任务步骤，支持多意图连贯执行
// ==========================================

import type { ExecutionPlan, StructuredIntent, SingleIntent, Intent, Slots } from '../../types';
import { sendMessageToDoubao } from '../../services/doubaoApi';
import { getBrainManager } from '../layer2-brain';
import { getQiyuanSystemPrompt } from '../qiyuanSettings';
import { getMemoryService } from '../../services/memoryService';
import { getOpenClawBridge } from '../openclawBridge';

// 导入新的技能系统
import { initSkills, executeSkill as executeNewSkill } from '../skills';

/**
 * 任务执行器类
 * 负责执行具体的任务，支持单意图和多意图
 */
export class TaskExecutor {
  private brainManager = getBrainManager();
  private memoryService = getMemoryService();
  private openclawBridge = getOpenClawBridge();

  constructor() {
    console.log('⚙️  执行层初始化成功（支持多意图）');
    
    // 初始化技能系统（自动注册所有技能）
    initSkills().catch(error => {
      console.error('❌ 技能系统初始化失败:', error);
    });
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
    if (intent === 'chat' || intent === 'unknown') {
      return '好的';
    }

    // 对于查询时间意图
    if (intent === 'check_time') {
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
    if (['open_app', 'open_folder', 'lock_screen', 'adjust_volume', 'mute_volume', 
        'search_web', 'shutdown_computer', 'restart_computer', 'cancel_shutdown', 
        'sleep_computer', 'empty_recycle_bin'].includes(intent)) {
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
      // 把意图映射到 OpenClaw 工具
      const openclawRequest = this.mapIntentToOpenClawTool(intent);

      if (openclawRequest) {
        // 调用 OpenClaw 工具
        const result = await this.openclawBridge.executeSkill(openclawRequest);

        if (result.success) {
          // 返回简化的结果描述
          switch (intent.intent) {
            case 'open_app':
              return `打开${intent.slots.appName}`;
            case 'open_folder':
              return '打开文件夹';
            case 'lock_screen':
              return '锁屏';
            case 'search_web':
              return `搜索${intent.slots.query}`;
            case 'shutdown_computer':
              return '关机';
            case 'restart_computer':
              return '重启';
            case 'cancel_shutdown':
              return '取消关机';
            case 'sleep_computer':
              return '休眠';
            case 'empty_recycle_bin':
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
    if (intent.intent === 'chat' || intent.intent === 'unknown') {
      await this.handleChatIntent(intent.rawText, sendMessage);
      return;
    }

    // 对于查询时间意图
    if (intent.intent === 'check_time') {
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
    if (['open_app', 'open_folder', 'lock_screen', 'adjust_volume', 'mute_volume', 
        'search_web', 'check_weather', 'shutdown_computer', 'restart_computer', 'cancel_shutdown', 
        'sleep_computer', 'empty_recycle_bin'].includes(intent.intent)) {
      
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
   * 处理系统控制意图（直接调用 Electron 主进程的系统控制）
   */
  private async handleSystemControlIntent(
    intent: StructuredIntent,
    sendMessage: (content: string) => Promise<void>
  ): Promise<void> {
    try {
      // 先发送执行中消息
      let executingMessage = '';
      switch (intent.intent) {
        case 'open_app':
          executingMessage = `好的，正在打开${intent.slots.appName}～`;
          break;
        case 'open_folder':
          executingMessage = '好的，正在打开文件夹～';
          break;
        case 'lock_screen':
          executingMessage = '好的，正在锁定屏幕～';
          break;
        case 'search_web':
          executingMessage = `好的，正在为你搜索"${intent.slots.query}"～`;
          break;
        case 'shutdown_computer':
          executingMessage = '好的，电脑将在 60 秒后关机～';
          break;
        case 'restart_computer':
          executingMessage = '好的，电脑将在 60 秒后重启～';
          break;
        case 'cancel_shutdown':
          executingMessage = '好的，正在取消关机/重启～';
          break;
        case 'sleep_computer':
          executingMessage = '好的，电脑即将休眠～';
          break;
        case 'empty_recycle_bin':
          executingMessage = '好的，正在清空回收站～';
          break;
        case 'check_weather':
          executingMessage = `好的，正在查询${intent.slots.location}的天气～`;
          break;
      }
      await sendMessage(executingMessage);

      // 直接调用 Electron 主进程的系统控制 API
      const result = await this.executeSystemControl(intent);

      console.log('🔍 [DEBUG] handleSystemControlIntent 收到结果:', result);

      if (result.success) {
        console.log('🔍 [DEBUG] 发送成功消息:', result.message);
        await sendMessage(`✅ ${result.message || '操作完成'}`);
      } else {
        console.log('🔍 [DEBUG] 发送失败消息:', result.message);
        await sendMessage(`❌ ${result.message || '操作失败'}`);
      }

    } catch (error) {
      console.error('❌ 系统控制执行失败:', error);
      await sendMessage('❌ 执行失败，请稍后重试');
    }
  }

  /**
   * 执行系统控制（调用 Electron 主进程）
   */
  private async executeSystemControl(intent: StructuredIntent): Promise<{ success: boolean; message: string }> {
    try {
      switch (intent.intent) {
        case 'open_app':
          return await (window as any).electronAPI.systemOpenApp(intent.slots.appName);
        
        case 'open_folder':
          return await (window as any).electronAPI.systemOpenFolder(intent.slots.folderName);
        
        case 'lock_screen':
          return await (window as any).electronAPI.systemLockScreen();
        
        case 'shutdown_computer':
          return await (window as any).electronAPI.systemShutdown();
        
        case 'restart_computer':
          return await (window as any).electronAPI.systemRestart();
        
        case 'cancel_shutdown':
          return await (window as any).electronAPI.systemCancelShutdown();
        
        case 'sleep_computer':
          return await (window as any).electronAPI.systemSleep();
        
        case 'empty_recycle_bin':
          return await (window as any).electronAPI.systemEmptyRecycleBin();
        
        // 使用新的技能系统（搜索网页、查询天气）
        case 'search_web':
        case 'check_weather':
          return await this.executeSkillViaNewSystem(intent);
        
        default:
          return { success: false, message: '不支持的操作' };
      }
    } catch (error) {
      console.error('❌ 系统控制执行失败:', error);
      return { success: false, message: '执行失败' };
    }
  }

  /**
   * 执行 OpenClaw 工具（通过 OpenClaw 桥接层）
   */
  private async executeOpenClawTool(intent: StructuredIntent): Promise<{ success: boolean; message: string }> {
    try {
      console.log('🔧 通过 OpenClaw 执行工具:', intent.intent);

      // 把意图转换为 OpenClaw 工具请求
      const openclawRequest = this.mapIntentToOpenClawTool(intent);

      let result;
      
      if (openclawRequest) {
        // 有 OpenClaw 工具映射，调用 OpenClaw
        console.log('📡 调用 OpenClaw 工具:', openclawRequest.skillId);
        result = await this.openclawBridge.executeSkill(openclawRequest);
      } else {
        // 没有 OpenClaw 工具映射，直接调用本地实现
        console.log('🏠 调用本地实现:', intent.intent);
        
        // 把启源意图名映射到本地工具名
        const localSkillMap: Record<string, string> = {
          'check_weather': 'weather',
          'search_web': 'search_web'
        };
        
        const localSkillId = localSkillMap[intent.intent] || intent.intent;
        const localParams = intent.slots || {};
        
        result = await this.openclawBridge.executeSkill({
          skillId: localSkillId,
          params: localParams
        });
      }

      if (result.success) {
        return { success: true, message: result.data || '操作完成' };
      } else {
        return { success: false, message: result.error || '操作失败' };
      }
    } catch (error: any) {
      console.error('❌ OpenClaw 工具执行失败:', error);
      return { success: false, message: `执行失败：${error.message || '请稍后重试'}` };
    }
  }

  /**
   * 通过新的技能系统执行技能（推荐方式）
   * 
   * 优势：
   * - 不消耗 OpenClaw token
   * - 完全本地化控制
   * - 支持可视化步骤记录
   */
  private async executeSkillViaNewSystem(intent: StructuredIntent): Promise<{ success: boolean; message: string }> {
    try {
      console.log('🚀 通过启源 AI 技能系统执行:', intent.intent);

      // 意图名到技能 ID 的映射
      const intentToSkillMap: Record<string, string> = {
        'search_web': 'search-web',        // 网页搜索（SearXNG）
        'check_weather': 'weather'         // 天气查询（wttr.in）
      };

      const skillId = intentToSkillMap[intent.intent];
      
      if (!skillId) {
        return { success: false, message: `不支持的意图：${intent.intent}` };
      }

      // 准备参数
      let params: Record<string, any> = { ...intent.slots };
      
      // 根据意图类型调整参数
      if (intent.intent === 'search_web') {
        params.query = intent.slots.query || '';
      }
      
      if (intent.intent === 'check_weather') {
        params.location = intent.slots.location || '北京';
      }

      console.log(`📡 调用技能: ${skillId}`, params);

      // 执行技能
      const result = await executeNewSkill(skillId, params);

      console.log('🔍 [DEBUG] executeSkillViaNewSystem 返回结果:', result);

      if (result.success) {
        // 如果有步骤记录，可以用于展示给用户
        if (result.steps && result.steps.length > 0) {
          console.log(`📊 技能执行步骤:`);
          result.steps.forEach((step) => {
            console.log(`   ${step.success ? '✅' : '❌'} [步骤 ${step.stepNumber}] ${step.name} (${Date.now() - step.startTime}ms)`);
          });
        }

        const message = result.data?.message || result.data || '操作完成';
        console.log('🔍 [DEBUG] 准备返回消息:', message);
        
        return { 
          success: true, 
          message: message
        };
      } else {
        console.log('🔍 [DEBUG] 技能执行失败:', result.error);
        return { success: false, message: result.error || '操作失败' };
      }
    } catch (error: any) {
      console.error('❌ 技能系统执行失败:', error);
      return { success: false, message: `执行失败：${error.message || '请稍后重试'}` };
    }
  }

  /**
   * 把意图转换为 OpenClaw 工具请求
   * 启源 AI 意图名 → OpenClaw 工具名 的映射
   */
  private mapIntentToOpenClawTool(intent: StructuredIntent): { skillId: string; params: Record<string, any> } | null {
    // 意图名到 OpenClaw 工具名的映射
    // 注意：只有 OpenClaw 的 tools 可以通过 HTTP API 调用
    // skills 不能通过 HTTP API 调用，需要用本地实现
    // search_web 直接用本地 SearXNG（OpenClaw web_search 需要 API Key）
    const intentToToolMap: Record<string, string> = {
      // 'search_web': 'web_search',  // 暂时不用，需要 Brave API Key
    };

    const skillId = intentToToolMap[intent.intent];
    
    // 如果没有映射，返回 null（表示用本地实现）
    if (!skillId) {
      return null;
    }
    
    // 对于搜索，把 query 参数传给 OpenClaw
    let params = intent.slots || {};
    
    // OpenClaw web_search 工具需要 query 参数
    if (intent.intent === 'search_web' && intent.slots.query) {
      params = { query: intent.slots.query };
    }

    return {
      skillId,
      params
    };
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
