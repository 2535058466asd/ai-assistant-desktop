/**
 * 启源 AI - 文档解析服务
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
  const pdfParseModule = await import('pdf-parse');
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
 * 按段落分割，每段不超过 maxChars 字符
 */
export function chunkText(
  text: string,
  maxChars: number = 500,
  overlap: number = 50
): string[] {
  // 先按双换行分段
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 0);

  const chunks: string[] = [];

  for (const para of paragraphs) {
    if (para.length <= maxChars) {
      chunks.push(para);
    } else {
      // 长段落按句子分割
      const sentences = para.split(/(?<=[。！？.!?\n])/);
      let current = '';

      for (const sentence of sentences) {
        if (current.length + sentence.length > maxChars && current.length > 0) {
          chunks.push(current.trim());
          // 保留overlap字符用于上下文衔接
          current = current.slice(-overlap) + sentence;
        } else {
          current += sentence;
        }
      }

      if (current.trim()) {
        chunks.push(current.trim());
      }
    }
  }

  return chunks;
}
