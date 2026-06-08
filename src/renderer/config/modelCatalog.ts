import type { ModelOption } from '../types/chat';
import type { ModelProviderId } from './modelConfig';

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
  'openai-compatible': {
    defaultModel: 'gpt-4',
    models: [
      { id: 'gpt-4', name: 'GPT-4', isOnline: true },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', isOnline: true },
    ],
  },
};

export function getCatalogForProvider(provider: ModelProviderId): ProviderModelCatalog {
  return MODEL_CATALOG[provider];
}

export function getModelsForProvider(provider: ModelProviderId, currentModelId?: string): ModelOption[] {
  const catalog = getCatalogForProvider(provider);
  const selectedModelId = currentModelId || catalog.defaultModel;
  const knownModel = catalog.models.find((model) => model.id === selectedModelId);

  if (knownModel) {
    return catalog.models;
  }

  return [
    { id: selectedModelId, name: selectedModelId, isOnline: true },
    ...catalog.models,
  ];
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
