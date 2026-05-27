/**
 * Nova AI - 工具执行器
 * 
 * 统一的工具执行函数，根据工具名分发到对应的 Electron API
 */

import { addToolLog, previewValue } from '../../services/workspaceStore';
import { createLogger, type LogMeta } from '../../../shared/logger';
import { executeRegisteredTool } from './toolRegistry';

const logger = createLogger('tool');

export interface ToolExecutionResult {
  success: boolean;
  data?: string;
  error?: string;
}

export async function executeTool(name: string, args: Record<string, any>, meta: LogMeta = {}): Promise<ToolExecutionResult> {
  logger.info('工具调用开始', { ...meta, phase: 'tool', name, args });
  const api = (window as any).electronAPI;
  const startedAt = performance.now();

  try {
    const result = await executeRegisteredTool(api, name, args);

    logger.info('工具调用结束', {
      ...meta,
      phase: 'tool',
      name,
      success: result.success,
      durationMs: Math.round(performance.now() - startedAt),
      result: result.data || result.error,
    });
    addToolLog({
      name,
      argsPreview: previewValue(args),
      status: result.success ? 'success' : 'error',
      durationMs: Math.round(performance.now() - startedAt),
      resultPreview: previewValue(result.data || result.error || ''),
    });
    return result;
  } catch (error: any) {
    logger.error('工具调用异常崩溃', {
      ...meta,
      phase: 'tool',
      name,
      durationMs: Math.round(performance.now() - startedAt),
      error: error.message,
    });
    addToolLog({
      name,
      argsPreview: previewValue(args),
      status: 'error',
      durationMs: Math.round(performance.now() - startedAt),
      resultPreview: error.message,
    });
    return { success: false, error: error.message };
  }
}
