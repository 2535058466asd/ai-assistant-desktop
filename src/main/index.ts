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
import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron'
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
    width: 1180,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#eef1f6',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: process.env.NODE_ENV !== 'development'
    }
  })
  mainWindow.setMenuBarVisibility(false)
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window-maximized-change', true)
  })
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window-maximized-change', false)
  })

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

function registerWindowControlHandlers() {
  ipcMain.handle('window-minimize', () => {
    mainWindow?.minimize()
  })

  ipcMain.handle('window-toggle-maximize', () => {
    if (!mainWindow) return false
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
      return false
    }
    mainWindow.maximize()
    return true
  })

  ipcMain.handle('window-close', () => {
    mainWindow?.close()
  })

  ipcMain.handle('window-is-maximized', () => {
    return mainWindow?.isMaximized() ?? false
  })
}

app.whenReady().then(() => {
  createWindow()
  registerDevelopmentShortcuts()
  registerWindowControlHandlers()
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
