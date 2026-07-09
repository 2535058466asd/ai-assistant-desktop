import { readStored, writeStored } from '../../utils/storage';
import { createLogger } from '../../../shared/logger';

const logger = createLogger('model');

const COST_STORAGE_KEY = 'nova.cost.usage';

export interface UsageRecord {
  id: string;
  chatId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  timestamp: number;
}

interface ModelPricing {
  inputPer1k: number;
  outputPer1k: number;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  'doubao-seed-2-0-pro-260215': { inputPer1k: 0.0008, outputPer1k: 0.002 },
  'doubao-seed-2-0-lite-260215': { inputPer1k: 0.0002, outputPer1k: 0.0006 },
  'doubao-seed-2-0-mini-260215': { inputPer1k: 0.0001, outputPer1k: 0.0003 },
  'doubao-1-5-pro-32k-250125': { inputPer1k: 0.0008, outputPer1k: 0.002 },
  'doubao-1-5-lite-32k-250115': { inputPer1k: 0.0003, outputPer1k: 0.0006 },
  'doubao-seed-2-0-pro': { inputPer1k: 0.0008, outputPer1k: 0.002 },
  'doubao-seed-2-0-lite': { inputPer1k: 0.0002, outputPer1k: 0.0006 },
  'doubao-seed-2-0-mini': { inputPer1k: 0.0001, outputPer1k: 0.0003 },
  'doubao-1-5-pro-32k': { inputPer1k: 0.0008, outputPer1k: 0.002 },
  'doubao-1-5-lite-32k': { inputPer1k: 0.0003, outputPer1k: 0.0006 },
  'mimo-v2.5': { inputPer1k: 0.001, outputPer1k: 0.003 },
  'gpt-4': { inputPer1k: 0.03, outputPer1k: 0.06 },
  'gpt-4-turbo': { inputPer1k: 0.01, outputPer1k: 0.03 },
  'gpt-3.5-turbo': { inputPer1k: 0.0005, outputPer1k: 0.0015 },
};

const DEFAULT_PRICING: ModelPricing = { inputPer1k: 0.002, outputPer1k: 0.006 };

function getPricing(model: string): ModelPricing {
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];
  const matchedKey = Object.keys(MODEL_PRICING)
    .sort((a, b) => b.length - a.length)
    .find((key) => model.startsWith(key));
  return matchedKey ? MODEL_PRICING[matchedKey] : DEFAULT_PRICING;
}

export function calculateCost(model: string, usage: { prompt_tokens: number; completion_tokens: number }): number {
  const pricing = getPricing(model);
  const inputCost = (usage.prompt_tokens / 1000) * pricing.inputPer1k;
  const outputCost = (usage.completion_tokens / 1000) * pricing.outputPer1k;
  return Math.round((inputCost + outputCost) * 1000000) / 1000000;
}

export function recordUsage(chatId: string, model: string, usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }): void {
  try {
    const cost = calculateCost(model, usage);
    const record: UsageRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      chatId,
      model,
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
      cost,
      timestamp: Date.now(),
    };

    const existing = getUsageRecords();
    existing.push(record);

    if (existing.length > 500) {
      existing.splice(0, existing.length - 500);
    }

    writeStored(COST_STORAGE_KEY, JSON.stringify(existing));
    logger.info('记录用量', { model, tokens: usage.total_tokens, cost });
  } catch (error) {
    logger.error('记录用量失败', error);
  }
}

export function getUsageRecords(): UsageRecord[] {
  try {
    const data = readStored(COST_STORAGE_KEY, '[]');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export function getUsageStats(filter?: { chatId?: string; model?: string; since?: number }): {
  totalRecords: number;
  totalTokens: number;
  totalCost: number;
  byModel: Record<string, { tokens: number; cost: number; count: number }>;
} {
  let records = getUsageRecords();

  if (filter?.chatId) {
    records = records.filter(r => r.chatId === filter.chatId);
  }
  if (filter?.model) {
    records = records.filter(r => r.model === filter.model);
  }
  if (filter?.since) {
    const since = filter.since;
    records = records.filter(r => r.timestamp >= since);
  }

  const byModel: Record<string, { tokens: number; cost: number; count: number }> = {};
  let totalTokens = 0;
  let totalCost = 0;

  for (const record of records) {
    totalTokens += record.totalTokens;
    totalCost += record.cost;

    if (!byModel[record.model]) {
      byModel[record.model] = { tokens: 0, cost: 0, count: 0 };
    }
    byModel[record.model].tokens += record.totalTokens;
    byModel[record.model].cost += record.cost;
    byModel[record.model].count += 1;
  }

  return {
    totalRecords: records.length,
    totalTokens,
    totalCost: Math.round(totalCost * 100) / 100,
    byModel,
  };
}
