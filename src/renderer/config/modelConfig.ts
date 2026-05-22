export type ModelProviderId = 'doubao' | 'openai-compatible' | 'mimo';

/**
 * 当前真正生效的模型配置。
 *
 * 这里不要只理解成“环境变量配置”：前端设置页保存到 localStorage 后，
 * localStorage 会优先于 .env。这样用户可以在应用里切换模型，不需要重启或改文件。
 */
export interface ActiveModelConfig {
  provider: ModelProviderId;
  apiKey: string;
  baseUrl: string;
  model: string;
  compactModel: string;
  temperature: number;
  maxTokens: number;
}

const DEFAULT_DOUBAO_MODEL = 'doubao-seed-2-0-pro-260215';
const DEFAULT_DOUBAO_COMPACT_MODEL = 'doubao-1-5-lite-32k-250115';
const DEFAULT_DOUBAO_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
const DEFAULT_MIMO_MODEL = 'mimo-v2.5';
const DEFAULT_MIMO_BASE_URL = 'https://api.xiaomimimo.com/v1';
const MIMO_ORDINARY_API_HOST = 'api.xiaomimimo.com/v1';
const MIMO_TOKEN_PLAN_HOST = 'token-plan-cn.xiaomimimo.com/v1';

// 读取设置页保存的值。服务端构建阶段没有 window，所以要先判断。
function readStored(key: string): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(key) || '';
}

// 读取 Vite 注入的 .env 变量。变量名必须以 VITE_ 开头才会暴露给渲染进程。
function readEnv(key: string): string {
  return (import.meta.env[key] as string | undefined) || '';
}

function readNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeProvider(value: string): ModelProviderId {
  if (value === 'mimo' || value === 'openai-compatible' || value === 'doubao') return value;
  return 'doubao';
}

function firstValue(...values: string[]): string {
  return values.find((value) => value.trim().length > 0) || '';
}

function isMimoTokenPlanConfig(apiKey: string, baseUrl: string): boolean {
  return apiKey.startsWith('tp-') || baseUrl.includes(MIMO_TOKEN_PLAN_HOST);
}

function canUseOrdinaryMimoEnv(apiKey: string, baseUrl: string): boolean {
  return apiKey.startsWith('sk-') && baseUrl.includes(MIMO_ORDINARY_API_HOST);
}

function migrateStoredMimoConfigIfNeeded(): {
  apiKey: string;
  baseUrl: string;
  model: string;
} {
  const storedApiKey = readStored('qiyuan.mimo.apiKey');
  const storedBaseUrl = readStored('qiyuan.mimo.baseUrl');
  const storedModel = readStored('qiyuan.mimo.model');

  if (!isMimoTokenPlanConfig(storedApiKey, storedBaseUrl)) {
    return { apiKey: storedApiKey, baseUrl: storedBaseUrl, model: storedModel };
  }

  const envApiKey = readEnv('VITE_MIMO_API_KEY');
  const envBaseUrl = firstValue(readEnv('VITE_MIMO_BASE_URL'), DEFAULT_MIMO_BASE_URL);
  const envModel = firstValue(readEnv('VITE_MIMO_MODEL'), DEFAULT_MIMO_MODEL);

  if (!canUseOrdinaryMimoEnv(envApiKey, envBaseUrl)) {
    return { apiKey: storedApiKey, baseUrl: storedBaseUrl, model: storedModel };
  }

  if (typeof window !== 'undefined') {
    window.localStorage.setItem('qiyuan.mimo.apiKey', envApiKey);
    window.localStorage.setItem('qiyuan.mimo.baseUrl', envBaseUrl);
    window.localStorage.setItem('qiyuan.mimo.model', firstValue(storedModel, envModel));
  }

  return {
    apiKey: envApiKey,
    baseUrl: envBaseUrl,
    model: firstValue(storedModel, envModel),
  };
}

function getStoredProvider(): ModelProviderId {
  return normalizeProvider(readStored('qiyuan.model.provider'));
}

function readLegacyCurrentProviderValue(key: string, provider: ModelProviderId): string {
  // qiyuan.model.* 是早期单模型配置遗留键。现在多 Provider 后，只有当前 Provider 一致时才允许读取，
  // 避免“小米 key 被豆包 Provider 误用”这类串配置问题。
  return getStoredProvider() === provider ? readStored(key) : '';
}

/**
 * 统一模型配置入口。
 *
 * 优先级：
 * 1. 设置页保存的 localStorage
 * 2. .env 里的 VITE_* 配置
 * 3. 代码里的默认值
 *
 * 以后 Orchestrator、Provider、记忆压缩、设置页都应该从这里拿配置，
 * 避免每个模块自己读一套环境变量导致不同步。
 */
export function getModelConfigForProvider(provider: ModelProviderId): ActiveModelConfig {
  const temperature = readNumber(readStored('qiyuan.model.temperature'), 0.8);
  const maxTokens = readNumber(readStored('qiyuan.model.maxTokens'), 1024);

  if (provider === 'mimo') {
    // MiMo 默认走普通按量 API 的 OpenAI-compatible 地址；Token Plan 只作为可选高级方案。
    const migrated = migrateStoredMimoConfigIfNeeded();
    const model = firstValue(
      migrated.model,
      readEnv('VITE_MIMO_MODEL'),
      DEFAULT_MIMO_MODEL,
    );
    return {
      provider,
      apiKey: firstValue(migrated.apiKey, readEnv('VITE_MIMO_API_KEY')),
      baseUrl: firstValue(migrated.baseUrl, readEnv('VITE_MIMO_BASE_URL'), DEFAULT_MIMO_BASE_URL),
      model,
      compactModel: firstValue(readStored('qiyuan.mimo.compactModel'), model),
      temperature,
      maxTokens,
    };
  }

  if (provider === 'openai-compatible') {
    // 给 DeepSeek、OpenRouter、LM Studio、Ollama 兼容服务等预留的通用入口。
    const model = firstValue(
      readStored('qiyuan.openai.model'),
      readEnv('VITE_OPENAI_COMPATIBLE_MODEL'),
    );
    return {
      provider,
      apiKey: firstValue(readStored('qiyuan.openai.apiKey'), readEnv('VITE_OPENAI_COMPATIBLE_API_KEY')),
      baseUrl: firstValue(readStored('qiyuan.openai.baseUrl'), readEnv('VITE_OPENAI_COMPATIBLE_BASE_URL')),
      model,
      compactModel: firstValue(readStored('qiyuan.openai.compactModel'), model),
      temperature,
      maxTokens,
    };
  }

  // 默认保留豆包，作为稳定 fallback；MiMo 没配 key 时项目也能继续启动。
  const model = firstValue(
    readStored('qiyuan.doubao.model'),
    readEnv('VITE_DOUBAO_MODEL'),
    DEFAULT_DOUBAO_MODEL,
  );
  return {
    provider: 'doubao',
    apiKey: firstValue(
      readStored('qiyuan.doubao.apiKey'),
      readLegacyCurrentProviderValue('qiyuan.model.apiKey', 'doubao'),
      readEnv('VITE_DOUBAO_API_KEY')
    ),
    baseUrl: firstValue(readStored('qiyuan.doubao.baseUrl'), readEnv('VITE_DOUBAO_API_URL'), DEFAULT_DOUBAO_BASE_URL),
    model,
    compactModel: firstValue(readStored('qiyuan.doubao.compactModel'), readEnv('VITE_DOUBAO_COMPACT_MODEL'), DEFAULT_DOUBAO_COMPACT_MODEL),
    temperature,
    maxTokens,
  };
}

export function getActiveModelConfig(): ActiveModelConfig {
  const provider = normalizeProvider(firstValue(
    readStored('qiyuan.model.provider'),
    readEnv('VITE_MODEL_PROVIDER'),
    'doubao',
  ));
  return getModelConfigForProvider(provider);
}

export function saveActiveModelConfig(config: ActiveModelConfig): void {
  if (typeof window === 'undefined') return;
  // 通用键用于当前 Provider；Provider 专属键用于切换回来时恢复各自配置。
  window.localStorage.setItem('qiyuan.model.provider', config.provider);
  window.localStorage.setItem('qiyuan.model.apiKey', config.apiKey);
  window.localStorage.setItem('qiyuan.model.baseUrl', config.baseUrl);
  window.localStorage.setItem('qiyuan.model.modelName', config.model);
  window.localStorage.setItem('qiyuan.model.temperature', String(config.temperature));
  window.localStorage.setItem('qiyuan.model.maxTokens', String(config.maxTokens));

  if (config.provider === 'doubao') {
    window.localStorage.setItem('qiyuan.doubao.apiKey', config.apiKey);
    window.localStorage.setItem('qiyuan.doubao.model', config.model);
    window.localStorage.setItem('qiyuan.doubao.baseUrl', config.baseUrl);
  } else if (config.provider === 'mimo') {
    window.localStorage.setItem('qiyuan.mimo.apiKey', config.apiKey);
    window.localStorage.setItem('qiyuan.mimo.baseUrl', config.baseUrl);
    window.localStorage.setItem('qiyuan.mimo.model', config.model);
  } else {
    window.localStorage.setItem('qiyuan.openai.apiKey', config.apiKey);
    window.localStorage.setItem('qiyuan.openai.baseUrl', config.baseUrl);
    window.localStorage.setItem('qiyuan.openai.model', config.model);
  }
}
