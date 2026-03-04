// ==========================================
// 记忆服务（主进程）
// 负责用户记忆的存储和读取
// ==========================================

import fs from 'fs';
import path from 'path';
import { app } from 'electron';

/**
 * 用户偏好类型
 */
export interface UserPreferences {
  favoriteArtist?: string;
  musicGenre?: string;
  wakeWord?: string;
  voiceSpeed?: number;
  voicePitch?: number;
  theme?: 'light' | 'dark';
  [key: string]: any;
}

/**
 * 重要记忆类型
 */
export interface ImportantMemory {
  id: string;
  content: string;
  timestamp: number;
  category: 'preference' | 'important_event' | 'fact' | 'other';
}

/**
 * 记忆服务类（主进程）
 */
export class MemoryService {
  private dataDir: string;
  private preferencesPath: string;
  private memoriesPath: string;
  private preferences: UserPreferences;
  private memories: ImportantMemory[];

  constructor() {
    this.dataDir = path.join(app.getPath('userData'), 'qiyuan-memory');
    this.preferencesPath = path.join(this.dataDir, 'preferences.json');
    this.memoriesPath = path.join(this.dataDir, 'memories.json');
    
    this.ensureDataDir();
    this.preferences = this.loadPreferences();
    this.memories = this.loadMemories();
    
    console.log('🧠 记忆服务（主进程）初始化成功');
  }

  private ensureDataDir(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
      console.log('📁 创建记忆数据目录:', this.dataDir);
    }
  }

  private loadPreferences(): UserPreferences {
    try {
      if (fs.existsSync(this.preferencesPath)) {
        const data = fs.readFileSync(this.preferencesPath, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('❌ 加载用户偏好失败:', error);
    }
    return {};
  }

  private loadMemories(): ImportantMemory[] {
    try {
      if (fs.existsSync(this.memoriesPath)) {
        const data = fs.readFileSync(this.memoriesPath, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('❌ 加载重要记忆失败:', error);
    }
    return [];
  }

  private savePreferences(): void {
    try {
      fs.writeFileSync(this.preferencesPath, JSON.stringify(this.preferences, null, 2));
      console.log('💾 用户偏好已保存');
    } catch (error) {
      console.error('❌ 保存用户偏好失败:', error);
    }
  }

  private saveMemories(): void {
    try {
      fs.writeFileSync(this.memoriesPath, JSON.stringify(this.memories, null, 2));
      console.log('💾 重要记忆已保存');
    } catch (error) {
      console.error('❌ 保存重要记忆失败:', error);
    }
  }

  // ========== 公开方法 ==========

  /**
   * 设置用户偏好
   * @param key 偏好键名
   * @param value 偏好值
   */
  setPreference(key: string, value: any): void {
    this.preferences[key] = value;
    this.savePreferences();
  }

  /**
   * 获取用户偏好
   * @param key 偏好键名
   * @returns 偏好值
   */
  getPreference(key: string): any {
    return this.preferences[key];
  }

  /**
   * 获取所有用户偏好
   * @returns 用户偏好对象副本
   */
  getAllPreferences(): UserPreferences {
    return { ...this.preferences };
  }

  /**
   * 添加重要记忆
   * @param content 记忆内容
   * @param category 记忆类别（默认为 fact）
   */
  addMemory(content: string, category: ImportantMemory['category'] = 'fact'): void {
    const memory: ImportantMemory = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      content,
      timestamp: Date.now(),
      category
    };
    
    this.memories.push(memory);
    this.saveMemories();
  }

  /**
   * 获取所有重要记忆
   * @returns 重要记忆数组副本
   */
  getAllMemories(): ImportantMemory[] {
    return [...this.memories];
  }

  /**
   * 搜索记忆
   * @param keyword 搜索关键词
   * @returns 匹配的记忆数组
   */
  searchMemories(keyword: string): ImportantMemory[] {
    const keywordLower = keyword.toLowerCase();
    return this.memories.filter(memory => 
      memory.content.toLowerCase().includes(keywordLower)
    );
  }

  /**
   * 删除指定记忆
   * @param id 记忆ID
   */
  deleteMemory(id: string): void {
    this.memories = this.memories.filter(m => m.id !== id);
    this.saveMemories();
  }

  /**
   * 清空所有记忆
   */
  clearAllMemories(): void {
    this.memories = [];
    this.saveMemories();
  }

  /**
   * 生成用于LLM的记忆提示词
   * @returns 格式化的记忆提示词字符串
   */
  getMemoryPrompt(): string {
    const parts: string[] = [];
    
    const prefs = this.getAllPreferences();
    if (Object.keys(prefs).length > 0) {
      parts.push('【用户偏好】');
      for (const [key, value] of Object.entries(prefs)) {
        if (value) {
          parts.push(`- ${key}: ${value}`);
        }
      }
    }
    
    const recentMemories = this.memories.slice(-10);
    if (recentMemories.length > 0) {
      parts.push('【重要记忆】');
      recentMemories.forEach(memory => {
        const date = new Date(memory.timestamp).toLocaleDateString('zh-CN');
        parts.push(`- [${date}] ${memory.content}`);
      });
    }
    
    return parts.length > 0 ? parts.join('\n') : '';
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
