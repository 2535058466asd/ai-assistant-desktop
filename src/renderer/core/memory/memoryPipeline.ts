import type { LogMeta } from '../../../shared/logger';
import { buildMemoryExtractionContext } from './memoryContextBuilder';
import { planMemoryOperations } from './memoryAgent';
import { applyMemoryOperations } from './memoryWriter';

export interface ProcessTurnMemoryInput {
  userText: string;
  assistantText: string;
  chatId?: string;
  messageId?: string;
  meta?: LogMeta;
}

export async function processTurnMemory(input: ProcessTurnMemoryInput): Promise<void> {
  const context = await buildMemoryExtractionContext({
    userText: input.userText,
    assistantText: input.assistantText,
    chatId: input.chatId,
    messageId: input.messageId,
  });
  const operations = await planMemoryOperations(context, input.meta);
  await applyMemoryOperations({
    operations,
    chatId: input.chatId,
    messageId: input.messageId,
    meta: input.meta,
  });
}

export * from './memoryPolicy';
