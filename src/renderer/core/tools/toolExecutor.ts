/**
 * 启源 AI - 工具执行器
 * 
 * 统一的工具执行函数，根据工具名分发到对应的 Electron API
 */

import { addToolLog, createTask, previewValue, updateProject } from '../../services/workspaceStore';
import { createLogger } from '../../../shared/logger';
import { executeRegisteredTool } from './toolRegistry';

const logger = createLogger('tool');

export interface ToolExecutionResult {
  success: boolean;
  data?: string;
  error?: string;
}

export async function executeTool(name: string, args: Record<string, any>): Promise<ToolExecutionResult> {
  logger.info('工具调用开始', { name, args });
  const api = (window as any).electronAPI;
  const startedAt = performance.now();

  try {
    let result: ToolExecutionResult;

    switch (name) {
      case 'workspace_create_task': {
        const task = createTask(args.title, args.project_id, args.priority);
        result = { success: true, data: `已创建任务：${task.title}` };
        break;
      }

      case 'workspace_update_project': {
        const patch: Record<string, any> = {};
        if (args.status) patch.status = args.status;
        if (args.goal) patch.goal = args.goal;
        if (args.next_step) patch.nextStep = args.next_step;
        if (args.blocker) patch.blocker = args.blocker;
        const project = updateProject(args.project_id, patch);
        result = project
          ? { success: true, data: `已更新项目：${project.name}` }
          : { success: false, error: `未找到项目：${args.project_id}` };
        break;
      }

      default:
        result = await executeRegisteredTool(api, name, args);
    }

    logger.info('工具调用结束', { name, success: result.success, result: result.data || result.error });
    addToolLog({
      name,
      argsPreview: previewValue(args),
      status: result.success ? 'success' : 'error',
      durationMs: Math.round(performance.now() - startedAt),
      resultPreview: previewValue(result.data || result.error || ''),
    });
    return result;
  } catch (error: any) {
    logger.error('工具调用异常崩溃', { name, error: error.message });
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
