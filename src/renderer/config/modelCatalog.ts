import type { ModelOption } from '../types/chat';
import type { ModelProviderId } from './modelConfig';
import { getModelConfigForProvider } from './modelConfig';
import { createLogger } from '../../shared/logger';

const logger = createLogger('model');

export interface ProviderModelCatalog {
  defaultModel: string;
  models: ModelOption[];
}

export interface ModelCapabilities {
  text: boolean;
  image: boolean;
  tools: boolean;
}

const DEFAULT_CAPABILITIES: ModelCapabilities = { text: true, image: false, tools: true };

const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  'doubao-seed-2-0-pro-260215': { text: true, image: true, tools: true },
  'doubao-seed-2-0-lite-260215': { text: true, image: true, tools: true },
  'doubao-seed-2-0-mini-260215': { text: true, image: true, tools: true },
  'mimo-v2.5': { text: true, image: true, tools: true },
  'mimo-v2.5-pro': { text: true, image: false, tools: true },
};

const MODEL_CATALOG: Record<ModelProviderId, ProviderModelCatalog> = {
  doubao: {
    defaultModel: 'doubao-seed-2-0-pro-260215',
    models: [
      { id: 'doubao-seed-2-0-pro-260215', name: '豆包 2.0 Pro', isOnline: true },
      { id: 'doubao-seed-2-0-lite-260215', name: '豆包 2.0 Lite', isOnline: true },
      { id: 'doubao-seed-2-0-mini-260215', name: '豆包 2.0 Mini', isOnline: true },
    ],
  },
  mimo: {
    defaultModel: 'mimo-v2.5',
    models: [
      { id: 'mimo-v2.5', name: 'MiMo 2.5', isOnline: true },
      { id: 'mimo-v2.5-pro', name: 'MiMo 2.5 Pro', isOnline: true },
    ],
  },
  deepseek: {
    defaultModel: 'deepseek-v4-flash',
    models: [
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', isOnline: true },
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', isOnline: true },
    ],
  },
  'openai-compatible': {
    defaultModel: 'gpt-4',
    models: [
      { id: 'gpt-4', name: 'GPT-4', isOnline: true },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', isOnline: true },
    ],
  },
};

// 缓存从 API 获取的模型列表
const fetchedModelsCache: Partial<Record<ModelProviderId, string[]>> = {};

/**
 * 从 API 获取可用模型列表并缓存
 */
export async function fetchModelsForProvider(provider: ModelProviderId): Promise<string[]> {
  if (fetchedModelsCache[provider]) return fetchedModelsCache[provider]!;

  const config = getModelConfigForProvider(provider);
  if (!config.apiKey || !config.baseUrl) return [];

  try {
    const base = config.baseUrl.replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
    const url = base + '/models';
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${config.apiKey}` } });
    if (!res.ok) return [];
    const data = await res.json();
    const ids = (data.data || []).map((m: any) => m.id as string).filter(Boolean).sort();
    if (ids.length > 0) {
      fetchedModelsCache[provider] = ids;
      logger.info('获取模型列表成功', { provider, count: ids.length });
    }
    return ids;
  } catch (e: any) {
    logger.warn('获取模型列表失败', { provider, error: e.message });
    return [];
  }
}

export function clearFetchedModelsCache(provider?: ModelProviderId): void {
  if (provider) delete fetchedModelsCache[provider];
  else Object.keys(fetchedModelsCache).forEach(k => delete fetchedModelsCache[k as ModelProviderId]);
}

export function getCatalogForProvider(provider: ModelProviderId): ProviderModelCatalog {
  return MODEL_CATALOG[provider] || MODEL_CATALOG['openai-compatible'];
}

export function getModelsForProvider(provider: ModelProviderId, currentModelId?: string): ModelOption[] {
  const catalog = getCatalogForProvider(provider);
  const selectedModelId = currentModelId || catalog.defaultModel;

  // 合并：写死的 catalog + API 获取的 + 当前选中的
  const allModels = new Map<string, ModelOption>();
  for (const m of catalog.models) allModels.set(m.id, m);

  const fetched = fetchedModelsCache[provider];
  if (fetched) {
    for (const id of fetched) {
      if (!allModels.has(id)) allModels.set(id, { id, name: id, isOnline: true });
    }
  }

  // 确保当前选中的模型在列表里
  if (!allModels.has(selectedModelId)) {
    allModels.set(selectedModelId, { id: selectedModelId, name: selectedModelId, isOnline: true });
  }

  return Array.from(allModels.values());
}

export function getDefaultModelForProvider(provider: ModelProviderId): string {
  return getCatalogForProvider(provider).defaultModel;
}

export function findModelOption(provider: ModelProviderId, modelId: string): ModelOption | null {
  return getModelsForProvider(provider, modelId).find((model) => model.id === modelId) || null;
}

export function getModelCapabilities(modelId: string): ModelCapabilities {
  return MODEL_CAPABILITIES[modelId] || DEFAULT_CAPABILITIES;
}
