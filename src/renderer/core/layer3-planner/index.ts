// ==========================================
// 第 3 层：清单层整合入口
// 任务编排层，只负责把意图变成可执行步骤清单
// ==========================================

export { IntentRegistry, getIntentRegistry } from './intentRegistry';

import type { StructuredIntent, ExecutionPlan } from '../../types';
import { getIntentRegistry } from './intentRegistry';

/**
 * 清单层管理器
 */
export class TaskPlannerManager {
  private intentRegistry = getIntentRegistry();

  /**
   * 初始化清单层
   */
  initialize(): void {
    console.log('📋 清单层已初始化');
  }

  /**
   * 创建执行计划
   */
  createPlan(intent: StructuredIntent): ExecutionPlan {
    const plan = this.intentRegistry.getPlan(intent);
    console.log('📋 执行计划已创建:', {
      taskId: plan.taskId,
      intent: plan.intent,
      steps: plan.steps.length
    });
    return plan;
  }
}

// 创建单例
let taskPlannerManagerInstance: TaskPlannerManager | null = null;

export function getTaskPlannerManager(): TaskPlannerManager {
  if (!taskPlannerManagerInstance) {
    taskPlannerManagerInstance = new TaskPlannerManager();
  }
  return taskPlannerManagerInstance;
}
