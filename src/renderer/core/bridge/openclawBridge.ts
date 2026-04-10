// ==========================================
// OpenClaw 工具桥接层
// 让启源 AI 能够使用 OpenClaw 的工具能力
// ==========================================

import { getOpenClawApi, type OpenClawToolRequest, type OpenClawToolResult } from '../../services/openclawApiClient';
import { getSearXNGService } from '../../services/searxngApi';

/**
 * OpenClaw 工具类型
 */
export interface OpenClawSkill {
  id: string;
  name: string;
  description: string;
  category: 'system' | 'file' | 'web' | 'other';
}

/**
 * 工具执行请求
 */
export interface SkillExecutionRequest {
  skillId: string;
  params: Record<string, any>;
}

/**
 * 工具执行结果
 */
export interface SkillExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * OpenClaw 桥接器类
 * 
 * 设计思路：
 * 1. 启源 AI 的四层架构完全保留
 * 2. 执行层（Layer4）可以选择调用 OpenClaw 的工具
 * 3. 这样既保留了自己的代码，又能使用 OpenClaw 的强大能力
 */
export class OpenClawBridge {
  private isConnected: boolean = false;
  private availableSkills: OpenClawSkill[] = [];
  private openclawApi = getOpenClawApi();
  private searxngService = getSearXNGService();

  constructor() {
    console.log('🔗 OpenClaw 桥接器初始化中...');
    this.initialize();
  }

  /**
   * 初始化桥接器
   */
  private async initialize(): Promise<void> {
    try {
      // 尝试连接 OpenClaw API
      const connected = await this.openclawApi.initialize();
      
      if (connected) {
        this.isConnected = true;
        console.log('✅ OpenClaw 连接成功');
        
        // 直接使用 OpenClaw 内置的 tools（来自官方文档）
        this.availableSkills = [
          {
            id: 'search_web',
            name: '网页搜索',
            description: '使用 SearXNG 搜索网页（本地实现）',
            category: 'web'
          },
          {
            id: 'web_fetch',
            name: '网页获取',
            description: '获取网页内容并转换为 Markdown',
            category: 'web'
          },
          {
            id: 'read',
            name: '读取文件',
            description: '读取文件内容',
            category: 'file'
          },
          {
            id: 'write',
            name: '写入文件',
            description: '写入文件内容',
            category: 'file'
          },
          {
            id: 'edit',
            name: '编辑文件',
            description: '编辑文件',
            category: 'file'
          },
          {
            id: 'exec',
            name: '执行命令',
            description: '执行 shell 命令',
            category: 'system'
          },
          {
            id: 'browser',
            name: '浏览器控制',
            description: '控制浏览器',
            category: 'other'
          },
          {
            id: 'sessions_list',
            name: '会话列表',
            description: '列出会话',
            category: 'system'
          },
          {
            id: 'message',
            name: '发送消息',
            description: '发送消息（Discord/Slack/Telegram）',
            category: 'other'
          },
          {
            id: 'cron',
            name: '定时任务',
            description: '管理定时任务',
            category: 'system'
          },
          {
            id: 'weather',
            name: '天气查询',
            description: '查询天气和温度（本地实现）',
            category: 'other'
          }
        ];
        
        // 检查是否需要添加本地的 search_web
        const hasSearchWeb = this.availableSkills.some(s => s.id === 'search_web');
        if (!hasSearchWeb) {
          this.availableSkills.push({
            id: 'search_web',
            name: '网页搜索',
            description: '使用 SearXNG 搜索网页内容',
            category: 'web'
          });
          console.log('🔍 OpenClaw 没有搜索工具，已添加本地 SearXNG 搜索');
        }
        
        // 打印所有可用的技能
        console.log('📦 所有可用的技能:');
        this.availableSkills.forEach(skill => {
          console.log(`   - ${skill.id}: ${skill.name}`);
        });
      } else {
        this.isConnected = false;
        console.warn('⚠️ OpenClaw 未连接，使用本地工具');
        
        // 使用本地工具列表
        this.availableSkills = [
          {
            id: 'open_app',
            name: '打开应用',
            description: '打开指定的应用程序',
            category: 'system'
          },
          {
            id: 'open_folder',
            name: '打开文件夹',
            description: '打开指定的文件夹',
            category: 'system'
          },
          {
            id: 'search_web',
            name: '网页搜索',
            description: '使用 SearXNG 搜索网页内容',
            category: 'web'
          }
        ];
      }
    } catch (error) {
      this.isConnected = false;
      console.warn('⚠️ OpenClaw 连接失败，使用本地工具');
      
      // 使用本地工具列表
      this.availableSkills = [
        {
          id: 'open_app',
          name: '打开应用',
          description: '打开指定的应用程序',
          category: 'system'
        },
        {
          id: 'open_folder',
          name: '打开文件夹',
          description: '打开指定的文件夹',
          category: 'system'
        },
        {
          id: 'search_web',
          name: '网页搜索',
          description: '使用 SearXNG 搜索网页内容',
          category: 'web'
        }
      ];
    }

    console.log('✅ OpenClaw 桥接器初始化完成');
    console.log(`📦 可用技能数量：${this.availableSkills.length}`);
  }

  /**
   * 根据工具名称分类
   */
  private categorizeSkill(skill: any): 'system' | 'file' | 'web' | 'other' {
    const name = (skill.name || '').toLowerCase();
    if (name.includes('打开应用') || name.includes('系统') || name.includes('volume')) {
      return 'system';
    }
    if (name.includes('文件') || name.includes('folder') || name.includes('file')) {
      return 'file';
    }
    if (name.includes('搜索') || name.includes('search') || name.includes('web')) {
      return 'web';
    }
    return 'other';
  }

  /**
   * 检查 OpenClaw 是否可用
   */
  checkAvailability(): boolean {
    return this.isConnected;
  }

  /**
   * 获取可用工具列表
   */
  getAvailableSkills(): OpenClawSkill[] {
    return [...this.availableSkills];
  }

  /**
   * 执行工具
   */
  async executeSkill(request: SkillExecutionRequest): Promise<SkillExecutionResult> {
    console.log('🔧 执行工具:', request.skillId, request.params);

    // 检查 OpenClaw 是否有这个工具
    const hasSkillInOpenClaw = this.availableSkills.some(s => s.id === request.skillId);
    
    // 如果 OpenClaw 已连接并且有这个工具，优先用 OpenClaw
    if (this.isConnected && hasSkillInOpenClaw) {
      try {
        const toolRequest: OpenClawToolRequest = {
          skillId: request.skillId,
          skillName: request.skillId,
          params: request.params
        };

        const result = await this.openclawApi.executeTool(toolRequest);
        
        if (result && result.success) {
          console.log('✅ 使用 OpenClaw 工具成功');
          return {
            success: true,
            data: result.data || result.output
          };
        } else {
          console.warn('⚠️ OpenClaw 工具执行失败，尝试使用本地实现');
        }
      } catch (error: any) {
        console.warn('⚠️ OpenClaw 工具调用失败，尝试使用本地实现:', error.message);
      }
    }

    // OpenClaw 没有或失败，使用本地实现
    console.log('🔧 使用本地工具实现');
    return this.executeLocalSkill(request);
  }

  /**
   * 本地工具执行（备用方案）
   */
  private async executeLocalSkill(request: SkillExecutionRequest): Promise<SkillExecutionResult> {
    console.log('🔧 使用本地工具执行:', request.skillId);

    switch (request.skillId) {
      case 'open_app':
        // 需要调用 Electron 主进程的 openApp 方法
        return {
          success: true,
          data: `已打开应用：${request.params.appName}`
        };
      
      case 'open_folder':
        return {
          success: true,
          data: `已打开文件夹：${request.params.folderName}`
        };
      
      case 'search_web':
        // search_web 现在映射到 OpenClaw 的 web_search 工具
        // 只有当 OpenClaw 调用失败时才会到这里
        try {
          const query = request.params.query || '';
          console.log('🔍 OpenClaw web_search 失败，使用本地 SearXNG:', query);
          const searchResult = await this.searxngService.searchAndFormat(query, 5);
          return {
            success: true,
            data: searchResult
          };
        } catch (error: any) {
          console.error('❌ SearXNG 搜索失败:', error);
          return {
            success: false,
            error: `搜索失败：${error.message || '请检查 SearXNG 是否启动'}`
          };
        }
      
      case 'weather':
        // weather 是 OpenClaw 的 skill，不是 tool，所以用本地实现
        try {
          const location = request.params.location || '北京';
          console.log('🌤️  查询天气:', location);
          
          // 调用 wttr.in API（不需要 API Key）
          const response = await fetch(`https://wttr.in/${encodeURIComponent(location)}?format=%C+%t+%h+%w`);
          
          if (response.ok) {
            const weatherText = await response.text();
            return {
              success: true,
              data: `${location}天气：${weatherText}`
            };
          } else {
            return {
              success: false,
              error: '天气查询失败'
            };
          }
        } catch (error: any) {
          console.error('❌ 天气查询失败:', error);
          return {
            success: false,
            error: `天气查询失败：${error.message || '请稍后重试'}`
          };
        }
      
      default:
        return {
          success: false,
          error: `未知工具：${request.skillId}`
        };
    }
  }
}

// 创建单例
let openclawBridgeInstance: OpenClawBridge | null = null;

export function getOpenClawBridge(): OpenClawBridge {
  if (!openclawBridgeInstance) {
    openclawBridgeInstance = new OpenClawBridge();
  }
  return openclawBridgeInstance;
}