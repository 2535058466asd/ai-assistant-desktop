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
