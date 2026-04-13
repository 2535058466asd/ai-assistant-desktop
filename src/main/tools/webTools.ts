import { ipcMain } from 'electron'

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

      // 方案2: DuckDuckGo 即时回答 API（免费，无需 key）
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
        // DuckDuckGo 也不可用，尝试方案3
      }

      // 方案3: Bing 搜索抓取
      try {
        const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
        const bingResponse = await fetch(bingUrl, {
          signal: AbortSignal.timeout(10000),
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        if (bingResponse.ok) {
          const html = await bingResponse.text();
          const results: string[] = [];
          const regex = /<li class="b_algo"><h2><a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a><\/h2>(?:<div[^>]*class="b_caption"[^>]*><p[^>]*>(.*?)<\/p>)?/gs;
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
        // Bing 抓取也失败
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
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
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
