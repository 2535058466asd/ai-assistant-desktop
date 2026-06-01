import { ipcMain } from 'electron'
import TurndownService from 'turndown'
import * as cheerio from 'cheerio'
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
    logger.info('搜索配置已更新', searchConfig);
    return { success: true, data: searchConfig };
  });
}

// HTML 转 Markdown 实例（保留标题、列表、链接、代码块、表格等结构）
const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
})

turndown.remove(['script', 'style', 'noscript', 'svg', 'nav', 'footer', 'header', 'aside', 'form', 'iframe'])

function cleanHtml(html: string): string {
  const $ = cheerio.load(html)

  $('script, style, noscript, svg, iframe, form').remove()
  $('nav, header, footer, aside, [role="navigation"], [role="banner"], [role="contentinfo"]').remove()

  const noisePattern = /ad[\s_-]?|banner|cookie|consent|popup|modal|overlay|social|share|comment|related|sidebar|widget|signup|subscribe|newsletter|promo|sponsor|tracking|analytics/i
  $('div, section').each((_i, el) => {
    const $el = $(el)
    const classes = $el.attr('class') || ''
    const id = $el.attr('id') || ''
    if (noisePattern.test(classes) || noisePattern.test(id)) {
      $el.remove()
    }
  })

  let $content = $('article').first()
  if (!$content.length) $content = $('main').first()
  if (!$content.length) $content = $('[role="main"]').first()
  if (!$content.length) $content = $('.post-content, .article-body, .article-content, .entry-content, .post-body, .markdown-body, .content-body, .rich-text').first()
  if (!$content.length) $content = $('#content, #main-content, #article, #post, #main').first()
  if (!$content.length) $content = $('body')

  $content.find('*').each((_i, el) => {
    const $el = $(el)
    if (!$el.children().length && !$el.text().trim()) {
      if (!/^(br|hr|img|input|video|audio|source|picture|figure|figcaption)$/i.test(el.tagName)) {
        $el.remove()
      }
    }
  })

  return $.html($content)
}

function htmlToMarkdown(html: string): string {
  const cleaned = cleanHtml(html)
  return turndown.turndown(cleaned)
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
function parseBaiduResults(html: string): { results: string[]; count: number } {
  const results: string[] = [];

  // 先去掉 script/style，减少干扰
  let clean = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  clean = clean.replace(/<style[\s\S]*?<\/style>/gi, '');

  // 百度每个搜索结果都有一个 <h3> 标题，用这个作为锚点向上向下提取
  const h3Regex = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;
  let h3Match;

  while ((h3Match = h3Regex.exec(clean)) !== null && results.length < 8) {
    const title = stripTag(h3Match[1]);
    if (!title || title.length < 4) continue;

    // 跳过百度知识图谱、百科卡片、相关搜索等非结果内容
    const lowerTitle = title.toLowerCase();
    if (
      title.includes('百度') ||
      title.includes('相关搜索') ||
      title.includes('其他人还在搜') ||
      title.includes('相关问题') ||
      title.includes('大家还在搜') ||
      title.includes('为您推荐') ||
      lowerTitle.includes('baidu')
    ) continue;

    // 从 <h3> 向前找最近的 <a href="..."> 来获取链接
    const beforeH3 = clean.substring(Math.max(0, h3Match.index - 800), h3Match.index);
    // 只匹配真正的搜索结果链接（百度搜索结果链接通常是 http/https，且在 data-click 容器内）
    const linkMatches = [...beforeH3.matchAll(/<a[^>]*href="(https?:\/\/[^"]*)"[^>]*>/g)];
    const link = linkMatches.length > 0 ? linkMatches[linkMatches.length - 1][1] : '';

    // 跳过百度百科、知道、贴吧等站内知识卡片（不是搜索结果）
    if (link.includes('baike.baidu.com') || link.includes('zhidao.baidu.com') || link.includes('tieba.baidu.com')) {
      // 额外检查：如果标题很短且像词条名，跳过
      if (title.length < 15) continue;
    }

    // 跳过广告
    const blockStart = Math.max(0, h3Match.index - 800);
    const blockContext = clean.substring(blockStart, h3Match.index + h3Match[0].length + 200);
    if (blockContext.includes('data-tuiguang') || blockContext.includes('广告')) continue;

    // 从 <h3> 向后找摘要（下一个 <h3> 之前的文本内容）
    const afterH3 = clean.substring(h3Match.index + h3Match[0].length);
    const nextH3 = afterH3.search(/<h3[^>]*>/i);
    const snippet = nextH3 > 0 ? afterH3.substring(0, nextH3) : afterH3.substring(0, 800);
    const abstract = stripTag(snippet).substring(0, 200);

    // 质量过滤：标题和摘要都要有足够的实际内容
    if (abstract.length < 15) continue;
    if (title.length < 4) continue;

    results.push(`[${results.length + 1}] ${title}\n    ${abstract}\n    ${link}`);
  }

  return { results, count: results.length };
}

/**
 * 解析必应搜索结果，只提取标题、摘要、链接
 */
function parseBingResults(html: string): { results: string[]; count: number } {
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

  return { results, count: results.length };
}

// 各搜索引擎实现
function formatSearchResult(index: number, title: string, content: string, url: string, engines?: string[]): string {
  const source = engines?.length ? `\n    来源: ${engines.join(', ')}` : '';
  return `[${index + 1}] ${title}\n    ${content}\n    ${url}${source}`;
}

async function trySearXNG(query: string): Promise<{ success: boolean; data?: string } | null> {
  const startedAt = Date.now();
  try {
    logger.debug('web_search 尝试 SearXNG', { query, url: searchConfig.searxngUrl });
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
        .filter((r: any) => r?.title && r?.url)
        .map((r: any, i: number) => formatSearchResult(i, r.title, r.content || '', r.url, r.engines))
        .join('\n\n');
      if (results) {
        logger.info('web_search SearXNG 成功', {
          engine: 'searxng',
          resultCount: data.results?.length || 0,
          durationMs: Date.now() - startedAt,
        });
        return { success: true, data: results };
      }
    }
    logger.warn('web_search SearXNG 无有效结果', {
      engine: 'searxng',
      fallbackReason: `HTTP ${response.status}`,
      durationMs: Date.now() - startedAt,
    });
    return null;
  } catch (e: any) {
    logger.warn('web_search SearXNG 失败，准备降级', {
      engine: 'searxng',
      fallbackReason: e.message,
      durationMs: Date.now() - startedAt,
    });
    return null;
  }
}

async function tryBaidu(query: string): Promise<{ success: boolean; data?: string } | null> {
  const startedAt = Date.now();
  try {
    logger.debug('web_search 尝试百度 HTML', { query });
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
      if (/百度安全验证|请输入验证码|网络不给力，请稍后重试|访问异常/i.test(html)) {
        logger.warn('web_search 百度返回验证页面，判定失败', {
          engine: 'baidu-html',
          fallbackReason: 'verification_page',
          durationMs: Date.now() - startedAt,
        });
        return null;
      }
      const { results, count } = parseBaiduResults(html);
      if (count > 0 && results.join('\n\n').length > 50) {
        logger.info('web_search 百度 HTML 成功', {
          engine: 'baidu-html',
          resultCount: count,
          durationMs: Date.now() - startedAt,
        });
        return { success: true, data: results.join('\n\n') };
      }
    }
    logger.warn('web_search 百度 HTML 无有效结果', {
      engine: 'baidu-html',
      fallbackReason: `HTTP ${bdResponse.status}`,
      durationMs: Date.now() - startedAt,
    });
    return null;
  } catch (e: any) {
    logger.warn('web_search 百度 HTML 失败', {
      engine: 'baidu-html',
      fallbackReason: e.message,
      durationMs: Date.now() - startedAt,
    });
    return null;
  }
}

async function tryBing(query: string): Promise<{ success: boolean; data?: string } | null> {
  const startedAt = Date.now();
  try {
    logger.debug('web_search 尝试必应 HTML', { query });
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
      const { results, count } = parseBingResults(html);
      if (count > 0 && results.join('\n\n').length > 50) {
        logger.info('web_search 必应 HTML 成功', {
          engine: 'bing-html',
          resultCount: count,
          durationMs: Date.now() - startedAt,
        });
        return { success: true, data: results.join('\n\n') };
      }
    }
    logger.warn('web_search 必应 HTML 无有效结果', {
      engine: 'bing-html',
      fallbackReason: `HTTP ${bingResponse.status}`,
      durationMs: Date.now() - startedAt,
    });
    return null;
  } catch (e: any) {
    logger.warn('web_search 必应 HTML 失败', {
      engine: 'bing-html',
      fallbackReason: e.message,
      durationMs: Date.now() - startedAt,
    });
    return null;
  }
}

// web_search — 后台静默搜索，返回文字结果（不打开浏览器）
export function registerWebSearch() {
  ipcMain.handle('web-search', async (_event, query: string) => {
    try {
      const engine = searchConfig.preferredEngine
      logger.info('web_search 开始', { query, preferredEngine: engine })

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

      // auto: 优先使用结构化 JSON；HTML 抓取仅作为兜底。
      const searxng = await trySearXNG(query)
      if (searxng) return searxng

      const bing = await tryBing(query)
      if (bing) return bing

      const baidu = await tryBaidu(query)
      if (baidu) return baidu

      logger.warn('web_search 所有搜索方式均失败', { query });
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
          hostname.startsWith('169.254.') ||
          hostname.endsWith('.local') ||
          hostname === '::1' ||
          hostname === '[::1]'
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
