// ==========================================
// 记忆提取工具函数
// 用于从对话中提取重要信息并存入记忆
// ==========================================

import { getMemoryService } from '../../services/memoryServiceClient';
import { getModelProvider } from '../model';
import { getActiveModelConfig } from '../../config/modelConfig';
import { createLogger, type LogMeta } from '../../../shared/logger';
import { getTextContent } from '../model/types';

const logger = createLogger('memory');

const SKIP_PATTERNS = /^(你好|hi|hello|早|早上好|晚上好|晚安|谢谢|thanks|ok|好的|嗯|哦|行|对|不是|再见|拜拜)/i;

/**
 * 判断是否值得调用 LLM 提取记忆
 */
export function shouldExtractMemory(userText: string, assistantText: string): boolean {
  if (userText.trim().length < 8) return false;
  if (SKIP_PATTERNS.test(userText.trim())) return false;
  if (assistantText.length < 10) return false;
  return true;
}

/**
 * 提取的记忆类型
 */
export interface ExtractedMemory {
  content: string;
  category: 'preference' | 'fact' | 'project' | 'decision' | 'belief' | 'event';
  importance: number;
  confidence: number;
  memoryKey?: string;
  sourceKind: 'explicit' | 'inferred';
  validUntil?: number;
}

/**
 * 使用LLM从对话中提取记忆
 * @param userText 用户输入文本
 * @param assistantText 助手回复文本
 * @returns 提取的记忆数组
 */
export async function extractMemoriesWithLLM(
  userText: string,
  assistantText: string,
  meta: LogMeta = {}
): Promise<ExtractedMemory[]> {
  try {
    const prompt = `分析以下对话，提取值得长期记住的信息。当前时间：${new Date().toISOString()}。

用户：${userText}
助手：${assistantText}

判断原则：
- 只提取用户主动透露的、稳定的、跨对话仍有价值的信息
- 不提取一次性的、临时的、只在当前对话有用的信息
- 不提取助手推测、助手建议、工具结果或助手回复中新增的信息
- 不提取短暂的情绪状态（"我好烦"、"压力好大"），但提取长期的态度和观点
- 不提取搜索、写作、打开软件、生成文件等单次请求，也不要推测其背后的长期偏好
- 用户明确说"记住"、"以后都要"、"我的偏好是"时，sourceKind 设为 explicit
- 其余可长期保留但需要推断的信息，sourceKind 设为 inferred，并降低 confidence
- event 必须给出合理的 validUntil；无法判断有效期的普通临时事件不要提取
- 如果不确定要不要记，就不记

类别说明：
- preference：用户偏好和习惯（"喜欢暗色主题"）
- fact：关于用户的客观事实（"叫李二"、"在成都"、"前端开发者"）
- project：用户在做的事情（"做Electron AI助手"、"用React"）
- decision：用户做出的选择（"决定不用Java"、"先就业再考研"）
- belief：用户的价值观和深层想法（"认为技术是中立的"、"觉得要不断学习"）
- event：有时间节点的重要事件（"明天9:10面试"、"6月毕业"）

重要性评分：
9-10：核心身份信息、重要事件（面试/入职/毕业）
7-8：项目信息、技术栈、明确偏好、重要观点
4-6：一般性事实、偶尔有用的信息
1-3：可能有用但不确定
没有值得记的：返回空数组 []

输出JSON格式：
[{
  "content": "简洁、可独立理解的记忆内容",
  "category": "preference|fact|project|decision|belief|event",
  "importance": 1-10,
  "confidence": 0.0-1.0,
  "sourceKind": "explicit|inferred",
  "memoryKey": "稳定事实键，例如 profile.user_name、preference.reply_style、project.nova.focus；没有稳定键时省略",
  "validUntil": "event 的过期时间戳（毫秒）；非 event 省略"
}]

只输出JSON，不要其他文字。`;

    // 调用LLM（使用mini模型，成本低）
    const provider = getModelProvider();
    const modelConfig = getActiveModelConfig();
    const response = await provider.chatWithTools({
      model: modelConfig.compactModel || modelConfig.model,
      messages: [
        { role: 'system', content: '你是一个记忆提取助手，只负责提取关键信息，不做其他回答。' },
        { role: 'user', content: prompt }
      ],
      traceId: meta.traceId,
    });

    // 解析JSON响应
    const parsed = JSON.parse(getTextContent(response.choices[0].message.content) || '[]');
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((memory: any) => typeof memory?.content === 'string' && memory.content.trim().length >= 4)
      .map((memory: any) => ({
        content: memory.content.trim().slice(0, 500),
        category: normalizeCategory(memory.category),
        importance: clampNumber(memory.importance, 1, 10, 5),
        confidence: clampNumber(memory.confidence, 0, 1, memory.sourceKind === 'explicit' ? 1 : 0.7),
        sourceKind: memory.sourceKind === 'explicit' ? 'explicit' as const : 'inferred' as const,
        memoryKey: typeof memory.memoryKey === 'string' ? memory.memoryKey.trim().slice(0, 100) : undefined,
        validUntil: normalizeTimestamp(memory.validUntil),
      }))
      .filter((memory: ExtractedMemory) => memory.sourceKind === 'explicit' || memory.confidence >= 0.78)
      .filter((memory: ExtractedMemory) => memory.category !== 'event' || !!memory.validUntil);
  } catch (error) {
    logger.error('LLM 记忆提取失败', { ...meta, phase: 'persist', error });
    return [];
  }
}

/**
 * 尝试从对话中提取重要信息并存入记忆
 * @param userText 用户输入文本
 * @param assistantText 助手回复文本
 */
export async function tryExtractAndSaveMemory(userText: string, assistantText: string, meta: LogMeta = {}): Promise<void> {
  try {
    const memoryService = getMemoryService();
    
    // 使用LLM提取记忆
    const extractedMemories = await extractMemoriesWithLLM(userText, assistantText, meta);
    
    // 保存提取的记忆
    for (const memory of extractedMemories) {
      const result = await memoryService.addMemory(memory.content, memory.category, memory.importance, {
        confidence: memory.confidence,
        memoryKey: memory.memoryKey,
        sourceKind: memory.sourceKind,
        validUntil: memory.validUntil,
        sourceConversation: meta.chatId,
        sourceMessage: meta.messageId,
      });
      logger.info('候选记忆治理完成', { ...meta, phase: 'persist', ...memory, result });
    }

    // 提取用户名字（保留原有逻辑作为备份）
    const nameMatch = userText.match(/(?:我叫|我的名字是)\s*([\u4e00-\u9fa5A-Za-z0-9_-]{1,20})(?:[，。！？,.!\s]|$)/);
    if (nameMatch) {
      const userName = nameMatch[1].trim();
      if (userName && userName.length < 20) {
        await memoryService.setPreference('userName', userName);
        logger.info('已通过兜底规则保存用户名', { ...meta, phase: 'persist', userName });
      }
    }

  } catch (error) {
    logger.error('提取并保存记忆失败', { ...meta, phase: 'persist', error });
    // 提取记忆失败不影响聊天，所以不抛出错误
  }
}

function normalizeCategory(category: unknown): ExtractedMemory['category'] {
  const allowed = new Set<ExtractedMemory['category']>(['preference', 'fact', 'project', 'decision', 'belief', 'event']);
  return allowed.has(category as ExtractedMemory['category']) ? category as ExtractedMemory['category'] : 'fact';
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function normalizeTimestamp(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > Date.now() ? Math.round(parsed) : undefined;
}
