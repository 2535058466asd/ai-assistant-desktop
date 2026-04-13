import { ipcMain } from 'electron'

/**
 * 从 HTML 中提取搜索结果的通用函数
 */
function extractSearchResults(html: string, maxResults: number = 5): string[] {
  const results: string[] = [];
  // 通用正则：匹配 <a> 标签中的标题和链接，以及相邻的文本摘要
  const regex = /<a[^>]*href="(https?:\/\/[^"]*)"[^>]*>(.*?)<\/a>[\s\S]*?(?:<span[^>]*>(.*?)<\/span>)?/gs;
  let match;
  while ((match = regex.exec(html)) !== null && results.length < maxResults) {
    const url = match[1];
    const title = match[2].replace(/<[^>]*>/g, '').trim();
    const snippet = match[3] ? match[3].replace(/<[^>]*>/g, '').trim() : '';
    // 过滤掉导航链接、空标题等噪音
    if (title && title.length > 2 && !url.includes('bing.com') && !url.includes('baidu.com/link') && !url.includes('m.baidu.com')) {
      results.push(`[${results.length + 1}] ${title}\n    ${snippet}\n    ${url}`);
    }
  }
  return results;
}

// web_search — 后台静默搜索，返回文字结果（不打开浏览器）
export function registerWebSearch() {
  ipcMain.handle('web-search', async (_event, query: string) => {
    try {
      // 方案1: SearXNG（本地自建搜索，最佳体验）
      try {
        const response = await fetch(`http://localhost:8888/search?q=${encodeURIComponent(query)}&format=json`, {
          signal: AbortSignal.timeout(8000)
        });
        if (response.ok) {
          const data: any = await response.json();
          const results = (data.results || []).slice(0, 8)
            .map((r: any, i: number) => `[${i + 1}] ${r.title}\n    ${r.content || ''}\n    ${r.url}`)
            .join('\n\n');
          return { success: true, data: results || '未找到相关结果' };
        }
      } catch {
        // SearXNG 不可用，尝试方案2
      }

      // 方案2: 百度搜索抓取（国内最稳定）
      try {
        const bdResponse = await fetch(`https://www.baidu.com/s?wd=${encodeURIComponent(query)}`, {
          signal: AbortSignal.timeout(10000),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'zh-CN,zh;q=0.9',
          }
        });
        if (bdResponse.ok) {
          const html = await bdResponse.text();
          const results: string[] = [];
          // 百度搜索结果格式：<h3 class="c-title"><a href="...">标题</a></h3>
          const bdRegex = /<h3[^>]*class="[^"]*t[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>[\s\S]*?(?:<span[^>]*class="[^"]*content-right[^"]*"[^>]*>([\s\S]*?)<\/span>)?/gs;
          let match;
          while ((match = bdRegex.exec(html)) !== null && results.length < 5) {
            const url = match[1];
            const title = match[2].replace(/<[^>]*>/g, '').trim();
            const snippet = match[3] ? match[3].replace(/<[^>]*>/g, '').trim() : '';
            if (title && !url.includes('baidu.com/link')) {
              results.push(`[${results.length + 1}] ${title}\n    ${snippet}\n    ${url}`);
            }
          }
          if (results.length > 0) {
            return { success: true, data: results.join('\n\n') };
          }
        }
      } catch {
        // 百度也失败，尝试方案3
      }

      // 方案3: 必应国内版（cn.bing.com，国内可访问）
      try {
        const bingResponse = await fetch(`https://cn.bing.com/search?q=${encodeURIComponent(query)}`, {
          signal: AbortSignal.timeout(10000),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'zh-CN,zh;q=0.9',
          }
        });
        if (bingResponse.ok) {
          const html = await bingResponse.text();
          const results: string[] = [];
          const regex = /<li class="b_algo"><h2><a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a><\/h2>[\s\S]*?(?:<p[^>]*>(.*?)<\/p>)?/gs;
          let match;
          while ((match = regex.exec(html)) !== null && results.length < 5) {
            const url = match[1];
            const title = match[2].replace(/<[^>]*>/g, '').trim();
            const snippet = match[3] ? match[3].replace(/<[^>]*>/g, '').trim() : '';
            results.push(`[${results.length + 1}] ${title}\n    ${snippet}\n    ${url}`);
          }
          if (results.length > 0) {
            return { success: true, data: results.join('\n\n') };
          }
        }
      } catch {
        // 必应也失败
      }

      // 方案4: DuckDuckGo（海外环境兜底）
      try {
        const ddgResponse = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`, {
          signal: AbortSignal.timeout(8000),
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (ddgResponse.ok) {
          const ddgData: any = await ddgResponse.json();
          let result = '';
          if (ddgData.Abstract) {
            result = ddgData.Abstract;
            if (ddgData.AbstractSource) result += `\n来源: ${ddgData.AbstractSource}`;
            if (ddgData.AbstractURL) result += `\n链接: ${ddgData.AbstractURL}`;
          }
          if (ddgData.RelatedTopics && ddgData.RelatedTopics.length > 0) {
            const related = ddgData.RelatedTopics.slice(0, 5)
              .filter((t: any) => t.Text)
              .map((t: any) => `• ${t.Text}`)
              .join('\n');
            if (related) result += (result ? '\n\n相关结果:\n' : '') + related;
          }
          if (result) return { success: true, data: result };
        }
      } catch {
        // DuckDuckGo 也失败
      }

      return { success: false, error: '所有搜索方式均失败，请检查网络连接' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}

// web_fetch — 后台抓取网页文字内容（不打开浏览器）
export function registerWebFetch() {
  ipcMain.handle('web-fetch', async (_event, url: string) => {
    try {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return { success: false, error: 'URL 必须以 http:// 或 https:// 开头' };
      }

      const response = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        }
      });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text') && !contentType.includes('html') && !contentType.includes('json')) {
        return { success: false, error: `不支持的内容类型: ${contentType}` };
      }

      let text = await response.text();

      // 如果是 HTML，提取纯文本
      if (contentType.includes('html')) {
        text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
        text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
        text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '');
        text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '');
        text = text.replace(/<header[\s\S]*?<\/header>/gi, '');
        text = text.replace(/<[^>]*>/g, '');
        text = text.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
        text = text.replace(/\n{3,}/g, '\n\n').trim();
      }

      const MAX_LENGTH = 8000;
      if (text.length > MAX_LENGTH) {
        text = text.slice(0, MAX_LENGTH) + '\n\n...(内容过长，已截断)';
      }

      return { success: true, data: text || '网页内容为空' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}
