import { createTask, updateProject } from '../../services/workspaceStore';
import type { ToolDefinition } from '../model';
import type { ToolExecutionResult } from './toolExecutor';

export type ToolRiskLevel = 'read' | 'low_write' | 'system' | 'destructive' | 'external_send';
export type ToolCategory = 'file' | 'system' | 'web' | 'clipboard' | 'knowledge' | 'workspace' | 'app';

type ToolArgs = Record<string, any>;

export interface ToolSpec {
  schema: ToolDefinition;
  category: ToolCategory;
  riskLevel: ToolRiskLevel;
  isReadOnly: boolean;
  timeoutMs: number;
  requiresConfirmation?: (args: ToolArgs) => boolean;
  execute: (api: any, args: ToolArgs) => Promise<ToolExecutionResult>;
}

export interface RegisteredTool {
  name: string;
  description: string;
  category: ToolCategory;
  riskLevel: ToolRiskLevel;
  isReadOnly: boolean;
  timeoutMs: number;
  requiresConfirmation?: (args: ToolArgs) => boolean;
  execute: (api: any, args: ToolArgs) => Promise<ToolExecutionResult>;
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

function functionTool(
  name: string,
  description: string,
  properties: Record<string, any>,
  required: string[] = []
): ToolDefinition {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: {
        type: 'object',
        properties,
        required,
      },
    },
  };
}

function emptyFunctionTool(name: string, description: string): ToolDefinition {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: { type: 'object', properties: {}, required: [] },
    },
  };
}

export const TOOLS: Record<string, ToolSpec> = {
  exec_command: {
    schema: functionTool(
      'exec_command',
      '执行系统命令。用于查看系统信息、查询进程、执行开发命令、打开程序等。日常低风险命令可自动执行，高风险命令会要求用户确认。优先使用专用工具；只有专用工具不够用时再使用本工具。',
      { command: { type: 'string', description: '要执行的命令' } },
      ['command']
    ),
    category: 'system',
    riskLevel: 'system',
    isReadOnly: false,
    timeoutMs: 15000,
    requiresConfirmation: (args) => hasHighRiskCommand(String(args.command || '')),
    execute: (api, args) => api.execCommand(args.command),
  },

  read_file: {
    schema: functionTool(
      'read_file',
      '读取文件内容。当用户想查看某个文件的内容时使用。',
      { path: { type: 'string', description: '文件完整路径' } },
      ['path']
    ),
    category: 'file',
    riskLevel: 'read',
    isReadOnly: true,
    timeoutMs: 10000,
    execute: (api, args) => api.readFile(args.path),
  },
  write_file: {
    schema: functionTool(
      'write_file',
      '创建或修改文件。当用户想保存内容、新建文件、修改文件时使用。',
      {
        path: { type: 'string', description: '文件完整路径' },
        content: { type: 'string', description: '要写入的内容' },
      },
      ['path', 'content']
    ),
    category: 'file',
    riskLevel: 'low_write',
    isReadOnly: false,
    timeoutMs: 10000,
    execute: (api, args) => api.writeFile(args.path, args.content),
  },
  create_dir: {
    schema: functionTool(
      'create_dir',
      '创建目录。用于新建文件夹或确保某个目录存在。',
      { path: { type: 'string', description: '要创建的目录路径' } },
      ['path']
    ),
    category: 'file',
    riskLevel: 'low_write',
    isReadOnly: false,
    timeoutMs: 10000,
    execute: (api, args) => api.createDir(args.path),
  },
  copy_file: {
    schema: functionTool(
      'copy_file',
      '复制文件或目录。用于备份、整理文件，不会删除源文件。',
      {
        source_path: { type: 'string', description: '源文件或目录路径' },
        target_path: { type: 'string', description: '目标文件或目录路径' },
      },
      ['source_path', 'target_path']
    ),
    category: 'file',
    riskLevel: 'low_write',
    isReadOnly: false,
    timeoutMs: 20000,
    execute: (api, args) => api.copyFile(args.source_path, args.target_path),
  },
  move_file: {
    schema: functionTool(
      'move_file',
      '移动或重命名文件/目录。会改变源路径位置，执行前应确认用户意图。',
      {
        source_path: { type: 'string', description: '源文件或目录路径' },
        target_path: { type: 'string', description: '目标文件或目录路径' },
      },
      ['source_path', 'target_path']
    ),
    category: 'file',
    riskLevel: 'low_write',
    isReadOnly: false,
    timeoutMs: 20000,
    execute: (api, args) => api.moveFile(args.source_path, args.target_path),
  },
  delete_file: {
    schema: functionTool(
      'delete_file',
      '删除文件或目录。这是不可逆操作，请确认用户意图后再调用。',
      { path: { type: 'string', description: '文件或目录路径' } },
      ['path']
    ),
    category: 'file',
    riskLevel: 'destructive',
    isReadOnly: false,
    timeoutMs: 20000,
    requiresConfirmation: () => true,
    execute: (api, args) => api.deleteFile(args.path),
  },
  list_dir: {
    schema: functionTool(
      'list_dir',
      '列出指定目录下的文件和文件夹。',
      { path: { type: 'string', description: '目录路径' } },
      ['path']
    ),
    category: 'file',
    riskLevel: 'read',
    isReadOnly: true,
    timeoutMs: 10000,
    execute: (api, args) => api.listDir(args.path),
  },
  search_files: {
    schema: functionTool(
      'search_files',
      '在指定目录中搜索包含特定关键词的文件名。',
      {
        directory: { type: 'string', description: '搜索目录路径' },
        keyword: { type: 'string', description: '文件名关键词' },
      },
      ['directory', 'keyword']
    ),
    category: 'file',
    riskLevel: 'read',
    isReadOnly: true,
    timeoutMs: 15000,
    execute: (api, args) => api.searchFiles(args.path ?? args.directory, args.pattern ?? args.keyword),
  },
  grep_content: {
    schema: functionTool(
      'grep_content',
      '在文件或目录内容中搜索包含特定关键词的行。',
      {
        file_path: { type: 'string', description: '文件或目录路径' },
        pattern: { type: 'string', description: '要搜索的关键词或正则表达式' },
        file_pattern: { type: 'string', description: '可选的文件名过滤规则，如 *.ts' },
      },
      ['file_path', 'pattern']
    ),
    category: 'file',
    riskLevel: 'read',
    isReadOnly: true,
    timeoutMs: 15000,
    execute: (api, args) => api.grepContent(args.path ?? args.file_path, args.keyword ?? args.pattern, args.file_pattern),
  },

  web_search: {
    schema: functionTool(
      'web_search',
      '搜索互联网信息。当用户需要查询实时信息、新闻、知识、教程时使用。不适用于查天气。',
      { query: { type: 'string', description: '搜索关键词' } },
      ['query']
    ),
    category: 'web',
    riskLevel: 'read',
    isReadOnly: true,
    timeoutMs: 20000,
    execute: (api, args) => api.webSearch(args.query),
  },
  web_fetch: {
    schema: functionTool(
      'web_fetch',
      '获取指定 URL 的网页内容。当用户说“帮我看看这个链接的内容”时使用。',
      { url: { type: 'string', description: '要获取的网页 URL' } },
      ['url']
    ),
    category: 'web',
    riskLevel: 'read',
    isReadOnly: true,
    timeoutMs: 20000,
    execute: (api, args) => api.webFetch(args.url),
  },

  clipboard_read: {
    schema: emptyFunctionTool('clipboard_read', '读取剪贴板内容。当用户说“翻译刚才复制的”或“总结剪贴板内容”时使用。'),
    category: 'clipboard',
    riskLevel: 'read',
    isReadOnly: true,
    timeoutMs: 5000,
    execute: (api) => api.clipboardRead(),
  },
  clipboard_write: {
    schema: functionTool(
      'clipboard_write',
      '将内容写入剪贴板。',
      { text: { type: 'string', description: '要复制到剪贴板的内容' } },
      ['text']
    ),
    category: 'clipboard',
    riskLevel: 'low_write',
    isReadOnly: false,
    timeoutMs: 5000,
    execute: (api, args) => api.clipboardWrite(args.text),
  },

  open_app: {
    schema: functionTool(
      'open_app',
      '打开应用程序或网页链接。当用户说“打开微信”“打开百度”时使用。',
      { target: { type: 'string', description: '应用名称或 URL' } },
      ['target']
    ),
    category: 'app',
    riskLevel: 'low_write',
    isReadOnly: false,
    timeoutMs: 15000,
    execute: (api, args) => api.openApp(args.target),
  },
  notify: {
    schema: functionTool(
      'notify',
      '发送系统通知提醒用户。当用户设置了提醒、需要告知重要信息时使用。',
      {
        title: { type: 'string', description: '通知标题' },
        body: { type: 'string', description: '通知内容' },
      },
      ['title', 'body']
    ),
    category: 'system',
    riskLevel: 'low_write',
    isReadOnly: false,
    timeoutMs: 5000,
    execute: (api, args) => api.notify(args.title, args.body),
  },

  get_current_time: {
    schema: emptyFunctionTool('get_current_time', '获取当前日期和时间。当用户问“今天几号”、“现在几点”、“今天星期几”时使用。'),
    category: 'system',
    riskLevel: 'read',
    isReadOnly: true,
    timeoutMs: 5000,
    execute: (api) => api.getCurrentTime(),
  },
  get_system_info: {
    schema: emptyFunctionTool('get_system_info', '获取系统信息（CPU、内存、磁盘、系统版本）。当用户问“电脑配置”、“内存多大”、“磁盘空间”时使用。'),
    category: 'system',
    riskLevel: 'read',
    isReadOnly: true,
    timeoutMs: 5000,
    execute: (api) => api.getSystemInfo(),
  },

  knowledge_search: {
    schema: functionTool(
      'knowledge_search',
      '搜索本地知识库。从向量数据库中检索最相关的文档片段。',
      {
        query: { type: 'string', description: '搜索查询文本' },
        n_results: { type: 'number', description: '返回结果数量，默认 3' },
      },
      ['query']
    ),
    category: 'knowledge',
    riskLevel: 'read',
    isReadOnly: true,
    timeoutMs: 15000,
    execute: (api, args) => api.knowledgeSearch(args.query, args.n_results),
  },
  knowledge_add: {
    schema: functionTool(
      'knowledge_add',
      '向知识库添加新的知识内容。支持批量添加多条文档。',
      {
        documents: {
          type: 'array',
          items: { type: 'string' },
          description: '要添加的文档内容数组',
        },
        category: { type: 'string', description: '知识分类' },
      },
      ['documents']
    ),
    category: 'knowledge',
    riskLevel: 'low_write',
    isReadOnly: false,
    timeoutMs: 20000,
    execute: (api, args) => {
      const docs = args.documents || [];
      const metas = args.category
        ? docs.map(() => ({ category: args.category, created_at: new Date().toISOString() }))
        : undefined;
      return api.knowledgeAdd(docs, metas);
    },
  },
  knowledge_import_file: {
    schema: functionTool(
      'knowledge_import_file',
      '导入文件到知识库。支持 PDF、Word、Excel、TXT、MD 文件。',
      {
        file_path: { type: 'string', description: '文件完整路径' },
        category: { type: 'string', description: '知识分类' },
      },
      ['file_path']
    ),
    category: 'knowledge',
    riskLevel: 'low_write',
    isReadOnly: false,
    timeoutMs: 60000,
    execute: (api, args) => api.knowledgeImportFile(args.file_path, args.category),
  },
  knowledge_import_image: {
    schema: functionTool(
      'knowledge_import_image',
      '识别图片内容并导入知识库。',
      {
        image_path: { type: 'string', description: '图片文件完整路径' },
        category: { type: 'string', description: '知识分类' },
      },
      ['image_path']
    ),
    category: 'knowledge',
    riskLevel: 'low_write',
    isReadOnly: false,
    timeoutMs: 60000,
    execute: (api, args) => api.knowledgeImportImage(args.image_path, args.category),
  },

  workspace_create_task: {
    schema: functionTool(
      'workspace_create_task',
      '在个人 AI 工作台中创建项目任务。',
      {
        title: { type: 'string', description: '任务标题' },
        project_id: { type: 'string', description: '项目 ID，默认 project-ai-workspace' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'], description: '任务优先级' },
      },
      ['title']
    ),
    category: 'workspace',
    riskLevel: 'low_write',
    isReadOnly: false,
    timeoutMs: 5000,
    execute: async (_api, args) => {
      const task = createTask(args.title, args.project_id, args.priority);
      return { success: true, data: `已创建任务：${task.title}` };
    },
  },
  workspace_update_project: {
    schema: functionTool(
      'workspace_update_project',
      '更新个人 AI 工作台中的项目状态、下一步或阻塞点。',
      {
        project_id: { type: 'string', description: '项目 ID' },
        status: { type: 'string', enum: ['active', 'blocked', 'planning', 'done'], description: '项目状态' },
        goal: { type: 'string', description: '项目目标' },
        next_step: { type: 'string', description: '下一步行动' },
        blocker: { type: 'string', description: '阻塞点' },
      },
      ['project_id']
    ),
    category: 'workspace',
    riskLevel: 'low_write',
    isReadOnly: false,
    timeoutMs: 5000,
    execute: async (_api, args) => {
      const patch: Record<string, any> = {};
      if (args.status) patch.status = args.status;
      if (args.goal) patch.goal = args.goal;
      if (args.next_step) patch.nextStep = args.next_step;
      if (args.blocker) patch.blocker = args.blocker;
      const project = updateProject(args.project_id, patch);
      return project
        ? { success: true, data: `已更新项目：${project.name}` }
        : { success: false, error: `未找到项目：${args.project_id}` };
    },
  },
};

export const toolDefinitions: ToolDefinition[] = Object.values(TOOLS).map((tool) => tool.schema);

export const toolRegistry: Record<string, RegisteredTool> = Object.fromEntries(
  Object.entries(TOOLS).map(([name, tool]) => [
    name,
    {
      name,
      description: tool.schema.function.description,
      category: tool.category,
      riskLevel: tool.riskLevel,
      isReadOnly: tool.isReadOnly,
      timeoutMs: tool.timeoutMs,
      requiresConfirmation: tool.requiresConfirmation,
      execute: tool.execute,
    },
  ])
);

export function getToolMetadata(name: string) {
  const tool = toolRegistry[name];
  if (!tool) return null;
  return {
    category: tool.category,
    riskLevel: tool.riskLevel,
    isReadOnly: tool.isReadOnly,
    timeoutMs: tool.timeoutMs,
  };
}

export function getToolPromptSummary(): string {
  return Object.values(toolRegistry)
    .map((tool) => `- ${tool.name}：${tool.description}（分类：${tool.category}；风险：${tool.riskLevel}）`)
    .join('\n');
}

function shouldConfirm(tool: RegisteredTool, args: ToolArgs): boolean {
  if (tool.requiresConfirmation) return tool.requiresConfirmation(args);
  return tool.riskLevel === 'system' || tool.riskLevel === 'destructive' || tool.riskLevel === 'external_send';
}

function confirmTool(tool: RegisteredTool, args: ToolArgs): boolean {
  if (!shouldConfirm(tool, args)) return true;
  return window.confirm(`工具「${tool.name}」需要执行 ${tool.riskLevel} 操作。\n\n参数：${JSON.stringify(args, null, 2)}\n\n是否继续？`);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, toolName: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`工具 ${toolName} 执行超时（${timeoutMs}ms）`));
    }, timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export async function executeRegisteredTool(api: any, name: string, args: ToolArgs): Promise<ToolExecutionResult> {
  const tool = toolRegistry[name];
  if (!tool) return { success: false, error: `未知工具: ${name}` };
  if (!confirmTool(tool, args)) {
    return { success: false, error: `工具 ${name} 已被用户取消或被安全策略拦截` };
  }
  return withTimeout(tool.execute(api, args), tool.timeoutMs, name);
}
