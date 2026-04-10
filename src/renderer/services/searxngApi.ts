/**
 * ==========================================
 * SearXNG API 服务
 * 直接调用本地部署的 SearXNG 进行搜索
 * 地址：http://localhost:8080
 * ==========================================
 */

/* ==========================================
   SearXNG 搜索结果类型
   ========================================== */
export interface SearXNGSearchResult {
  title: string;
  url: string;
  content: string;
  engine: string;
  score?: number;
}

export interface SearXNGSearchResponse {
  query: string;
  number_of_results: number;
  results: SearXNGSearchResult[];
  answers: any[];
  corrections: any[];
  infoboxes: any[];
  suggestions: string[];
  unresponsive_engines: any[];
}

/* ==========================================
   SearXNG API 服务类
   ========================================== */
export class SearXNGService {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:8080') {
    this.baseUrl = baseUrl;
    console.log('🔍 SearXNG 服务初始化:', this.baseUrl);
  }

  /**
   * 搜索网页
   * @param query - 搜索关键词
   * @param limit - 返回结果数量（默认 10）
   * @returns 搜索结果
   */
  async search(query: string, limit: number = 10): Promise<SearXNGSearchResponse> {
    try {
      console.log('🔍 SearXNG 搜索:', query);

      // 构建搜索 URL
      const searchUrl = new URL(`${this.baseUrl}/search`);
      searchUrl.searchParams.set('q', query);
      searchUrl.searchParams.set('format', 'json');
      searchUrl.searchParams.set('language', 'zh-CN');
      searchUrl.searchParams.set('engines', 'baidu,bing,duckduckgo');

      console.log('📦 请求 URL:', searchUrl.toString());

      // 检查是否有 electronAPI 可用
      const hasElectronAPI = !!(window as any).electronAPI?.httpProxy;
      
      let responseData: any;
      
      if (hasElectronAPI) {
        // Electron 环境：使用 electronAPI.httpProxy
        const result = await (window as any).electronAPI.httpProxy({
          method: 'GET',
          url: searchUrl.toString(),
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });

        if (!result.success) {
          throw new Error(result.error || '搜索请求失败');
        }

        if (result.status && result.status >= 400) {
          throw new Error(`HTTP ${result.status}: ${result.data || result.error}`);
        }

        // 解析响应
        responseData = typeof result.data === 'string' 
          ? JSON.parse(result.data) 
          : result.data;
      } else {
        // 开发环境：直接使用 fetch API
        const response = await fetch(searchUrl.toString(), {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        responseData = await response.json();
      }

      console.log('✅ SearXNG 搜索成功，找到', responseData.results?.length || 0, '条结果');

      return responseData;
    } catch (error: any) {
      console.error('❌ SearXNG 搜索失败:', error);
      throw error;
    }
  }

  /**
   * 格式化搜索结果为易读文本
   * @param response - SearXNG 原始响应
   * @param maxResults - 最大显示结果数
   * @returns 格式化后的文本
   */
  formatResultsToText(response: SearXNGSearchResponse, maxResults: number = 5): string {
    const { results, query } = response;

    if (!results || results.length === 0) {
      return `抱歉，没有找到关于"${query}"的相关结果。`;
    }

    const limitedResults = results.slice(0, maxResults);

    let text = `为你找到关于"${query}"的信息：\n\n`;

    limitedResults.forEach((result, index) => {
      text += `${index + 1}. 【${result.title}】\n`;
      text += `   ${result.content || '暂无摘要'}\n`;
      text += `   链接：${result.url}\n\n`;
    });

    if (results.length > maxResults) {
      text += `……还有 ${results.length - maxResults} 条结果未显示`;
    }

    return text;
  }

  /**
   * 搜索并直接返回格式化文本
   * @param query - 搜索关键词
   * @param maxResults - 最大显示结果数
   * @returns 格式化后的搜索结果文本
   */
  async searchAndFormat(query: string, maxResults: number = 5): Promise<string> {
    const response = await this.search(query, maxResults * 2); // 多搜一点，避免无效结果
    return this.formatResultsToText(response, maxResults);
  }
}

/* ==========================================
   创建单例
   ========================================== */
let searxngServiceInstance: SearXNGService | null = null;

export function getSearXNGService(): SearXNGService {
  if (!searxngServiceInstance) {
    searxngServiceInstance = new SearXNGService();
  }
  return searxngServiceInstance;
}
