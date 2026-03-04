// 导入 contextBridge 和 ipcRenderer，用于安全地暴露 API 到渲染进程
import { contextBridge, ipcRenderer } from 'electron'

/**
 * 暴露安全的 API 到渲染进程
 * 就像"安全门"，只允许特定的信息通过
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // 切换菜单语言
  switchMenuLanguage: (lang: 'zh' | 'en') => ipcRenderer.send('switch-menu-language', lang),
  // 发送消息到 AI
  sendMessageToAI: async (userMessages: string[], assistantMessages: string[]) => {
    return ipcRenderer.invoke('send-message-to-ai', userMessages, assistantMessages);
  },
  // 文字转语音
  textToSpeech: async (text: string) => {
    return ipcRenderer.invoke('text-to-speech', text);
  },
  // HTTP请求代理（解决CORS问题）
  httpProxy: async (options: any) => {
    return ipcRenderer.invoke('http-proxy', options);
  },
  // Whisper语音识别
  whisperTranscribe: async (audioBase64: string, language: string = 'zh') => {
    return ipcRenderer.invoke('whisper-transcribe', audioBase64, language);
  },
  // 系统控制 - 打开应用
  systemOpenApp: async (appName: string) => {
    return ipcRenderer.invoke('system-open-app', appName);
  },
  // 系统控制 - 打开文件夹
  systemOpenFolder: async (folderName: string) => {
    return ipcRenderer.invoke('system-open-folder', folderName);
  },
  // 系统控制 - 锁定屏幕
  systemLockScreen: async () => {
    return ipcRenderer.invoke('system-lock-screen');
  },
  // 系统控制 - 调节音量
  systemAdjustVolume: async (volume?: number, direction?: 'up' | 'down') => {
    return ipcRenderer.invoke('system-adjust-volume', volume, direction);
  },
  // 系统控制 - 静音/取消静音
  systemToggleMute: async (action?: 'mute' | 'unmute') => {
    return ipcRenderer.invoke('system-toggle-mute', action);
  },
  // 系统控制 - 搜索网页
  systemSearchWeb: async (query: string) => {
    return ipcRenderer.invoke('system-search-web', query);
  },
  // 系统控制 - 关机
  systemShutdown: async () => {
    return ipcRenderer.invoke('system-shutdown');
  },
  // 系统控制 - 重启
  systemRestart: async () => {
    return ipcRenderer.invoke('system-restart');
  },
  // 系统控制 - 取消关机/重启
  systemCancelShutdown: async () => {
    return ipcRenderer.invoke('system-cancel-shutdown');
  },
  // 系统控制 - 休眠
  systemSleep: async () => {
    return ipcRenderer.invoke('system-sleep');
  },
  // 系统控制 - 清空回收站
  systemEmptyRecycleBin: async () => {
    return ipcRenderer.invoke('system-empty-recycle-bin');
  },
  // 记忆服务 - 设置偏好
  memorySetPreference: async (key: string, value: any) => {
    return ipcRenderer.invoke('memory-set-preference', key, value);
  },
  // 记忆服务 - 获取偏好
  memoryGetPreference: async (key: string) => {
    return ipcRenderer.invoke('memory-get-preference', key);
  },
  // 记忆服务 - 获取所有偏好
  memoryGetAllPreferences: async () => {
    return ipcRenderer.invoke('memory-get-all-preferences');
  },
  // 记忆服务 - 添加记忆
  memoryAddMemory: async (content: string, category: string = 'fact') => {
    return ipcRenderer.invoke('memory-add-memory', content, category);
  },
  // 记忆服务 - 获取所有记忆
  memoryGetAllMemories: async () => {
    return ipcRenderer.invoke('memory-get-all-memories');
  },
  // 记忆服务 - 获取记忆提示词
  memoryGetPrompt: async () => {
    return ipcRenderer.invoke('memory-get-prompt');
  },
  // 截图服务 - 截取屏幕
  screenshotTake: async () => {
    return ipcRenderer.invoke('screenshot-take');
  }
})

// 类型定义，用于 TypeScript 类型检查
declare global {
  interface Window {
    electronAPI: {
      switchMenuLanguage: (lang: 'zh' | 'en') => void;
      sendMessageToAI: (userMessages: string[], assistantMessages: string[]) => Promise<{ success: boolean; message: string }>;
      textToSpeech: (text: string) => Promise<{ success: boolean; audioPath?: string; error?: string }>;
      httpProxy: (options: any) => Promise<{ success: boolean; status?: number; headers?: any; data?: string; error?: string; isBinary?: boolean }>;
      whisperTranscribe: (audioBase64: string, language?: string) => Promise<{ success: boolean; text?: string; error?: string }>;
      systemOpenApp: (appName: string) => Promise<{ success: boolean; message: string }>;
      systemOpenFolder: (folderName: string) => Promise<{ success: boolean; message: string }>;
      systemLockScreen: () => Promise<{ success: boolean; message: string }>;
      systemAdjustVolume: (volume?: number, direction?: 'up' | 'down') => Promise<{ success: boolean; message: string }>;
      systemToggleMute: (action?: 'mute' | 'unmute') => Promise<{ success: boolean; message: string }>;
      systemSearchWeb: (query: string) => Promise<{ success: boolean; message: string }>;
      systemShutdown: () => Promise<{ success: boolean; message: string }>;
      systemRestart: () => Promise<{ success: boolean; message: string }>;
      systemCancelShutdown: () => Promise<{ success: boolean; message: string }>;
      systemSleep: () => Promise<{ success: boolean; message: string }>;
      systemEmptyRecycleBin: () => Promise<{ success: boolean; message: string }>;
      memorySetPreference: (key: string, value: any) => Promise<void>;
      memoryGetPreference: (key: string) => Promise<any>;
      memoryGetAllPreferences: () => Promise<any>;
      memoryAddMemory: (content: string, category?: string) => Promise<void>;
      memoryGetAllMemories: () => Promise<any[]>;
      memoryGetPrompt: () => Promise<string>;
      screenshotTake: () => Promise<{ success: boolean; imageData?: string; error?: string }>;
    };
  }
}
