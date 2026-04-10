/**
 * 启源 AI - 技能系统类型定义
 * 
 * 参考：OpenClaw SKILL.md 编写规范
 * 设计原则：
 * 1. Tool = 基础能力（单一功能）
 * 2. Skill = 工具组合（完成复杂任务）
 * 3. 可维护、可迭代、可扩展
 */

// ============================================================
// 一、工具相关类型（Tools）
// ============================================================

/**
 * 工具执行结果
 */
export interface ToolResult {
  /** 是否成功 */
  success: boolean;
  /** 返回数据 */
  data?: any;
  /** 错误信息 */
  error?: string;
  /** 执行时间（毫秒） */
  executionTime?: number;
}

/**
 * 工具参数定义
 */
export interface ToolParamDef {
  /** 参数名 */
  name: string;
  /** 参数类型 */
  type: 'string' | 'number' | 'boolean' | 'object';
  /** 是否必填 */
  required: boolean;
  /** 参数描述 */
  description: string;
  /** 默认值 */
  defaultValue?: any;
}

/**
 * 工具定义接口
 */
export interface ToolDefinition {
  /** 工具唯一标识（kebab-case） */
  id: string;
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 所属分类 */
  category: 'browser' | 'network' | 'system' | 'file' | 'ai' | 'other';
  /** 参数定义 */
  params: ToolParamDef[];
  /** 执行函数 */
  execute: (params: Record<string, any>) => Promise<ToolResult>;
}

// ============================================================
// 二、技能相关类型（Skills）
// ============================================================

/**
 * 技能元数据（对应 SKILL.md 的 YAML frontmatter）
 */
export interface SkillMetadata {
  /** 技能唯一标识（必须与目录名一致，kebab-case） */
  name: string;
  /** 描述（最重要的字段，决定何时触发） */
  description: string;
  /** 版本号（语义化版本） */
  version: string;
  /** 作者 */
  author?: string;
  /** 标签 */
  tags?: string[];
  /** 是否允许用户手动触发 */
  userInvocable?: boolean;
  /** 允许使用的工具列表 */
  allowedTools?: string[];
  /** 扩展元数据 */
  metadata?: Record<string, any>;
}

/**
 * 技能执行结果
 */
export interface SkillResult {
  /** 是否成功 */
  success: boolean;
  /** 返回数据 */
  data?: any;
  /** 错误信息 */
  error?: string;
  /** 执行步骤记录（用于可视化） */
  steps?: SkillExecutionStep[];
  /** 总执行时间（毫秒） */
  totalExecutionTime?: number;
}

/**
 * 技能执行步骤（用于可视化展示）
 */
export interface SkillExecutionStep {
  /** 步骤序号 */
  stepNumber: number;
  /** 步骤名称 */
  name: string;
  /** 步骤描述 */
  description: string;
  /** 调用的工具 ID */
  toolId?: string;
  /** 工具参数 */
  toolParams?: Record<string, any>;
  /** 步骤结果 */
  result?: ToolResult | SkillResult;
  /** 输出信息（兼容旧版） */
  output?: any;
  /** 开始时间 */
  startTime: number;
  /** 结束时间 */
  endTime: number;
  /** 执行时间 */
  executionTime?: number;
  /** 是否成功 */
  success: boolean;
}

/**
 * 技能参数定义
 */
export interface SkillParamDef {
  /** 参数名 */
  name: string;
  /** 参数类型 */
  type: 'string' | 'number' | 'boolean' | 'object';
  /** 是否必填 */
  required: boolean;
  /** 参数描述 */
  description: string;
  /** 默认值 */
  defaultValue?: any;
  /** 示例值 */
  example?: any;
}

/**
 * 技能示例（对应 SKILL.md 的 Examples 部分）
 */
export interface SkillExample {
  /** 示例 ID */
  id: string;
  /** 示例名称 */
  name: string;
  /** 用户输入 */
  input: string;
  /** 预期输出 */
  expectedOutput: string;
  /** 实际执行的参数 */
  params?: Record<string, any>;
}

/**
 * 错误处理规则（对应 SKILL.md 的 Error Handling）
 */
export interface ErrorHandlingRule {
  /** 错误类型 */
  errorType: string;
  /** 错误原因 */
  cause: string;
  /** 解决方案 */
  solution: string;
}

/**
 * 技能定义接口（完整的技能）
 */
export interface SkillDefinition {
  /** 元数据（YAML frontmatter） */
  metadata: SkillMetadata;
  
  /** 技能参数定义 */
  params: SkillParamDef[];
  
  /** 使用场景（When to Use） */
  whenToUse: string[];
  
  /** 前置条件（Prerequisites） */
  prerequisites?: string[];
  
  /** 示例（Examples） */
  examples: SkillExample[];
  
  /** 错误处理（Error Handling） */
  errorHandling: ErrorHandlingRule[];
  
  /** 输出格式描述 */
  outputFormat?: string;
  
  /** 设计模式（参考 Google ADK 五模式） */
  pattern?: 'tool-wrapper' | 'generator' | 'reviewer' | 'inversion' | 'pipeline';
  
  /**
   * 执行函数
   * @param params 用户传入的参数
   * @param steps 执行步骤记录（可选，用于可视化）
   * @returns 技能执行结果
   */
  execute: (params: Record<string, any>, steps?: SkillExecutionStep[]) => Promise<SkillResult>;
}

// ============================================================
// 三、注册表相关类型
// ============================================================

/**
 * 技能注册表项
 */
export interface RegistryEntry {
  /** 技能定义 */
  skill: SkillDefinition;
  /** 注册时间 */
  registeredAt: Date;
  /** 是否启用 */
  enabled: boolean;
  /** 使用次数统计 */
  usageCount: number;
}

/**
 * 工具注册表项
 */
export interface ToolRegistryEntry {
  /** 工具定义 */
  tool: ToolDefinition;
  /** 注册时间 */
  registeredAt: Date;
  /** 是否可用 */
  available: boolean;
}
