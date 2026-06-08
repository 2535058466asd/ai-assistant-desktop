import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MODEL_CONTEXT_MESSAGES,
  buildDisplayMessages,
  buildModelContext,
  buildModelContextWithDiagnostics,
  sanitizeModelMessages,
} from '../../renderer/core/conversation/conversationContext';
import type { Message } from '../../renderer/types';
import type { ModelMessage } from '../../renderer/core/model';

const baseTime = Date.now();

function message(partial: Partial<Message> & Pick<Message, 'id' | 'role'>): Message {
  return {
    content: '',
    timestamp: baseTime,
    sessionId: 'test-session',
    ...partial,
  };
}

describe('conversationContext', () => {
  it('buildDisplayMessages 只返回可见 user/assistant，并给最终回复补工具摘要', () => {
    const history: Message[] = [
      message({ id: 'u1', role: 'user', content: '查一下天气' }),
      message({
        id: 'a1-round1',
        role: 'assistant',
        isInternal: true,
        tool_calls: [{
          id: 'call_weather',
          type: 'function',
          function: { name: 'web_search', arguments: '{"q":"weather"}' },
        }],
      }),
      message({
        id: 't1',
        role: 'tool',
        isInternal: true,
        tool_call_id: 'call_weather',
        content: JSON.stringify({ success: true, data: '晴天' }),
      }),
      message({ id: 'a1', role: 'assistant', content: '今天是晴天。' }),
    ];

    const display = buildDisplayMessages(history);

    expect(display.map((item) => item.id)).toEqual(['u1', 'a1']);
    expect(display[1].toolCallSummary).toHaveLength(1);
    expect(display[1].toolCallSummary?.[0].name).toBe('web_search');
  });

  it('sanitizeModelMessages 移除空 reasoning_content、空 assistant 和孤立 tool', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '', reasoning_content: '' },
      { role: 'tool', content: 'orphan', tool_call_id: 'missing' },
      { role: 'assistant', content: '你好呀', reasoning_content: '' },
    ];

    const sanitized = sanitizeModelMessages(messages, 'mimo');

    expect(sanitized).toEqual([
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '你好呀' },
    ]);
  });

  it('buildModelContext 保留最近有效工具调用，丢弃更早工具轮次', async () => {
    const history: Message[] = [
      message({ id: 'u1', role: 'user', content: '第一轮' }),
      message({
        id: 'a1-round1',
        role: 'assistant',
        isInternal: true,
        tool_calls: [{
          id: 'old_call',
          type: 'function',
          function: { name: 'old_tool', arguments: '{}' },
        }],
      }),
      message({ id: 'old_result', role: 'tool', isInternal: true, tool_call_id: 'old_call', content: '{"success":true}' }),
      message({ id: 'a1', role: 'assistant', content: '第一轮完成' }),
      message({ id: 'u2', role: 'user', content: '第二轮' }),
      message({
        id: 'a2-round1',
        role: 'assistant',
        isInternal: true,
        tool_calls: [{
          id: 'new_call',
          type: 'function',
          function: { name: 'new_tool', arguments: '{}' },
        }],
      }),
      message({ id: 'new_result', role: 'tool', isInternal: true, tool_call_id: 'new_call', content: '{"success":true}' }),
    ];

    const context = await buildModelContext(history);

    expect(context.some((item) => item.role === 'tool' && item.tool_call_id === 'old_call')).toBe(false);
    expect(context.some((item) => item.role === 'tool' && item.tool_call_id === 'new_call')).toBe(true);
    expect(context.some((item) => item.role === 'assistant' && item.tool_calls?.[0]?.id === 'new_call')).toBe(true);
  });

  it('buildModelContext 对所有 provider 使用同样的 50 条上下文窗口', async () => {
    const history = Array.from({ length: 80 }, (_, index) => message({
      id: `m${index}`,
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `消息${index}`,
    }));

    const doubao = await buildModelContext(history, { provider: 'doubao' });
    const mimo = await buildModelContext(history, { provider: 'mimo' });

    expect(doubao).toHaveLength(DEFAULT_MODEL_CONTEXT_MESSAGES);
    expect(mimo).toHaveLength(DEFAULT_MODEL_CONTEXT_MESSAGES);
    expect(doubao.map((item) => item.content)).toEqual(mimo.map((item) => item.content));
  });

  it('buildModelContextWithDiagnostics 记录清洗前后数量和丢弃原因', async () => {
    const result = await buildModelContextWithDiagnostics([
      message({ id: 'u1', role: 'user', content: '' }),
      message({ id: 'a1', role: 'assistant', content: '有效回复', reasoning_content: '' }),
    ], { provider: 'mimo' });

    expect(result.diagnostics.rawCount).toBe(2);
    expect(result.diagnostics.sanitizedCount).toBe(1);
    expect(result.diagnostics.dropped.some((item) => item.reason === 'empty_user_message')).toBe(true);
    expect(result.messages[0]).toEqual({ role: 'assistant', content: '有效回复' });
  });

  it('MiMo 遇到缺 reasoning_content 的历史工具调用时转成文本摘要', async () => {
    const history: Message[] = [
      message({ id: 'u1', role: 'user', content: '帮我查资料' }),
      message({
        id: 'a1-round1',
        role: 'assistant',
        isInternal: true,
        content: '',
        tool_calls: [{
          id: 'call_search',
          type: 'function',
          function: { name: 'web_search', arguments: '{"q":"MiMo"}' },
        }],
      }),
      message({
        id: 't1',
        role: 'tool',
        isInternal: true,
        tool_call_id: 'call_search',
        content: JSON.stringify({ success: true, data: 'MiMo 是小米大模型。' }),
      }),
    ];

    const result = await buildModelContextWithDiagnostics(history, { provider: 'mimo' });

    expect(result.messages.some((item) => item.role === 'tool')).toBe(false);
    expect(result.messages.some((item) => item.role === 'assistant' && item.tool_calls?.length)).toBe(false);
    expect(result.messages.some((item) => item.role === 'assistant' && String(item.content).includes('此前工具调用摘要'))).toBe(true);
    expect(result.diagnostics.dropped.some((item) => item.reason === 'mimo_tool_call_without_reasoning_summarized')).toBe(true);
  });

  it('坏掉的 tool_call arguments JSON 不会原样回放给模型', async () => {
    const history: Message[] = [
      message({ id: 'u1', role: 'user', content: '继续处理' }),
      message({
        id: 'a1-round1',
        role: 'assistant',
        isInternal: true,
        content: '',
        tool_calls: [{
          id: 'call_bad',
          type: 'function',
          function: { name: 'run_command', arguments: '{"command":"findstr /s /i "prompt""' },
        }],
      }),
      message({
        id: 't1',
        role: 'tool',
        isInternal: true,
        tool_call_id: 'call_bad',
        content: JSON.stringify({ success: false, error: '工具参数解析失败' }),
      }),
    ];

    const result = await buildModelContextWithDiagnostics(history, { provider: 'mimo' });

    expect(result.messages.some((item) => item.role === 'tool')).toBe(false);
    expect(result.messages.some((item) => item.role === 'assistant' && item.tool_calls?.length)).toBe(false);
    expect(result.messages.some((item) => item.role === 'assistant' && String(item.content).includes('此前工具调用摘要'))).toBe(true);
    expect(result.diagnostics.dropped.some((item) => item.reason === 'invalid_tool_call_arguments_summarized')).toBe(true);
  });
});
