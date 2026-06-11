import { getActiveModelConfig } from '../../config/modelConfig';
import { createLogger, type LogMeta } from '../../../shared/logger';
import { getModelProvider } from '../model';
import { getTextContent } from '../model/types';
import type { MemoryExtractionContext } from './memoryContextBuilder';
import { validateMemoryOperation, type MemoryOperation, type ValidMemoryOperation } from './memoryPolicy';

const logger = createLogger('memoryAgent');

export async function planMemoryOperations(
  context: MemoryExtractionContext,
  meta: LogMeta = {}
): Promise<ValidMemoryOperation[]> {
  try {
    const provider = getModelProvider();
    const modelConfig = getActiveModelConfig();
    logger.info('开始分析本轮对话', {
      ...meta,
      phase: 'persist',
      existingCount: context.existingMemories.length,
      userLength: context.currentTurn.user.length,
      assistantLength: context.currentTurn.assistant.length,
    });

    const response = await provider.chatWithTools({
      model: modelConfig.compactModel || modelConfig.model,
      messages: [
        {
          role: 'system',
          content: '你是 Nova 的 Memory Agent。你只输出 JSON 数组，不做聊天回复。',
        },
        {
          role: 'user',
          content: buildMemoryAgentPrompt(context),
        },
      ],
      traceId: meta.traceId,
      caller: 'memoryAgent',
    });

    const raw = getTextContent(response.choices[0]?.message.content) || '[]';
    const operations = parseOperations(raw);
    const validOperations = operations
      .map(validateMemoryOperation)
      .filter((operation): operation is ValidMemoryOperation => Boolean(operation));

    logger.info('操作计划完成', {
      ...meta,
      phase: 'persist',
      existingCount: context.existingMemories.length,
      operationCount: operations.length,
      validCount: validOperations.length,
      actions: validOperations.map(operation => operation.action),
    });

    return validOperations;
  } catch (error) {
    logger.error('操作计划失败', { ...meta, phase: 'persist', error });
    return [];
  }
}

function buildMemoryAgentPrompt(context: MemoryExtractionContext): string {
  return `${context.policy}

当前时间：${context.now}

当前对话：
用户：${context.currentTurn.user}
助手：${context.currentTurn.assistant}

已有相关记忆：
${JSON.stringify(context.existingMemories, null, 2)}

请输出 MemoryOperation[] JSON 数组。每项格式如下：
{
  "action": "add|update|ignore",
  "content": "要保存或更新的记忆；ignore 可省略",
  "memoryKey": "稳定键；能给就给",
  "targetMemoryId": "update 时可填已有记忆 id",
  "category": "preference|fact|project|decision|belief|event",
  "scope": "core|long_term",
  "importance": 1-10,
  "confidence": 0-1,
  "sourceKind": "explicit|inferred",
  "validUntil": "event 的未来时间戳；非 event 省略",
  "reason": "为什么这样处理"
}

只输出 JSON 数组，不要 Markdown，不要解释。`;
}

function parseOperations(raw: string): MemoryOperation[] {
  const trimmed = raw.trim();
  const jsonText = extractJsonArray(trimmed);
  const parsed = JSON.parse(jsonText);
  return Array.isArray(parsed) ? parsed : [];
}

function extractJsonArray(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : text;
  const start = candidate.indexOf('[');
  const end = candidate.lastIndexOf(']');
  if (start >= 0 && end > start) return candidate.slice(start, end + 1);
  return '[]';
}
