import { describe, it, expect } from 'vitest';
import type { Message, AgentProcessEvent, ToolProcessEvent, ToolCallSummary } from '../../renderer/types';

describe('类型定义', () => {
  describe('Message', () => {
    it('应该创建基本消息', () => {
      const message: Message = {
        id: 'msg-123',
        role: 'user',
        content: '你好',
        timestamp: Date.now(),
        sessionId: 'session-123',
      };

      expect(message.id).toBe('msg-123');
      expect(message.role).toBe('user');
      expect(message.content).toBe('你好');
      expect(message.timestamp).toBeDefined();
      expect(message.sessionId).toBe('session-123');
    });

    it('应该支持可选字段', () => {
      const message: Message = {
        id: 'msg-123',
        role: 'assistant',
        content: '你好呀',
        timestamp: Date.now(),
        sessionId: 'session-123',
        reasoning_content: '思考过程',
        tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'test', arguments: '{}' } }],
        tool_call_id: 'call-1',
        traceId: 'trace-123',
        model: 'test-model',
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      };

      expect(message.reasoning_content).toBe('思考过程');
      expect(message.tool_calls).toHaveLength(1);
      expect(message.tool_call_id).toBe('call-1');
      expect(message.traceId).toBe('trace-123');
      expect(message.model).toBe('test-model');
      expect(message.usage).toBeDefined();
    });

    it('应该支持不同的角色', () => {
      const userMessage: Message = {
        id: '1',
        role: 'user',
        content: '用户消息',
        timestamp: Date.now(),
        sessionId: 'session-123',
      };

      const assistantMessage: Message = {
        id: '2',
        role: 'assistant',
        content: '助手消息',
        timestamp: Date.now(),
        sessionId: 'session-123',
      };

      const systemMessage: Message = {
        id: '3',
        role: 'system',
        content: '系统消息',
        timestamp: Date.now(),
        sessionId: 'session-123',
      };

      const toolMessage: Message = {
        id: '4',
        role: 'tool',
        content: '工具结果',
        timestamp: Date.now(),
        sessionId: 'session-123',
        tool_call_id: 'call-1',
      };

      expect(userMessage.role).toBe('user');
      expect(assistantMessage.role).toBe('assistant');
      expect(systemMessage.role).toBe('system');
      expect(toolMessage.role).toBe('tool');
    });
  });

  describe('AgentProcessEvent', () => {
    it('应该创建分析事件', () => {
      const event: AgentProcessEvent = {
        id: 'event-123',
        kind: 'analysis',
        title: '理解用户输入',
        status: 'success',
        detail: '用户想要...',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        traceId: 'trace-123',
      };

      expect(event.kind).toBe('analysis');
      expect(event.status).toBe('success');
    });

    it('应该创建响应事件', () => {
      const event: AgentProcessEvent = {
        id: 'event-123',
        kind: 'response',
        title: '生成回复',
        status: 'success',
        detail: '回复内容...',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        traceId: 'trace-123',
      };

      expect(event.kind).toBe('response');
    });

    it('应该支持不同的状态', () => {
      const successEvent: AgentProcessEvent = {
        id: '1',
        kind: 'analysis',
        title: '成功',
        status: 'success',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const pendingEvent: AgentProcessEvent = {
        id: '2',
        kind: 'analysis',
        title: '进行中',
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const errorEvent: AgentProcessEvent = {
        id: '3',
        kind: 'analysis',
        title: '失败',
        status: 'error',
        error: '错误信息',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(successEvent.status).toBe('success');
      expect(pendingEvent.status).toBe('pending');
      expect(errorEvent.status).toBe('error');
    });
  });

  describe('ToolProcessEvent', () => {
    it('应该创建工具事件', () => {
      const event: ToolProcessEvent = {
        id: 'tool-event-123',
        kind: 'tool',
        title: 'read_file',
        toolName: 'read_file',
        toolCallId: 'call-123',
        status: 'success',
        argsPreview: '{ path: "/test" }',
        resultPreview: '文件内容',
        durationMs: 150,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(event.toolName).toBe('read_file');
      expect(event.status).toBe('success');
      expect(event.durationMs).toBe(150);
    });

    it('应该支持不同的状态', () => {
      const successEvent: ToolProcessEvent = {
        id: '1',
        kind: 'tool',
        title: 'read_file',
        toolName: 'read_file',
        toolCallId: 'call-1',
        status: 'success',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const pendingEvent: ToolProcessEvent = {
        id: '2',
        kind: 'tool',
        title: 'write_file',
        toolName: 'write_file',
        toolCallId: 'call-2',
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const errorEvent: ToolProcessEvent = {
        id: '3',
        kind: 'tool',
        title: 'exec_command',
        toolName: 'exec_command',
        toolCallId: 'call-3',
        status: 'error',
        error: '命令执行失败',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(successEvent.status).toBe('success');
      expect(pendingEvent.status).toBe('pending');
      expect(errorEvent.status).toBe('error');
    });
  });

  describe('ToolCallSummary', () => {
    it('应该创建工具调用摘要', () => {
      const summary: ToolCallSummary = {
        name: 'read_file',
        argsPreview: '{ path: "/test" }',
        resultPreview: '文件内容',
        status: 'success',
        durationMs: 150,
      };

      expect(summary.name).toBe('read_file');
      expect(summary.status).toBe('success');
      expect(summary.durationMs).toBe(150);
    });

    it('应该支持失败的工具调用', () => {
      const summary: ToolCallSummary = {
        name: 'exec_command',
        argsPreview: '{ command: "rm -rf /" }',
        resultPreview: '权限不足',
        status: 'error',
        durationMs: 50,
      };

      expect(summary.status).toBe('error');
      expect(summary.resultPreview).toBe('权限不足');
    });
  });
});
