// ==========================================
// 记忆服务（渲染进程）
// 通过IPC与主进程的记忆服务通信
// ==========================================

/**
 * 记忆服务类（渲染进程）
 */
export class MemoryService {
  constructor() {
    console.log('🧠 记忆服务（渲染进程）初始化成功');
  }

  /**
   * 设置用户偏好
   */
  async setPreference(key: string, value: any): Promise<void> {
    if (window.electronAPI?.memorySetPreference) {
      await window.electronAPI.memorySetPreference(key, value);
    }
  }

  /**
   * 获取用户偏好
   */
  async getPreference(key: string): Promise<any> {
    if (window.electronAPI?.memoryGetPreference) {
      return await window.electronAPI.memoryGetPreference(key);
    }
    return null;
  }

  /**
   * 获取所有偏好
   */
  async getAllPreferences(): Promise<any> {
    if (window.electronAPI?.memoryGetAllPreferences) {
      return await window.electronAPI.memoryGetAllPreferences();
    }
    return {};
  }

  /**
   * 添加记忆
   */
  async addMemory(content: string, category: string = 'fact'): Promise<void> {
    if (window.electronAPI?.memoryAddMemory) {
      await window.electronAPI.memoryAddMemory(content, category);
    }
  }

  /**
   * 获取所有记忆
   */
  async getAllMemories(): Promise<any[]> {
    if (window.electronAPI?.memoryGetAllMemories) {
      return await window.electronAPI.memoryGetAllMemories();
    }
    return [];
  }

  /**
   * 获取记忆提示词
   */
  async getMemoryPrompt(): Promise<string> {
    if (window.electronAPI?.memoryGetPrompt) {
      return await window.electronAPI.memoryGetPrompt();
    }
    return '';
  }

  /**
   * 搜索记忆
   */
  async searchMemories(keyword: string): Promise<any[]> {
    if (window.electronAPI?.memorySearchMemories) {
      return await window.electronAPI.memorySearchMemories(keyword);
    }
    return [];
  }

  /**
   * 删除指定记忆
   */
  async deleteMemory(id: string): Promise<void> {
    if (window.electronAPI?.memoryDeleteMemory) {
      await window.electronAPI.memoryDeleteMemory(id);
    }
  }

  /**
   * 清空所有记忆
   */
  async clearAllMemories(): Promise<void> {
    if (window.electronAPI?.memoryClearAllMemories) {
      await window.electronAPI.memoryClearAllMemories();
    }
  }
}

// 创建单例
let memoryServiceInstance: MemoryService | null = null;

export function getMemoryService(): MemoryService {
  if (!memoryServiceInstance) {
    memoryServiceInstance = new MemoryService();
  }
  return memoryServiceInstance;
}
