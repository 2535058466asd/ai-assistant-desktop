// ==========================================
// 第 3 层：清单层 - 意图注册表
// 定义每个意图对应的执行步骤
// ==========================================

import type { StructuredIntent, ExecutionPlan, Intent } from '../../types';

/**
 * 意图注册表
 */
export class IntentRegistry {
  private planners: Map<Intent, (intent: StructuredIntent) => ExecutionPlan> = new Map();

  constructor() {
    this.initializePlanners();
  }

  /**
   * 初始化意图规划器
   */
  private initializePlanners(): void {
    // 闲聊意图 - 直接调用 LLM
    this.planners.set('CHAT', (intent) => ({
      taskId: this.generateTaskId(),
      sessionId: intent.sessionId,
      intent: intent.intent,
      steps: [
        {
          step: 1,
          service: 'chatService',
          func: 'generateChatResponse',
          params: { rawText: intent.rawText },
          retryCount: 0,
          maxRetries: 2,
          skipOnFailure: false
        }
      ],
      responseTemplate: '', // LLM 直接生成回复
      failureResponse: '抱歉，我现在有点累了，等会儿再聊吧~'
    }));

    // 播放音乐意图
    this.planners.set('PLAY_MUSIC', (intent) => ({
      taskId: this.generateTaskId(),
      sessionId: intent.sessionId,
      intent: intent.intent,
      steps: [
        {
          step: 1,
          service: 'musicService',
          func: 'playSong',
          params: {
            songName: intent.slots.songName,
            artist: intent.slots.artist
          },
          retryCount: 0,
          maxRetries: 2,
          skipOnFailure: false
        }
      ],
      responseTemplate: `好的，为你播放${intent.slots.songName ? intent.slots.songName : '音乐'}～🎵`,
      failureResponse: '抱歉，播放音乐失败了，请稍后再试~'
    }));

    // 打开应用意图
    this.planners.set('OPEN_APP', (intent) => ({
      taskId: this.generateTaskId(),
      sessionId: intent.sessionId,
      intent: intent.intent,
      steps: [
        {
          step: 1,
          service: 'systemService',
          func: 'openApp',
          params: { appName: intent.slots.appName },
          retryCount: 0,
          maxRetries: 2,
          skipOnFailure: false
        }
      ],
      responseTemplate: `好的，正在打开${intent.slots.appName}～`,
      failureResponse: `抱歉，找不到${intent.slots.appName}这个应用~`
    }));

    // 打开文件夹意图
    this.planners.set('OPEN_FOLDER', (intent) => ({
      taskId: this.generateTaskId(),
      sessionId: intent.sessionId,
      intent: intent.intent,
      steps: [
        {
          step: 1,
          service: 'systemService',
          func: 'openFolder',
          params: { folderName: intent.slots.folderName },
          retryCount: 0,
          maxRetries: 2,
          skipOnFailure: false
        }
      ],
      responseTemplate: `好的，正在打开文件夹～`,
      failureResponse: '抱歉，打开文件夹失败了~'
    }));

    // 锁定屏幕意图
    this.planners.set('LOCK_SCREEN', (intent) => ({
      taskId: this.generateTaskId(),
      sessionId: intent.sessionId,
      intent: intent.intent,
      steps: [
        {
          step: 1,
          service: 'systemService',
          func: 'lockScreen',
          params: {},
          retryCount: 0,
          maxRetries: 1,
          skipOnFailure: false
        }
      ],
      responseTemplate: '好的，正在锁定屏幕～',
      failureResponse: '抱歉，锁定屏幕失败了~'
    }));

    // 暂时禁用：调节音量意图
    // this.planners.set('ADJUST_VOLUME', (intent) => ({
    //   taskId: this.generateTaskId(),
    //   sessionId: intent.sessionId,
    //   intent: intent.intent,
    //   steps: [
    //     {
    //       step: 1,
    //       service: 'systemService',
    //       func: 'adjustVolume',
    //       params: { 
    //         volume: intent.slots.volume, 
    //         direction: intent.slots.volumeDirection 
    //       },
    //       retryCount: 0,
    //       maxRetries: 2,
    //       skipOnFailure: false
    //     }
    //   ],
    //   responseTemplate: intent.slots.volume 
    //     ? `好的，正在将音量调至${intent.slots.volume}%～`
    //     : intent.slots.volumeDirection === 'up'
    //     ? '好的，正在增大音量～'
    //     : '好的，正在减小音量～',
    //   failureResponse: '抱歉，调节音量失败了~'
    // }));

    // 暂时禁用：静音意图
    // this.planners.set('MUTE_VOLUME', (intent) => ({
    //   taskId: this.generateTaskId(),
    //   sessionId: intent.sessionId,
    //   intent: intent.intent,
    //   steps: [
    //     {
    //       step: 1,
    //       service: 'systemService',
    //       func: 'toggleMute',
    //       params: { action: intent.slots.muteAction },
    //       retryCount: 0,
    //       maxRetries: 2,
    //       skipOnFailure: false
    //     }
    //   ],
    //   responseTemplate: intent.slots.muteAction === 'mute' 
    //     ? '好的，正在静音～' 
    //     : intent.slots.muteAction === 'unmute'
    //     ? '好的，正在取消静音～'
    //     : '好的，正在切换静音状态～',
    //   failureResponse: '抱歉，切换静音失败了~'
    // }));

    // 查询时间意图
    this.planners.set('CHECK_TIME', (intent) => ({
      taskId: this.generateTaskId(),
      sessionId: intent.sessionId,
      intent: intent.intent,
      steps: [
        {
          step: 1,
          service: 'systemService',
          func: 'getCurrentTime',
          params: {},
          retryCount: 0,
          maxRetries: 1,
          skipOnFailure: false
        }
      ],
      responseTemplate: '', // 动态生成
      failureResponse: '抱歉，查询时间失败了~'
    }));

    // 搜索网页意图
    this.planners.set('SEARCH_WEB', (intent) => ({
      taskId: this.generateTaskId(),
      sessionId: intent.sessionId,
      intent: intent.intent,
      steps: [
        {
          step: 1,
          service: 'systemService',
          func: 'searchWeb',
          params: { query: intent.slots.query },
          retryCount: 0,
          maxRetries: 2,
          skipOnFailure: false
        }
      ],
      responseTemplate: `好的，正在为你搜索"${intent.slots.query}"～`,
      failureResponse: '抱歉，搜索失败了，请稍后再试~'
    }));

    // 关机意图
    this.planners.set('SHUTDOWN_COMPUTER', (intent) => ({
      taskId: this.generateTaskId(),
      sessionId: intent.sessionId,
      intent: intent.intent,
      steps: [
        {
          step: 1,
          service: 'systemService',
          func: 'shutdownComputer',
          params: {},
          retryCount: 0,
          maxRetries: 1,
          skipOnFailure: false
        }
      ],
      responseTemplate: '好的，电脑将在60秒后关机～',
      failureResponse: '抱歉，关机失败了，请稍后再试~'
    }));

    // 重启意图
    this.planners.set('RESTART_COMPUTER', (intent) => ({
      taskId: this.generateTaskId(),
      sessionId: intent.sessionId,
      intent: intent.intent,
      steps: [
        {
          step: 1,
          service: 'systemService',
          func: 'restartComputer',
          params: {},
          retryCount: 0,
          maxRetries: 1,
          skipOnFailure: false
        }
      ],
      responseTemplate: '好的，电脑将在60秒后重启～',
      failureResponse: '抱歉，重启失败了，请稍后再试~'
    }));

    // 取消关机意图
    this.planners.set('CANCEL_SHUTDOWN', (intent) => ({
      taskId: this.generateTaskId(),
      sessionId: intent.sessionId,
      intent: intent.intent,
      steps: [
        {
          step: 1,
          service: 'systemService',
          func: 'cancelShutdown',
          params: {},
          retryCount: 0,
          maxRetries: 1,
          skipOnFailure: false
        }
      ],
      responseTemplate: '好的，已取消关机/重启～',
      failureResponse: '抱歉，取消失败了，请稍后再试~'
    }));

    // 休眠意图
    this.planners.set('SLEEP_COMPUTER', (intent) => ({
      taskId: this.generateTaskId(),
      sessionId: intent.sessionId,
      intent: intent.intent,
      steps: [
        {
          step: 1,
          service: 'systemService',
          func: 'sleepComputer',
          params: {},
          retryCount: 0,
          maxRetries: 1,
          skipOnFailure: false
        }
      ],
      responseTemplate: '好的，电脑即将休眠～',
      failureResponse: '抱歉，休眠失败了，请稍后再试~'
    }));

    // 清空回收站意图
    this.planners.set('EMPTY_RECYCLE_BIN', (intent) => ({
      taskId: this.generateTaskId(),
      sessionId: intent.sessionId,
      intent: intent.intent,
      steps: [
        {
          step: 1,
          service: 'systemService',
          func: 'emptyRecycleBin',
          params: {},
          retryCount: 0,
          maxRetries: 1,
          skipOnFailure: false
        }
      ],
      responseTemplate: '好的，正在清空回收站～',
      failureResponse: '抱歉，清空回收站失败了，请稍后再试~'
    }));

    // 默认处理（未知意图当闲聊处理）
    this.planners.set('UNKNOWN', (intent) => ({
      taskId: this.generateTaskId(),
      sessionId: intent.sessionId,
      intent: 'CHAT',
      steps: [
        {
          step: 1,
          service: 'chatService',
          func: 'generateChatResponse',
          params: { rawText: intent.rawText },
          retryCount: 0,
          maxRetries: 2,
          skipOnFailure: false
        }
      ],
      responseTemplate: '',
      failureResponse: '抱歉，我没听懂你说什么~'
    }));
  }

  /**
   * 获取执行计划
   */
  getPlan(intent: StructuredIntent): ExecutionPlan {
    const planner = this.planners.get(intent.intent) || this.planners.get('UNKNOWN');
    if (!planner) {
      throw new Error('No planner found for intent: ' + intent.intent);
    }
    return planner(intent);
  }

  /**
   * 注册自定义规划器
   */
  registerPlanner(intent: Intent, planner: (intent: StructuredIntent) => ExecutionPlan): void {
    this.planners.set(intent, planner);
  }

  /**
   * 生成任务 ID
   */
  private generateTaskId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}

// 创建单例
let intentRegistryInstance: IntentRegistry | null = null;

export function getIntentRegistry(): IntentRegistry {
  if (!intentRegistryInstance) {
    intentRegistryInstance = new IntentRegistry();
  }
  return intentRegistryInstance;
}
