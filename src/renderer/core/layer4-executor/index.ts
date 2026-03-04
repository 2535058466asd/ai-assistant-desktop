// ==========================================
// 第 4 层：执行层整合入口
// 任务执行层，负责执行具体的任务
// ==========================================

export { TaskExecutor, getTaskExecutor } from './taskExecutor';

import type { ExecutionPlan, StructuredIntent } from '../../types';
import { getTaskExecutor } from './taskExecutor';

/**
 * 执行层管理器
 */
export class TaskExecutorManager {
  private taskExecutor = getTaskExecutor();

  /**
   * 初始化执行层
   */
  initialize(): void {
    console.log('⚙️  执行层已初始化');
  }

  /**
   * 执行计划
   */
  async executePlan(
    plan: ExecutionPlan,
    intent: StructuredIntent,
    sendMessage: (content: string) => Promise<void>
  ): Promise<void> {
    return await this.taskExecutor.executePlan(plan, intent, sendMessage);
  }
}

// 创建单例
let taskExecutorManagerInstance: TaskExecutorManager | null = null;

export function getTaskExecutorManager(): TaskExecutorManager {
  if (!taskExecutorManagerInstance) {
    taskExecutorManagerInstance = new TaskExecutorManager();
  }
  return taskExecutorManagerInstance;
}
