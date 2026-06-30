export type ModelProviderId = 'doubao' | 'openai-compatible' | 'mimo' | 'deepseek';

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
const DEFAULT_DOUBAO_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
const DEFAULT_MIMO_MODEL = 'mimo-v2.5';
const DEFAULT_MIMO_BASE_URL = 'https://api.xiaomimimo.com/v1';
const MIMO_ORDINARY_API_HOST = 'api.xiaomimimo.com/v1';
const MIMO_TOKEN_PLAN_HOST = 'token-plan-cn.xiaomimimo.com/v1';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash';
const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

const KEYS = {
  provider: 'nova.model.provider',
  legacyProvider: 'qiyuan.model.provider',
  modelTemperature: 'nova.model.temperature',
  legacyModelTemperature: 'qiyuan.model.temperature',
  modelMaxTokens: 'nova.model.maxTokens',
  legacyModelMaxTokens: 'qiyuan.model.maxTokens',
  doubaoApiKey: 'nova.doubao.apiKey',
  legacyDoubaoApiKey: 'qiyuan.doubao.apiKey',
  doubaoBaseUrl: 'nova.doubao.baseUrl',
  legacyDoubaoBaseUrl: 'qiyuan.doubao.baseUrl',
  doubaoModel: 'nova.doubao.model',
  legacyDoubaoModel: 'qiyuan.doubao.model',
  doubaoCompactModel: 'nova.doubao.compactModel',
  legacyDoubaoCompactModel: 'qiyuan.doubao.compactModel',
  mimoApiKey: 'nova.mimo.apiKey',
  legacyMimoApiKey: 'qiyuan.mimo.apiKey',
  mimoBaseUrl: 'nova.mimo.baseUrl',
  legacyMimoBaseUrl: 'qiyuan.mimo.baseUrl',
  mimoModel: 'nova.mimo.model',
  legacyMimoModel: 'qiyuan.mimo.model',
  mimoCompactModel: 'nova.mimo.compactModel',
  legacyMimoCompactModel: 'qiyuan.mimo.compactModel',
  openaiApiKey: 'nova.openai.apiKey',
  legacyOpenaiApiKey: 'qiyuan.openai.apiKey',
  openaiBaseUrl: 'nova.openai.baseUrl',
  legacyOpenaiBaseUrl: 'qiyuan.openai.baseUrl',
  openaiModel: 'nova.openai.model',
  legacyOpenaiModel: 'qiyuan.openai.model',
  openaiCompactModel: 'nova.openai.compactModel',
  legacyOpenaiCompactModel: 'qiyuan.openai.compactModel',
  deepseekApiKey: 'nova.deepseek.apiKey',
  deepseekBaseUrl: 'nova.deepseek.baseUrl',
  deepseekModel: 'nova.deepseek.model',
  deepseekCompactModel: 'nova.deepseek.compactModel',
} as const;

// 读取设置页保存的值。服务端构建阶段没有 window，所以要先判断。
function readStored(key: string, legacyKey?: string): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(key) || (legacyKey ? window.localStorage.getItem(legacyKey) || '' : '');
}

function writeStored(key: string, value: string, legacyKey?: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, value);
  if (legacyKey) {
    window.localStorage.removeItem(legacyKey);
  }
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
  if (value === 'mimo' || value === 'openai-compatible' || value === 'doubao' || value === 'deepseek') return value;
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
  const storedApiKey = readStored(KEYS.mimoApiKey, KEYS.legacyMimoApiKey);
  const storedBaseUrl = readStored(KEYS.mimoBaseUrl, KEYS.legacyMimoBaseUrl);
  const storedModel = readStored(KEYS.mimoModel, KEYS.legacyMimoModel);

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
    writeStored(KEYS.mimoApiKey, envApiKey, KEYS.legacyMimoApiKey);
    writeStored(KEYS.mimoBaseUrl, envBaseUrl, KEYS.legacyMimoBaseUrl);
    writeStored(KEYS.mimoModel, firstValue(storedModel, envModel), KEYS.legacyMimoModel);
  }

  return {
    apiKey: envApiKey,
    baseUrl: envBaseUrl,
    model: firstValue(storedModel, envModel),
  };
}

function getStoredProvider(): ModelProviderId {
  return normalizeProvider(readStored(KEYS.provider, KEYS.legacyProvider));
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
  const temperature = readNumber(readStored(KEYS.modelTemperature, KEYS.legacyModelTemperature), 0.8);
  const maxTokens = readNumber(readStored(KEYS.modelMaxTokens, KEYS.legacyModelMaxTokens), 1024);

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
      compactModel: firstValue(readStored(KEYS.mimoCompactModel, KEYS.legacyMimoCompactModel), model),
      temperature,
      maxTokens,
    };
  }

  if (provider === 'deepseek') {
    const model = firstValue(
      readStored(KEYS.deepseekModel),
      readEnv('VITE_DEEPSEEK_MODEL'),
      DEFAULT_DEEPSEEK_MODEL,
    );
    return {
      provider,
      apiKey: firstValue(readStored(KEYS.deepseekApiKey), readEnv('VITE_DEEPSEEK_API_KEY')),
      baseUrl: firstValue(readStored(KEYS.deepseekBaseUrl), readEnv('VITE_DEEPSEEK_BASE_URL'), DEFAULT_DEEPSEEK_BASE_URL),
      model,
      compactModel: firstValue(readStored(KEYS.deepseekCompactModel), model),
      temperature,
      maxTokens,
    };
  }

  if (provider === 'openai-compatible') {
    // 给 DeepSeek、OpenRouter、LM Studio、Ollama 兼容服务等预留的通用入口。
    const model = firstValue(
      readStored(KEYS.openaiModel, KEYS.legacyOpenaiModel),
      readEnv('VITE_OPENAI_COMPATIBLE_MODEL'),
    );
    return {
      provider,
      apiKey: firstValue(readStored(KEYS.openaiApiKey, KEYS.legacyOpenaiApiKey), readEnv('VITE_OPENAI_COMPATIBLE_API_KEY')),
      baseUrl: firstValue(readStored(KEYS.openaiBaseUrl, KEYS.legacyOpenaiBaseUrl), readEnv('VITE_OPENAI_COMPATIBLE_BASE_URL')),
      model,
      compactModel: firstValue(readStored(KEYS.openaiCompactModel, KEYS.legacyOpenaiCompactModel), model),
      temperature,
      maxTokens,
    };
  }

  // 默认保留豆包，作为稳定 fallback；MiMo 没配 key 时项目也能继续启动。
  const model = firstValue(
    readStored(KEYS.doubaoModel, KEYS.legacyDoubaoModel),
    readEnv('VITE_DOUBAO_MODEL'),
    DEFAULT_DOUBAO_MODEL,
  );
  return {
    provider: 'doubao',
    apiKey: firstValue(
      readStored(KEYS.doubaoApiKey, KEYS.legacyDoubaoApiKey),
      readEnv('VITE_DOUBAO_API_KEY')
    ),
    baseUrl: firstValue(readStored(KEYS.doubaoBaseUrl, KEYS.legacyDoubaoBaseUrl), readEnv('VITE_DOUBAO_API_URL'), DEFAULT_DOUBAO_BASE_URL),
    model,
    compactModel: firstValue(readStored(KEYS.doubaoCompactModel, KEYS.legacyDoubaoCompactModel), readEnv('VITE_DOUBAO_COMPACT_MODEL'), model),
    temperature,
    maxTokens,
  };
}

export function getActiveModelConfig(): ActiveModelConfig {
  const provider = normalizeProvider(firstValue(
    readStored(KEYS.provider, KEYS.legacyProvider),
    readEnv('VITE_MODEL_PROVIDER'),
    'doubao',
  ));
  return getModelConfigForProvider(provider);
}

export function saveActiveModelConfig(config: ActiveModelConfig): void {
  if (typeof window === 'undefined') return;
  // 只写 provider 标识和全局参数
  writeStored(KEYS.provider, config.provider, KEYS.legacyProvider);
  writeStored(KEYS.modelTemperature, String(config.temperature), KEYS.legacyModelTemperature);
  writeStored(KEYS.modelMaxTokens, String(config.maxTokens), KEYS.legacyModelMaxTokens);

  // 写 provider 专属键
  if (config.provider === 'doubao') {
    writeStored(KEYS.doubaoApiKey, config.apiKey, KEYS.legacyDoubaoApiKey);
    writeStored(KEYS.doubaoModel, config.model, KEYS.legacyDoubaoModel);
    writeStored(KEYS.doubaoBaseUrl, config.baseUrl, KEYS.legacyDoubaoBaseUrl);
    writeStored(KEYS.doubaoCompactModel, config.compactModel, KEYS.legacyDoubaoCompactModel);
  } else if (config.provider === 'mimo') {
    writeStored(KEYS.mimoApiKey, config.apiKey, KEYS.legacyMimoApiKey);
    writeStored(KEYS.mimoBaseUrl, config.baseUrl, KEYS.legacyMimoBaseUrl);
    writeStored(KEYS.mimoModel, config.model, KEYS.legacyMimoModel);
    writeStored(KEYS.mimoCompactModel, config.compactModel, KEYS.legacyMimoCompactModel);
  } else if (config.provider === 'deepseek') {
    writeStored(KEYS.deepseekApiKey, config.apiKey);
    writeStored(KEYS.deepseekBaseUrl, config.baseUrl);
    writeStored(KEYS.deepseekModel, config.model);
    writeStored(KEYS.deepseekCompactModel, config.compactModel);
  } else {
    writeStored(KEYS.openaiApiKey, config.apiKey, KEYS.legacyOpenaiApiKey);
    writeStored(KEYS.openaiBaseUrl, config.baseUrl, KEYS.legacyOpenaiBaseUrl);
    writeStored(KEYS.openaiModel, config.model, KEYS.legacyOpenaiModel);
    writeStored(KEYS.openaiCompactModel, config.compactModel, KEYS.legacyOpenaiCompactModel);
  }
}

export function saveProviderConnectionConfig(config: Pick<ActiveModelConfig, 'provider' | 'apiKey' | 'baseUrl' | 'temperature' | 'maxTokens'> & { model?: string }): ActiveModelConfig {
  const current = getModelConfigForProvider(config.provider);
  const nextConfig: ActiveModelConfig = {
    ...current,
    ...config,
    model: config.model || current.model,
    compactModel: current.compactModel || config.model || current.model,
  };
  saveActiveModelConfig(nextConfig);
  return nextConfig;
}
