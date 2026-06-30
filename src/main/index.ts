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
import { app, BrowserWindow, globalShortcut } from 'electron'
import path from 'path'
import { registerAllTools } from './tools'
import { createLogger } from '../shared/logger'
import {
  registerModelProxyHandlers,
  registerTTSHandlers,
  registerASRHandlers,
  registerMemoryHandlers,
  registerConversationHandlers,
  registerAttachmentHandlers,
  registerRealtimeDialogHandlers,
} from './ipc'

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
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: process.env.NODE_ENV !== 'development'
    }
  })
  mainWindow.setMenuBarVisibility(false)

  const isDev = !app.isPackaged;
  if (isDev) {
    const tryLoadURL = async () => {
      const ports = [5173, 5174, 5175, 5176, 5177, 5178, 5179, 5180];
      for (const port of ports) {
        try {
          await mainWindow!.loadURL(`http://localhost:${port}`);
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

app.whenReady().then(() => {
  createWindow()
  registerDevelopmentShortcuts()
  registerAllTools()
  registerModelProxyHandlers()
  registerTTSHandlers()
  registerASRHandlers()
  registerMemoryHandlers()
  registerConversationHandlers()
  registerAttachmentHandlers()
  registerRealtimeDialogHandlers(() => mainWindow)
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
