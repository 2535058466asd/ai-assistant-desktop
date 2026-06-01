/**
 * Nova AI - 文档解析服务
 *
 * 支持 PDF、Word(.docx)、Excel(.xlsx)、TXT、MD 文件的文本提取
 * 提取后的文本可导入 RAG 知识库
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * 解析结果
 */
export interface ParseResult {
  success: boolean;
  text?: string;
  pageCount?: number;
  sheetCount?: number;
  error?: string;
}

/**
 * 根据文件扩展名自动选择解析器
 */
export async function parseFile(filePath: string): Promise<ParseResult> {
  if (!fs.existsSync(filePath)) {
    return { success: false, error: `文件不存在: ${filePath}` };
  }

  const ext = path.extname(filePath).toLowerCase();

  try {
    switch (ext) {
      case '.pdf':
        return await parsePDF(filePath);
      case '.docx':
        return await parseDocx(filePath);
      case '.xlsx':
      case '.xls':
        return await parseExcel(filePath);
      case '.txt':
      case '.md':
        return parseText(filePath);
      default:
        return { success: false, error: `不支持的文件格式: ${ext}，支持 PDF/Word/Excel/TXT/MD` };
    }
  } catch (error: any) {
    return { success: false, error: `解析失败: ${error.message}` };
  }
}

/**
 * 解析 PDF 文件
 */
async function parsePDF(filePath: string): Promise<ParseResult> {
  const pdfParseModule: any = await import('pdf-parse');
  const pdfParse = pdfParseModule.default || pdfParseModule;
  const buffer = fs.readFileSync(filePath);
  const data = await (pdfParse as any)(buffer);

  return {
    success: true,
    text: data.text,
    pageCount: data.numpages,
  };
}

/**
 * 解析 Word (.docx) 文件
 */
async function parseDocx(filePath: string): Promise<ParseResult> {
  const mammoth = await import('mammoth');
  const buffer = fs.readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer });

  return {
    success: true,
    text: result.value,
  };
}

/**
 * 解析 Excel (.xlsx/.xls) 文件
 * 将每个Sheet转为文本，格式：Sheet名 + 表格内容
 */
async function parseExcel(filePath: string): Promise<ParseResult> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.readFile(filePath);
  const sheets: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    // 转为二维数组
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

    if (data.length === 0) continue;

    let sheetText = `=== Sheet: ${sheetName} ===\n`;
    for (const row of data) {
      const cells = (row as any[]).map((cell: any) => String(cell ?? '')).join(' | ');
      sheetText += cells + '\n';
    }
    sheets.push(sheetText);
  }

  return {
    success: true,
    text: sheets.join('\n'),
    sheetCount: workbook.SheetNames.length,
  };
}

/**
 * 解析纯文本文件 (.txt, .md)
 */
function parseText(filePath: string): ParseResult {
  const text = fs.readFileSync(filePath, 'utf-8');
  return { success: true, text };
}

/**
 * 将解析后的文本切分成适合RAG的文档片段
 * 中文感知：标题边界、多级分隔符、最小 chunk 保护
 */
export function chunkText(
  text: string,
  maxChars: number = 800,
  overlap: number = 150
): string[] {
  const MIN_CHUNK = 100;

  // 第一步：按标题硬切分
  const sections = splitByHeadings(text);

  const chunks: string[] = [];

  for (const section of sections) {
    if (section.length <= maxChars) {
      if (section.length >= MIN_CHUNK) {
        chunks.push(section);
      } else {
        // 过短的片段合并到上一个 chunk
        if (chunks.length > 0 && chunks[chunks.length - 1].length + section.length <= maxChars) {
          chunks[chunks.length - 1] += '\n\n' + section;
        } else if (section.length > 0) {
          chunks.push(section);
        }
      }
      continue;
    }

    // 第二步：按双换行分段
    const paragraphs = section.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 0);

    for (const para of paragraphs) {
      if (para.length <= maxChars) {
        appendChunk(chunks, para, maxChars, MIN_CHUNK);
      } else {
        // 第三步：长段落按多级分隔符切分
        splitLongParagraph(chunks, para, maxChars, overlap, MIN_CHUNK);
      }
    }
  }

  return chunks.filter(c => c.trim().length > 0);
}

function appendChunk(chunks: string[], text: string, maxChars: number, minChunk: number): void {
  if (chunks.length > 0 && chunks[chunks.length - 1].length + text.length + 2 <= maxChars) {
    chunks[chunks.length - 1] += '\n\n' + text;
  } else if (text.length >= minChunk || chunks.length === 0) {
    chunks.push(text);
  } else {
    // 过短，尽量合并（不超过 maxChars）
    if (chunks.length > 0 && chunks[chunks.length - 1].length + text.length + 1 <= maxChars) {
      chunks[chunks.length - 1] += '\n' + text;
    } else {
      chunks.push(text);
    }
  }
}

function splitByHeadings(text: string): string[] {
  // 匹配 Markdown 标题、中文编号标题（仅匹配带章节部篇的结构化标题，不匹配普通列表项）
  const headingPattern = /^(#{1,6}\s+.+|第[一二三四五六七八九十\d]+[章节部篇]\s*.+)$/gm;

  const starts: number[] = [];
  let match: RegExpExecArray | null;

  while ((match = headingPattern.exec(text)) !== null) {
    starts.push(match.index);
  }

  if (starts.length === 0) return [text];

  const sections: string[] = [];

  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1] : text.length;
    const section = text.slice(starts[i], end).trim();
    if (section) sections.push(section);
  }

  // 标题前的前导文本
  if (starts[0] > 0) {
    const preamble = text.slice(0, starts[0]).trim();
    if (preamble) sections.unshift(preamble);
  }

  return sections;
}

function splitLongParagraph(chunks: string[], para: string, maxChars: number, overlap: number, minChunk: number): void {
  // 多级分隔符：句号 > 分号/冒号 > 逗号 > 硬切
  const separators = [/(?<=[。！？.!?\n])/, /(?<=[；：;:])/, /(?<=[，,])/];
  let sentences: string[] = [para];

  for (const sep of separators) {
    const candidate = para.split(sep).filter(s => s.length > 0);
    if (candidate.length > 1) {
      sentences = candidate;
      break;
    }
  }

  // 如果所有分隔符都无法切分，硬切
  if (sentences.length <= 1 && para.length > maxChars) {
    sentences = [];
    for (let i = 0; i < para.length; i += maxChars - overlap) {
      sentences.push(para.slice(i, i + maxChars));
    }
  }

  let current = '';
  for (const sentence of sentences) {
    if (current.length + sentence.length > maxChars && current.length >= minChunk) {
      chunks.push(current.trim());
      current = current.slice(-overlap) + sentence;
    } else {
      current += sentence;
    }
  }

  if (current.trim().length >= minChunk) {
    chunks.push(current.trim());
  } else if (current.trim().length > 0 && chunks.length > 0
    && chunks[chunks.length - 1].length + current.trim().length <= maxChars) {
    chunks[chunks.length - 1] += current.trim();
  } else if (current.trim().length > 0) {
    chunks.push(current.trim());
  }
}
