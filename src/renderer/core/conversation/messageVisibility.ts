import type { Message } from '../../types';

const LEGACY_INTERNAL_ASSISTANT_ID = /-round\d+$/;

/** 兼容旧存档：早期 AgentLoop 没有显式标记内部轮次，只能通过 ID 识别。 */
export function isInternalAgentMessage(message: Message): boolean {
  return Boolean(
    message.isInternal
    || message.role === 'tool'
    || (message.role === 'assistant' && LEGACY_INTERNAL_ASSISTANT_ID.test(message.id))
  );
}

/** 聊天区只展示真实用户输入和最终助手回复。 */
export function isVisibleChatMessage(message: Message): boolean {
  return (
    (message.role === 'user' || message.role === 'assistant')
    && !isInternalAgentMessage(message)
  );
}

/**
 * 恢复旧 SQLite 存档时清理历史污染：
 * - 带工具调用的 round 消息仍是模型续推必需上下文；
 * - 无工具调用的 round 消息是最终回复重复副本，应删除。
 */
export function normalizeArchivedHistory(history: Message[]): Message[] {
  return history.flatMap((message) => {
    if (message.role === 'tool') {
      return [{ ...message, isInternal: true }];
    }

    if (message.role === 'assistant' && LEGACY_INTERNAL_ASSISTANT_ID.test(message.id)) {
      return message.tool_calls?.length
        ? [{ ...message, isInternal: true }]
        : [];
    }

    return [message];
  });
}
