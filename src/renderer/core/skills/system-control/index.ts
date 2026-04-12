/**
 * 技能：系统控制
 * 
 * 功能：执行各种系统控制操作，如打开应用、锁屏、关机等
 * 模式：Tool Wrapper
 */

import {
  SkillDefinition,
  SkillResult,
  SkillExecutionStep
} from '../types';

import { callTool } from '../registry';

// ============================================================
// SKILL.md 文档
// ============================================================

/**
 * ---
 * name: system-control
 * description: |
 *   执行系统控制操作，如打开应用、打开文件夹、锁屏、关机等。
 *   Triggers: "打开应用", "锁屏", "关机", "重启", "清空回收站"
 *   Does NOT trigger:
 *   - 与系统控制无关的操作
 *   Output: 操作执行结果
 * version: 1.0.0
 * author: 启源 AI
 * tags: [system, control, utility]
 * user-invocable: true
 * allowed-tools: ["system.open-app", "system.open-folder", "system.lock-screen", "system.shutdown", "system.restart", "system.cancel-shutdown", "system.sleep", "system.empty-recycle", "system.screenshot"]
 * metadata: {
 *   "emoji": "⚙️",
 *   "pattern": "tool-wrapper"
 * }
 * ---
 * 
 * # 系统控制
 * 
 * **Pattern: Tool Wrapper**
 * 
 * ## When to Use
 * - 用户需要执行系统级操作
 * - 打开应用或文件夹
 * - 锁定屏幕、关机、重启等
 * - 清空回收站
 * - 截图
 * 
 * ## Prerequisites
 * - Electron 环境（需要主进程支持）
 * - 相应的系统权限
 * 
 * ## Instructions
 * 1. 接收用户输入的操作类型和参数
 * 2. 根据操作类型调用相应的系统工具
 * 3. 返回执行结果
 * 
 * ## Examples
 * 
 * ### Example 1: 打开浏览器
 * **Input**: "打开浏览器"
 * **Execute**: `system.open-app(appName="浏览器")`
 * **Output**: 操作完成
 * 
 * ### Example 2: 锁定屏幕
 * **Input**: "锁屏"
 * **Execute**: `system.lock-screen()`
 * **Output**: 操作完成
 * 
 * ### Example 3: 关机
 * **Input**: "关机"
 * **Execute**: `system.shutdown()`
 * **Output**: 电脑将在 60 秒后关机
 */

// ============================================================
// 技能实现
// ============================================================

export const systemControlSkill: SkillDefinition = {
  metadata: {
    name: 'system-control',
    description: '执行系统控制操作，如打开应用、锁屏、关机等。Triggers: "打开应用", "锁屏", "关机", "重启", "清空回收站"。Output: 操作执行结果',
    version: '1.0.0',
    author: '启源 AI',
    tags: ['system', 'control', 'utility'],
    userInvocable: true,
    allowedTools: ['system.open-app', 'system.open-folder', 'system.lock-screen', 'system.shutdown', 'system.restart', 'system.cancel-shutdown', 'system.sleep', 'system.empty-recycle', 'system.screenshot'],
    metadata: {
      emoji: '⚙️',
      pattern: 'tool-wrapper'
    }
  },
  
  params: [
    {
      name: 'action',
      type: 'string',
      required: true,
      description: '操作类型',
      example: 'open-app'
    },
    {
      name: 'target',
      type: 'string',
      required: false,
      description: '操作目标（如应用名、文件夹名）',
      example: '浏览器'
    }
  ],
  
  whenToUse: [
    '用户需要执行系统级操作',
    '打开应用或文件夹',
    '锁定屏幕、关机、重启等',
    '清空回收站',
    '截图'
  ],
  
  examples: [
    {
      id: 'open-browser',
      name: '打开浏览器',
      input: '打开浏览器',
      expectedOutput: '操作完成',
      params: { action: 'open-app', target: '浏览器' }
    },
    {
      id: 'lock-screen',
      name: '锁定屏幕',
      input: '锁屏',
      expectedOutput: '操作完成',
      params: { action: 'lock-screen' }
    },
    {
      id: 'shutdown',
      name: '关机',
      input: '关机',
      expectedOutput: '电脑将在 60 秒后关机',
      params: { action: 'shutdown' }
    }
  ],
  
  errorHandling: [
    {
      errorType: 'API_UNAVAILABLE',
      cause: '系统控制 API 不可用',
      solution: '检查 Electron 环境是否正常'
    },
    {
      errorType: 'PERMISSION_DENIED',
      cause: '权限不足',
      solution: '确保应用有相应的系统权限'
    },
    {
      errorType: 'INVALID_PARAMS',
      cause: '参数无效',
      solution: '检查输入参数是否正确'
    }
  ],
  
  outputFormat: JSON.stringify({
    success: true,
    data: {
      action: '操作类型',
      result: '操作结果',
      message: '操作完成'
    }
  }, null, 2),
  
  pattern: 'tool-wrapper',
  
  async execute(
    params: Record<string, any>,
    steps?: SkillExecutionStep[]
  ): Promise<SkillResult> {
    
    try {
      const action = params.action;
      const target = params.target;
      
      console.log(`⚙️  开始执行"系统控制"技能`);
      console.log(`📋 操作: ${action}`);
      if (target) {
        console.log(`🎯 目标: ${target}`);
      }
      
      let result;
      
      // 根据操作类型调用相应的工具
      switch (action) {
        case 'open-app':
          result = await callTool(
            'system.open-app',
            { appName: target },
            steps || [],
            '打开应用',
            `打开应用 ${target}`
          );
          break;
          
        case 'open-folder':
          result = await callTool(
            'system.open-folder',
            { folderName: target },
            steps || [],
            '打开文件夹',
            `打开文件夹 ${target}`
          );
          break;
          
        case 'lock-screen':
          result = await callTool(
            'system.lock-screen',
            {},
            steps || [],
            '锁定屏幕',
            '锁定当前屏幕'
          );
          break;
          
        case 'shutdown':
          result = await callTool(
            'system.shutdown',
            {},
            steps || [],
            '关机',
            '关闭电脑'
          );
          break;
          
        case 'restart':
          result = await callTool(
            'system.restart',
            {},
            steps || [],
            '重启',
            '重启电脑'
          );
          break;
          
        case 'cancel-shutdown':
          result = await callTool(
            'system.cancel-shutdown',
            {},
            steps || [],
            '取消关机',
            '取消正在进行的关机操作'
          );
          break;
          
        case 'sleep':
          result = await callTool(
            'system.sleep',
            {},
            steps || [],
            '休眠',
            '使电脑进入休眠状态'
          );
          break;
          
        case 'empty-recycle':
          result = await callTool(
            'system.empty-recycle',
            {},
            steps || [],
            '清空回收站',
            '清空系统回收站'
          );
          break;
          
        case 'screenshot':
          result = await callTool(
            'system.screenshot',
            {},
            steps || [],
            '截图',
            '截取当前屏幕'
          );
          break;
          
        default:
          return {
            success: false,
            error: `不支持的操作类型: ${action}`,
            steps
          };
      }
      
      if (result.success) {
        return {
          success: true,
          data: {
            message: result.data?.result?.message || '操作完成',
            action,
            target,
            raw: result.data
          },
          steps
        };
      } else {
        return {
          success: false,
          error: result.error || '操作失败',
          steps
        };
      }
      
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '系统控制执行失败',
        steps
      };
    }
  }
};

// 导出技能（支持默认导出和命名导出两种方式）
export default systemControlSkill;