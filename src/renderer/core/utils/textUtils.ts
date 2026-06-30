import { getTextContent } from '../model/types';

/**
 * 截断文本用于 UI 展示或日志预览
 */
export function previewValue(value: unknown, maxLength: number = 180): string {
  let text: string;
  if (typeof value === 'string') {
    text = value;
  } else {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  }

  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

/**
 * 截断模型内容（支持 string 和 ModelContentPart[]）
 */
export function previewText(value: unknown, maxLength = 300): string {
  const text = getTextContent(value as any) || (typeof value === 'string' ? value : '');
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

/**
 * 验证工具调用参数是否为合法 JSON
 */
export function hasValidToolCallArguments(toolCall: { function?: { arguments?: string } }): boolean {
  const rawArguments = toolCall.function?.arguments;
  // 空参数视为有效（等同于 {}），让工具自己处理缺参
  if (typeof rawArguments !== 'string' || rawArguments.trim().length === 0) return true;
  try {
    JSON.parse(rawArguments);
    return true;
  } catch {
    return false;
  }
}
