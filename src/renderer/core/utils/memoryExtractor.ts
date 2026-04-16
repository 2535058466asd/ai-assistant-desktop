// ==========================================
// 记忆提取工具函数
// 用于从对话中提取重要信息并存入记忆
// ==========================================

import { getMemoryService } from '../../services/memoryServiceClient';
import { sendMessageToDoubao } from '../../services/doubaoApiClient';

/**
 * 提取的记忆类型
 */
export interface ExtractedMemory {
  content: string;
  category: 'preference' | 'fact' | 'project' | 'decision';
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
    const prompt = `分析以下对话，提取值得记住的关键信息。

用户：${userText}
助手：${assistantText}

提取规则：
1. 只提取事实性信息（用户偏好、项目信息、个人情况、重要决策）
2. 不提取临时性信息（"今天天气怎么样"）
3. 不提取AI的回复内容
4. 每条记忆独立、简洁、具体
5. 如果没有值得记住的信息，返回空数组

输出JSON格式：
[{"content": "记忆内容", "category": "preference|fact|project|decision", "importance": 1-10}]

只输出JSON，不要其他文字。`;

    // 调用LLM（使用mini模型，成本低）
    const response = await sendMessageToDoubao(prompt, [], '你是一个记忆提取助手，只负责提取关键信息，不做其他回答。');
    
    // 解析JSON响应
    const memories = JSON.parse(response);
    return Array.isArray(memories) ? memories : [];
  } catch (error) {
    console.error('❌ LLM提取记忆失败:', error);
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
      console.log('📝 已记住:', memory.content, `[${memory.category}, importance: ${memory.importance}]`);
    }

    // 提取用户名字（保留原有逻辑作为备份）
    const nameMatch = userText.match(/我叫(.+)|我的名字是(.+)|我是(.+)/);
    if (nameMatch) {
      const userName = (nameMatch[1] || nameMatch[2] || nameMatch[3]).trim();
      if (userName && userName.length < 20) {
        await memoryService.setPreference('userName', userName);
        console.log('📝 已记住用户名字:', userName);
      }
    }

  } catch (error) {
    console.error('❌ 提取记忆失败:', error);
    // 提取记忆失败不影响聊天，所以不抛出错误
  }
}
