import { app, BrowserWindow, Menu, ipcMain } from 'electron'
import path from 'path'
import http from 'http'
import https from 'https'
import fs from 'fs'
import doubaoApi from './services/doubaoApi'
import { getSystemControlService } from './services/systemControl'
import { getMemoryService } from './services/memoryService'
import { getScreenshotService } from './services/screenshotService'

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

ipcMain.handle('send-message-to-ai', async (_event, userMessages: string[], assistantMessages: string[]) => {
  try {
    const messages = doubaoApi.formatMessages(userMessages, assistantMessages);
    const reply = await doubaoApi.sendMessage(messages);
    return { success: true, message: reply };
  } catch (error) {
    console.error('IPC send-message-to-ai error:', error);
    return { success: false, message: error instanceof Error ? error.message : String(error) };
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

      console.log('🌐 HTTP代理请求:', requestOptions.method, options.url, '二进制:', isBinary);
      console.log('📋 请求头:', requestOptions.headers);
      console.log('📤 请求体数据:', options.data);
      
      if (options.data) {
        try {
          const parsed = JSON.parse(options.data);
          console.log('📝 解析后的请求体:', JSON.stringify(parsed, null, 2));
        } catch (e) {
          console.log('⚠️  请求体不是JSON:', options.data);
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
        console.error('❌ HTTP代理请求失败:', error);
        resolve({
          success: false,
          error: error.message
        });
      });

      if (options.data) {
        req.write(options.data);
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

ipcMain.handle('screenshot-take', async () => {
  return await screenshotService.takeScreenshot();
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
