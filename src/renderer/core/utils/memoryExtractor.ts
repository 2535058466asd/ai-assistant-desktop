// ==========================================
// 记忆提取工具函数
// 用于从对话中提取重要信息并存入记忆
// ==========================================

import { getMemoryService } from '../../services/memoryServiceClient';

/**
 * 尝试从对话中提取重要信息并存入记忆
 * @param userText 用户输入文本
 * @param assistantText 助手回复文本
 */
export async function tryExtractAndSaveMemory(userText: string, assistantText: string): Promise<void> {
  try {
    const memoryService = getMemoryService();
    
    // 简单的关键词提取（后续可以用LLM来更智能地提取）
    
    // 提取用户名字
    const nameMatch = userText.match(/我叫(.+)|我的名字是(.+)|我是(.+)/);
    if (nameMatch) {
      const userName = (nameMatch[1] || nameMatch[2] || nameMatch[3]).trim();
      if (userName && userName.length < 20) {
        await memoryService.setPreference('userName', userName);
        console.log('📝 已记住用户名字:', userName);
      }
    }

    // 提取用户喜好
    if (userText.includes('我喜欢') || userText.includes('我爱') || userText.includes('我讨厌') || userText.includes('我不喜欢')) {
      await memoryService.addMemory(userText, 'preference');
      console.log('📝 已记住用户偏好:', userText);
    }

    // 提取重要信息
    if (userText.includes('记住') || userText.includes('别忘了') || userText.includes('记得')) {
      await memoryService.addMemory(userText, 'important');
      console.log('📝 已记住重要信息:', userText);
    }

  } catch (error) {
    console.error('❌ 提取记忆失败:', error);
    // 提取记忆失败不影响聊天，所以不抛出错误
  }
}
