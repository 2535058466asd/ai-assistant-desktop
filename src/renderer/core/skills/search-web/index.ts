/**
 * 技能：网页搜索
 * 
 * 功能：使用本地 SearXNG 引擎进行后台搜索，返回结构化结果
 * 模式：Tool Wrapper + Generator
 */

import {
  SkillDefinition,
  SkillResult,
  SkillExecutionStep
} from '../types';

import { callTool } from '../registry';

// ============================================================
// SKILL.md 文档（按 OpenClaw 规范）
// ============================================================

/**
 * ---
 * name: search-web
 * description: |
 *   使用本地 SearXNG 引擎进行网页搜索，返回结构化结果。
 *   Triggers: "帮我搜", "查一下", "look up", "搜索资料", "找信息"
 *   Does NOT trigger:
 *   - 用户想要在浏览器中看结果（用 search-browser 技能）
 *   - 用户已经提供了具体 URL
 *   Output: 结构化搜索结果列表（标题、URL、摘要）
 * version: 1.0.0
 * author: 启源 AI
 * tags: [search, web, searxng, research]
 * user-invocable: true
 * allowed-tools: ["network.searxng-search"]
 * metadata: {
 *   "emoji": "🌐",
 *   "requires": {
 *     "env": ["SEARXNG_URL"]
 *   },
 *   "pattern": "tool-wrapper"
 * }
 * ---
 * 
 * # 网页搜索（SearXNG）
 * 
 * **Pattern: Tool Wrapper + Generator**
 * 
 * ## When to Use
 * - 需要获取搜索结果的文本内容
 * - AI 需要整理或总结搜索结果
 * - 后台静默搜索，不需要打开浏览器
 * 
 * ## Prerequisites
 * - SearXNG 服务已启动（默认 http://localhost:8080）
 * - 网络连接正常
 * 
 * ## Instructions
 * 1. 接收用户输入的搜索关键词
 * 2. 调用 SearXNG API 进行搜索
 * 3. 解析并格式化返回的结果
 * 4. 返回结构化的搜索结果列表
 * 
 * ## Examples
 * 
 * ### Example 1: 基本搜索
 * **Input**: "帮我搜一下 React 18 新特性"
 * **Execute**: `searxng-search(query="React 18 新特性")`
 * **Output**: 前 10 条搜索结果，包含标题、URL、摘要
 * 
 * ### Example 2: 图片搜索
 * **Input**: "搜一些猫咪图片"
 * **Execute**: `searxng-search(query="猫咪", categories="images")`
 * **Output**: 图片搜索结果列表
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
 *     "resultsCount": 10,
 *     "results": [
 *       {
 *         "title": "结果标题",
 *         "url": "https://...",
 *         "snippet": "摘要文字...",
 *         "engine": "bing"
 *       }
 *     ]
 *   }
 * }
 * ```
 * 
 * ## Error Handling
 * | Error | Cause | Fix |
 * |-------|-------|-----|
 * | 连接拒绝 | SearXNG 未运行 | 启动 SearXNG: docker-compose up -d |
 * | 无结果 | 关键词太具体 | 扩大搜索范围 |
 * | 超时 | 网络问题 | 重试一次 |
 */

// ============================================================
// 技能实现
// ============================================================

export const searchWebSkill: SkillDefinition = {
  metadata: {
    name: 'search-web',
    description: '使用本地 SearXNG 引擎进行网页搜索，返回结构化结果。Triggers: "帮我搜", "查一下", "look up"。Does NOT trigger: 浏览器搜索用 search-browser。Output: 结构化搜索结果',
    version: '1.0.0',
    author: '启源 AI',
    tags: ['search', 'web', 'searxng', 'research'],
    userInvocable: true,
    allowedTools: ['network.searxng-search'],
    metadata: {
      emoji: '🌐',
      requires: { env: ['SEARXNG_URL'] },
      pattern: 'tool-wrapper'
    }
  },
  
  params: [
    {
      name: 'query',
      type: 'string',
      required: true,
      description: '搜索关键词',
      example: 'React 18 新特性'
    },
    {
      name: 'limit',
      type: 'number',
      required: false,
      description: '返回结果数量限制',
      defaultValue: 10,
      example: 5
    },
    {
      name: 'categories',
      type: 'string',
      required: false,
      description: '搜索分类（general/images/news/science/files）',
      defaultValue: 'general',
      example: 'images'
    }
  ],
  
  whenToUse: [
    '需要获取搜索结果的文本内容',
    'AI 需要整理或总结搜索结果',
    '后台静默搜索',
    '用户说"帮我查"、"搜一下"'
  ],
  
  examples: [
    {
      id: 'basic-search',
      name: '基本搜索',
      input: '帮我搜一下 React 18 新特性',
      expectedOutput: '返回 React 18 新特性的搜索结果列表',
      params: { query: 'React 18 新特性' }
    },
    {
      id: 'image-search',
      name: '图片搜索',
      input: '搜一些猫咪图片',
      expectedOutput: '返回图片搜索结果',
      params: { query: '猫咪', categories: 'images' }
    },
    {
      id: 'limited-results',
      name: '限制结果数',
      input: '只给我前 5 个结果',
      expectedOutput: '只返回 5 条结果',
      params: { query: '前端框架', limit: 5 }
    }
  ],
  
  errorHandling: [
    {
      errorType: 'CONNECTION_REFUSED',
      cause: 'SearXNG 服务未运行',
      solution: '启动 SearXNG 服务：docker-compose up -d'
    },
    {
      errorType: 'EMPTY_RESULTS',
      cause: '关键词太具体或无相关结果',
      solution: '建议用户扩大搜索范围'
    },
    {
      errorType: 'TIMEOUT',
      cause: '网络超时',
      solution: '重试一次或检查网络连接'
    }
  ],
  
  outputFormat: JSON.stringify({
    success: true,
    data: {
      query: '搜索关键词',
      resultsCount: 10,
      results: [
        {
          title: '结果标题',
          url: 'https://...',
          snippet: '摘要...',
          engine: 'bing'
        }
      ]
    }
  }, null, 2),
  
  pattern: 'tool-wrapper',
  
  async execute(
    params: Record<string, any>,
    steps?: SkillExecutionStep[]
  ): Promise<SkillResult> {
    
    try {
      const query = params.query;
      
      // 参数验证
      if (!query || query.trim() === '') {
        return {
          success: false,
          error: '请提供搜索关键词',
          steps
        };
      }
      
      console.log(`🌐 开始执行"网页搜索"技能`);
      console.log(`📝 关键词: ${query}`);
      
      // 调用 SearXNG 搜索工具
      const result = await callTool(
        'network.searxng-search',
        {
          query: query.trim(),
          limit: params.limit || 10,
          categories: params.categories || 'general'
        },
        steps || [],
        'SearXNG 搜索',
        `使用 SearXNG 搜索"${query}"`
      );
      
      if (result.success) {
        // 格式化输出为可读文本
        const searchData = result.data;
        const formattedResults = formatSearchResults(searchData.results);
        
        return {
          success: true,
          data: {
            message: `找到 ${searchData.resultsCount} 条关于"${query}"的搜索结果`,
            raw: searchData,
            formatted: formattedResults
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
        error: error.message || '搜索执行失败',
        steps
      };
    }
  }
};

// 导出技能（支持默认导出和命名导出两种方式）
export default searchWebSkill;

/**
 * 格式化搜索结果为可读文本（辅助函数）
 */
function formatSearchResults(results: any[]): string {
  if (!results || results.length === 0) {
    return '未找到相关结果';
  }
  
  let text = '';
  
  for (let i = 0; i < results.length; i++) {
    const item = results[i];
    text += `${i + 1}. **${item.title}**\n`;
    text += `   ${item.url}\n`;
    if (item.snippet) {
      text += `   ${item.snippet}\n`;
    }
    text += '\n';
  }
  
  return text.trim();
}
