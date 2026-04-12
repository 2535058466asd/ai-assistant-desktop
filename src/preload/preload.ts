// 导入 contextBridge 和 ipcRenderer，用于安全地暴露 API 到渲染进程
import { contextBridge, ipcRenderer } from 'electron'

/**
 * 暴露安全的 API 到渲染进程
 * 就像"安全门"，只允许特定的信息通过
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // HTTP请求代理（解决CORS问题）
  httpProxy: async (options: any) => {
    return ipcRenderer.invoke('http-proxy', options);
  },
  // 执行系统命令
  execCommand: async (command: string) => {
    return ipcRenderer.invoke('exec-command', command);
  },
  // 读取文件
  readFile: async (path: string) => {
    return ipcRenderer.invoke('read-file', path);
  },
  // 写入文件
  writeFile: async (path: string, content: string) => {
    return ipcRenderer.invoke('write-file', path, content);
  },
  // 网页搜索
  webSearch: async (query: string) => {
    return ipcRenderer.invoke('web-search', query);
  },
  // 读取剪贴板
  clipboardRead: async () => {
    return ipcRenderer.invoke('clipboard-read');
  },
  // 写入剪贴板
  clipboardWrite: async (text: string) => {
    return ipcRenderer.invoke('clipboard-write', text);
  },
  // 屏幕截图
  screenshot: async () => {
    return ipcRenderer.invoke('screenshot');
  },
  // 打开应用
  openApp: async (target: string) => {
    return ipcRenderer.invoke('open-app', target);
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
  // 记忆服务 - 搜索记忆
  memorySearchMemories: async (keyword: string) => {
    return ipcRenderer.invoke('memory-search-memories', keyword);
  },
  // 记忆服务 - 删除记忆
  memoryDeleteMemory: async (id: string) => {
    return ipcRenderer.invoke('memory-delete-memory', id);
  },
  // 记忆服务 - 清空所有记忆
  memoryClearAllMemories: async () => {
    return ipcRenderer.invoke('memory-clear-all-memories');
  },
  // ========== TTS 持久化缓存 ==========
  // 检查本地缓存是否存在
  ttsCacheCheck: async (text: string, voice: string) => {
    return ipcRenderer.invoke('tts-cache-check', text, voice);
  },
  // 保存音频到本地缓存
  ttsCacheSave: async (text: string, voice: string, audioBase64: string) => {
    return ipcRenderer.invoke('tts-cache-save', text, voice, audioBase64);
  },

  // ========== 通用 IPC 方法（用于 TTS/ASR 等模块化服务）==========
  
  // 通用调用（用于 invoke 模式）
  invoke: (channel: string, ...args: any[]) => {
    return ipcRenderer.invoke(channel, ...args);
  },
  
  // 监听主进程消息（用于 on 模式）
  on: (channel: string, callback: (...args: any[]) => void) => {
    console.log('[Preload] 注册监听器 channel:', channel)
    ipcRenderer.on(channel, (_event, ...args) => {
      console.log('[Preload] 收到 ipcRenderer 事件, channel:', channel, 'args.length:', args.length)
      if (args.length > 0) {
        console.log('[Preload] 第一个参数:', typeof args[0], args[0] ? '有值' : 'null/undefined')
        if (args[0] && typeof args[0] === 'object') {
          const obj = args[0] as any
          console.log('[Preload] 对象 keys:', Object.keys(obj))
          if (obj.audioBase64) {
            console.log('[Preload] audioBase64 长度:', obj.audioBase64.length)
          }
        }
      }
      callback(...args)
    })
  }
})

// 类型定义，用于 TypeScript 类型检查
declare global {
  interface Window {
    electronAPI: {
      httpProxy: (options: any) => Promise<{ success: boolean; status?: number; headers?: any; data?: string; error?: string; isBinary?: boolean }>;
      // 新的工具 API
      execCommand: (command: string) => Promise<{ success: boolean; data?: string; error?: string }>;
      readFile: (path: string) => Promise<{ success: boolean; data?: string; error?: string }>;
      writeFile: (path: string, content: string) => Promise<{ success: boolean; data?: string; error?: string }>;
      webSearch: (query: string) => Promise<{ success: boolean; data?: string; error?: string }>;
      clipboardRead: () => Promise<{ success: boolean; data?: string; error?: string }>;
      clipboardWrite: (text: string) => Promise<{ success: boolean; data?: string; error?: string }>;
      screenshot: () => Promise<{ success: boolean; data?: string; error?: string }>;
      openApp: (target: string) => Promise<{ success: boolean; data?: string; error?: string }>;
      systemOpenApp: (appName: string) => Promise<{ success: boolean; message: string }>;
      systemOpenFolder: (folderName: string) => Promise<{ success: boolean; message: string }>;
      systemLockScreen: () => Promise<{ success: boolean; message: string }>;
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
      memorySearchMemories: (keyword: string) => Promise<any[]>;
      memoryDeleteMemory: (id: string) => Promise<void>;
      memoryClearAllMemories: () => Promise<void>;
      // TTS 持久化缓存
      ttsCacheCheck: (text: string, voice: string) => Promise<{ exists: boolean; audioData?: string }>;
      ttsCacheSave: (text: string, voice: string, audioBase64: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
      // 通用 IPC 方法（用于 TTS/ASR 等模块化服务）
      invoke: (channel: string, ...args: any[]) => Promise<any>;
      on: (channel: string, callback: (...args: any[]) => void) => void;
  };
  }
}
