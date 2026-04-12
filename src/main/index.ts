// 在文件顶部添加
if (process.env.NODE_ENV === 'development') {
  try {
    require('electron-reloader')(module);
  } catch (_) {}
}
import { app, BrowserWindow, Menu, ipcMain } from 'electron'
import path from 'path'
import http from 'http'
import https from 'https'
import fs from 'fs'
import { getSystemControlService } from './services/systemControl'
import { getMemoryService } from './services/memoryServiceBackend'
import { getScreenshotService } from './services/screenshotService'
import openclawAuth from './services/openclawAuth'
import { getTTSService } from './services/tts/volcengineTTSWebSocketService'
import { getASRService } from './services/asr/volcengineASRWebSocketService'

class WhisperService {
  whisper: any;

  constructor() {
    console.log('🎤 Whisper服务初始化中...');
  }

  async initialize(): Promise<void> {
    try {
      this.whisper = await import('node-whisper');
      console.log('✅ Whisper服务初始化成功');
    } catch (error) {
      console.error('❌ Whisper服务初始化失败:', error);
      throw error;
    }
  }

  async transcribe(audioData: Buffer, language: string = 'zh'): Promise<string> {
    try {
      console.log('🎤 Whisper开始识别...');
      
      const tempDir = path.join(app.getPath('userData'), 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const tempFile = path.join(tempDir, `audio_${Date.now()}.wav`);
      fs.writeFileSync(tempFile, audioData);
      
      console.log('📝 音频已保存到:', tempFile);
      
      const result = await this.whisper.transcribe(tempFile, {
        language: language,
        model: 'tiny',
        verbose: true
      });
      
      console.log('✅ Whisper识别完成:', result);
      
      fs.unlinkSync(tempFile);
      
      return result.text || '';
      
    } catch (error) {
      console.error('❌ Whisper识别失败:', error);
      throw error;
    }
  }
}

const whisperService = new WhisperService();

let mainWindow: BrowserWindow | null = null



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
          console.log(`✅ 成功连接到 Vite 服务器: http://localhost:${port}`);
          return;
        } catch (error) {
          console.log(`⏳ 尝试连接端口 ${port} 失败，继续尝试...`);
        }
      }
      console.error('❌ 无法连接到 Vite 服务器');
    };
    tryLoadURL();
    
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

class TtsService {
  private outputDir: string;
  private edgeTts: any;

  constructor() {
    this.outputDir = path.join(app.getPath('userData'), 'output');
    
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  async synthesize(text: string): Promise<string> {
    try {
      console.log('开始语音合成:', text);
      
      if (!this.edgeTts) {
        this.edgeTts = await import('edge-tts/out/index.js');
      }

      const timestamp = Date.now();
      const audioPath = path.join(this.outputDir, 'audio_' + timestamp + '.mp3');

      await this.edgeTts.ttsSave(text, audioPath);
      console.log('语音合成成功，保存路径:', audioPath);

      return audioPath;
    } catch (error) {
      console.error('语音合成失败:', error);
      throw new Error('语音合成失败，请稍后重试');
    }
  }

  getOutputDir(): string {
    return this.outputDir;
  }
}

const ttsService = new TtsService();

function startTtsServer() {
  const server = http.createServer((req, res) => {
    if (req.url === '/api/tts' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          const text = data.text;
          
          if (!text) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Text is required' }));
            return;
          }
          
          const audioPath = await ttsService.synthesize(text);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          const relativePath = audioPath.replace(/.*\\output\\/, 'output/').replace(/\\/g, '/');
          res.end(JSON.stringify({ audio_path: relativePath }));
          console.log('返回音频文件路径:', relativePath);
        } catch (error) {
          console.error('TTS server error:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'TTS service error' }));
        }
      });
    } else if (req.url.startsWith('/output/')) {
      const filePath = path.join(ttsService.getOutputDir(), req.url.replace('/output/', ''));
      
      if (filePath.startsWith(ttsService.getOutputDir())) {
        const stream = fs.createReadStream(filePath);
        stream.on('error', () => {
          res.writeHead(404);
          res.end();
        });
        stream.pipe(res);
      } else {
        res.writeHead(403);
        res.end();
      }
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  
  server.listen(3001, function() {
    console.log('TTS server running on http://localhost:3001');
  });
}

ipcMain.handle('text-to-speech', async (_event, text: string) => {
  try {
    const audioPath = await ttsService.synthesize(text);
    return { success: true, audioPath };
  } catch (error) {
    console.error('IPC text-to-speech error:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});



ipcMain.handle('whisper-transcribe', async (_event, audioBase64: string, language: string = 'zh') => {
  try {
    console.log('🎤 收到Whisper识别请求');
    
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    
    if (!whisperService.whisper) {
      await whisperService.initialize();
    }
    
    const text = await whisperService.transcribe(audioBuffer, language);
    
    return { success: true, text };
  } catch (error) {
    console.error('❌ Whisper识别失败:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
});

ipcMain.handle('http-proxy', async (_event, options: any) => {
  return new Promise((resolve) => {
    try {
      const url = new URL(options.url);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;
      const isBinary = options.responseType === 'arraybuffer';
      
      const requestOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: options.method || 'GET',
        headers: options.headers || {}
      };

      console.log('🌐 HTTP 代理请求:', requestOptions.method, options.url, '二进制:', isBinary);
      console.log('📋 请求头:', requestOptions.headers);
      console.log('📤 请求体数据:', options.body);
      
      if (options.body) {
        try {
          const parsed = JSON.parse(options.body);
          console.log('📝 解析后的请求体:', JSON.stringify(parsed, null, 2));
        } catch (e) {
          console.log('⚠️  请求体不是 JSON:', options.body);
        }
      }

      const req = client.request(requestOptions, (res) => {
        const chunks: Buffer[] = [];
        
        res.on('data', (chunk) => {
          chunks.push(chunk);
        });
        
        res.on('end', () => {
          console.log('✅ HTTP代理响应完成，状态码:', res.statusCode);
          
          if (isBinary) {
            const buffer = Buffer.concat(chunks);
            const base64Data = buffer.toString('base64');
            resolve({
              success: true,
              status: res.statusCode,
              headers: res.headers,
              data: base64Data,
              isBinary: true
            });
          } else {
            const data = Buffer.concat(chunks).toString('utf8');
            resolve({
              success: true,
              status: res.statusCode,
              headers: res.headers,
              data: data
            });
          }
        });
      });

      req.on('error', (error) => {
        console.error('❌ HTTP 代理请求失败:', error);
        resolve({
          success: false,
          error: error.message
        });
      });

      if (options.body) {
        req.write(options.body);
      }
      
      req.end();
    } catch (error) {
      console.error('❌ HTTP代理异常:', error);
      resolve({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
});

const systemControlService = getSystemControlService();
const memoryService = getMemoryService();
const screenshotService = getScreenshotService();

ipcMain.handle('system-open-app', async (_event, appName: string) => {
  return await systemControlService.openApp(appName);
});

ipcMain.handle('system-open-folder', async (_event, folderName: string) => {
  return await systemControlService.openFolder(folderName);
});

ipcMain.handle('system-lock-screen', async () => {
  return await systemControlService.lockScreen();
});

ipcMain.handle('system-adjust-volume', async (_event, volume?: number, direction?: 'up' | 'down') => {
  return await systemControlService.adjustVolume(volume, direction);
});

ipcMain.handle('system-toggle-mute', async (_event, action?: 'mute' | 'unmute') => {
  return await systemControlService.toggleMute(action);
});

ipcMain.handle('system-search-web', async (_event, query: string) => {
  return await systemControlService.searchWeb(query);
});

ipcMain.handle('system-shutdown', async () => {
  return await systemControlService.shutdownComputer();
});

ipcMain.handle('system-restart', async () => {
  return await systemControlService.restartComputer();
});

ipcMain.handle('system-cancel-shutdown', async () => {
  return await systemControlService.cancelShutdown();
});

ipcMain.handle('system-sleep', async () => {
  return await systemControlService.sleepComputer();
});

ipcMain.handle('system-empty-recycle-bin', async () => {
  return await systemControlService.emptyRecycleBin();
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

ipcMain.handle('memory-add-memory', async (_event, content: string, category: string = 'fact') => {
  memoryService.addMemory(content, category as any);
});

ipcMain.handle('memory-get-all-memories', async () => {
  return memoryService.getAllMemories();
});

ipcMain.handle('memory-get-prompt', async () => {
  return memoryService.getMemoryPrompt();
});

ipcMain.handle('memory-search-memories', async (_event, keyword: string) => {
  return memoryService.searchMemories(keyword);
});

ipcMain.handle('memory-delete-memory', async (_event, id: string) => {
  memoryService.deleteMemory(id);
});

ipcMain.handle('memory-clear-all-memories', async () => {
  memoryService.clearAllMemories();
});

ipcMain.handle('screenshot-take', async () => {
  return await screenshotService.takeScreenshot();
});

// ========== OpenClaw 设备认证 IPC ==========
ipcMain.handle('openclaw-get-device-identity', async () => {
  try {
    const identity = openclawAuth.getOrCreateDeviceIdentity();
    // 只返回 renderer 需要的信息（私钥绝不暴露给 renderer）
    return {
      success: true,
      identity: {
        id: identity.id,
        publicKeyBase64: openclawAuth.getPublicKeyBase64(),
        createdAt: identity.createdAt
      }
    };
  } catch (error) {
    console.error('❌ [Main] 获取设备身份失败:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('openclaw-sign-challenge', async (_event, nonce: string, ts: number) => {
  try {
    console.log('🔐 [Main] 收到签名请求, nonce长度:', nonce?.length);
    const signature = openclawAuth.signChallenge(nonce, ts);
    return { success: true, signature };
  } catch (error) {
    console.error('❌ [Main] 签名失败:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
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
    console.error('❌ [Main] TTS 连接失败:', error)
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
    console.error('❌ [Main] TTS 合成失败:', error)
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
    console.error('❌ [Main] TTS 断开连接失败:', error)
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
      console.log('💾 [Main] TTS 缓存命中:', fileName)
      const audioData = fs.readFileSync(filePath)
      return { exists: true, audioData: audioData.toString('base64') }
    }
    
    console.log('📭 [Main] TTS 缓存未命中')
    return { exists: false }
  } catch (error) {
    console.error('❌ [Main] TTS 缓存检查失败:', error)
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
    
    console.log('💾 [Main] TTS 缓存已保存:', fileName, '大小:', audioBuffer.length, 'bytes')
    return { success: true, filePath }
  } catch (error) {
    console.error('❌ [Main] TTS 缓存保存失败:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

// 获取缓存列表
ipcMain.handle('tts-cache-list', async () => {
  try {
    const cacheDir = getTTSCacheDir()
    const files = fs.readdirSync(cacheDir)
    return { success: true, count: files.length, files }
  } catch (error) {
    console.error('❌ [Main] TTS 缓存列表获取失败:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

// 清除所有缓存
ipcMain.handle('tts-cache-clear', async () => {
  try {
    const cacheDir = getTTSCacheDir()
    const files = fs.readdirSync(cacheDir)
    for (const file of files) {
      fs.unlinkSync(path.join(cacheDir, file))
    }
    console.log('🗑️ [Main] TTS 缓存已清除，共', files.length, '个文件')
    return { success: true, deletedCount: files.length }
  } catch (error) {
    console.error('❌ [Main] TTS 缓存清除失败:', error)
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
    console.error('❌ [Main] ASR 连接失败:', error)
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
    console.error('❌ [Main] ASR 开始识别失败:', error)
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
    console.error('❌ [Main] ASR 发送音频失败:', error)
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
    console.error('❌ [Main] ASR 停止识别失败:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  createWindow()
  startTtsServer()
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
