/**
 * Nova AI - 工具注册中心
 *
 * 统一注册所有工具的 IPC Handler
 */

import { registerExecCommand } from './execCommand'
import { registerReadFile, registerWriteFile, registerListDir, registerSearchFiles, registerGrepContent } from './fileOps'
import { registerWebSearch, registerWebFetch, registerSearchSetConfig } from './webTools'
import { registerClipboardRead, registerClipboardWrite } from './clipboard'
import { registerOpenApp } from './openApp'
import { registerKnowledgeSearch, registerKnowledgeAdd, registerKnowledgeStats, registerKnowledgeImportFile, registerKnowledgeImportImage, registerKnowledgeSources, registerKnowledgeDeleteBySource } from './ragTools'
import { registerSystemTools } from './systemTools'
import { createLogger } from '../../shared/logger'

const logger = createLogger('tool')

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
  registerSearchSetConfig()
  registerWebSearch()
  registerWebFetch()

  // 剪贴板
  registerClipboardRead()
  registerClipboardWrite()

  // 打开应用
  registerOpenApp()

  // 知识库 RAG
  registerKnowledgeSearch()
  registerKnowledgeAdd()
  registerKnowledgeStats()
  registerKnowledgeSources()
  registerKnowledgeDeleteBySource()
  registerKnowledgeImportFile()
  registerKnowledgeImportImage()

  // 系统工具（时间/系统信息/通知/删除）
  registerSystemTools()

  logger.info('Tools registered', { count: 22 });
}
