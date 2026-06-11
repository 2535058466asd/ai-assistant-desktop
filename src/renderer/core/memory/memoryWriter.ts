import { getMemoryService } from '../../services/memoryServiceClient';
import { createLogger, type LogMeta } from '../../../shared/logger';
import type { ValidMemoryOperation } from './memoryPolicy';

const logger = createLogger('memoryStore');

export interface ApplyMemoryOperationsInput {
  operations: ValidMemoryOperation[];
  chatId?: string;
  messageId?: string;
  meta?: LogMeta;
}

export async function applyMemoryOperations(input: ApplyMemoryOperationsInput): Promise<void> {
  const memoryService = getMemoryService();

  for (const operation of input.operations) {
    if (operation.action === 'ignore') {
      logger.info('忽略候选记忆', {
        ...input.meta,
        phase: 'persist',
        reason: operation.reason,
        content: operation.content,
      });
      continue;
    }

    const result = await memoryService.addMemory(
      operation.content,
      operation.category,
      operation.importance,
      {
        sourceConversation: input.chatId,
        sourceMessage: input.messageId,
        sourceKind: operation.sourceKind,
        memoryKey: operation.memoryKey,
        confidence: operation.confidence,
        validUntil: operation.validUntil,
        scope: operation.scope,
        reason: operation.reason,
      }
    );

    logger.info('执行记忆操作', {
      ...input.meta,
      phase: 'persist',
      action: operation.action,
      memoryKey: operation.memoryKey,
      scope: operation.scope,
      result,
    });
  }
}
