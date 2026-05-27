// 导入 contextBridge 和 ipcRenderer，用于安全地暴露 API 到渲染进程
import { contextBridge, ipcRenderer } from 'electron'

/**
 * 暴露安全的 API 到渲染进程
 * 就像"安全门"，只允许特定的信息通过
 */
contextBridge.exposeInMainWorld('electronAPI', {
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
  // 抓取网页内容
  webFetch: async (url: string) => {
    return ipcRenderer.invoke('web-fetch', url);
  },
  searchSetConfig: async (config: { preferredEngine?: string; searxngUrl?: string }) => {
    return ipcRenderer.invoke('search-set-config', config);
  },
  // 列出目录内容
  listDir: async (dirPath: string) => {
    return ipcRenderer.invoke('list-dir', dirPath);
  },
  // 按文件名搜索文件
  searchFiles: async (dirPath: string, pattern: string) => {
    return ipcRenderer.invoke('search-files', dirPath, pattern);
  },
  // 按内容搜索文件
  grepContent: async (dirPath: string, keyword: string, filePattern?: string) => {
    return ipcRenderer.invoke('grep-content', dirPath, keyword, filePattern);
  },
  // 读取剪贴板
  clipboardRead: async () => {
    return ipcRenderer.invoke('clipboard-read');
  },
  // 写入剪贴板
  clipboardWrite: async (text: string) => {
    return ipcRenderer.invoke('clipboard-write', text);
  },
  // 打开应用
  openApp: async (target: string) => {
    return ipcRenderer.invoke('open-app', target);
  },
  // ========== 系统工具 ==========
  // 获取当前时间
  getCurrentTime: async () => {
    return ipcRenderer.invoke('getCurrentTime');
  },
  // 获取系统信息
  getSystemInfo: async () => {
    return ipcRenderer.invoke('getSystemInfo');
  },
  // 发送系统通知
  notify: async (title: string, body: string) => {
    return ipcRenderer.invoke('notify', title, body);
  },
  // 删除文件
  deleteFile: async (filePath: string) => {
    return ipcRenderer.invoke('deleteFile', filePath);
  },
  // ========== 知识库 RAG ==========
  // 搜索知识库
  knowledgeSearch: async (query: string, nResults?: number) => {
    return ipcRenderer.invoke('knowledge-search', query, nResults);
  },
  // 添加知识到知识库
  knowledgeAdd: async (documents: string[], metadatas?: Record<string, string>[]) => {
    return ipcRenderer.invoke('knowledge-add', documents, metadatas);
  },
  // 获取知识库统计
  knowledgeStats: async () => {
    return ipcRenderer.invoke('knowledge-stats');
  },
  knowledgeSources: async () => {
    return ipcRenderer.invoke('knowledge-sources');
  },
  knowledgeDeleteBySource: async (source: string) => {
    return ipcRenderer.invoke('knowledge-delete-by-source', source);
  },
  // 导入文件到知识库（PDF/Word/Excel/TXT/MD）
  knowledgeImportFile: async (filePath: string, category?: string) => {
    return ipcRenderer.invoke('knowledge-import-file', filePath, category);
  },
  // 识别图片并导入知识库
  knowledgeImportImage: async (imagePath: string, category?: string) => {
    return ipcRenderer.invoke('knowledge-import-image', imagePath, category);
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
  memoryAddMemory: async (content: string, category: string = 'fact', importance: number = 5) => {
    return ipcRenderer.invoke('memory-add-memory', content, category, importance);
  },
  // 记忆服务 - 获取所有记忆
  memoryGetAllMemories: async () => {
    return ipcRenderer.invoke('memory-get-all-memories');
  },
  // 记忆服务 - 获取记忆提示词
  memoryGetPrompt: async (userInput: string = '') => {
    return ipcRenderer.invoke('memory-get-prompt', userInput);
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

  // ========== TTS / ASR 白名单 IPC ==========
  modelFetch: async (request: { endpoint: string; headers?: Record<string, string>; body?: string }) =>
    ipcRenderer.invoke('model-fetch', request),
  modelFetchStream: async (
    request: { requestId: string; endpoint: string; headers?: Record<string, string>; body?: string },
    onChunk: (chunk: string) => void
  ) => {
    const chunkHandler = (_event: Electron.IpcRendererEvent, requestId: string, chunk: string) => {
      if (requestId === request.requestId) onChunk(chunk);
    };
    const cleanup = () => {
      ipcRenderer.removeListener('model-fetch-stream-chunk', chunkHandler);
      ipcRenderer.removeListener('model-fetch-stream-end', endHandler);
      ipcRenderer.removeListener('model-fetch-stream-error', errorHandler);
    };
    const endHandler = (_event: Electron.IpcRendererEvent, requestId: string) => {
      if (requestId === request.requestId) cleanup();
    };
    const errorHandler = (_event: Electron.IpcRendererEvent, requestId: string) => {
      if (requestId === request.requestId) cleanup();
    };
    ipcRenderer.on('model-fetch-stream-chunk', chunkHandler);
    ipcRenderer.on('model-fetch-stream-end', endHandler);
    ipcRenderer.on('model-fetch-stream-error', errorHandler);
    try {
      return await ipcRenderer.invoke('model-fetch-stream', request);
    } finally {
      cleanup();
    }
  },
  ttsV3Connect: async (config: any) => ipcRenderer.invoke('tts-v3-connect', config),
  ttsV3Synthesize: async (config: any, text: string, options?: { sessionId?: string }) =>
    ipcRenderer.invoke('tts-v3-synthesize', config, text, options),
  ttsV3Disconnect: async () => ipcRenderer.invoke('tts-v3-disconnect'),
  asrV3Connect: async (config: any) => ipcRenderer.invoke('asr-v3-connect', config),
  asrV3StartRecognition: async (config: any) => ipcRenderer.invoke('asr-v3-start-recognition', config),
  asrV3SendAudio: async (config: any, audioBase64: string, isLast: boolean) =>
    ipcRenderer.invoke('asr-v3-send-audio', config, audioBase64, isLast),
  asrV3StopRecognition: async (config: any) => ipcRenderer.invoke('asr-v3-stop-recognition', config),
  
  // 监听主进程消息（仅允许 TTS/ASR 事件）
  on: (channel: string, callback: (...args: any[]) => void) => {
    const allowedChannels = new Set([
      'tts-session-started',
      'tts-audio-chunk',
      'tts-audio-complete',
      'tts-error',
      'asr-result',
      'asr-complete',
      'asr-error',
    ]);
    if (!allowedChannels.has(channel)) {
      throw new Error(`IPC channel is not allowed: ${channel}`);
    }
    ipcRenderer.on(channel, (_event, ...args) => {
      callback(...args)
    })
  }
})

// 类型定义，用于 TypeScript 类型检查
declare global {
  interface Window {
    electronAPI: {
      // 新的工具 API
      execCommand: (command: string) => Promise<{ success: boolean; data?: string; error?: string }>;
      readFile: (path: string) => Promise<{ success: boolean; data?: string; error?: string }>;
      writeFile: (path: string, content: string) => Promise<{ success: boolean; data?: string; error?: string }>;
      webSearch: (query: string) => Promise<{ success: boolean; data?: string; error?: string }>;
      webFetch: (url: string) => Promise<{ success: boolean; data?: string; error?: string }>;
      searchSetConfig: (config: { preferredEngine?: string; searxngUrl?: string }) => Promise<{ success: boolean; data?: unknown; error?: string }>;
      listDir: (dirPath: string) => Promise<{ success: boolean; data?: string; error?: string }>;
      searchFiles: (dirPath: string, pattern: string) => Promise<{ success: boolean; data?: string; error?: string }>;
      grepContent: (dirPath: string, keyword: string, filePattern?: string) => Promise<{ success: boolean; data?: string; error?: string }>;
      clipboardRead: () => Promise<{ success: boolean; data?: string; error?: string }>;
      clipboardWrite: (text: string) => Promise<{ success: boolean; data?: string; error?: string }>;
      openApp: (target: string) => Promise<{ success: boolean; data?: string; error?: string }>;
      // 系统工具
      getCurrentTime: () => Promise<{ success: boolean; data?: string; error?: string }>;
      getSystemInfo: () => Promise<{ success: boolean; data?: string; error?: string }>;
      notify: (title: string, body: string) => Promise<{ success: boolean; data?: string; error?: string }>;
      deleteFile: (filePath: string) => Promise<{ success: boolean; data?: string; error?: string }>;
      // 知识库 RAG
      knowledgeSearch: (query: string, nResults?: number) => Promise<{ success: boolean; data?: string; error?: string }>;
      knowledgeAdd: (documents: string[], metadatas?: Record<string, string>[]) => Promise<{ success: boolean; count?: number; error?: string }>;
      knowledgeStats: () => Promise<{ success: boolean; data?: { count: number; collections: string[] }; error?: string }>;
      knowledgeSources: () => Promise<{ success: boolean; data?: Array<{ source: string; category: string; count: number; createdAt?: string }>; error?: string }>;
      knowledgeDeleteBySource: (source: string) => Promise<{ success: boolean; deletedCount?: number; error?: string }>;
      knowledgeImportFile: (filePath: string, category?: string) => Promise<{ success: boolean; count?: number; chunks?: number; info?: string; error?: string }>;
      knowledgeImportImage: (imagePath: string, category?: string) => Promise<{ success: boolean; count?: number; info?: string; error?: string }>;
      memorySetPreference: (key: string, value: any) => Promise<void>;
      memoryGetPreference: (key: string) => Promise<any>;
      memoryGetAllPreferences: () => Promise<any>;
      memoryAddMemory: (content: string, category?: string, importance?: number) => Promise<void>;
      memoryGetAllMemories: () => Promise<any[]>;
      memoryGetPrompt: (userInput?: string) => Promise<string>;
      memorySearchMemories: (keyword: string) => Promise<any[]>;
      memoryDeleteMemory: (id: string) => Promise<void>;
      memoryClearAllMemories: () => Promise<void>;
      // TTS 持久化缓存
      ttsCacheCheck: (text: string, voice: string) => Promise<{ exists: boolean; audioData?: string }>;
      ttsCacheSave: (text: string, voice: string, audioBase64: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
      // TTS / ASR 白名单 IPC
      ttsV3Connect: (config: any) => Promise<any>;
      ttsV3Synthesize: (config: any, text: string, options?: { sessionId?: string }) => Promise<any>;
      ttsV3Disconnect: () => Promise<any>;
      asrV3Connect: (config: any) => Promise<any>;
      asrV3StartRecognition: (config: any) => Promise<any>;
      asrV3SendAudio: (config: any, audioBase64: string, isLast: boolean) => Promise<any>;
      asrV3StopRecognition: (config: any) => Promise<any>;
      modelFetch: (request: { endpoint: string; headers?: Record<string, string>; body?: string }) => Promise<{
        ok: boolean;
        status: number;
        statusText: string;
        body: string;
      }>;
      modelFetchStream: (
        request: { requestId: string; endpoint: string; headers?: Record<string, string>; body?: string },
        onChunk: (chunk: string) => void
      ) => Promise<{
        ok: boolean;
        status: number;
        statusText: string;
        body: string;
      }>;
      on: (channel: string, callback: (...args: any[]) => void) => void;
  };
  }
}
