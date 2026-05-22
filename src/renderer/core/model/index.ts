import { DoubaoProvider } from './doubaoProvider';
import { MiMoProvider } from './mimoProvider';
import { OpenAICompatibleProvider } from './openAICompatibleProvider';
import type { ModelProvider } from './types';
import { getActiveModelConfig, type ActiveModelConfig } from '../../config/modelConfig';

export type { ModelProvider, ModelMessage, ModelResponse, ToolDefinition, ToolCall, StreamChunk } from './types';

/**
 * 根据统一配置创建具体模型 Provider。
 *
 * Orchestrator 不关心现在用的是豆包、MiMo 还是 OpenAI-compatible，
 * 它只调用 ModelProvider 约定好的 chatWithTools / chatWithToolsStream。
 * 这样以后接新模型时，只需要新增 Provider 和配置分支。
 */
export function createModelProvider(config: ActiveModelConfig = getActiveModelConfig()): ModelProvider {
  if (config.provider === 'mimo') {
    return new MiMoProvider({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      compactModel: config.compactModel,
    });
  }
  if (config.provider === 'openai-compatible') {
    return new OpenAICompatibleProvider({
      id: 'openai-compatible',
      displayName: 'OpenAI Compatible',
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      defaultModel: config.model,
      compactModel: config.compactModel,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });
  }
  return new DoubaoProvider({
    apiKey: config.apiKey,
    apiUrl: config.baseUrl,
    model: config.model,
    temperature: config.temperature,
    topP: 0.95,
    maxTokens: config.maxTokens,
    compactModel: config.compactModel,
  });
}

// 当前运行中的 Provider 单例。设置页保存后会调用 setModelProvider 热切换。
let provider: ModelProvider = createModelProvider();

export function getModelProvider(): ModelProvider {
  return provider;
}

export function setModelProvider(nextProvider: ModelProvider): void {
  provider = nextProvider;
}

// 兼容旧调用方式：外部直接传配置创建 OpenAI-compatible Provider。
export function createOpenAICompatibleProvider(config: {
  id: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
  defaultModel?: string;
  compactModel?: string;
}): ModelProvider {
  return new OpenAICompatibleProvider({
    ...config,
    defaultModel: config.defaultModel || getActiveModelConfig().model,
    compactModel: config.compactModel,
  });
}

export function createMiMoProvider(config: { baseUrl: string; apiKey: string; model?: string; compactModel?: string }): ModelProvider {
  const active = getActiveModelConfig();
  // 如果调用方没传 model，就沿用当前设置页 / .env 中的 MiMo 模型。
  return new MiMoProvider({
    ...config,
    model: config.model || active.model,
    compactModel: config.compactModel || active.compactModel,
  });
}
