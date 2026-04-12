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
  const api = (window as any).electronAPI;

  try {
    switch (name) {
      case 'exec_command':
        return await api.execCommand(args.command);

      case 'read_file':
        return await api.readFile(args.path);

      case 'write_file':
        return await api.writeFile(args.path, args.content);

      case 'web_search':
        return await api.webSearch(args.query);

      case 'clipboard_read':
        return await api.clipboardRead();

      case 'clipboard_write':
        return await api.clipboardWrite(args.text);

      case 'screenshot':
        return await api.screenshot();

      case 'open_app':
        return await api.openApp(args.target);

      default:
        return { success: false, error: `未知工具: ${name}` };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
