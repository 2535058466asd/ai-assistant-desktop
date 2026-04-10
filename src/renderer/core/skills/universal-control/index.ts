/**
 * 技能：通用应用控制
 * 
 * 功能：统一的应用控制接口（打开、关闭、控制）
 * 特点：不是硬编码每个应用，而是通过通用协议控制
 * 
 * 设计理念：
 * - 不为每个应用写单独的代码
 * - 通过标准化的 action + params 控制
 * - 支持 Windows 系统级 API 和应用特定 API
 */

import {
  SkillDefinition,
  SkillResult,
  SkillExecutionStep
} from '../types';

// ============================================================
// SKILL.md 文档（按 OpenClaw 规范）
// ============================================================

/**
 * ---
 * name: universal-app-control
 * description: |
 *   通用应用控制。可以打开、关闭、控制任意应用程序。
 *   Triggers: "打开XX", "启动XX", "关闭XX", "播放XX", "暂停", "调大音量"
 *   Does NOT trigger:
 *   - 用户想要搜索信息（用 search-web/search-browser）
 *   - 用户想要查询天气（用 weather）
 *   Output: 应用执行相应操作
 * version: 2.0.0
 * author: 启源 AI
 * tags: [system, app, control, universal]
 * user-invocable: true
 * allowed-tools: []  // 直接调用 Electron API，不需要工具
 * metadata: {
 *   "emoji": "🎮",
 *   "pattern": "universal-controller",
 *   "category": "system-control",
 *   "userFacing": true,
 *   "isUniversal": true  // 标记为通用技能
 * }
 * ---
 * 
 * # 通用应用控制
 * 
 * **Pattern: Universal Controller**
 * 
 * ## 核心概念
 * 
 * 不是为每个应用写代码，而是提供**统一的控制接口**：
 * 
 * ```
 * 用户输入 → 意图识别 → 提取 (action, target, params) → 执行
 * ```
 * 
 * ## 支持的操作类型
 * 
 * ### 1. 应用生命周期
 * | Action | 说明 | 示例 |
 * |--------|------|------|
 * | `open` | 打开应用 | "打开QQ"、"启动浏览器" |
 * | `close` | 关闭应用 | "关闭QQ"、"关掉记事本" |
 * | `switch` | 切换到应用 | "切换到微信" |
 * | `restart` | 重启应用 | "重启浏览器" |
 * 
 * ### 2. 媒体控制
 * | Action | 说明 | 示例 |
 * |--------|------|------|
 * | `play` | 播放 | "播放音乐"、"放首歌" |
 * | `pause` | 暂停 | "暂停一下" |
 * | `stop` | 停止 | "停止播放" |
 * | `next` | 下一首 | "下一首" |
 * | `prev` | 上一首 | "上一首" |
 * | `volume-up` | 音量+ | "大声点"、"调大音量" |
 * | `volume-down` | 音量- | "小声点" |
 * | `mute` | 静音 | "静音" |
 * 
 * ### 3. 系统控制
 * | Action | 说明 | 示例 |
 * |--------|------|------|
 * | `lock-screen` | 锁屏 | "锁屏"、"锁定电脑" |
 * | `shutdown` | 关机 | "关机" |
 * | `restart` | 重启 | "重启电脑" |
 * | `sleep` | 休眠 | "休眠" |
 * | `screenshot` | 截图 | "截个屏" |
 * 
 * ### 4. 文件/文件夹
 * | Action | 说明 | 示例 |
 * |--------|------|------|
 * | `open-folder` | 打开文件夹 | "打开桌面"、"打开下载文件夹" |
 * | `create-file` | 创建文件 | "新建文档"、"创建txt" |
 * | `delete-file` | 删除文件 | "删除这个文件" |
 * 
 * ## 参数说明
 * 
 * ```typescript
 * {
 *   action: string,        // 操作类型（必填）
 *   target?: string,        // 目标对象（应用名/文件名等）
 *   params?: {              // 额外参数
 *     query?: string,       // 搜索关键词（如歌曲名）
 *     volume?: number,      // 音量值
 *     path?: string,        // 文件路径
 *     appName?: string      // 应用名称
 *   }
 * }
 * ```
 * 
 * ## Examples
 * 
 * ### Example 1: 打开应用
 * ```json
 * {
 *   "action": "open",
 *   "target": "QQ"
 * }
 * ```
 * 用户说："打开 QQ"
 * 
 * ### Example 2: 播放音乐
 * ```json
 * {
 *   "action": "play",
 *   "target": "music",
 *   "params": { "query": "周杰伦" }
 * }
 * ```
 * 用户说："播放周杰伦的歌"
 * 
 * ### Example 3: 调整音量
 * ```json
 * {
 *   "action": "volume-up",
 *   "params": { "volume": 20 }
 * }
 * ```
 * 用户说："把声音调大点"
 * 
 * ### Example 4: 打开文件夹
 * ```json
 * {
 *   "action": "open-folder",
 *   "target": "desktop"
 * }
 * ```
 * 用户说："打开桌面"
 * 
 * ## Error Handling
 * | Error | Cause | Fix |
 * |-------|-------|-----|
 * | 应用未找到 | 应用未安装或名称错误 | 尝试模糊匹配或提示用户 |
 * | 权限不足 | 需要管理员权限 | 提示用户确认 |
 * | 操作失败 | 应用不支持该操作 | 返回错误信息并建议替代方案 |
 */

// ============================================================
// 辅助处理函数（独立于技能对象）
// ============================================================

/**
 * 处理打开应用
 */
async function handleOpen(appName: string, api: any): Promise<any> {
  if (!appName) {
    return { success: false, message: '请指定要打开的应用名称' };
  }
  
  try {
    const result = await api.systemOpenApp(appName);
    return {
      success: result.success,
      message: result.message || `正在打开 ${appName}...`
    };
  } catch (error: any) {
    return {
      success: false,
      message: `打开 ${appName} 失败：${error.message}`
    };
  }
}

/**
 * 处理关闭应用
 */
async function handleClose(appName: string, api: any): Promise<any> {
  if (!appName) {
    return { success: false, message: '请指定要关闭的应用名称' };
  }
  
  try {
    const result = await api.systemCloseApp?.(appName) 
      || { success: false, message: `暂不支持关闭 ${appName}` };
    return result;
  } catch (error: any) {
    return {
      success: false,
      message: `关闭 ${appName} 失败：${error.message}`
    };
  }
}

/**
 * 处理播放媒体
 */
async function handlePlay(target: string, params: any, api: any): Promise<any> {
  const query = params?.query || target || '';
  
  try {
    // 如果有搜索词，尝试播放指定内容
    if (query && api.systemPlayMedia) {
      const result = await api.systemPlayMedia(query);
      return {
        success: true,
        message: `正在播放: ${query}`
      };
    }
    
    // 否则发送全局播放命令
    if (api.systemMediaControl) {
      const result = await api.systemMediaControl('play');
      return {
        success: true,
        message: query ? `正在播放: ${query}` : '继续播放'
      };
    }
    
    return {
      success: false,
      message: '当前环境不支持媒体控制'
    };
  } catch (error: any) {
    return {
      success: false,
      message: `播放失败：${error.message}`
    };
  }
}

/**
 * 处理暂停播放
 */
async function handlePause(api: any): Promise<any> {
  try {
    if (api.systemMediaControl) {
      const result = await api.systemMediaControl('pause');
      return { success: true, message: '已暂停' };
    }
    return { success: false, message: '当前环境不支持媒体控制' };
  } catch (error: any) {
    return { success: false, message: `暂停失败：${error.message}` };
  }
}

/**
 * 处理停止播放
 */
async function handleStop(api: any): Promise<any> {
  try {
    if (api.systemMediaControl) {
      const result = await api.systemMediaControl('stop');
      return { success: true, message: '已停止播放' };
    }
    return { success: false, message: '当前环境不支持媒体控制' };
  } catch (error: any) {
    return { success: false, message: `停止失败：${error.message}` };
  }
}

/**
 * 处理下一首
 */
async function handleNext(api: any): Promise<any> {
  try {
    if (api.systemMediaControl) {
      const result = await api.systemMediaControl('next');
      return { success: true, message: '下一首' };
    }
    return { success: false, message: '当前环境不支持媒体控制' };
  } catch (error: any) {
    return { success: false, message: `切换失败：${error.message}` };
  }
}

/**
 * 处理上一首
 */
async function handlePrev(api: any): Promise<any> {
  try {
    if (api.systemMediaControl) {
      const result = await api.systemMediaControl('prev');
      return { success: true, message: '上一首' };
    }
    return { success: false, message: '当前环境不支持媒体控制' };
  } catch (error: any) {
    return { success: false, message: `切换失败：${error.message}` };
  }
}

/**
 * 处理调大音量
 */
async function handleVolumeUp(delta: number, api: any): Promise<any> {
  try {
    const volume = delta || 10;
    if (api.systemAdjustVolume) {
      const result = await api.systemAdjustVolume(volume);
      return { success: true, message: `音量已增加 ${volume}%` };
    }
    return { success: false, message: '当前环境不支持音量调节' };
  } catch (error: any) {
    return { success: false, message: `调节音量失败：${error.message}` };
  }
}

/**
 * 处理调小音量
 */
async function handleVolumeDown(delta: number, api: any): Promise<any> {
  try {
    const volume = -(delta || 10);
    if (api.systemAdjustVolume) {
      const result = await api.systemAdjustVolume(volume);
      return { success: true, message: `音量已减小 ${Math.abs(volume)}%` };
    }
    return { success: false, message: '当前环境不支持音量调节' };
  } catch (error: any) {
    return { success: false, message: `调节音量失败：${error.message}` };
  }
}

/**
 * 处理静音
 */
async function handleMute(api: any): Promise<any> {
  try {
    if (api.systemMute) {
      const result = await api.systemMute();
      return { success: true, message: '已静音' };
    }
    return { success: false, message: '当前环境不支持静音' };
  } catch (error: any) {
    return { success: false, message: `静音失败：${error.message}` };
  }
}

/**
 * 处理锁屏
 */
async function handleLockScreen(api: any): Promise<any> {
  try {
    const result = await api.systemLockScreen();
    return {
      success: true,
      message: '屏幕已锁定'
    };
  } catch (error: any) {
    return {
      success: false,
      message: `锁屏失败：${error.message}`
    };
  }
}

/**
 * 处理关机
 */
async function handleShutdown(api: any): Promise<any> {
  try {
    const result = await api.systemShutdown();
    return {
      success: true,
      message: '电脑将在 60 秒后关机（可取消）'
    };
  } catch (error: any) {
    return {
      success: false,
      message: `关机失败：${error.message}`
    };
  }
}

/**
 * 处理重启
 */
async function handleRestart(api: any): Promise<any> {
  try {
    const result = await api.systemRestart();
    return {
      success: true,
      message: '电脑将在 60 秒后重启（可取消）'
    };
  } catch (error: any) {
    return {
      success: false,
      message: `重启失败：${error.message}`
    };
  }
}

/**
 * 处理休眠
 */
async function handleSleep(api: any): Promise<any> {
  try {
    const result = await api.systemSleep();
    return {
      success: true,
      message: '电脑即将休眠'
    };
  } catch (error: any) {
    return {
      success: false,
      message: `休眠失败：${error.message}`
    };
  }
}

/**
 * 处理截图
 */
async function handleScreenshot(api: any): Promise<any> {
  try {
    const result = await api.systemScreenshot?.()
      || { success: false, data: null, message: '截图功能不可用' };
    
    if (result.success && result.data) {
      return {
        success: true,
        message: '截图成功',
        screenshotPath: result.data
      };
    }
    return result;
  } catch (error: any) {
    return {
      success: false,
      message: `截图失败：${error.message}`
    };
  }
}

/**
 * 处理打开文件夹
 */
async function handleOpenFolder(folderName: string, api: any): Promise<any> {
  if (!folderName) {
    return { success: false, message: '请指定要打开的文件夹' };
  }
  
  try {
    const result = await api.systemOpenFolder(folderName);
    return {
      success: result.success,
      message: result.message || `正在打开 ${folderName} 文件夹...`
    };
  } catch (error: any) {
    return {
      success: false,
      message: `打开文件夹失败：${error.message}`
    };
  }
}

/**
 * 获取操作的中文名称
 */
function getActionName(action: string): string {
  const names: Record<string, string> = {
    'open': '打开应用',
    'close': '关闭应用',
    'play': '播放',
    'pause': '暂停',
    'stop': '停止',
    'next': '下一首',
    'prev': '上一首',
    'volume-up': '调大音量',
    'volume-down': '调小音量',
    'mute': '静音',
    'lock-screen': '锁屏',
    'shutdown': '关机',
    'restart': '重启',
    'sleep': '休眠',
    'screenshot': '截图',
    'open-folder': '打开文件夹'
  };
  return names[action] || action;
}

/**
 * 获取操作的描述文本
 */
function getDescription(action: string, target?: string, params?: any): string {
  switch (action) {
    case 'open':
      return `打开 ${target || '应用'}`;
    case 'close':
      return `关闭 ${target || '应用'}`;
    case 'play':
      return params?.query ? `播放: ${params.query}` : '播放';
    case 'pause':
      return '暂停播放';
    case 'volume-up':
      return `音量 +${params?.volume || 10}%`;
    case 'volume-down':
      return `音量 -${params?.volume || 10}%`;
    case 'open-folder':
      return `打开 ${target || '文件夹'}`;
    default:
      return `${getActionName(action)} ${target || ''}`;
  }
}

// ============================================================
// 技能实现
// ============================================================

export const universalControlSkill: SkillDefinition = {
  metadata: {
    name: 'universal-app-control',
    description: '通用应用控制。支持打开/关闭/控制任意应用、媒体控制、系统操作、文件管理。Triggers: "打开XX", "播放XX", "暂停", "调大音量", "锁屏"。Output: 执行相应操作',
    version: '2.0.0',
    author: '启源 AI',
    tags: ['system', 'app', 'control', 'universal'],
    userInvocable: true,
    allowedTools: [],
    metadata: {
      emoji: '🎮',
      pattern: 'universal-controller',
      category: 'system-control',
      userFacing: true,
      isUniversal: true  // 标记为通用技能
    }
  },
  
  params: [
    {
      name: 'action',
      type: 'string',
      required: true,
      description: '操作类型：open/close/play/pause/stop/next/prev/volume-up/volume-down/mute/lock-screen/shutdown/restart/sleep/screenshot/open-folder/create-file/delete-file'
    },
    {
      name: 'target',
      type: 'string',
      required: false,
      description: '目标对象（应用名、文件夹名等）'
    },
    {
      name: 'params',
      type: 'object',
      required: false,
      description: '额外参数（query: 搜索词, volume: 音量值, path: 路径等）'
    }
  ],
  
  whenToUse: [
    '用户要求打开或关闭某个应用',
    '用户要求播放、暂停、停止媒体',
    '用户要求调整音量或静音',
    '用户要求锁屏、关机、重启电脑',
    '用户要求截图',
    '用户要求打开文件夹或文件操作'
  ],
  
  errorHandling: [
    {
      errorType: '应用未找到',
      cause: '应用未安装或名称错误',
      solution: '尝试模糊匹配或提示用户确认应用名称'
    },
    {
      errorType: '权限不足',
      cause: '需要管理员权限执行该操作',
      solution: '提示用户确认或使用管理员权限运行'
    },
    {
      errorType: '操作失败',
      cause: '应用不支持该操作或系统限制',
      solution: '返回错误信息并建议替代方案'
    }
  ],
  
  examples: [
    {
      id: 'open-app',
      name: '打开应用',
      input: '打开 QQ',
      expectedOutput: 'QQ 应用程序启动',
      params: { action: 'open', target: 'QQ' }
    },
    {
      id: 'play-music',
      name: '播放音乐',
      input: '播放周杰伦的歌',
      expectedOutput: '开始播放周杰伦的音乐',
      params: { action: 'play', target: 'music', params: { query: '周杰伦' } }
    },
    {
      id: 'pause-music',
      name: '暂停音乐',
      input: '暂停音乐',
      expectedOutput: '音乐已暂停',
      params: { action: 'pause' }
    },
    {
      id: 'volume-up',
      name: '调大音量',
      input: '把声音调大点',
      expectedOutput: '音量已调大',
      params: { action: 'volume-up', params: { volume: 20 } }
    },
    {
      id: 'lock-screen',
      name: '锁屏',
      input: '锁屏',
      expectedOutput: '屏幕已锁定',
      params: { action: 'lock-screen' }
    },
    {
      id: 'open-folder',
      name: '打开桌面',
      input: '打开桌面',
      expectedOutput: '桌面文件夹已打开',
      params: { action: 'open-folder', target: 'desktop' }
    }
  ],
  
  async execute(params: Record<string, any>): Promise<SkillResult> {
    const startTime = Date.now();
    const steps: SkillExecutionStep[] = [];
    
    const { action, target, params: extraParams = {} } = params;
    
    console.log(`🎮 开始执行"通用应用控制"技能`);
    console.log(`📋 操作类型: ${action}`);
    console.log(`🎯 目标对象: ${target || '无'}`);
    console.log(`📝 额外参数:`, extraParams);
    
    try {
      let result;
      
      // 检查是否在 Electron 环境
      if (typeof window === 'undefined' || !(window as any).electronAPI) {
        return {
          success: false,
          error: '当前环境不支持系统控制（需要桌面端）',
          steps,
          totalExecutionTime: Date.now() - startTime
        };
      }
      
      const electronAPI = (window as any).electronAPI;
      
      // 根据操作类型分发处理（调用外部辅助函数）
      switch (action) {
        
        // ========== 应用生命周期 ==========
        case 'open':
          result = await handleOpen(target, electronAPI);
          break;
          
        case 'close':
          result = await handleClose(target, electronAPI);
          break;
          
        // ========== 媒体控制 ==========
        case 'play':
          result = await handlePlay(target, extraParams, electronAPI);
          break;
          
        case 'pause':
          result = await handlePause(electronAPI);
          break;
          
        case 'stop':
          result = await handleStop(electronAPI);
          break;
          
        case 'next':
          result = await handleNext(electronAPI);
          break;
          
        case 'prev':
          result = await handlePrev(electronAPI);
          break;
          
        case 'volume-up':
          result = await handleVolumeUp(extraParams.volume, electronAPI);
          break;
          
        case 'volume-down':
          result = await handleVolumeDown(extraParams.volume, electronAPI);
          break;
          
        case 'mute':
          result = await handleMute(electronAPI);
          break;
          
        // ========== 系统控制 ==========
        case 'lock-screen':
          result = await handleLockScreen(electronAPI);
          break;
          
        case 'shutdown':
          result = await handleShutdown(electronAPI);
          break;
          
        case 'restart':
          result = await handleRestart(electronAPI);
          break;
          
        case 'sleep':
          result = await handleSleep(electronAPI);
          break;
          
        case 'screenshot':
          result = await handleScreenshot(electronAPI);
          break;
          
        // ========== 文件/文件夹 ==========
        case 'open-folder':
          result = await handleOpenFolder(target, electronAPI);
          break;
          
        default:
          result = {
            success: false,
            message: `不支持的操作类型: ${action}`,
            supportedActions: [
              'open', 'close', 'play', 'pause', 'stop', 'next', 'prev',
              'volume-up', 'volume-down', 'mute', 'lock-screen', 'shutdown',
              'restart', 'sleep', 'screenshot', 'open-folder'
            ]
          };
      }
      
      // 记录步骤
      steps.push({
        stepNumber: 1,
        name: getActionName(action),
        description: getDescription(action, target, extraParams),
        toolId: 'universal-control',
        toolParams: { action, target, params: extraParams },
        success: result.success,
        output: result.message || result.error,
        startTime,
        endTime: Date.now(),
        executionTime: Date.now() - startTime
      });
      
      if (result.success) {
        return {
          success: true,
          data: {
            message: result.message,
            action,
            target,
            executedAt: new Date().toISOString()
          },
          steps,
          totalExecutionTime: Date.now() - startTime
        };
      } else {
        return {
          success: false,
          error: result.message || result.error || '操作执行失败',
          steps,
          totalExecutionTime: Date.now() - startTime
        };
      }
      
    } catch (error: any) {
      console.error('❌ 通用应用控制失败:', error);
      return {
        success: false,
        error: error.message || '通用应用控制执行失败',
        steps,
        totalExecutionTime: Date.now() - startTime
      };
    }
  }
};

// 导出技能（支持默认导出和命名导出两种方式）
export default universalControlSkill;
