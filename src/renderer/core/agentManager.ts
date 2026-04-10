// ==========================================
// Agent 管理器
// 支持创建和管理多个 AI Agent
// ==========================================

import { Orchestrator } from './orchestrator';
import type { Message, SessionId } from '../types';

/**
 * Agent 配置接口
 */
export interface AgentConfig {
  id: string;                    // Agent ID
  name: string;                  // Agent 名称
  description: string;           // 描述
  systemPrompt?: string;         // 系统提示词
  model?: string;                // 使用的模型
  workspace?: string;            // 工作目录
}

/**
 * Agent 实例
 */
interface AgentInstance {
  config: AgentConfig;
  orchestrator: Orchestrator;
  createdAt: number;
}

/**
 * Agent 管理器类
 */
export class AgentManager {
  private agents: Map<string, AgentInstance> = new Map();
  private currentAgentId: string = 'default';

  constructor() {
    console.log('🤖 Agent 管理器初始化中...');
    this.initializeDefaultAgent();
  }

  /**
   * 初始化默认 Agent
   */
  private initializeDefaultAgent(): void {
    const defaultConfig: AgentConfig = {
      id: 'default',
      name: '启源',
      description: '默认的通用 AI 助手',
      systemPrompt: '你是一个智能 AI 助手，友好、专业，能够帮助用户解决各种问题。'
    };

    this.createAgent(defaultConfig);
    console.log('✅ 默认 Agent "启源" 已创建');
  }

  /**
   * 创建一个新的 Agent
   * @param config Agent 配置
   */
  createAgent(config: AgentConfig): AgentInstance {
    // 每个 Agent 有独立的 Orchestrator
    const orchestrator = new Orchestrator();
    
    const agent: AgentInstance = {
      config,
      orchestrator,
      createdAt: Date.now()
    };

    this.agents.set(config.id, agent);
    console.log(`✅ Agent "${config.name}" (${config.id}) 已创建`);
    
    return agent;
  }

  /**
   * 获取指定 Agent
   * @param agentId Agent ID
   */
  getAgent(agentId: string): AgentInstance | undefined {
    return this.agents.get(agentId);
  }

  /**
   * 获取当前活跃的 Agent
   */
  getCurrentAgent(): AgentInstance {
    const agent = this.agents.get(this.currentAgentId);
    if (!agent) {
      throw new Error(`Agent ${this.currentAgentId} 不存在`);
    }
    return agent;
  }

  /**
   * 切换到指定 Agent
   * @param agentId Agent ID
   */
  switchToAgent(agentId: string): boolean {
    if (this.agents.has(agentId)) {
      this.currentAgentId = agentId;
      console.log(`🔄 已切换到 Agent: ${this.agents.get(agentId)?.config.name}`);
      return true;
    }
    console.warn(`⚠️ Agent ${agentId} 不存在`);
    return false;
  }

  /**
   * 获取所有 Agent 列表
   */
  getAllAgents(): AgentConfig[] {
    return Array.from(this.agents.values()).map(agent => agent.config);
  }

  /**
   * 删除指定 Agent
   * @param agentId Agent ID
   */
  deleteAgent(agentId: string): boolean {
    if (agentId === 'default') {
      console.warn('⚠️ 不能删除默认 Agent');
      return false;
    }

    if (this.agents.has(agentId)) {
      this.agents.delete(agentId);
      
      // 如果删除的是当前 Agent，切换回默认
      if (this.currentAgentId === agentId) {
        this.currentAgentId = 'default';
      }
      
      console.log(`🗑️ Agent ${agentId} 已删除`);
      return true;
    }
    return false;
  }

  /**
   * 通过当前 Agent 发送消息
   * @param text 用户输入
   */
  async sendMessage(text: string): Promise<void> {
    const agent = this.getCurrentAgent();
    await agent.orchestrator.processTextInput(text);
  }

  /**
   * 获取当前 Agent 的历史消息
   */
  getHistory(): Message[] {
    const agent = this.getCurrentAgent();
    return agent.orchestrator.getHistory();
  }

  /**
   * 开始语音监听（当前 Agent）
   */
  async startVoiceListening(): Promise<boolean> {
    const agent = this.getCurrentAgent();
    return agent.orchestrator.startVoiceListening();
  }

  /**
   * 停止语音监听（当前 Agent）
   */
  stopVoiceListening(): void {
    const agent = this.getCurrentAgent();
    agent.orchestrator.stopVoiceListening();
  }
}

// 创建单例
let agentManagerInstance: AgentManager | null = null;

export function getAgentManager(): AgentManager {
  if (!agentManagerInstance) {
    agentManagerInstance = new AgentManager();
  }
  return agentManagerInstance;
}
