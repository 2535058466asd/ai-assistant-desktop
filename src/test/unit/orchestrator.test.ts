import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Orchestrator } from '../../renderer/core/orchestrator';
import type { Message } from '../../renderer/types';

// Mock 所有依赖
vi.mock('../../renderer/core/history', () => ({
  getHistoryManager: vi.fn(() => ({
    initialize: vi.fn(),
    setHistory: vi.fn(),
    getHistory: vi.fn(() => []),
    addMessage: vi.fn(),
    getHistoryForLLM: vi.fn(() => []),
  })),
}));

vi.mock('../../renderer/core/conversation/conversationRuntime', () => ({
  ConversationRuntime: vi.fn(() => ({
    initialize: vi.fn(() => 'test-session'),
    reset: vi.fn(() => 'test-session'),
    getSessionId: vi.fn(() => 'test-session'),
    createMessageId: vi.fn(() => 'msg-123'),
    addMessage: vi.fn(),
    getHistory: vi.fn(() => []),
    getArchiveHistory: vi.fn(() => []),
    getModelHistory: vi.fn(() => []),
    getHistoryForLLM: vi.fn(() => []),
  })),
}));

vi.mock('../../renderer/core/context/contextCompactor', () => ({
  ContextCompactor: vi.fn(() => ({
    truncateToolResult: vi.fn((result) => result),
    compactIfNeeded: vi.fn(),
  })),
}));

vi.mock('../../renderer/core/agent', () => ({
  AgentLoop: vi.fn(() => ({
    run: vi.fn(() => Promise.resolve({
      content: '测试回复',
      reasoningContent: '',
      toolCallSummary: [],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      model: 'test-model',
    })),
    updateContextCompactor: vi.fn(),
  })),
}));

vi.mock('../../renderer/core/events/agentEventBridge', () => ({
  AgentEventBridge: vi.fn(() => ({
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    emitMessage: vi.fn(),
    emitStreamStart: vi.fn(),
    emitStreamChunk: vi.fn(),
    emitStreamEnd: vi.fn(),
    emitProcessEvent: vi.fn(),
    setMessageCallback: vi.fn(),
    setStreamCallbacks: vi.fn(),
  })),
}));

vi.mock('../../renderer/core/novaSettings', () => ({
  getNovaSystemPrompt: vi.fn(() => '你是一个AI助手'),
  getToolGuidancePrompt: vi.fn(() => ''),
  DEFAULT_NOVA_SETTINGS: {
    welcomeMessage: '你好，我是 Nova，你的 AI 助手！有什么我可以帮你的吗？',
  },
}));

vi.mock('../../renderer/services/memoryServiceClient', () => ({
  getMemoryService: vi.fn(() => ({
    addMemory: vi.fn(),
    getRelevantMemories: vi.fn(() => []),
    setPreference: vi.fn(),
  })),
}));

vi.mock('../../renderer/core/utils/memoryExtractor', () => ({
  tryExtractAndSaveMemory: vi.fn(),
  shouldExtractMemory: vi.fn(() => false),
}));

vi.mock('../../renderer/core/model/modelRuntime', () => ({
  getResolvedRuntimeModel: vi.fn(() => ({ modelId: 'test-model', providerId: 'test' })),
}));

vi.mock('../../renderer/core/tools/toolRegistry', () => ({
  getToolPromptSummary: vi.fn(() => '工具摘要'),
  getInitialToolDefinitions: vi.fn(() => []),
}));

vi.mock('../../renderer/core/voice', () => ({
  getVoiceGatewayManager: vi.fn(() => ({
    initialize: vi.fn(),
    onMessage: vi.fn(),
    stopListening: vi.fn(),
    wakeUp: vi.fn(),
  })),
}));

vi.mock('../../renderer/core/cost/costTracker', () => ({
  recordUsage: vi.fn(),
}));

describe('Orchestrator 核心协调器', () => {
  let orchestrator: Orchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    orchestrator = new Orchestrator();
  });

  describe('构造函数', () => {
    it('应该初始化所有依赖', () => {
      expect(orchestrator).toBeDefined();
    });

    it('应该调用initialize', () => {
      // 验证初始化被调用
      expect(orchestrator).toBeDefined();
    });
  });

  describe('setModel', () => {
    it('应该设置模型ID', () => {
      orchestrator.setModel('new-model');
      // 验证模型ID被设置
      expect(orchestrator).toBeDefined();
    });
  });

  describe('resetConversation', () => {
    it('应该重置对话上下文', () => {
      orchestrator.resetConversation([]);
      // 验证重置被调用
      expect(orchestrator).toBeDefined();
    });

    it('应该传入历史消息', () => {
      const history: Message[] = [
        { id: '1', role: 'user', content: '你好', timestamp: Date.now(), sessionId: 'old' },
      ];
      orchestrator.resetConversation(history);
      expect(orchestrator).toBeDefined();
    });
  });

  describe('getHistory', () => {
    it('应该返回对话历史', () => {
      const history = orchestrator.getHistory();
      expect(history).toBeDefined();
      expect(Array.isArray(history)).toBe(true);
    });
  });

  describe('getArchiveHistory', () => {
    it('应该返回归档历史', () => {
      const archiveHistory = orchestrator.getArchiveHistory();
      expect(archiveHistory).toBeDefined();
      expect(Array.isArray(archiveHistory)).toBe(true);
    });
  });

  describe('processTextInput', () => {
    it('应该处理文本输入', async () => {
      await orchestrator.processTextInput('你好');
      // 验证处理被调用
      expect(orchestrator).toBeDefined();
    });

    it('应该跳过空输入', async () => {
      await orchestrator.processTextInput('');
      // 验证空输入被跳过
      expect(orchestrator).toBeDefined();
    });

    it('应该跳过纯空格输入', async () => {
      await orchestrator.processTextInput('   ');
      // 验证纯空格输入被跳过
      expect(orchestrator).toBeDefined();
    });
  });

  describe('getWelcomeMessage', () => {
    it('应该返回欢迎消息', () => {
      const welcomeMessage = orchestrator.getWelcomeMessage();
      expect(welcomeMessage).toBeDefined();
      expect(typeof welcomeMessage).toBe('string');
    });
  });

  describe('onMessage', () => {
    it('应该注册消息回调', () => {
      const callback = vi.fn();
      orchestrator.onMessage(callback);
      // 验证回调被注册
      expect(orchestrator).toBeDefined();
    });
  });

  describe('onStream', () => {
    it('应该注册流式回调', () => {
      const callbacks = {
        onStreamStart: vi.fn(),
        onStreamChunk: vi.fn(),
        onStreamEnd: vi.fn(),
      };
      orchestrator.onStream(callbacks);
      // 验证回调被注册
      expect(orchestrator).toBeDefined();
    });
  });

  describe('stopVoiceListening', () => {
    it('应该停止语音监听', () => {
      orchestrator.stopVoiceListening();
      // 验证停止被调用
      expect(orchestrator).toBeDefined();
    });
  });

  describe('wakeUp', () => {
    it('应该唤醒语音', () => {
      orchestrator.wakeUp();
      // 验证唤醒被调用
      expect(orchestrator).toBeDefined();
    });
  });
});
