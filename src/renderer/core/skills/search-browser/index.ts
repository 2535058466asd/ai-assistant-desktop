/**
 * 技能：打开浏览器搜索
 * 
 * 功能：在默认浏览器中打开搜索引擎并搜索关键词
 * 模式：Tool Wrapper（简单封装）
 */

import {
  SkillDefinition,
  SkillResult,
  SkillExecutionStep
} from '../types';

// 导入工具调用辅助函数
import { callTool } from '../registry';

// ============================================================
// SKILL.md 文档（按 OpenClaw 规范）
// ============================================================

/**
 * ---
 * name: search-browser
 * description: |
 *   在默认浏览器中打开搜索引擎并搜索关键词。
 *   Triggers: "搜索", "search", "打开浏览器搜", "帮我找", "查一下"
 *   Does NOT trigger:
 *   - 用户已经提供了具体 URL
 *   - 只需要后台返回结果（用 search-web 技能）
 *   Output: 浏览器自动打开并显示搜索结果
 * version: 1.0.0
 * author: 启源 AI
 * tags: [browser, search, ui]
 * user-invocable: true
 * allowed-tools: ["browser.open-search"]
 * metadata: {
 *   "emoji": "🔍",
 *   "pattern": "tool-wrapper"
 * }
 * ---
 * 
 * # 打开浏览器搜索
 * 
 * **Pattern: Tool Wrapper**
 * 
 * ## When to Use
 * - 用户想要在浏览器中看到搜索结果
 * - 需要可视化展示搜索过程
 * - 用户明确要求"打开浏览器"
 * 
 * ## Prerequisites
 * - 默认浏览器已安装
 * - 网络连接正常
 * 
 * ## Instructions
 * 1. 接收用户输入的搜索关键词
 * 2. 选择默认搜索引擎（Bing/Google/百度）
 * 3. 构建搜索 URL
 * 4. 调用浏览器工具打开链接
 * 
 * ## Examples
 * 
 * ### Example 1: 基本搜索
 * **Input**: "搜索 B站"
 * **Execute**: `open-search(query="B站")`
 * **Output**: 浏览器打开 Bing 搜索 "B站" 的结果页
 * 
 * ### Example 2: 指定搜索引擎
 * **Input**: "用 Google 搜索 React 教程"
 * **Execute**: `open-search(query="React 教程", engine="google")`
 * **Output**: 浏览器打开 Google 搜索结果页
 * 
 * ### Edge Case
 * **Input**: "搜索"（无关键词）
 * **Action**: 询问用户要搜索什么
 * 
 * ## Output Format
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "query": "搜索关键词",
 *     "engine": "bing",
 *     "url": "完整的搜索URL",
 *     "openedAt": "2026-04-05T..."
 *   }
 * }
 * ```
 * 
 * ## Error Handling
 * | Error | Cause | Fix |
 * |-------|-------|-----|
 * | 无关键词 | 用户未提供 | 询问用户 |
 * | 浏览器无法打开 | 系统限制 | 尝试其他方式 |
 * | 网络错误 | 网络断开 | 提示用户检查网络 |
 */

// ============================================================
// 技能实现
// ============================================================

export const searchBrowserSkill: SkillDefinition = {
  // 元数据（YAML frontmatter）
  metadata: {
    name: 'search-browser',
    description: '在默认浏览器中打开搜索引擎并搜索关键词。Triggers: "搜索", "search", "打开浏览器搜"。Does NOT trigger: 后台搜索用 search-web。Output: 浏览器自动打开并显示搜索结果',
    version: '1.0.0',
    author: '启源 AI',
    tags: ['browser', 'search', 'ui'],
    userInvocable: true,
    allowedTools: ['browser.open-search'],
    metadata: {
      emoji: '🔍',
      pattern: 'tool-wrapper'
    }
  },
  
  // 参数定义
  params: [
    {
      name: 'query',
      type: 'string',
      required: true,
      description: '搜索关键词',
      example: 'B站'
    },
    {
      name: 'engine',
      type: 'string',
      required: false,
      description: '搜索引擎（bing/google/baidu）',
      defaultValue: 'bing',
      example: 'google'
    }
  ],
  
  // 使用场景
  whenToUse: [
    '用户想要在浏览器中查看搜索结果',
    '需要可视化展示搜索过程',
    '用户明确说"打开浏览器"',
    '用户想看搜索结果的网页'
  ],
  
  // 示例
  examples: [
    {
      id: 'basic-search',
      name: '基本搜索',
      input: '搜索 B站',
      expectedOutput: '浏览器打开并显示 B站 的搜索结果',
      params: { query: 'B站' }
    },
    {
      id: 'google-search',
      name: 'Google 搜索',
      input: '用 Google 搜索 React 教程',
      expectedOutput: '浏览器打开 Google 搜索 React 教程的结果',
      params: { query: 'React 教程', engine: 'google' }
    },
    {
      id: 'no-query',
      name: '无关键词',
      input: '搜索',
      expectedOutput: '询问用户要搜索什么'
    }
  ],
  
  // 错误处理
  errorHandling: [
    {
      errorType: 'MISSING_QUERY',
      cause: '用户未提供搜索关键词',
      solution: '提示用户输入搜索关键词'
    },
    {
      errorType: 'BROWSER_ERROR',
      cause: '浏览器无法打开',
      solution: '检查系统默认浏览器设置'
    },
    {
      errorType: 'NETWORK_ERROR',
      cause: '网络连接失败',
      solution: '提示用户检查网络连接'
    }
  ],
  
  // 输出格式
  outputFormat: JSON.stringify({
    success: true,
    data: {
      query: '搜索关键词',
      engine: 'bing',
      url: '完整搜索URL',
      openedAt: '时间戳'
    }
  }, null, 2),
  
  // 设计模式
  pattern: 'tool-wrapper',
  
  /**
   * 执行函数
   */
  async execute(
    params: Record<string, any>,
    steps?: SkillExecutionStep[]
  ): Promise<SkillResult> {
    
    try {
      const query = params.query;
      
      // 1. 参数验证
      if (!query || query.trim() === '') {
        return {
          success: false,
          error: '请提供搜索关键词',
          steps
        };
      }
      
      console.log(`🔍 开始执行"打开浏览器搜索"技能`);
      console.log(`📝 关键词: ${query}`);
      
      // 2. 调用浏览器搜索工具（使用 callTool 自动记录步骤）
      const result = await callTool(
        'browser.open-search',
        {
          query: query.trim(),
          engine: params.engine || 'bing'
        },
        steps || [],
        '打开搜索引擎',
        `在浏览器中搜索"${query}"`
      );
      
      // 3. 返回结果
      if (result.success) {
        return {
          success: true,
          data: {
            message: `已在浏览器中打开搜索：${query}`,
            ...result.data
          },
          steps
        };
      } else {
        return {
          success: false,
          error: result.error || '搜索失败',
          steps
        };
      }
      
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '执行失败',
        steps
      };
    }
  }
};

// 导出默认导出（方便注册）
export default searchBrowserSkill;
