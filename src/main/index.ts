// 开发环境热重载
if (process.env.NODE_ENV === 'development') {
  import('electron-reloader').then((reloader) => {
    try {
      if (reloader && typeof reloader === 'function') {
        (reloader as any)(module);
      }
    } catch (_) {}
  }).catch(() => {});
}
import { app, BrowserWindow, Menu, ipcMain, globalShortcut } from 'electron'
import { exec, execSync } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
import path from 'path'
import fs from 'fs'
import { getMemoryService } from './services/memoryServiceBackend'
import { getTTSService } from './services/tts/volcengineTTSWebSocketService'
import { getASRService } from './services/asr/volcengineASRWebSocketService'
import { registerAllTools } from './tools'
import { createLogger } from '../shared/logger'

let mainWindow: BrowserWindow | null = null
const mainLogger = createLogger('ipc')

function toggleDevTools() {
  if (!mainWindow) return
  const webContents = mainWindow.webContents
  if (webContents.isDevToolsOpened()) {
    webContents.closeDevTools()
  } else {
    webContents.openDevTools({ mode: 'detach' })
  }
}

function registerDevelopmentShortcuts() {
  if (app.isPackaged) return
  globalShortcut.register('F12', toggleDevTools)
  globalShortcut.register('CommandOrControl+Shift+I', toggleDevTools)
}



function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: process.env.NODE_ENV !== 'development'
    }
  })

  const isDev = !app.isPackaged;
  if (isDev) {
    const tryLoadURL = async () => {
      const ports = [5173, 5174, 5175, 5176, 5177, 5178, 5179, 5180];
      for (const port of ports) {
        try {
          await mainWindow.loadURL(`http://localhost:${port}`);
          mainLogger.info('Connected to Vite dev server', { url: `http://localhost:${port}` });
          return;
        } catch (error) {
          mainLogger.debug('Vite dev server port unavailable, trying next', { port });
        }
      }
      mainLogger.error('Unable to connect to Vite dev server');
    };
    tryLoadURL();
    
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

const memoryService = getMemoryService();

// ========== Model HTTP/SSE 代理 ==========
// 渲染进程直连第三方模型接口容易遇到 CORS、浏览器安全策略或连接被关闭。
// 大模型请求统一从 main process 发出，和 TTS/ASR 的 Node 侧接入方式保持一致。
ipcMain.handle('model-fetch', async (_event, request: {
  endpoint: string;
  headers?: Record<string, string>;
  body?: string;
}) => {
  try {
    const response = await fetch(request.endpoint, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
    });
    const body = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      body,
    };
  } catch (error) {
    mainLogger.error('Model fetch failed', error);
    return {
      ok: false,
      status: 0,
      statusText: error instanceof Error ? error.message : String(error),
      body: '',
    };
  }
});

ipcMain.handle('model-fetch-stream', async (event, request: {
  requestId: string;
  endpoint: string;
  headers?: Record<string, string>;
  body?: string;
}) => {
  try {
    const response = await fetch(request.endpoint, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return {
        ok: false,
        status: response.status,
        statusText: response.statusText,
        body,
      };
    }

    if (!response.body) {
      return {
        ok: false,
        status: response.status,
        statusText: 'Response body is empty',
        body: '',
      };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunkText = decoder.decode(value, { stream: true });
      event.sender.send('model-fetch-stream-chunk', request.requestId, chunkText);
    }

    event.sender.send('model-fetch-stream-end', request.requestId);
    return {
      ok: true,
      status: response.status,
      statusText: response.statusText,
      body: '',
    };
  } catch (error) {
    mainLogger.error('Model stream fetch failed', error);
    event.sender.send('model-fetch-stream-error', request.requestId, error instanceof Error ? error.message : String(error));
    return {
      ok: false,
      status: 0,
      statusText: error instanceof Error ? error.message : String(error),
      body: '',
    };
  }
});

ipcMain.handle('memory-set-preference', async (_event, key: string, value: any) => {
  memoryService.setPreference(key, value);
});

ipcMain.handle('memory-get-preference', async (_event, key: string) => {
  return memoryService.getPreference(key);
});

ipcMain.handle('memory-get-all-preferences', async () => {
  return memoryService.getAllPreferences();
});

ipcMain.handle('memory-add-memory', async (_event, content: string, category: string = 'fact', importance: number = 5) => {
  await memoryService.addMemory(content, category as any, importance);
});

ipcMain.handle('memory-get-all-memories', async () => {
  return memoryService.getAllMemories();
});

ipcMain.handle('memory-get-prompt', async (_event, userInput: string = '') => {
  return await memoryService.getMemoryPrompt(userInput);
});

ipcMain.handle('memory-search-memories', async (_event, keyword: string, limit: number = 10) => {
  return memoryService.searchMemories(keyword, limit);
});

ipcMain.handle('memory-delete-memory', async (_event, id: string) => {
  memoryService.deleteMemory(id);
});

ipcMain.handle('memory-clear-all-memories', async () => {
  memoryService.clearAllMemories();
});

// ========== 豆包语音 TTS WebSocket v3 IPC ==========
ipcMain.handle('tts-v3-connect', async (_event, config: any) => {
  try {
    const window = BrowserWindow.getAllWindows()[0]
    if (!window) {
      return { success: false, error: '没有找到主窗口' }
    }
    const ttsService = getTTSService(config, window)
    await ttsService.connect()
    return { success: true }
  } catch (error) {
    mainLogger.error('TTS connect failed', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle('tts-v3-synthesize', async (_event, config: any, text: string, options?: { sessionId?: string }) => {
  try {
    const window = BrowserWindow.getAllWindows()[0]
    if (!window) {
      return { success: false, error: '没有找到主窗口' }
    }
    const ttsService = getTTSService(config, window)
    const sessionId = await ttsService.synthesize(text, options?.sessionId)
    return { success: true, sessionId }
  } catch (error) {
    mainLogger.error('TTS synthesize failed', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle('tts-v3-disconnect', async () => {
  try {
    const window = BrowserWindow.getAllWindows()[0]
    if (!window) {
      return { success: true }
    }
    const ttsService = getTTSService({} as any, window)
    ttsService.disconnect()
    return { success: true }
  } catch (error) {
    mainLogger.error('TTS disconnect failed', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

// ========== TTS 持久化缓存 IPC ==========
// 使用 Node.js 内置的 crypto
const crypto = require('crypto')

// 获取 TTS 缓存目录
const getTTSCacheDir = () => {
  const cacheDir = path.join(app.getPath('userData'), 'tts-cache')
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true })
  }
  return cacheDir
}

// 生成缓存文件名（基于文本和音色的 MD5 hash）
const getCacheFileName = (text: string, voice: string): string => {
  const hash = crypto.createHash('md5').update(`${text}_${voice}`).digest('hex')
  return `${hash}.wav`
}

// 检查本地缓存是否存在
ipcMain.handle('tts-cache-check', async (_event, text: string, voice: string) => {
  try {
    const cacheDir = getTTSCacheDir()
    const fileName = getCacheFileName(text, voice)
    const filePath = path.join(cacheDir, fileName)
    
    if (fs.existsSync(filePath)) {
      mainLogger.debug('TTS cache hit', { fileName })
      const audioData = fs.readFileSync(filePath)
      return { exists: true, audioData: audioData.toString('base64') }
    }
    
    mainLogger.debug('TTS cache miss')
    return { exists: false }
  } catch (error) {
    mainLogger.error('TTS cache check failed', error)
    return { exists: false }
  }
})

// 保存音频到本地缓存
ipcMain.handle('tts-cache-save', async (_event, text: string, voice: string, audioBase64: string) => {
  try {
    const cacheDir = getTTSCacheDir()
    const fileName = getCacheFileName(text, voice)
    const filePath = path.join(cacheDir, fileName)
    
    const audioBuffer = Buffer.from(audioBase64, 'base64')
    fs.writeFileSync(filePath, audioBuffer)
    
    mainLogger.info('TTS cache saved', { fileName, sizeBytes: audioBuffer.length })
    return { success: true, filePath }
  } catch (error) {
    mainLogger.error('TTS cache save failed', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

// ========== 豆包语音 ASR WebSocket v3 IPC ==========
ipcMain.handle('asr-v3-connect', async (_event, config: any) => {
  try {
    const window = BrowserWindow.getAllWindows()[0]
    if (!window) {
      return { success: false, error: '没有找到主窗口' }
    }
    const asrService = getASRService(config, window)
    await asrService.connect()
    return { success: true }
  } catch (error) {
    mainLogger.error('ASR connect failed', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle('asr-v3-start-recognition', async (_event, config: any) => {
  try {
    const window = BrowserWindow.getAllWindows()[0]
    if (!window) {
      return { success: false, error: '没有找到主窗口' }
    }
    const asrService = getASRService(config, window)
    await asrService.startRecognition()
    return { success: true }
  } catch (error) {
    mainLogger.error('ASR start recognition failed', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle('asr-v3-send-audio', async (_event, config: any, audioBase64: string, isLast: boolean) => {
  try {
    const window = BrowserWindow.getAllWindows()[0]
    if (!window) {
      return { success: false, error: '没有找到主窗口' }
    }
    const asrService = getASRService(config, window)
    await asrService.sendAudioChunk(audioBase64, isLast)
    return { success: true }
  } catch (error) {
    mainLogger.error('ASR send audio failed', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle('asr-v3-stop-recognition', async (_event, config: any) => {
  try {
    const window = BrowserWindow.getAllWindows()[0]
    if (!window) {
      return { success: true }
    }
    const asrService = getASRService(config, window)
    asrService.stopRecognition()
    return { success: true }
  } catch (error) {
    mainLogger.error('ASR stop recognition failed', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
});

app.whenReady().then(() => {
  if (app.isPackaged) {
    Menu.setApplicationMenu(null)
  }
  createWindow()
  registerDevelopmentShortcuts()
  registerAllTools()
})



app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
