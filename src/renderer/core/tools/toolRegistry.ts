import { createTask, updateProject } from '../../services/workspaceStore';
import type { ToolDefinition } from '../model';
import type { ToolExecutionResult } from './toolExecutor';

export type ToolRiskLevel = 'read' | 'low_write' | 'system' | 'destructive' | 'external_send';
export type ToolCategory = 'file' | 'system' | 'web' | 'clipboard' | 'knowledge' | 'memory' | 'workspace' | 'app';

type ElectronAPI = Window['electronAPI'];
type ToolArgs = Record<string, any>;

export function validateToolArgs(schema: ToolDefinition, args: ToolArgs): string | null {
  const required = (schema.function.parameters?.required || []) as string[];
  for (const key of required) {
    if (args[key] === undefined || args[key] === null || args[key] === '') {
      return `缺少必要参数: ${key}`;
    }
  }
  return null;
}

export interface ToolSpec {
  schema: ToolDefinition;
  category: ToolCategory;
  riskLevel: ToolRiskLevel;
  isReadOnly: boolean;
  timeoutMs: number;
  requiresConfirmation?: (args: ToolArgs) => boolean;
  execute: (api: ElectronAPI, args: ToolArgs) => Promise<ToolExecutionResult>;
}

export interface RegisteredTool {
  name: string;
  description: string;
  category: ToolCategory;
  riskLevel: ToolRiskLevel;
  isReadOnly: boolean;
  timeoutMs: number;
  requiresConfirmation?: (args: ToolArgs) => boolean;
  execute: (api: ElectronAPI, args: ToolArgs) => Promise<ToolExecutionResult>;
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

function formatMemoryWriteResult(result: any, content: string): string {
  const action = result?.action || 'unknown';
  const reason = result?.reason ? `（${result.reason}）` : '';
  switch (action) {
    case 'added':
      return `已记住：${content}`;
    case 'merged':
      return `已合并到已有记忆：${content}`;
    case 'superseded':
      return `已更新记忆：${content}`;
    case 'ignored':
      return `记忆未保存${reason}`;
    default:
      return `记忆处理完成：${content}`;
  }
}

export const TOOLS: Record<string, ToolSpec> = {
  exec_command: {
    schema: functionTool(
      'exec_command',
      '执行系统命令。低风险命令自动执行，高风险需确认。优先用专用工具。',
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
      '读取文件内容。',
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
      '创建或修改文件。',
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
      '创建目录。',
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
      '复制文件或目录，不删除源文件。',
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
      '移动或重命名文件/目录。',
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
      '删除文件或目录（不可逆，需确认）。',
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
      '列出目录下的文件和文件夹。',
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
      '按文件名搜索文件，支持通配符。',
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
    execute: (api, args) => api.searchFiles(args.directory, args.keyword),
  },
  grep_content: {
    schema: functionTool(
      'grep_content',
      '搜索文件内容，支持关键词和正则。可指定文件过滤和上下文行数。',
      {
        file_path: { type: 'string', description: '文件或目录路径' },
        pattern: { type: 'string', description: '搜索关键词或正则表达式' },
        file_pattern: { type: 'string', description: '文件名过滤，如 *.ts' },
        regex: { type: 'boolean', description: '是否用正则匹配（默认 false）' },
        context_lines: { type: 'number', description: '匹配行前后显示几行上下文（默认 0）' },
      },
      ['file_path', 'pattern']
    ),
    category: 'file',
    riskLevel: 'read',
    isReadOnly: true,
    timeoutMs: 15000,
    execute: (api, args) => api.grepContent(args.file_path, args.pattern, args.file_pattern, { regex: args.regex, context_lines: args.context_lines }),
  },

  web_search: {
    schema: functionTool(
      'web_search',
      '搜索互联网信息。',
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
      '抓取指定 URL 的网页正文（转 Markdown）。',
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
    schema: emptyFunctionTool('clipboard_read', '读取剪贴板内容。'),
    category: 'clipboard',
    riskLevel: 'read',
    isReadOnly: true,
    timeoutMs: 5000,
    execute: (api) => api.clipboardRead(),
  },
  clipboard_write: {
    schema: functionTool(
      'clipboard_write',
      '写入内容到剪贴板。',
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
      '打开应用程序或网页链接。',
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
      '发送系统通知。',
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
    schema: emptyFunctionTool('get_current_time', '获取当前日期和时间。'),
    category: 'system',
    riskLevel: 'read',
    isReadOnly: true,
    timeoutMs: 5000,
    execute: (api) => api.getCurrentTime(),
  },
  get_system_info: {
    schema: emptyFunctionTool('get_system_info', '获取系统信息（CPU/内存/磁盘）。'),
    category: 'system',
    riskLevel: 'read',
    isReadOnly: true,
    timeoutMs: 5000,
    execute: (api) => api.getSystemInfo(),
  },

  add_memory: {
    schema: functionTool(
      'add_memory',
      '当且仅当用户明确要求“记住/以后/我的偏好是”等长期信息时，提交候选记忆。不要用于普通推断或临时信息。',
      {
        content: { type: 'string', description: '简洁、可独立理解的记忆内容' },
        category: {
          type: 'string',
          enum: ['preference', 'fact', 'project', 'decision', 'belief', 'event'],
          description: '记忆类别',
        },
        importance: { type: 'number', description: '重要性 1-10，默认 7' },
        memoryKey: { type: 'string', description: '稳定键，例如 profile.user_name、preference.reply_style、project.nova.focus' },
        confidence: { type: 'number', description: '可信度 0-1，显式记忆通常为 1' },
        scope: { type: 'string', enum: ['core', 'long_term'], description: 'core 为常驻记忆，long_term 为按需召回' },
        reason: { type: 'string', description: '为什么保存这条记忆' },
      },
      ['content', 'category']
    ),
    category: 'memory',
    riskLevel: 'low_write',
    isReadOnly: false,
    timeoutMs: 10000,
    execute: async (api, args) => {
      const content = String(args.content || '').trim();
      const result = await api.memoryAddMemory(
        content,
        args.category || 'fact',
        args.importance ?? 7,
        {
          sourceKind: 'explicit',
          memoryKey: args.memoryKey,
          confidence: args.confidence ?? 1,
          scope: args.scope,
          reason: args.reason || 'user_explicit_memory_request',
        }
      );
      return {
        success: true,
        data: formatMemoryWriteResult(result, content),
      };
    },
  },

  knowledge_search: {
    schema: functionTool(
      'knowledge_search',
      '搜索本地知识库，返回最相关文档片段。',
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
      '向知识库添加文档内容。',
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
      '导入文件到知识库（PDF/Word/Excel/TXT/MD）。',
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
      '创建工作台任务。',
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
      '更新工作台项目状态或下一步。',
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

export interface SkillDefinition {
  name: string;
  description: string;
  tools: string[];
  instructions: string;
}

export const SKILLS: Record<string, SkillDefinition> = {
  file_manager: {
    name: 'file_manager',
    description: '文件管理：列出目录、搜索文件、搜索内容、复制/移动/删除文件、创建目录',
    tools: ['list_dir', 'search_files', 'grep_content', 'copy_file', 'move_file', 'delete_file', 'create_dir'],
    instructions: '当用户需要操作文件时，优先使用专用文件工具而不是 exec_command。\n搜索文件时先用 search_files 定位，再用 read_file 读取内容。\ngrep_content 支持正则（regex: true）和上下文行数（context_lines），适合代码搜索。\n删除文件前务必确认用户意图。',
  },
  knowledge_manager: {
    name: 'knowledge_manager',
    description: '知识库管理：添加知识、导入文件、导入图片到知识库',
    tools: ['knowledge_add', 'knowledge_import_file', 'knowledge_import_image'],
    instructions: '操作知识库时，先用 knowledge_search 检索已有内容，避免重复导入。\n导入文件支持 PDF、Word、Excel、TXT、MD 格式，会自动切片。\n导入图片会先走视觉识别再转为知识片段。\n添加知识时可以用 category 参数分类，方便后续检索。',
  },
  system_tools: {
    name: 'system_tools',
    description: '系统工具：打开应用、发送通知、获取系统信息、写入剪贴板',
    tools: ['open_app', 'notify', 'get_system_info', 'clipboard_write'],
    instructions: '打开应用时直接传应用名称或 URL，工具会自动处理。\n系统通知适合设置提醒或告知用户重要信息。\n获取系统信息返回 CPU、内存、磁盘等硬件数据。',
  },
  workspace: {
    name: 'workspace',
    description: '工作台：创建任务、更新项目状态',
    tools: ['workspace_create_task', 'workspace_update_project'],
    instructions: '工作台用于管理个人项目和任务。\n创建任务时可指定优先级（low/medium/high）。\n更新项目时可修改状态（active/blocked/planning/done）、目标、下一步或阻塞点。',
  },
};

const CORE_TOOL_NAMES = [
  'exec_command', 'read_file', 'write_file', 'web_search', 'web_fetch',
  'get_current_time', 'clipboard_read', 'knowledge_search', 'add_memory',
];

function buildSkillEntryTools(): Record<string, ToolSpec> {
  const entries: Record<string, ToolSpec> = {};
  for (const [key, skill] of Object.entries(SKILLS)) {
    entries[`open_${key}`] = {
      schema: functionTool(
        `open_${key}`,
        `打开「${skill.description}」技能，获取可用工具列表和使用指南。当你需要${skill.description.split('：')[0]}相关能力时调用。`,
        {},
        []
      ),
      category: 'system',
      riskLevel: 'read',
      isReadOnly: true,
      timeoutMs: 3000,
      execute: async () => {
        const subToolNames = skill.tools.join(', ');
        return {
          success: true,
          data: `已激活「${skill.name}」技能。\n\n可用子工具: ${subToolNames}\n\n使用指南:\n${skill.instructions}`,
        };
      },
    };
  }
  return entries;
}

const SKILL_ENTRY_TOOLS = buildSkillEntryTools();

export function getInitialToolDefinitions(): ToolDefinition[] {
  const core = CORE_TOOL_NAMES.map((name) => TOOLS[name]).filter(Boolean).map((t) => t.schema);
  const skillEntries = Object.values(SKILL_ENTRY_TOOLS).map((t) => t.schema);
  return [...core, ...skillEntries];
}

export function getToolDefinitionsForActiveSkills(activatedSkills: Set<string>): ToolDefinition[] {
  const core = CORE_TOOL_NAMES.map((name) => TOOLS[name]).filter(Boolean).map((t) => t.schema);
  const skillEntrySchemas = Object.entries(SKILL_ENTRY_TOOLS)
    .filter(([key]) => !activatedSkills.has(key.replace('open_', '')))
    .map(([, t]) => t.schema);
  const activeSubTools: ToolDefinition[] = [];
  for (const skillName of activatedSkills) {
    const skill = SKILLS[skillName];
    if (!skill) continue;
    for (const toolName of skill.tools) {
      const tool = TOOLS[toolName];
      if (tool) activeSubTools.push(tool.schema);
    }
  }
  return [...core, ...skillEntrySchemas, ...activeSubTools];
}

export function getSkillInstructionsForActive(activatedSkills: Set<string>): string {
  const parts: string[] = [];
  for (const skillName of activatedSkills) {
    const skill = SKILLS[skillName];
    if (skill) parts.push(skill.instructions);
  }
  return parts.join('\n\n');
}

export function getToolPromptSummary(toolDefs?: ToolDefinition[]): string {
  const defs = toolDefs || toolDefinitions;
  return defs
    .map((t) => `- ${t.function.name}：${t.function.description}`)
    .join('\n');
}

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
  const schema = TOOLS[name]?.schema;
  if (schema) {
    const validationError = validateToolArgs(schema, args);
    if (validationError) return { success: false, error: validationError };
  }
  if (!confirmTool(tool, args)) {
    return { success: false, error: `工具 ${name} 已被用户取消或被安全策略拦截` };
  }
  return withTimeout(tool.execute(api, args), tool.timeoutMs, name);
}
