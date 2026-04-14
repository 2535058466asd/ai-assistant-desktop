import { ipcMain } from 'electron'
import TurndownService from 'turndown'

// HTML 转 Markdown 实例（保留标题、列表、链接、代码块、表格等结构）
const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
})

/**
 * HTML 转 Markdown（保留网页结构信息，AI 更容易理解）
 */
function htmlToMarkdown(html: string): string {
  return turndown.turndown(html)
}

/**
 * HTML 转纯文本（去掉标签、脚本、样式，压缩空白）
 * 用于搜索结果等不需要结构的场景
 */
function htmlToText(html: string): string {
  let text = html;
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  text = text.replace(/<[^>]*>/g, ' ');
  text = text.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#\d+;/g, '');
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

// web_search — 后台静默搜索，返回文字结果（不打开浏览器）
export function registerWebSearch() {
  ipcMain.handle('web-search', async (_event, query: string) => {
    try {
      // 方案1: SearXNG（本地自建搜索，返回干净 JSON）
      try {
        console.log(`🔍 [web_search] 方案1: 尝试 SearXNG...`);
        const response = await fetch(`http://localhost:8888/search?q=${encodeURIComponent(query)}&format=json`, {
          signal: AbortSignal.timeout(8000)
        });
        if (response.ok) {
          const data: any = await response.json();
          const results = (data.results || []).slice(0, 8)
            .map((r: any, i: number) => `[${i + 1}] ${r.title}\n    ${r.content || ''}\n    ${r.url}`)
            .join('\n\n');
          if (results) {
            console.log(`🔍 [web_search] SearXNG 成功，返回 ${data.results?.length || 0} 条结果`);
            return { success: true, data: results };
          }
        }
      } catch (e: any) {
        console.log(`🔍 [web_search] SearXNG 失败: ${e.message}`);
      }

      // 方案2: 百度搜索（HTML 转纯文本）
      try {
        console.log(`🔍 [web_search] 方案2: 尝试百度搜索...`);
        const bdResponse = await fetch(`https://www.baidu.com/s?wd=${encodeURIComponent(query)}&rn=10`, {
          signal: AbortSignal.timeout(10000),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            'Accept': 'text/html,application/xhtml+xml',
          }
        });
        if (bdResponse.ok) {
          const html = await bdResponse.text();
          const text = htmlToText(html);
          if (text.length > 100) {
            const result = text.slice(0, 6000);
            console.log(`🔍 [web_search] 百度成功，返回 ${text.length} 字符`);
            return { success: true, data: result };
          }
        }
      } catch (e: any) {
        console.log(`🔍 [web_search] 百度失败: ${e.message}`);
      }

      // 方案3: 必应国内版（HTML 转纯文本）
      try {
        console.log(`🔍 [web_search] 方案3: 尝试必应国内版...`);
        const bingResponse = await fetch(`https://cn.bing.com/search?q=${encodeURIComponent(query)}&count=10`, {
          signal: AbortSignal.timeout(10000),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            'Accept': 'text/html,application/xhtml+xml',
          }
        });
        if (bingResponse.ok) {
          const html = await bingResponse.text();
          const text = htmlToText(html);
          if (text.length > 100) {
            const result = text.slice(0, 6000);
            console.log(`🔍 [web_search] 必应成功，返回 ${text.length} 字符`);
            return { success: true, data: result };
          }
        }
      } catch (e: any) {
        console.log(`🔍 [web_search] 必应失败: ${e.message}`);
      }

      console.log(`🔍 [web_search] 所有搜索方式均失败`);
      return { success: false, error: '所有搜索方式均失败，请检查网络连接' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}

// web_fetch — 后台抓取网页内容，转为 Markdown（保留标题、列表、链接、代码块、表格等结构）
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
      if (!contentType.includes('text') && !contentType.includes('html') && !contentType.includes('json') && !contentType.includes('markdown')) {
        return { success: false, error: `不支持的内容类型: ${contentType}` };
      }

      let text = await response.text();

      if (contentType.includes('html')) {
        text = htmlToMarkdown(text);
      }

      const MAX_LENGTH = 12000;
      if (text.length > MAX_LENGTH) {
        text = text.slice(0, MAX_LENGTH) + '\n\n...(内容过长，已截断)';
      }

      return { success: true, data: text || '网页内容为空' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}
