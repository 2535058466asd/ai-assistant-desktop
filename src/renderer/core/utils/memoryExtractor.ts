// ==========================================
// 记忆提取工具函数
// 用于从对话中提取重要信息并存入记忆
// ==========================================

import { getMemoryService } from '../../services/memoryServiceClient';
import { sendMessageToDoubao } from '../../services/doubaoApiClient';
import { createLogger } from '../../../shared/logger';

const logger = createLogger('memory');

/**
 * 提取的记忆类型
 */
export interface ExtractedMemory {
  content: string;
  category: 'preference' | 'fact' | 'project' | 'decision' | 'belief' | 'event';
  importance: number;
}

/**
 * 使用LLM从对话中提取记忆
 * @param userText 用户输入文本
 * @param assistantText 助手回复文本
 * @returns 提取的记忆数组
 */
export async function extractMemoriesWithLLM(
  userText: string,
  assistantText: string
): Promise<ExtractedMemory[]> {
  try {
    const prompt = `分析以下对话，提取值得长期记住的信息。

用户：${userText}
助手：${assistantText}

判断原则：
- 只提取用户主动透露的、稳定的、跨对话仍有价值的信息
- 不提取一次性的、临时的、只在当前对话有用的信息
- 不提取短暂的情绪状态（"我好烦"、"压力好大"），但提取长期的态度和观点
- 不提取搜索请求本身（"帮我搜xxx"），但提取搜索背后的意图（如果有的话）
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
[{"content": "记忆内容", "category": "preference|fact|project|decision|belief|event", "importance": 1-10}]

只输出JSON，不要其他文字。`;

    // 调用LLM（使用mini模型，成本低）
    const response = await sendMessageToDoubao(prompt, [], '你是一个记忆提取助手，只负责提取关键信息，不做其他回答。');
    
    // 解析JSON响应
    const memories = JSON.parse(response);
    return Array.isArray(memories) ? memories : [];
  } catch (error) {
    logger.error('LLM 记忆提取失败', error);
    return [];
  }
}

/**
 * 尝试从对话中提取重要信息并存入记忆
 * @param userText 用户输入文本
 * @param assistantText 助手回复文本
 */
export async function tryExtractAndSaveMemory(userText: string, assistantText: string): Promise<void> {
  try {
    const memoryService = getMemoryService();
    
    // 使用LLM提取记忆
    const extractedMemories = await extractMemoriesWithLLM(userText, assistantText);
    
    // 保存提取的记忆
    for (const memory of extractedMemories) {
      await memoryService.addMemory(memory.content, memory.category, memory.importance);
      logger.info('已从对话保存记忆', memory);
    }

    // 提取用户名字（保留原有逻辑作为备份）
    const nameMatch = userText.match(/我叫(.+)|我的名字是(.+)|我是(.+)/);
    if (nameMatch) {
      const userName = (nameMatch[1] || nameMatch[2] || nameMatch[3]).trim();
      if (userName && userName.length < 20) {
        await memoryService.setPreference('userName', userName);
        logger.info('已通过兜底规则保存用户名', { userName });
      }
    }

  } catch (error) {
    logger.error('提取并保存记忆失败', error);
    // 提取记忆失败不影响聊天，所以不抛出错误
  }
}
