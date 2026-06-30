import type { ModelOption } from '../../types/chat';
import {
  getActiveModelConfig,
  getModelConfigForProvider,
  saveActiveModelConfig,
  type ActiveModelConfig,
  type ModelProviderId,
} from '../../config/modelConfig';
import {
  findModelOption,
  getDefaultModelForProvider,
  getModelsForProvider,
} from '../../config/modelCatalog';
import { createLogger } from '../../../shared/logger';

const logger = createLogger('model');

export interface ResolvedModelRuntime {
  provider: ModelProviderId;
  modelId: string;
  compactModel: string;
  config: ActiveModelConfig;
}

export function resolveModelForRequest(runtime: ResolvedModelRuntime, hasImageAttachment: boolean): string {
  if (!hasImageAttachment) return runtime.modelId;
  if (runtime.provider === 'mimo') return 'mimo-v2.5';
  if (runtime.provider === 'doubao') return runtime.modelId;
  logger.warn('OpenAI-compatible 模型暂未配置图片理解，将使用当前模型继续', {
    provider: runtime.provider,
    model: runtime.modelId,
  });
  return runtime.modelId;
}

export function inferProviderFromModelId(modelId: string, currentProvider?: ModelProviderId | null): ModelProviderId | null {
  if (currentProvider === 'mimo' && modelId.startsWith('mimo-')) return 'mimo';
  if (currentProvider === 'doubao' && modelId.startsWith('doubao-')) return 'doubao';
  if (currentProvider === 'deepseek' && modelId.startsWith('deepseek-')) return 'deepseek';
  if (currentProvider === 'openai-compatible') {
    const known = getModelsForProvider('openai-compatible').some((model) => model.id === modelId);
    if (known) return 'openai-compatible';
  }

  if (modelId.startsWith('mimo-')) return 'mimo';
  if (modelId.startsWith('doubao-')) return 'doubao';
  if (modelId.startsWith('deepseek-')) return 'deepseek';
  if (getModelsForProvider('openai-compatible').some((model) => model.id === modelId)) return 'openai-compatible';

  return currentProvider || null;
}

export function normalizeModelSelection(provider: ModelProviderId, requestedModelId?: string): { modelId: string; option: ModelOption } {
  const fallbackModel = getDefaultModelForProvider(provider);
  const modelId = requestedModelId || fallbackModel;
  const option = findModelOption(provider, modelId);

  if (option) {
    return { modelId: option.id, option };
  }

  logger.warn('当前 provider 不支持历史模型值，自动回退到默认模型', {
    provider,
    requestedModelId: modelId,
    fallbackModel,
  });

  const fallbackOption = findModelOption(provider, fallbackModel);
  return {
    modelId: fallbackOption?.id || fallbackModel,
    option: fallbackOption || { id: fallbackModel, name: fallbackModel, isOnline: true },
  };
}

export function getResolvedRuntimeModel(requestedModelId?: string): ResolvedModelRuntime {
  // 从 provider 专属 key 读配置，避免通用 key 串值
  const genericConfig = getActiveModelConfig();
  const activeConfig = getModelConfigForProvider(genericConfig.provider);
  const normalized = normalizeModelSelection(activeConfig.provider, requestedModelId || activeConfig.model);
  const config: ActiveModelConfig = {
    ...activeConfig,
    model: normalized.modelId,
    compactModel: activeConfig.compactModel || normalized.modelId,
  };
  return {
    provider: config.provider,
    modelId: normalized.modelId,
    compactModel: config.compactModel || normalized.modelId,
    config: {
      ...config,
      compactModel: config.compactModel || normalized.modelId,
    },
  };
}

export function syncProviderConfigForModel(modelId: string): ResolvedModelRuntime {
  // 从 provider 专属 key 读当前 provider，不根据 model ID 推断
  const activeConfig = getActiveModelConfig();
  const provider = activeConfig.provider;
  const baseConfig = getModelConfigForProvider(provider);
  const normalized = normalizeModelSelection(provider, modelId);
  const nextConfig: ActiveModelConfig = {
    ...baseConfig,
    provider,
    model: normalized.modelId,
    compactModel: normalized.modelId,
  };
  saveActiveModelConfig(nextConfig);

  return {
    provider,
    modelId: normalized.modelId,
    compactModel: normalized.modelId,
    config: nextConfig,
  };
}
