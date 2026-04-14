/**
 * 启源 AI - 工具注册中心
 *
 * 统一注册所有工具的 IPC Handler
 */

import { registerExecCommand } from './execCommand'
import { registerReadFile, registerWriteFile, registerListDir, registerSearchFiles, registerGrepContent } from './fileOps'
import { registerWebFetch } from './webTools'
import { registerClipboardRead, registerClipboardWrite } from './clipboard'
import { registerScreenshot } from './screenshot'
import { registerOpenApp } from './openApp'

export function registerAllTools() {
  // 系统命令
  registerExecCommand()

  // 文件操作
  registerReadFile()
  registerWriteFile()
  registerListDir()
  registerSearchFiles()
  registerGrepContent()

  // 网络工具
  registerWebFetch()

  // 剪贴板
  registerClipboardRead()
  registerClipboardWrite()

  // 截图
  registerScreenshot()

  // 打开应用
  registerOpenApp()

  console.log('🛠️ [工具] 11个工具已注册完成');
}
