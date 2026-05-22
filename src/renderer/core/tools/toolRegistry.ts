import { createTask, updateProject } from '../../services/workspaceStore';
import type { ToolDefinition } from '../model';
import type { ToolExecutionResult } from './toolExecutor';

export type ToolRiskLevel = 'read' | 'low_write' | 'system' | 'destructive' | 'external_send';

type ToolArgs = Record<string, any>;

/**
 * 单个工具的完整定义。
 *
 * schema：给大模型看的函数描述，决定模型会不会、怎么调用这个工具。
 * riskLevel：给应用看的风险等级，决定是否需要确认。
 * execute：真正执行工具的代码。
 *
 * 这三块放在一起，是为了避免“模型看到的工具”和“实际执行的工具”不同步。
 */
export interface ToolSpec {
  schema: ToolDefinition;
  riskLevel: ToolRiskLevel;
  requiresConfirmation?: (args: ToolArgs) => boolean;
  execute: (api: any, args: ToolArgs) => Promise<ToolExecutionResult>;
}

export interface RegisteredTool {
  name: string;
  description: string;
  riskLevel: ToolRiskLevel;
  requiresConfirmation?: (args: ToolArgs) => boolean;
  execute: (api: any, args: ToolArgs) => Promise<ToolExecutionResult>;
}

function hasHighRiskCommand(command: string): boolean {
  const normalized = command.trim().toLowerCase();
  // 只拦截明显危险的系统级命令；普通打开应用、查看目录、开发命令不应该频繁打断用户。
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

/**
 * 工具总注册表。
 *
 * 新增工具时优先在这里加一项：
 * 1. 写 schema，让模型知道什么时候调用
 * 2. 设 riskLevel，让权限系统知道是否确认
 * 3. 写 execute，把参数转给 preload 暴露的白名单 API 或本地 store
 */
export const TOOLS: Record<string, ToolSpec> = {
  exec_command: {
    schema: {
      type: 'function',
      function: {
        name: 'exec_command',
        description: '执行系统命令。用于查看系统信息、查询进程、执行开发命令、打开程序等。日常低风险命令可自动执行，高风险命令会要求用户确认。优先使用专用工具；只有专用工具不够用时再使用本工具。',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: '要执行的命令' },
          },
          required: ['command'],
        },
      },
    },
    riskLevel: 'system',
    requiresConfirmation: (args) => hasHighRiskCommand(String(args.command || '')),
    execute: (api, args) => api.execCommand(args.command),
  },
  read_file: {
    schema: {
      type: 'function',
      function: {
        name: 'read_file',
        description: '读取文件内容。当用户想查看某个文件的内容时使用。',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '文件完整路径' },
          },
          required: ['path'],
        },
      },
    },
    riskLevel: 'read',
    execute: (api, args) => api.readFile(args.path),
  },
  write_file: {
    schema: {
      type: 'function',
      function: {
        name: 'write_file',
        description: '创建或修改文件。当用户想保存内容、新建文件、修改文件时使用。',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '文件完整路径' },
            content: { type: 'string', description: '要写入的内容' },
          },
          required: ['path', 'content'],
        },
      },
    },
    riskLevel: 'low_write',
    execute: (api, args) => api.writeFile(args.path, args.content),
  },
  web_search: {
    schema: {
      type: 'function',
      function: {
        name: 'web_search',
        description: '搜索互联网信息。当用户需要查询实时信息、新闻、知识、教程时使用。不适用于查天气。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '搜索关键词' },
          },
          required: ['query'],
        },
      },
    },
    riskLevel: 'read',
    execute: (api, args) => api.webSearch(args.query),
  },
  web_fetch: {
    schema: {
      type: 'function',
      function: {
        name: 'web_fetch',
        description: '获取指定 URL 的网页内容。当用户说“帮我看看这个链接的内容”时使用。',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: '要获取的网页 URL' },
          },
          required: ['url'],
        },
      },
    },
    riskLevel: 'read',
    execute: (api, args) => api.webFetch(args.url),
  },
  list_dir: {
    schema: {
      type: 'function',
      function: {
        name: 'list_dir',
        description: '列出指定目录下的文件和文件夹。',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '目录路径' },
          },
          required: ['path'],
        },
      },
    },
    riskLevel: 'read',
    execute: (api, args) => api.listDir(args.path),
  },
  search_files: {
    schema: {
      type: 'function',
      function: {
        name: 'search_files',
        description: '在指定目录中搜索包含特定关键词的文件名。',
        parameters: {
          type: 'object',
          properties: {
            directory: { type: 'string', description: '搜索目录路径' },
            keyword: { type: 'string', description: '文件名关键词' },
          },
          required: ['directory', 'keyword'],
        },
      },
    },
    riskLevel: 'read',
    execute: (api, args) => api.searchFiles(args.path ?? args.directory, args.pattern ?? args.keyword),
  },
  grep_content: {
    schema: {
      type: 'function',
      function: {
        name: 'grep_content',
        description: '在文件或目录内容中搜索包含特定关键词的行。',
        parameters: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: '文件或目录路径' },
            pattern: { type: 'string', description: '要搜索的关键词或正则表达式' },
            file_pattern: { type: 'string', description: '可选的文件名过滤规则，如 *.ts' },
          },
          required: ['file_path', 'pattern'],
        },
      },
    },
    riskLevel: 'read',
    execute: (api, args) => api.grepContent(args.path ?? args.file_path, args.keyword ?? args.pattern, args.file_pattern),
  },
  clipboard_read: {
    schema: {
      type: 'function',
      function: {
        name: 'clipboard_read',
        description: '读取剪贴板内容。当用户说“翻译刚才复制的”或“总结剪贴板内容”时使用。',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
    riskLevel: 'read',
    execute: (api) => api.clipboardRead(),
  },
  clipboard_write: {
    schema: {
      type: 'function',
      function: {
        name: 'clipboard_write',
        description: '将内容写入剪贴板。',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string', description: '要复制到剪贴板的内容' },
          },
          required: ['text'],
        },
      },
    },
    riskLevel: 'low_write',
    execute: (api, args) => api.clipboardWrite(args.text),
  },
  open_app: {
    schema: {
      type: 'function',
      function: {
        name: 'open_app',
        description: '打开应用程序或网页链接。当用户说“打开微信”“打开百度”时使用。',
        parameters: {
          type: 'object',
          properties: {
            target: { type: 'string', description: '应用名称或 URL' },
          },
          required: ['target'],
        },
      },
    },
    riskLevel: 'low_write',
    execute: (api, args) => api.openApp(args.target),
  },
  knowledge_search: {
    schema: {
      type: 'function',
      function: {
        name: 'knowledge_search',
        description: '搜索本地知识库。从向量数据库中检索最相关的文档片段。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '搜索查询文本' },
            n_results: { type: 'number', description: '返回结果数量，默认 3' },
          },
          required: ['query'],
        },
      },
    },
    riskLevel: 'read',
    execute: (api, args) => api.knowledgeSearch(args.query, args.n_results),
  },
  knowledge_add: {
    schema: {
      type: 'function',
      function: {
        name: 'knowledge_add',
        description: '向知识库添加新的知识内容。支持批量添加多条文档。',
        parameters: {
          type: 'object',
          properties: {
            documents: {
              type: 'array',
              items: { type: 'string' },
              description: '要添加的文档内容数组',
            },
            category: { type: 'string', description: '知识分类' },
          },
          required: ['documents'],
        },
      },
    },
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
    schema: {
      type: 'function',
      function: {
        name: 'knowledge_import_file',
        description: '导入文件到知识库。支持 PDF、Word、Excel、TXT、MD 文件。',
        parameters: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: '文件完整路径' },
            category: { type: 'string', description: '知识分类' },
          },
          required: ['file_path'],
        },
      },
    },
    riskLevel: 'low_write',
    execute: (api, args) => api.knowledgeImportFile(args.file_path, args.category),
  },
  knowledge_import_image: {
    schema: {
      type: 'function',
      function: {
        name: 'knowledge_import_image',
        description: '识别图片内容并导入知识库。',
        parameters: {
          type: 'object',
          properties: {
            image_path: { type: 'string', description: '图片文件完整路径' },
            category: { type: 'string', description: '知识分类' },
          },
          required: ['image_path'],
        },
      },
    },
    riskLevel: 'low_write',
    execute: (api, args) => api.knowledgeImportImage(args.image_path, args.category),
  },
  workspace_create_task: {
    schema: {
      type: 'function',
      function: {
        name: 'workspace_create_task',
        description: '在个人 AI 工作台中创建项目任务。',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '任务标题' },
            project_id: { type: 'string', description: '项目 ID，默认 project-ai-workspace' },
            priority: { type: 'string', enum: ['low', 'medium', 'high'], description: '任务优先级' },
          },
          required: ['title'],
        },
      },
    },
    riskLevel: 'low_write',
    execute: async (_api, args) => {
      const task = createTask(args.title, args.project_id, args.priority);
      return { success: true, data: `已创建任务：${task.title}` };
    },
  },
  workspace_update_project: {
    schema: {
      type: 'function',
      function: {
        name: 'workspace_update_project',
        description: '更新个人 AI 工作台中的项目状态、下一步或阻塞点。',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'string', description: '项目 ID' },
            status: { type: 'string', enum: ['active', 'blocked', 'planning', 'done'], description: '项目状态' },
            goal: { type: 'string', description: '项目目标' },
            next_step: { type: 'string', description: '下一步行动' },
            blocker: { type: 'string', description: '阻塞点' },
          },
          required: ['project_id'],
        },
      },
    },
    riskLevel: 'low_write',
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

// 传给模型的工具列表，只包含 schema，不暴露执行函数。
export const toolDefinitions: ToolDefinition[] = Object.values(TOOLS).map((tool) => tool.schema);

// 运行时执行工具用的注册表，由 TOOLS 自动派生，避免手写两份。
export const toolRegistry: Record<string, RegisteredTool> = Object.fromEntries(
  Object.entries(TOOLS).map(([name, tool]) => [
    name,
    {
      name,
      description: tool.schema.function.description,
      riskLevel: tool.riskLevel,
      requiresConfirmation: tool.requiresConfirmation,
      execute: tool.execute,
    },
  ])
);

function shouldConfirm(tool: RegisteredTool, args: ToolArgs): boolean {
  // requiresConfirmation 可以做更细的判断，例如 exec_command 只在危险命令时确认。
  if (tool.requiresConfirmation) return tool.requiresConfirmation(args);
  return tool.riskLevel === 'system' || tool.riskLevel === 'destructive' || tool.riskLevel === 'external_send';
}

function confirmTool(tool: RegisteredTool, args: ToolArgs): boolean {
  if (!shouldConfirm(tool, args)) return true;
  if (tool.riskLevel === 'destructive') return false;
  return window.confirm(`工具「${tool.name}」需要执行 ${tool.riskLevel} 操作。\n\n参数：${JSON.stringify(args, null, 2)}\n\n是否继续？`);
}

export async function executeRegisteredTool(api: any, name: string, args: ToolArgs): Promise<ToolExecutionResult> {
  const tool = toolRegistry[name];
  if (!tool) return { success: false, error: `未知工具: ${name}` };
  // 这里是最后一道安全门：模型已经决定调用工具，但真正执行前仍要过权限策略。
  if (!confirmTool(tool, args)) {
    return { success: false, error: `工具 ${name} 已被用户取消或被安全策略拦截` };
  }
  return tool.execute(api, args);
}
