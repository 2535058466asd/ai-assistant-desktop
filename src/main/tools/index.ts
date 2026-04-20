/**
 * 启源 AI - 工具注册中心
 *
 * 统一注册所有工具的 IPC Handler
 */

import { registerExecCommand } from './execCommand'
import { registerReadFile, registerWriteFile, registerListDir, registerSearchFiles, registerGrepContent } from './fileOps'
import { registerWebSearch, registerWebFetch } from './webTools'
import { registerClipboardRead, registerClipboardWrite } from './clipboard'
import { registerScreenshot } from './screenshot'
import { registerOpenApp } from './openApp'
import { registerKnowledgeSearch, registerKnowledgeAdd, registerKnowledgeStats, registerKnowledgeImportFile, registerKnowledgeImportImage } from './ragTools'

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
  registerWebSearch()
  registerWebFetch()

  // 剪贴板
  registerClipboardRead()
  registerClipboardWrite()

  // 截图
  registerScreenshot()

  // 打开应用
  registerOpenApp()

  // 知识库 RAG
  registerKnowledgeSearch()
  registerKnowledgeAdd()
  registerKnowledgeStats()
  registerKnowledgeImportFile()
  registerKnowledgeImportImage()

  console.log('🛠️ [工具] 17个工具已注册完成');
}
