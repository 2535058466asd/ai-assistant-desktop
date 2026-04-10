/**
 * 启源 AI - 技能管理器
 * 
 * 功能：
 * 1. 注册技能
 * 2. 发现技能（根据意图匹配）
 * 3. 执行技能（带可视化步骤）
 * 4. 统计和管理
 */

import {
  SkillDefinition,
  SkillResult,
  SkillExecutionStep,
  RegistryEntry,
  ToolResult
} from './types';

// 导入工具库
import { getToolById } from '../tools/index';

// ============================================================
// 技能注册表（单例模式）
// ============================================================

class SkillRegistry {
  /** 已注册的技能 */
  private skills: Map<string, RegistryEntry> = new Map();
  
  /**
   * 注册一个技能
   * @param skill 技能定义
   */
  register(skill: SkillDefinition): void {
    const id = skill.metadata.name;
    
    if (this.skills.has(id)) {
      console.warn(`⚠️ 技能 "${id}" 已存在，将被覆盖`);
    }
    
    this.skills.set(id, {
      skill,
      registeredAt: new Date(),
      enabled: true,
      usageCount: 0
    });
  }
  
  /**
   * 获取所有已注册的技能
   */
  getAll(): RegistryEntry[] {
    return Array.from(this.skills.values()).filter(entry => entry.enabled);
  }
  
  /**
   * 根据 ID 获取技能
   */
  getById(id: string): RegistryEntry | undefined {
    return this.skills.get(id);
  }
  
  /**
   * 根据关键词搜索技能（用于发现/匹配）
   * @param query 搜索关键词或意图名
   * @returns 匹配的技能列表（按相关度排序）
   */
  search(query: string): RegistryEntry[] {
    const lowerQuery = query.toLowerCase();
    
    return Array.from(this.skills.values())
      .filter(entry => entry.enabled)
      .map(entry => ({
        entry,
        score: this.calculateRelevanceScore(entry.skill, lowerQuery)
      }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.entry);
  }
  
  /**
   * 计算技能与查询的相关度分数
   */
  private calculateRelevanceScore(skill: SkillDefinition, query: string): number {
    let score = 0;
    
    // 1. 名称匹配（权重高）
    if (skill.metadata.name.includes(query)) {
      score += 10;
    } else if (query.includes(skill.metadata.name)) {
      score += 8;
    }
    
    // 2. 描述匹配（关键词触发）
    const description = skill.metadata.description.toLowerCase();
    if (description.includes(query)) {
      score += 5;
    }
    
    // 3. 标签匹配
    if (skill.metadata.tags) {
      for (const tag of skill.metadata.tags) {
        if (tag.toLowerCase().includes(query)) {
          score += 3;
        }
      }
    }
    
    // 4. 使用场景匹配
    for (const scenario of skill.whenToUse) {
      if (scenario.toLowerCase().includes(query)) {
        score += 4;
      }
    }
    
    // 5. 示例输入匹配
    for (const example of skill.examples) {
      if (example.input.toLowerCase().includes(query)) {
        score += 2;
      }
    }
    
    return score;
  }
  
  /**
   * 启用/禁用技能
   */
  setEnabled(id: string, enabled: boolean): boolean {
    const entry = this.skills.get(id);
    if (!entry) return false;
    
    entry.enabled = enabled;
    return true;
  }
  
  /**
   * 增加使用次数统计
   */
  incrementUsage(id: string): void {
    const entry = this.skills.get(id);
    if (entry) {
      entry.usageCount++;
    }
  }
  
  /**
   * 获取使用统计
   */
  getStats(): { totalSkills: number; enabledSkills: number; topUsed: RegistryEntry[] } {
    const allEntries = Array.from(this.skills.values());
    const enabledEntries = allEntries.filter(e => e.enabled);
    const sortedByUsage = [...enabledEntries].sort((a, b) => b.usageCount - a.usageCount);
    
    return {
      totalSkills: allEntries.length,
      enabledSkills: enabledEntries.length,
      topUsed: sortedByUsage.slice(0, 5)
    };
  }
}

// 创建单例实例
const registry = new SkillRegistry();

export { registry as skillRegistry };

// ============================================================
// 技能执行器（带可视化步骤记录）
// ============================================================

class SkillExecutor {
  
  /**
   * 执行技能（核心方法）
   * @param skillId 技能 ID
   * @param params 用户参数
   * @returns 技能执行结果（包含步骤记录）
   */
  async execute(
    skillId: string,
    params: Record<string, any>
  ): Promise<SkillResult> {
    const startTime = Date.now();
    const steps: SkillExecutionStep[] = [];
    
    try {
      // 1. 查找技能
      const entry = registry.getById(skillId);
      
      if (!entry || !entry.enabled) {
        throw new Error(`技能 "${skillId}" 不存在或未启用`);
      }
      
      const skill = entry.skill;
      
      // 2. 验证参数
      this.validateParams(skill, params);
      
      // 3. 增加使用统计
      registry.incrementUsage(skillId);
      
      // 4. 执行技能（传入步骤记录函数）
      const result = await skill.execute(params, steps);
      
      // 5. 记录总时间
      result.totalExecutionTime = Date.now() - startTime;
      result.steps = steps;
      
      return result;
      
    } catch (error: any) {
      // 错误处理
      const errorResult: SkillResult = {
        success: false,
        error: error.message || `技能执行失败`,
        steps,
        totalExecutionTime: Date.now() - startTime
      };
      
      console.error(`❌ 技能执行失败: ${skillId}`, error);
      return errorResult;
    }
  }
  
  /**
   * 验证参数是否完整
   */
  private validateParams(skill: SkillDefinition, params: Record<string, any>): void {
    const requiredParams = skill.params.filter(p => p.required);
    
    for (const paramDef of requiredParams) {
      if (!(paramDef.name in params) || params[paramDef.name] === undefined) {
        throw new Error(`缺少必填参数: ${paramDef.name} (${paramDef.description})`);
      }
    }
  }
}

// 创建单例实例
const executor = new SkillExecutor();

export { executor as skillExecutor };

// ============================================================
// 辅助函数：在技能内部调用工具并记录步骤
// ============================================================

/**
 * 在技能中调用工具（自动记录步骤）
 * 
 * 使用方式：
 * ```typescript
 * async execute(params, steps) {
 *   // 步骤 1：打开浏览器
 *   const step1 = await callTool('browser.open-search', { query: 'B站' }, steps);
 *   
 *   // 步骤 2：获取天气
 *   const step2 = await callTool('network.wttr-weather', { location: '北京' }, steps);
 *   
 *   return { success: true, data: {...} };
 * }
 * ```
 */
export async function callTool(
  toolId: string,
  toolParams: Record<string, any>,
  steps: SkillExecutionStep[],
  stepName?: string,
  stepDescription?: string
): Promise<ToolResult> {
  const stepNumber = steps.length + 1;
  const startTime = Date.now();
  
  try {
    // 查找工具
    const tool = getToolById(toolId);
    
    if (!tool) {
      throw new Error(`工具 "${toolId}" 不存在`);
    }
    
    // 执行工具
    const result = await tool.execute(toolParams);
    
    // 记录步骤
    const step: SkillExecutionStep = {
      stepNumber,
      name: stepName || tool.name,
      description: stepDescription || `调用工具: ${tool.name}`,
      toolId,
      toolParams,
      result,
      startTime,
      endTime: Date.now(),
      success: result.success
    };
    
    steps.push(step);
    
    return result;
    
  } catch (error: any) {
    // 记录失败步骤
    const step: SkillExecutionStep = {
      stepNumber,
      name: stepName || toolId,
      description: stepDescription || `调用工具失败: ${toolId}`,
      toolId,
      toolParams,
      result: { success: false, error: error.message },
      startTime,
      endTime: Date.now(),
      success: false
    };
    
    steps.push(step);
    
    console.error(`❌ 工具调用失败: ${toolId} - ${error.message}`);
    
    return { success: false, error: error.message };
  }
}
