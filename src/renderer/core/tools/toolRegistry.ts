import type { ToolExecutionResult } from './toolExecutor';

export type ToolRiskLevel = 'read' | 'low_write' | 'system' | 'destructive' | 'external_send';

export interface RegisteredTool {
  name: string;
  description: string;
  riskLevel: ToolRiskLevel;
  requiresConfirmation?: (args: Record<string, any>) => boolean;
  execute: (api: any, args: Record<string, any>) => Promise<ToolExecutionResult>;
}

function hasHighRiskCommand(command: string): boolean {
  const normalized = command.trim().toLowerCase();
  const highRiskPatterns = [
    /\btaskkill\b/,
    /\bstop-process\b/,
    /\bkill\b/,
    /\bsc\s+(stop|delete|config)\b/,
    /\bnet\s+(user|localgroup|accounts)\b/,
    /\bicacls\b/,
    /\btakeown\b/,
    /\breg\s+(add|delete|import|restore)\b/,
    /\bsetx\b/,
    /\bpowershell\b.*\b(remove-item|move-item|set-executionpolicy|invoke-expression|iex)\b/,
    /\bcurl\b.*\|\s*(powershell|pwsh|cmd|sh|bash)\b/,
    /\binvoke-webrequest\b.*\|\s*(iex|invoke-expression)\b/,
  ];
  return highRiskPatterns.some((pattern) => pattern.test(normalized));
}

function shouldConfirm(tool: RegisteredTool, args: Record<string, any>): boolean {
  if (tool.requiresConfirmation) return tool.requiresConfirmation(args);
  const riskLevel = tool.riskLevel;
  return riskLevel === 'system' || riskLevel === 'destructive' || riskLevel === 'external_send';
}

function confirmTool(tool: RegisteredTool, args: Record<string, any>): boolean {
  if (!shouldConfirm(tool, args)) return true;
  if (tool.riskLevel === 'destructive') return false;
  return window.confirm(`工具「${tool.name}」需要执行 ${tool.riskLevel} 操作。\n\n参数：${JSON.stringify(args, null, 2)}\n\n是否继续？`);
}

export const toolRegistry: Record<string, RegisteredTool> = {
  exec_command: {
    name: 'exec_command',
    description: '执行系统命令',
    riskLevel: 'system',
    requiresConfirmation: (args) => hasHighRiskCommand(String(args.command || '')),
    execute: (api, args) => api.execCommand(args.command),
  },
  read_file: {
    name: 'read_file',
    description: '读取文件内容',
    riskLevel: 'read',
    execute: (api, args) => api.readFile(args.path),
  },
  write_file: {
    name: 'write_file',
    description: '写入文件内容',
    riskLevel: 'low_write',
    execute: (api, args) => api.writeFile(args.path, args.content),
  },
  web_search: {
    name: 'web_search',
    description: '搜索互联网',
    riskLevel: 'read',
    execute: (api, args) => api.webSearch(args.query),
  },
  web_fetch: {
    name: 'web_fetch',
    description: '获取网页内容',
    riskLevel: 'read',
    execute: (api, args) => api.webFetch(args.url),
  },
  list_dir: {
    name: 'list_dir',
    description: '列出目录',
    riskLevel: 'read',
    execute: (api, args) => api.listDir(args.path),
  },
  search_files: {
    name: 'search_files',
    description: '搜索文件名',
    riskLevel: 'read',
    execute: (api, args) => api.searchFiles(args.path ?? args.directory, args.pattern ?? args.keyword),
  },
  grep_content: {
    name: 'grep_content',
    description: '搜索文件内容',
    riskLevel: 'read',
    execute: (api, args) => api.grepContent(args.path ?? args.file_path, args.keyword ?? args.pattern, args.file_pattern),
  },
  clipboard_read: {
    name: 'clipboard_read',
    description: '读取剪贴板',
    riskLevel: 'read',
    execute: (api) => api.clipboardRead(),
  },
  clipboard_write: {
    name: 'clipboard_write',
    description: '写入剪贴板',
    riskLevel: 'low_write',
    execute: (api, args) => api.clipboardWrite(args.text),
  },
  screenshot: {
    name: 'screenshot',
    description: '截屏',
    riskLevel: 'read',
    execute: (api) => api.screenshot(),
  },
  open_app: {
    name: 'open_app',
    description: '打开应用',
    riskLevel: 'low_write',
    execute: (api, args) => api.openApp(args.target),
  },
  knowledge_search: {
    name: 'knowledge_search',
    description: '检索知识库',
    riskLevel: 'read',
    execute: (api, args) => api.knowledgeSearch(args.query, args.n_results),
  },
  knowledge_add: {
    name: 'knowledge_add',
    description: '添加知识',
    riskLevel: 'low_write',
    execute: (api, args) => {
      const docs = args.documents || [];
      const metas = args.category
        ? docs.map(() => ({ category: args.category, created_at: new Date().toISOString() }))
        : undefined;
      return api.knowledgeAdd(docs, metas);
    },
  },
  knowledge_import_file: {
    name: 'knowledge_import_file',
    description: '导入文件到知识库',
    riskLevel: 'low_write',
    execute: (api, args) => api.knowledgeImportFile(args.file_path, args.category),
  },
  knowledge_import_image: {
    name: 'knowledge_import_image',
    description: '识别图片并导入知识库',
    riskLevel: 'low_write',
    execute: (api, args) => api.knowledgeImportImage(args.image_path, args.category),
  },
};

export async function executeRegisteredTool(api: any, name: string, args: Record<string, any>): Promise<ToolExecutionResult> {
  const tool = toolRegistry[name];
  if (!tool) return { success: false, error: `未知工具: ${name}` };
  if (!confirmTool(tool, args)) {
    return { success: false, error: `工具 ${name} 已被用户取消或被安全策略拦截` };
  }
  return tool.execute(api, args);
}
