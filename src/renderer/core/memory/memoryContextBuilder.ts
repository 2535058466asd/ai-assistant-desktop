import { getMemoryService } from '../../services/memoryServiceClient';
import { MEMORY_POLICY_TEXT, type ExistingMemory } from './memoryPolicy';

export interface MemoryExtractionContext {
  currentTurn: {
    user: string;
    assistant: string;
  };
  existingMemories: ExistingMemory[];
  policy: string;
  now: string;
  chatId?: string;
  messageId?: string;
}

export interface BuildMemoryExtractionContextInput {
  userText: string;
  assistantText: string;
  chatId?: string;
  messageId?: string;
}

export async function buildMemoryExtractionContext(
  input: BuildMemoryExtractionContextInput
): Promise<MemoryExtractionContext> {
  const memoryService = getMemoryService();
  const searchQuery = [input.userText, input.assistantText].join('\n').slice(0, 1200);
  const existingMemories = await memoryService.searchMemories(searchQuery);

  return {
    currentTurn: {
      user: input.userText.trim(),
      assistant: input.assistantText.trim(),
    },
    existingMemories: existingMemories.slice(0, 10).map((memory: any) => ({
      id: String(memory.id),
      content: String(memory.content || ''),
      category: memory.category || 'fact',
      importance: Number(memory.importance || 5),
      confidence: Number(memory.confidence || 0.7),
      memory_key: memory.memory_key,
      scope: memory.scope,
      source_kind: memory.source_kind,
      status: memory.status,
      valid_until: memory.valid_until,
    })),
    policy: MEMORY_POLICY_TEXT,
    now: new Date().toISOString(),
    chatId: input.chatId,
    messageId: input.messageId,
  };
}
