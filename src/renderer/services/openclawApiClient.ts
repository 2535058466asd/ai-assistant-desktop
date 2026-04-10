// ==========================================
// OpenClaw API 服务（HTTP API 版本 - 最终方案）
// 只用 OpenClaw 的工具，意图识别由启源 AI 自己做
// ==========================================

export interface OpenClawToolRequest {
  skillId: string;
  skillName: string;
  params: Record<string, any>;
}

export interface OpenClawToolResult {
  success: boolean;
  output?: any;
  data?: any;
  error?: string;
}

export interface OpenClawToolInfo {
  id: string;
  name: string;
  description: string;
}

export class OpenClawApiService {
  private gatewayUrl: string;
  private token: string;
  private isAvailable: boolean = false;

  constructor() {
    console.log('🔗 OpenClaw API 服务初始化（HTTP API 版）...');
    this.gatewayUrl = 'http://localhost:18789';
    this.token = 'dc55cf74ac50c211b57f04a2959fb94ce344495be0eab3b7';
  }

  async initialize(): Promise<boolean> {
    try {
      console.log('🔗 开始 OpenClaw HTTP API 连接检查...');
      this.isAvailable = true;
      console.log('✅ OpenClaw HTTP API 连接成功');
      return true;
    } catch (error) {
      console.error('❌ OpenClaw HTTP API 连接失败:', error);
      this.isAvailable = false;
      return false;
    }
  }

  async getAvailableSkills(): Promise<OpenClawToolInfo[]> {
    console.log('📦 使用默认工具列表（OpenClaw 不提供工具列表 API）');
    return this.getDefaultTools();
  }

  async executeTool(request: OpenClawToolRequest): Promise<OpenClawToolResult> {
    try {
      console.log('🔧 执行 OpenClaw 工具:', request.skillId);
      console.log('   参数:', request.params);

      const requestBody = {
        tool: request.skillId,
        args: request.params,
        sessionKey: 'qiyuan-ai-session',
        dryRun: false
      };
      
      console.log('📦 请求体:', JSON.stringify(requestBody, null, 2));

      const response = await this.httpRequest('POST', '/tools/invoke', requestBody);
      
      console.log('✅ 工具执行成功:', response);
      
      return {
        success: true,
        output: response,
        data: response
      };
    } catch (error: any) {
      console.error('❌ 工具执行失败:', error);
      console.error('错误详情:', error);
      return {
        success: false,
        error: error?.message || '工具执行失败'
      };
    }
  }

  private async httpRequest(
    method: string,
    path: string,
    body?: any
  ): Promise<any> {
    const url = `${this.gatewayUrl}${path}`;
    
    // 检查是否有 electronAPI 可用（Electron 环境）
    const hasElectronAPI = !!(window as any).electronAPI?.httpProxy;
    
    if (hasElectronAPI) {
      // Electron 环境：使用 electronAPI.httpProxy
      const options: any = {
        method,
        url,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      };

      if (body) {
        options.body = JSON.stringify(body);
      }

      const result = await (window as any).electronAPI.httpProxy(options);
      
      if (!result.success) {
        throw new Error(result.error || 'HTTP 请求失败');
      }

      if (result.status && result.status >= 400) {
        throw new Error(`HTTP ${result.status}: ${result.data || result.error}`);
      }

      return typeof result.data === 'string' 
        ? JSON.parse(result.data) 
        : result.data;
    } else {
      // 开发环境：直接使用 fetch API
      const fetchOptions: RequestInit = {
        method,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      };

      if (body) {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(url, fetchOptions);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    }
  }

  isConnected(): boolean {
    return this.isAvailable;
  }

  disconnect(): void {
    this.isAvailable = false;
  }

  private getDefaultTools(): OpenClawToolInfo[] {
    return [
      { id: 'open_app', name: '打开应用', description: '打开指定的应用程序' },
      { id: 'open_folder', name: '打开文件夹', description: '打开指定的文件夹' },
      { id: 'search_web', name: '网页搜索', description: '在浏览器中搜索内容' },
      { id: 'lock_screen', name: '锁屏', description: '锁定屏幕' },
      { id: 'shutdown_computer', name: '关机', description: '关闭电脑' },
      { id: 'restart_computer', name: '重启', description: '重启电脑' },
      { id: 'cancel_shutdown', name: '取消关机', description: '取消关机或重启' },
      { id: 'sleep_computer', name: '休眠', description: '电脑休眠' },
      { id: 'empty_recycle_bin', name: '清空回收站', description: '清空回收站' }
    ];
  }
}

let openclawApiInstance: OpenClawApiService | null = null;

export function getOpenClawApi(): OpenClawApiService {
  if (!openclawApiInstance) {
    openclawApiInstance = new OpenClawApiService();
  }
  return openclawApiInstance;
}
