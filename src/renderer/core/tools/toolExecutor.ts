/**
 * 启源 AI - 工具执行器
 * 
 * 统一的工具执行函数，根据工具名分发到对应的 Electron API
 */

export interface ToolExecutionResult {
  success: boolean;
  data?: string;
  error?: string;
}

export async function executeTool(name: string, args: Record<string, any>): Promise<ToolExecutionResult> {
  console.log(`🔧 [工具调用] ${name}(${JSON.stringify(args)})`);
  const api = (window as any).electronAPI;

  try {
    let result: ToolExecutionResult;

    switch (name) {
      case 'exec_command':
        result = await api.execCommand(args.command);
        break;

      case 'read_file':
        result = await api.readFile(args.path);
        break;

      case 'write_file':
        result = await api.writeFile(args.path, args.content);
        break;

      case 'web_search':
        result = await api.webSearch(args.query);
        break;

      case 'web_fetch':
        result = await api.webFetch(args.url);
        break;

      case 'list_dir':
        result = await api.listDir(args.path);
        break;

      case 'search_files':
        result = await api.searchFiles(args.path, args.pattern);
        break;

      case 'grep_content':
        result = await api.grepContent(args.path, args.keyword, args.file_pattern);
        break;

      case 'clipboard_read':
        result = await api.clipboardRead();
        break;

      case 'clipboard_write':
        result = await api.clipboardWrite(args.text);
        break;

      case 'screenshot':
        result = await api.screenshot();
        break;

      case 'open_app':
        result = await api.openApp(args.target);
        break;

      case 'knowledge_search':
        result = await api.knowledgeSearch(args.query, args.n_results);
        break;

      case 'knowledge_add': {
        const docs = args.documents || [];
        const metas = args.category
          ? docs.map(() => ({ category: args.category, created_at: new Date().toISOString() }))
          : undefined;
        result = await api.knowledgeAdd(docs, metas);
        break;
      }

      case 'knowledge_import_file':
        result = await api.knowledgeImportFile(args.file_path, args.category);
        break;

      case 'knowledge_import_image':
        result = await api.knowledgeImportImage(args.image_path, args.category);
        break;

      default:
        result = { success: false, error: `未知工具: ${name}` };
    }

    console.log(`🔧 [工具结果] ${name}: ${result.success ? '✅成功' : '❌失败'} - ${JSON.stringify(result)}`);
    return result;
  } catch (error: any) {
    console.error(`🔧 [工具异常] ${name}: ${error.message}`);
    return { success: false, error: error.message };
  }
}
