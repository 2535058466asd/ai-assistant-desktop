import { DoubaoProvider } from './doubaoProvider';
import { MiMoProvider } from './mimoProvider';
import { OpenAICompatibleProvider } from './openAICompatibleProvider';
import type { ModelProvider } from './types';

export type { ModelProvider, ModelMessage, ModelResponse, ToolDefinition, ToolCall, StreamChunk } from './types';

function createInitialProvider(): ModelProvider {
  const env = import.meta.env;
  const providerId = env.VITE_MODEL_PROVIDER || 'doubao';
  if (providerId === 'mimo' && env.VITE_MIMO_BASE_URL && env.VITE_MIMO_API_KEY) {
    return new MiMoProvider({
      baseUrl: env.VITE_MIMO_BASE_URL,
      apiKey: env.VITE_MIMO_API_KEY,
    });
  }
  if (
    providerId === 'openai-compatible' &&
    env.VITE_OPENAI_COMPATIBLE_BASE_URL &&
    env.VITE_OPENAI_COMPATIBLE_API_KEY
  ) {
    return new OpenAICompatibleProvider({
      id: 'openai-compatible',
      displayName: 'OpenAI Compatible',
      baseUrl: env.VITE_OPENAI_COMPATIBLE_BASE_URL,
      apiKey: env.VITE_OPENAI_COMPATIBLE_API_KEY,
    });
  }
  return new DoubaoProvider();
}

let provider: ModelProvider = createInitialProvider();

export function getModelProvider(): ModelProvider {
  return provider;
}

export function setModelProvider(nextProvider: ModelProvider): void {
  provider = nextProvider;
}

export function createOpenAICompatibleProvider(config: {
  id: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
}): ModelProvider {
  return new OpenAICompatibleProvider(config);
}

export function createMiMoProvider(config: { baseUrl: string; apiKey: string }): ModelProvider {
  return new MiMoProvider(config);
}
