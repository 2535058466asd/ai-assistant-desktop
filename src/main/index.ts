// 在文件顶部添加
if (process.env.NODE_ENV === 'development') {
  try {
    require('electron-reloader')(module);
  } catch (_) {}
}
import { app, BrowserWindow, Menu, ipcMain, clipboard, desktopCapturer, shell } from 'electron'
import { exec, execSync } from 'child_process'
import { promisify } from 'util'
import iconv from 'iconv-lite'

const execAsync = promisify(exec)
import path from 'path'
import http from 'http'
import https from 'https'
import fs from 'fs'
import { getMemoryService } from './services/memoryServiceBackend'
import { getScreenshotService } from './services/screenshotService'
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

const memoryService = getMemoryService();
const screenshotService = getScreenshotService();

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

// ========== 新的工具 IPC Handler ==========

// exec_command — 执行系统命令（带安全限制和超时）
ipcMain.handle('exec-command', async (_event, command: string) => {
  // 危险命令黑名单
  const blocked = ['format ', 'del /f', 'del /s', 'rm -rf', 'rd /s', 'diskpart', 'mkfs'];
  const cmdLower = command.toLowerCase();
  if (blocked.some(b => cmdLower.includes(b))) {
    return { success: false, error: `命令被安全策略拦截: ${command}` };
  }

  return new Promise((resolve) => {
    exec(command, { timeout: 15000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        resolve({ 
          success: false, 
          error: error.message,
          data: stderr || stdout || ''  // 即使失败也返回已有的输出
        });
      } else {
        resolve({ 
          success: true, 
          data: stdout.trim() || '(命令执行成功，无输出)',
          stderr: stderr.trim() || undefined  // 附带 stderr 信息
        });
      }
    });
  });
});

// read_file — 读取文件
ipcMain.handle('read-file', async (_event, filePath: string) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { success: true, data: content };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// write_file — 写入文件
ipcMain.handle('write-file', async (_event, filePath: string, content: string) => {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true, data: `文件已保存: ${filePath}` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// list_dir — 列出目录内容
ipcMain.handle('list-dir', async (_event, dirPath: string) => {
  try {
    if (!fs.existsSync(dirPath)) {
      return { success: false, error: `目录不存在: ${dirPath}` };
    }
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      return { success: false, error: `不是目录: ${dirPath}` };
    }
    const items = fs.readdirSync(dirPath);
    const result = items.map(item => {
      try {
        const itemStat = fs.statSync(path.join(dirPath, item));
        return itemStat.isDirectory() ? `${item}/` : item;
      } catch {
        return item;
      }
    });
    return { success: true, data: result.join('\n') || '(空目录)' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// search_files — 按文件名搜索文件
ipcMain.handle('search-files', async (_event, dirPath: string, pattern: string) => {
  try {
    if (!fs.existsSync(dirPath)) {
      return { success: false, error: `目录不存在: ${dirPath}` };
    }
    // 将 glob 简单模式转为正则（支持 * 和 ?）
    const regexStr = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
    const regex = new RegExp(regexStr, 'i');
    const results: string[] = [];

    function walkDir(dir: string, depth: number = 0) {
      if (depth > 10) return; // 限制搜索深度
      try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          if (item.startsWith('.') || item === 'node_modules' || item === '.git') continue;
          const fullPath = path.join(dir, item);
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              walkDir(fullPath, depth + 1);
            } else if (regex.test(item)) {
              results.push(fullPath);
            }
          } catch { /* 跳过无权限的文件 */ }
        }
      } catch { /* 跳过无权限的目录 */ }
    }

    walkDir(dirPath);
    if (results.length > 50) {
      return { success: true, data: results.slice(0, 50).join('\n') + `\n\n...(共找到 ${results.length} 个文件，已显示前50个)` };
    }
    return { success: true, data: results.join('\n') || '未找到匹配的文件' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// grep_content — 按内容搜索文件
ipcMain.handle('grep-content', async (_event, dirPath: string, keyword: string, filePattern?: string) => {
  try {
    if (!fs.existsSync(dirPath)) {
      return { success: false, error: `目录不存在: ${dirPath}` };
    }
    const results: string[] = [];
    const fileRegex = filePattern ? new RegExp(filePattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.'), 'i') : null;

    function walkDir(dir: string, depth: number = 0) {
      if (depth > 10) return;
      try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          if (item.startsWith('.') || item === 'node_modules' || item === '.git') continue;
          const fullPath = path.join(dir, item);
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              walkDir(fullPath, depth + 1);
            } else if (stat.size < 1024 * 1024) { // 跳过大于1MB的文件
              if (fileRegex && !fileRegex.test(item)) continue;
              try {
                const content = fs.readFileSync(fullPath, 'utf-8');
                const lines = content.split('\n');
                for (let i = 0; i < lines.length; i++) {
                  if (lines[i].includes(keyword)) {
                    results.push(`${fullPath}:${i + 1}: ${lines[i].trim()}`);
                    if (results.length >= 30) return; // 限制结果数量
                  }
                }
              } catch { /* 跳过二进制文件 */ }
            }
          } catch { /* 跳过无权限的文件 */ }
        }
      } catch { /* 跳过无权限的目录 */ }
    }

    walkDir(dirPath);
    if (results.length >= 30) {
      return { success: true, data: results.join('\n') + `\n\n...(结果过多，已显示前30条)` };
    }
    return { success: true, data: results.join('\n') || '未找到匹配的内容' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// web_search — 后台静默搜索，返回文字结果（不打开浏览器）
ipcMain.handle('web-search', async (_event, query: string) => {
  try {
    // 方案1: SearXNG（本地自建搜索，最佳体验）
    try {
      const response = await fetch(`http://localhost:8888/search?q=${encodeURIComponent(query)}&format=json`, {
        signal: AbortSignal.timeout(8000)
      });
      if (response.ok) {
        const data: any = await response.json();
        const results = (data.results || []).slice(0, 8)
          .map((r: any, i: number) => `[${i + 1}] ${r.title}\n    ${r.content || ''}\n    ${r.url}`)
          .join('\n\n');
        return { success: true, data: results || '未找到相关结果' };
      }
    } catch {
      // SearXNG 不可用，尝试方案2
    }

    // 方案2: DuckDuckGo 即时回答 API（免费，无需 key）
    try {
      const ddgResponse = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`, {
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      if (ddgResponse.ok) {
        const ddgData: any = await ddgResponse.json();
        let result = '';
        if (ddgData.Abstract) {
          result = ddgData.Abstract;
          if (ddgData.AbstractSource) result += `\n来源: ${ddgData.AbstractSource}`;
          if (ddgData.AbstractURL) result += `\n链接: ${ddgData.AbstractURL}`;
        }
        if (ddgData.RelatedTopics && ddgData.RelatedTopics.length > 0) {
          const related = ddgData.RelatedTopics.slice(0, 5)
            .filter((t: any) => t.Text)
            .map((t: any) => `• ${t.Text}`)
            .join('\n');
          if (related) result += (result ? '\n\n相关结果:\n' : '') + related;
        }
        if (result) return { success: true, data: result };
      }
    } catch {
      // DuckDuckGo 也不可用，尝试方案3
    }

    // 方案3: 用 Bing 搜索抓取（通过 http-proxy 绕过 CORS）
    try {
      const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
      const bingResponse = await fetch(bingUrl, {
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      if (bingResponse.ok) {
        const html = await bingResponse.text();
        // 简单提取搜索结果（标题+摘要）
        const results: string[] = [];
        const regex = /<li class="b_algo"><h2><a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a><\/h2>(?:<div[^>]*class="b_caption"[^>]*><p[^>]*>(.*?)<\/p>)?/gs;
        let match;
        while ((match = regex.exec(html)) !== null && results.length < 5) {
          const url = match[1];
          const title = match[2].replace(/<[^>]*>/g, '').trim();
          const snippet = match[3] ? match[3].replace(/<[^>]*>/g, '').trim() : '';
          results.push(`[${results.length + 1}] ${title}\n    ${snippet}\n    ${url}`);
        }
        if (results.length > 0) {
          return { success: true, data: results.join('\n\n') };
        }
      }
    } catch {
      // Bing 抓取也失败
    }

    return { success: false, error: '所有搜索方式均失败，请检查网络连接' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// web_fetch — 后台抓取网页文字内容（不打开浏览器）
ipcMain.handle('web-fetch', async (_event, url: string) => {
  try {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return { success: false, error: 'URL 必须以 http:// 或 https:// 开头' };
    }

    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text') && !contentType.includes('html') && !contentType.includes('json')) {
      return { success: false, error: `不支持的内容类型: ${contentType}` };
    }

    let text = await response.text();

    // 如果是 HTML，提取纯文本
    if (contentType.includes('html')) {
      // 移除 script 和 style
      text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
      text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
      text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '');
      text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '');
      text = text.replace(/<header[\s\S]*?<\/header>/gi, '');
      // 移除所有 HTML 标签
      text = text.replace(/<[^>]*>/g, '');
      // 解码 HTML 实体
      text = text.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
      // 压缩空白
      text = text.replace(/\n{3,}/g, '\n\n').trim();
    }

    // 限制长度，避免 token 爆炸
    const MAX_LENGTH = 8000;
    if (text.length > MAX_LENGTH) {
      text = text.slice(0, MAX_LENGTH) + '\n\n...(内容过长，已截断)';
    }

    return { success: true, data: text || '网页内容为空' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// clipboard_read — 读取剪贴板
ipcMain.handle('clipboard-read', async () => {
  try {
    const text = clipboard.readText();
    return { success: true, data: text || '剪贴板为空' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// clipboard_write — 写入剪贴板
ipcMain.handle('clipboard-write', async (_event, text: string) => {
  try {
    clipboard.writeText(text);
    return { success: true, data: '已复制到剪贴板' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// screenshot — 屏幕截图
ipcMain.handle('screenshot', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1280, height: 720 }
    });
    const image = sources[0].thumbnail.toDataURL();
    return { success: true, data: image };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// open_app — 智能打开应用或网页
ipcMain.handle('open-app', async (_event, target: string) => {
  try {
    // 1. 是 URL → 用 shell 打开浏览器
    if (target.startsWith('http://') || target.startsWith('https://')) {
      shell.openExternal(target);
      return { success: true, data: `已打开网页: ${target}` };
    }

    // 2. 查注册表 App Paths（Windows 专有）
    if (process.platform === 'win32') {
      try {
        const { execSync } = require('child_process');
        const regResult = execSync(
          `reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${target}.exe" /ve`,
          { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
        );
        // 从注册表结果中提取路径（格式：    (默认)    REG_SZ    C:\xxx\xxx.exe）
        const match = regResult.match(/REG_SZ\s+(.+)/);
        if (match && match[1]) {
          const appPath = match[1].trim();
          shell.openPath(appPath);
          return { success: true, data: `已打开: ${target}（路径: ${appPath}）` };
        }
      } catch {
        // 注册表没找到，继续下一步
      }

      // 3. 搜索开始菜单快捷方式
      try {
        const { execSync } = require('child_process');
        const userMenu = process.env.APPDATA || '';
        const publicMenu = process.env.ALLUSERSPROFILE || '';
        const searchCmd = `dir /s /b "${userMenu}\\Microsoft\\Windows\\Start Menu\\Programs\\*${target}*.lnk" 2>nul & dir /s /b "${publicMenu}\\Microsoft\\Windows\\Start Menu\\Programs\\*${target}*.lnk" 2>nul`;
        // Windows cmd 输出是 GBK 编码，需要用 buffer 模式读取后转码
        const lnkBuffer = execSync(searchCmd, { stdio: ['pipe', 'pipe', 'pipe'] });
        const lnkResult = iconv.decode(lnkBuffer, 'gbk').trim();
        if (lnkResult) {
          const lnkPath = lnkResult.split('\n')[0].trim();
          // 用 start 命令打开 .lnk 文件（stdio 用 pipe 防止弹错误框）
          execSync(`start "" "${lnkPath}"`, { stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000 });
          return { success: true, data: `已打开: ${target}（快捷方式: ${lnkPath}）` };
        }
      } catch {
        // 开始菜单也没找到，继续下一步
      }

      // 4. 兜底：直接 start（windowsHide 防止弹窗）
      try {
        execSync(`start "" "${target}"`, { stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000, windowsHide: true });
        return { success: true, data: `已打开: ${target}` };
      } catch {
        // start 也失败了
      }
    } else {
      // Mac / Linux
      const cmd = process.platform === 'darwin' ? `open -a "${target}"` : `xdg-open "${target}"`;
      execSync(cmd, { stdio: 'ignore', timeout: 10000 });
      return { success: true, data: `已打开: ${target}` };
    }

    return { success: false, error: `找不到应用: ${target}` };
  } catch (error: any) {
    return { success: false, error: `无法打开 "${target}": ${error.message}` };
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})
