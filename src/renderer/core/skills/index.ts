/**
 * 启源 AI - 技能系统主入口
 * 
 * 功能：
 * 1. 自动注册所有技能
 * 2. 提供统一的技能调用接口
 * 3. 导出所有可用技能
 */

// 导入类型
export * from './types';

// 导入注册表和管理器（先导入再导出）
import { skillRegistry, skillExecutor, callTool } from './registry';
export { skillRegistry, skillExecutor, callTool };

// 导入工具库
export { allTools, getToolById, getToolsByCategory } from '../tools/index';

// 导入类型（避免循环依赖）
import type { SkillDefinition } from './types';

/**
 * 所有已实现的技能列表
 * 延迟初始化，避免循环依赖
 */
let allSkills: SkillDefinition[] | null = null;

async function getSkills(): Promise<SkillDefinition[]> {
  if (!allSkills) {
    // 使用 ES6 动态导入，避免循环依赖
    const searchBrowserModule = await import('./search-browser/index');
    const searchWebModule = await import('./search-web/index');
    const weatherModule = await import('./weather/index');
    const universalControlModule = await import('./universal-control/index');
    
    console.log('📦 导入的模块:', {
      searchBrowser: searchBrowserModule,
      searchWeb: searchWebModule,
      weather: weatherModule,
      universalControl: universalControlModule
    });
    
    // 详细调试：打印每个模块的所有导出
    console.log('🔍 search-browser 导出:', Object.keys(searchBrowserModule));
    console.log('🔍 search-web 导出:', Object.keys(searchWebModule));
    console.log('🔍 weather 导出:', Object.keys(weatherModule));
    console.log('🔍 universal-control 导出:', Object.keys(universalControlModule));
    
    console.log('🔍 searchBrowserModule.default:', searchBrowserModule.default);
    console.log('🔍 searchBrowserModule.searchBrowserSkill:', searchBrowserModule.searchBrowserSkill);
    
    console.log('🔍 searchWebModule.default:', searchWebModule.default);
    console.log('🔍 searchWebModule.searchWebSkill:', searchWebModule.searchWebSkill);
    
    console.log('🔍 weatherModule.default:', weatherModule.default);
    console.log('🔍 weatherModule.weatherSkill:', weatherModule.weatherSkill);
    
    console.log('🔍 universalControlModule.default:', universalControlModule.default);
    console.log('🔍 universalControlModule.universalControlSkill:', universalControlModule.universalControlSkill);
    
    const searchBrowserSkill = searchBrowserModule.default || searchBrowserModule.searchBrowserSkill;
    const searchWebSkill = searchWebModule.default || searchWebModule.searchWebSkill;
    const weatherSkill = weatherModule.default || weatherModule.weatherSkill;
    const universalControlSkill = universalControlModule.default || universalControlModule.universalControlSkill;
    
    console.log('📦 解析的技能:', {
      searchBrowserSkill,
      searchWebSkill,
      weatherSkill,
      universalControlSkill
    });
    
    allSkills = [
      // 搜索相关技能
      searchBrowserSkill,
      searchWebSkill,
      
      // 天气相关技能
      weatherSkill,
      
      // 🎮 通用应用控制技能（替代多个独立技能）
      universalControlSkill
    ];
  }
  return allSkills;
}

/**
 * 初始化技能系统（自动注册所有技能）
 * 
 * 使用方式：
 * ```typescript
 * import { initSkills, executeSkill } from '@/core/skills';
 * 
 * // 初始化（在应用启动时调用一次）
 * await initSkills();
 * 
 * // 执行技能
 * const result = await executeSkill('search-web', { query: 'B站' });
 * ```
 */
export async function initSkills(): Promise<void> {
  console.log('\n🚀 正在初始化启源 AI 技能系统...\n');
  
  const skills = await getSkills();
  
  for (const skill of skills) {
    skillRegistry.register(skill);
  }
  
  const stats = skillRegistry.getStats();
  
  console.log(`\n✅ 技能系统初始化完成！`);
  console.log(`📊 统计信息：`);
  console.log(`   - 总技能数: ${stats.totalSkills}`);
  console.log(`   - 已启用: ${stats.enabledSkills}`);
  console.log(`   - 常用技能:`);
  
  if (stats.topUsed.length > 0) {
    for (const entry of stats.topUsed) {
      const emoji = entry.skill.metadata.metadata?.emoji || '⚡️';
      console.log(`     ${emoji} ${entry.skill.metadata.name} - ${entry.skill.metadata.description.slice(0, 30)}...`);
    }
  } else {
    for (const entry of skillRegistry.getAll().slice(0, 5)) {
      const emoji = entry.skill.metadata.metadata?.emoji || '⚡️';
      console.log(`     ${emoji} ${entry.skill.metadata.name} - ${entry.skill.metadata.description.slice(0, 30)}...`);
    }
  }
  
  console.log('');
}

/**
 * 执行技能的便捷方法
 * 
 * @param skillId 技能 ID
 * @param params 参数
 * @returns 执行结果
 */
export async function executeSkill(
  skillId: string,
  params: Record<string, any>
): Promise<import('./types').SkillResult> {
  return skillExecutor.execute(skillId, params);
}

/**
 * 根据意图查找匹配的技能
 * 
 * @param query 意图或关键词
 * @returns 匹配的技能列表
 */
export function findMatchingSkills(query: string): import('./types').RegistryEntry[] {
  return skillRegistry.search(query);
}

/**
 * 获取所有已注册的技能
 */
export function getAllSkills(): import('./types').RegistryEntry[] {
  return skillRegistry.getAll();
}

/**
 * 获取技能详细信息
 */
export function getSkillDetail(skillId: string): import('./types').RegistryEntry | undefined {
  return skillRegistry.getById(skillId);
}
