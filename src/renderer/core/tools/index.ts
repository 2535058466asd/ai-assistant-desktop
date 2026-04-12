/**
 * 启源 AI - 工具库类型定义
 * 
 * 基础能力的封装，每个 Tool 只做一件事
 */

import { ToolDefinition, ToolResult, ToolParamDef } from '../skills/types';

// ============================================================
// 浏览器相关工具
// ============================================================

/**
 * 打开外部链接（浏览器）
 */
export const openExternalTool: ToolDefinition = {
  id: 'browser.open-external',
  name: '打开外部链接',
  description: '在默认浏览器中打开指定 URL',
  category: 'browser',
  params: [
    {
      name: 'url',
      type: 'string',
      required: true,
      description: '要打开的 URL 地址'
    }
  ],
  execute: async (params) => {
    const startTime = Date.now();
    
    try {
      const url = params.url;
      
      // 检查 Electron API 是否可用
      if (typeof window !== 'undefined' && (window as any).electronAPI?.openExternal) {
        await (window as any).electronAPI.openExternal(url);
        
        return {
          success: true,
          data: { url, openedAt: new Date().toISOString() },
          executionTime: Date.now() - startTime
        };
      } else {
        // fallback：直接用 window.open
        window.open(url, '_blank');
        
        return {
          success: true,
          data: { url, openedAt: new Date().toISOString(), method: 'fallback' },
          executionTime: Date.now() - startTime
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '打开链接失败',
        executionTime: Date.now() - startTime
      };
    }
  }
};

/**
 * 打开搜索引擎搜索
 */
export const openSearchTool: ToolDefinition = {
  id: 'browser.open-search',
  name: '打开搜索',
  description: '在默认浏览器中打开搜索引擎并搜索关键词',
  category: 'browser',
  params: [
    {
      name: 'query',
      type: 'string',
      required: true,
      description: '搜索关键词'
    },
    {
      name: 'engine',
      type: 'string',
      required: false,
      description: '搜索引擎（bing/google/baidu）',
      defaultValue: 'bing'
    }
  ],
  execute: async (params) => {
    const startTime = Date.now();
    
    try {
      const query = params.query;
      const engine = params.engine || 'bing';
      
      // 构建搜索 URL
      const searchUrls: Record<string, string> = {
        bing: `https://www.bing.com/search?q=`,
        google: `https://www.google.com/search?q=`,
        baidu: `https://www.baidu.com/s?wd=`
      };
      
      const baseUrl = searchUrls[engine] || searchUrls.bing;
      const url = baseUrl + encodeURIComponent(query);
      
      // 调用 openExternal 工具
      const result = await openExternalTool.execute({ url });
      
      return {
        ...result,
        data: {
          query,
          engine,
          url,
          openedAt: new Date().toISOString()
        },
        executionTime: Date.now() - startTime
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '搜索失败',
        executionTime: Date.now() - startTime
      };
    }
  }
};

// ============================================================
// 网络相关工具
// ============================================================

/**
 * HTTP GET 请求
 */
export const httpGetTool: ToolDefinition = {
  id: 'network.http-get',
  name: 'HTTP GET 请求',
  description: '发送 HTTP GET 请求获取数据',
  category: 'network',
  params: [
    {
      name: 'url',
      type: 'string',
      required: true,
      description: '请求的 URL'
    },
    {
      name: 'headers',
      type: 'object',
      required: false,
      description: '自定义请求头',
      defaultValue: {}
    }
  ],
  execute: async (params) => {
    const startTime = Date.now();
    
    try {
      const response = await fetch(params.url, {
        method: 'GET',
        headers: params.headers || {}
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      // 尝试解析 JSON，失败则返回文本
      let data;
      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }
      
      return {
        success: true,
        data: {
          status: response.status,
          contentType,
          data
        },
        executionTime: Date.now() - startTime
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '网络请求失败',
        executionTime: Date.now() - startTime
      };
    }
  }
};

/**
 * SearXNG 搜索工具
 */
export const searxngSearchTool: ToolDefinition = {
  id: 'network.searxng-search',
  name: 'SearXNG 搜索',
  description: '使用本地 SearXNG 引擎进行网页搜索',
  category: 'network',
  params: [
    {
      name: 'query',
      type: 'string',
      required: true,
      description: '搜索关键词'
    },
    {
      name: 'limit',
      type: 'number',
      required: false,
      description: '返回结果数量限制',
      defaultValue: 10
    },
    {
      name: 'categories',
      type: 'string',
      required: false,
      description: '搜索分类（general/images/news/science/files）',
      defaultValue: 'general'
    }
  ],
  execute: async (params) => {
    const startTime = Date.now();
    
    try {
      const query = params.query;
      const limit = params.limit || 10;
      const categories = params.categories || 'general';
      
      // SearXNG API 地址（使用 Vite 代理避免 CORS）
      // 开发环境：/searxng → http://localhost:8080
      // 生产环境：需要配置实际地址
      const searxngUrl = '/searxng';  // 使用代理路径
      
      console.log(`🌐 SearXNG 搜索：${query}`);
      console.log(` 请求代理路径: ${searxngUrl}`);
      
      // 构建 API URL
      const apiUrl = `${searxngUrl}/search?q=${encodeURIComponent(query)}&format=json&categories=${categories}`;
      
      // 发送请求
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        throw new Error(`SearXNG 返回错误: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // 格式化结果
      const results = (data.results || []).slice(0, limit).map((item: any) => ({
        title: item.title,
        url: item.url,
        snippet: item.content || '',
        engine: item.engine || ''
      }));
      
      return {
        success: true,
        data: {
          query,
          resultsCount: results.length,
          results
        },
        executionTime: Date.now() - startTime
      };
    } catch (error: any) {
      console.error('❌ SearXNG 搜索失败:', error);
      return {
        success: false,
        error: `SearXNG 搜索失败：${error.message}`,
        executionTime: Date.now() - startTime
      };
    }
  }
};

// ============================================================
// 天气相关工具
// ============================================================

/**
 * wttr.in 天气查询工具
 */
export const wttrWeatherTool: ToolDefinition = {
  id: 'network.wttr-weather',
  name: 'wttr.in 天气查询',
  description: '使用 wttr.in API 查询天气（无需 API Key）',
  category: 'network',
  params: [
    {
      name: 'location',
      type: 'string',
      required: true,
      description: '城市名或地点'
    },
    {
      name: 'format',
      type: 'string',
      required: false,
      description: '返回格式（json/text）',
      defaultValue: 'json'
    }
  ],
  execute: async (params) => {
    const startTime = Date.now();
    
    try {
      const location = params.location;
      const format = params.format || 'json';
      
      // wttr.in API URL（使用 j 参数获取 JSON 格式）
      const apiUrl = `https://wttr.in/${encodeURIComponent(location)}?format=j1&lang=zh`;
      
      console.log(`🌤️  查询天气：${location}`);
      console.log(` 请求 URL: ${apiUrl}`);
      
      // 发送请求
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        throw new Error(`天气查询失败：${response.status}`);
      }
      
      // 先获取原始文本
      const rawText = await response.text();
      console.log(`📝 原始响应：`, rawText.slice(0, 200));
      
      // 尝试解析为 JSON
      let data;
      try {
        data = JSON.parse(rawText);
      } catch (parseError: any) {
        console.error('❌ JSON 解析失败:', parseError);
        console.error('❌ 原始文本:', rawText);
        throw new Error(`JSON 解析失败：${parseError.message}`);
      }
      
      return {
        success: true,
        data: {
          location,
          weather: data,
          queriedAt: new Date().toISOString()
        },
        executionTime: Date.now() - startTime
      };
    } catch (error: any) {
      return {
        success: false,
        error: `天气查询失败: ${error.message}`,
        executionTime: Date.now() - startTime
      };
    }
  }
};

// ============================================================
// 系统控制工具
// ============================================================

/**
 * 打开应用
 */
export const openAppTool: ToolDefinition = {
  id: 'system.open-app',
  name: '打开应用',
  description: '通过系统命令打开指定的应用程序',
  category: 'system',
  params: [
    {
      name: 'appName',
      type: 'string',
      required: true,
      description: '应用名称'
    }
  ],
  execute: async (params) => {
    const startTime = Date.now();
    
    try {
      const appName = params.appName;
      
      if (typeof window !== 'undefined' && (window as any).electronAPI?.systemOpenApp) {
        const result = await (window as any).electronAPI.systemOpenApp(appName);
        
        return {
          success: result.success,
          data: { appName, result },
          executionTime: Date.now() - startTime
        };
      } else {
        return {
          success: false,
          error: '系统控制 API 不可用',
          executionTime: Date.now() - startTime
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '打开应用失败',
        executionTime: Date.now() - startTime
      };
    }
  }
};

/**
 * 打开文件夹
 */
export const openFolderTool: ToolDefinition = {
  id: 'system.open-folder',
  name: '打开文件夹',
  description: '打开指定的文件夹',
  category: 'system',
  params: [
    {
      name: 'folderName',
      type: 'string',
      required: true,
      description: '文件夹名称'
    }
  ],
  execute: async (params) => {
    const startTime = Date.now();
    
    try {
      const folderName = params.folderName;
      
      if (typeof window !== 'undefined' && (window as any).electronAPI?.systemOpenFolder) {
        const result = await (window as any).electronAPI.systemOpenFolder(folderName);
        
        return {
          success: result.success,
          data: { folderName, result },
          executionTime: Date.now() - startTime
        };
      } else {
        return {
          success: false,
          error: '系统控制 API 不可用',
          executionTime: Date.now() - startTime
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '打开文件夹失败',
        executionTime: Date.now() - startTime
      };
    }
  }
};

/**
 * 锁定屏幕
 */
export const lockScreenTool: ToolDefinition = {
  id: 'system.lock-screen',
  name: '锁定屏幕',
  description: '锁定当前用户的屏幕',
  category: 'system',
  params: [],
  execute: async () => {
    const startTime = Date.now();
    
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.systemLockScreen) {
        const result = await (window as any).electronAPI.systemLockScreen();
        
        return {
          success: result.success,
          data: { result },
          executionTime: Date.now() - startTime
        };
      } else {
        return {
          success: false,
          error: '系统控制 API 不可用',
          executionTime: Date.now() - startTime
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '锁定屏幕失败',
        executionTime: Date.now() - startTime
      };
    }
  }
};

/**
 * 关机
 */
export const shutdownTool: ToolDefinition = {
  id: 'system.shutdown',
  name: '关机',
  description: '关闭电脑',
  category: 'system',
  params: [],
  execute: async () => {
    const startTime = Date.now();
    
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.systemShutdown) {
        const result = await (window as any).electronAPI.systemShutdown();
        
        return {
          success: result.success,
          data: { result },
          executionTime: Date.now() - startTime
        };
      } else {
        return {
          success: false,
          error: '系统控制 API 不可用',
          executionTime: Date.now() - startTime
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '关机失败',
        executionTime: Date.now() - startTime
      };
    }
  }
};

/**
 * 重启
 */
export const restartTool: ToolDefinition = {
  id: 'system.restart',
  name: '重启',
  description: '重启电脑',
  category: 'system',
  params: [],
  execute: async () => {
    const startTime = Date.now();
    
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.systemRestart) {
        const result = await (window as any).electronAPI.systemRestart();
        
        return {
          success: result.success,
          data: { result },
          executionTime: Date.now() - startTime
        };
      } else {
        return {
          success: false,
          error: '系统控制 API 不可用',
          executionTime: Date.now() - startTime
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '重启失败',
        executionTime: Date.now() - startTime
      };
    }
  }
};

/**
 * 取消关机
 */
export const cancelShutdownTool: ToolDefinition = {
  id: 'system.cancel-shutdown',
  name: '取消关机',
  description: '取消正在进行的关机或重启操作',
  category: 'system',
  params: [],
  execute: async () => {
    const startTime = Date.now();
    
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.systemCancelShutdown) {
        const result = await (window as any).electronAPI.systemCancelShutdown();
        
        return {
          success: result.success,
          data: { result },
          executionTime: Date.now() - startTime
        };
      } else {
        return {
          success: false,
          error: '系统控制 API 不可用',
          executionTime: Date.now() - startTime
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '取消关机失败',
        executionTime: Date.now() - startTime
      };
    }
  }
};

/**
 * 休眠
 */
export const sleepTool: ToolDefinition = {
  id: 'system.sleep',
  name: '休眠',
  description: '使电脑进入休眠状态',
  category: 'system',
  params: [],
  execute: async () => {
    const startTime = Date.now();
    
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.systemSleep) {
        const result = await (window as any).electronAPI.systemSleep();
        
        return {
          success: result.success,
          data: { result },
          executionTime: Date.now() - startTime
        };
      } else {
        return {
          success: false,
          error: '系统控制 API 不可用',
          executionTime: Date.now() - startTime
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '休眠失败',
        executionTime: Date.now() - startTime
      };
    }
  }
};

/**
 * 清空回收站
 */
export const emptyRecycleBinTool: ToolDefinition = {
  id: 'system.empty-recycle',
  name: '清空回收站',
  description: '清空系统回收站',
  category: 'system',
  params: [],
  execute: async () => {
    const startTime = Date.now();
    
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.systemEmptyRecycleBin) {
        const result = await (window as any).electronAPI.systemEmptyRecycleBin();
        
        return {
          success: result.success,
          data: { result },
          executionTime: Date.now() - startTime
        };
      } else {
        return {
          success: false,
          error: '系统控制 API 不可用',
          executionTime: Date.now() - startTime
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '清空回收站失败',
        executionTime: Date.now() - startTime
      };
    }
  }
};

/**
 * 截图
 */
export const screenshotTool: ToolDefinition = {
  id: 'system.screenshot',
  name: '截图',
  description: '截取当前屏幕的截图',
  category: 'system',
  params: [],
  execute: async () => {
    const startTime = Date.now();
    
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.screenshotTake) {
        const result = await (window as any).electronAPI.screenshotTake();
        
        return {
          success: result.success,
          data: { result },
          executionTime: Date.now() - startTime
        };
      } else {
        return {
          success: false,
          error: '系统控制 API 不可用',
          executionTime: Date.now() - startTime
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '截图失败',
        executionTime: Date.now() - startTime
      };
    }
  }
};

// ============================================================
// 导出所有工具
// ============================================================

/**
 * 所有可用工具列表
 */
export const allTools: ToolDefinition[] = [
  // 浏览器工具
  openExternalTool,
  openSearchTool,
  
  // 网络工具
  httpGetTool,
  searxngSearchTool,
  wttrWeatherTool,
  
  // 系统工具
  openAppTool,
  openFolderTool,
  lockScreenTool,
  shutdownTool,
  restartTool,
  cancelShutdownTool,
  sleepTool,
  emptyRecycleBinTool,
  screenshotTool
];

/**
 * 根据 ID 获取工具
 */
export function getToolById(id: string): ToolDefinition | undefined {
  return allTools.find(tool => tool.id === id);
}

/**
 * 根据分类获取工具
 */
export function getToolsByCategory(category: string): ToolDefinition[] {
  return allTools.filter(tool => tool.category === category);
}
