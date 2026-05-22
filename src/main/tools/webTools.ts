import { ipcMain } from 'electron'
import TurndownService from 'turndown'
import { createLogger } from '../../shared/logger'

const logger = createLogger('tool')

// 搜索配置（可通过 settings UI 动态修改）
let searchConfig = {
  preferredEngine: 'auto' as 'auto' | 'searxng' | 'baidu' | 'bing',
  searxngUrl: 'http://localhost:8888',
}

export function registerSearchSetConfig() {
  ipcMain.handle('search-set-config', async (_event, nextConfig: Partial<typeof searchConfig>) => {
    if (nextConfig.preferredEngine && ['auto', 'searxng', 'baidu', 'bing'].includes(nextConfig.preferredEngine)) {
      searchConfig.preferredEngine = nextConfig.preferredEngine;
    }
    if (typeof nextConfig.searxngUrl === 'string' && nextConfig.searxngUrl.trim()) {
      searchConfig.searxngUrl = nextConfig.searxngUrl.trim().replace(/\/$/, '');
    }
    logger.info('Search config updated', searchConfig);
    return { success: true, data: searchConfig };
  });
}

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

/**
 * 从 HTML 中提取纯文本（去掉标签但保留基本结构）
 */
function stripTag(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 解析百度搜索结果，只提取标题、摘要、链接（过滤广告和导航噪音）
 */
function parseBaiduResults(html: string): string {
  const results: string[] = [];

  // 先去掉 script/style，减少干扰
  let clean = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  clean = clean.replace(/<style[\s\S]*?<\/style>/gi, '');

  // 百度每个搜索结果都有一个 <h3> 标题，用这个作为锚点向上向下提取
  const h3Regex = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;
  let h3Match;

  while ((h3Match = h3Regex.exec(clean)) !== null && results.length < 8) {
    const title = stripTag(h3Match[1]);
    if (!title || title.length < 2 || title.includes('百度')) continue;

    // 从 <h3> 向前找最近的 <a href="..."> 来获取链接
    const beforeH3 = clean.substring(Math.max(0, h3Match.index - 500), h3Match.index);
    const linkMatch = beforeH3.match(/<a[^>]*href="(https?:\/\/[^"]*|http:\/\/[^"]*)"[^>]*>\s*$/);
    // 如果前面没找到，尝试在 h3 内部找
    const linkInH3 = h3Match[1].match(/href="([^"]*)"/);
    const link = linkMatch ? linkMatch[1] : (linkInH3 ? linkInH3[1] : '');

    // 从 <h3> 向后找摘要（下一个 <h3> 之前的文本内容）
    const afterH3 = clean.substring(h3Match.index + h3Match[0].length);
    const nextH3 = afterH3.search(/<h3[^>]*>/i);
    const snippet = nextH3 > 0 ? afterH3.substring(0, nextH3) : afterH3.substring(0, 500);
    const abstract = stripTag(snippet).substring(0, 200);

    // 过滤广告和导航
    if (title.includes('广告') || abstract.includes('广告')) continue;
    if (abstract.length < 10) continue;

    results.push(`[${results.length + 1}] ${title}\n    ${abstract}\n    ${link}`);
  }

  return results.join('\n\n');
}

/**
 * 解析必应搜索结果，只提取标题、摘要、链接
 */
function parseBingResults(html: string): string {
  const results: string[] = [];

  // 必应搜索结果在 <li class="b_algo"> 中
  const resultRegex = /<li[^>]*class="[^"]*b_algo[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let match;

  while ((match = resultRegex.exec(html)) !== null && results.length < 8) {
    const block = match[1];

    // 提取标题
    const titleMatch = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    if (!titleMatch) continue;

    const title = stripTag(titleMatch[1]);
    if (!title || title.length < 2) continue;

    // 提取链接
    const linkMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]*)"[^>]*>/);
    const link = linkMatch ? linkMatch[1] : '';

    // 提取摘要
    const abstractMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const abstract = abstractMatch ? stripTag(abstractMatch[1]) : '';

    results.push(`[${results.length + 1}] ${title}\n    ${abstract}\n    ${link}`);
  }

  return results.join('\n\n');
}

// 各搜索引擎实现
async function trySearXNG(query: string): Promise<{ success: boolean; data?: string } | null> {
  try {
    logger.debug('web_search trying SearXNG', { query, url: searchConfig.searxngUrl });
    const response = await fetch(`${searchConfig.searxngUrl}/search?q=${encodeURIComponent(query)}&format=json`, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      }
    });
    if (response.ok) {
      const data: any = await response.json();
      const results = (data.results || []).slice(0, 8)
        .map((r: any, i: number) => `[${i + 1}] ${r.title}\n    ${r.content || ''}\n    ${r.url}`)
        .join('\n\n');
      if (results) {
        logger.info('web_search SearXNG succeeded', { resultCount: data.results?.length || 0 });
        return { success: true, data: results };
      }
    }
    return null;
  } catch (e: any) {
    logger.debug('web_search SearXNG failed', { error: e.message });
    return null;
  }
}

async function tryBaidu(query: string): Promise<{ success: boolean; data?: string } | null> {
  try {
    logger.debug('web_search trying Baidu', { query });
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
      const results = parseBaiduResults(html);
      if (results.length > 50) {
        logger.info('web_search Baidu succeeded');
        return { success: true, data: results };
      }
    }
    return null;
  } catch (e: any) {
    logger.debug('web_search Baidu failed', { error: e.message });
    return null;
  }
}

async function tryBing(query: string): Promise<{ success: boolean; data?: string } | null> {
  try {
    logger.debug('web_search trying Bing CN', { query });
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
      const results = parseBingResults(html);
      if (results.length > 50) {
        logger.info('web_search Bing CN succeeded');
        return { success: true, data: results };
      }
    }
    return null;
  } catch (e: any) {
    logger.debug('web_search Bing CN failed', { error: e.message });
    return null;
  }
}

// web_search — 后台静默搜索，返回文字结果（不打开浏览器）
export function registerWebSearch() {
  ipcMain.handle('web-search', async (_event, query: string) => {
    try {
      const engine = searchConfig.preferredEngine
      logger.info('web_search starting', { query, preferredEngine: engine })

      // 指定引擎时只尝试该引擎
      if (engine === 'searxng') {
        const r = await trySearXNG(query)
        if (r) return r
        return { success: false, error: 'SearXNG 搜索失败，请检查服务是否运行' }
      }
      if (engine === 'baidu') {
        const r = await tryBaidu(query)
        if (r) return r
        return { success: false, error: '百度搜索失败' }
      }
      if (engine === 'bing') {
        const r = await tryBing(query)
        if (r) return r
        return { success: false, error: '必应搜索失败' }
      }

      // auto: 按优先级依次尝试
      const searxng = await trySearXNG(query)
      if (searxng) return searxng

      const baidu = await tryBaidu(query)
      if (baidu) return baidu

      const bing = await tryBing(query)
      if (bing) return bing

      logger.warn('web_search all providers failed', { query });
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

      // 安全检查：禁止访问内网地址（防止 SSRF）
      try {
        const parsedUrl = new URL(url);
        const hostname = parsedUrl.hostname;
        if (
          hostname === 'localhost' ||
          hostname === '127.0.0.1' ||
          hostname === '0.0.0.0' ||
          hostname.startsWith('192.168.') ||
          hostname.startsWith('10.') ||
          hostname.startsWith('172.') ||
          hostname.endsWith('.local') ||
          hostname === '::1'
        ) {
          return { success: false, error: '不允许访问内网地址' };
        }
      } catch {
        return { success: false, error: '无效的 URL' };
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
