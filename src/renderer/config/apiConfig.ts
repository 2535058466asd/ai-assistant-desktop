/**
 * 启源 AI 助手 - API 配置文件
 * 在此配置豆包 API 的相关参数
 */

export interface ApiConfig {
  // API 密钥
  apiKey: string;
  // API 地址
  apiUrl: string;
  // 模型名称
  model: string;
  // 温度参数（控制创造性，0-2之间）
  temperature: number;
  // top_p 参数（控制多样性，0-1之间）
  topP: number;
  // 最大生成token数
  maxTokens: number;
}

function readStoredValue(key: string): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(key) || '';
}

function readEnvValue(key: string): string {
  return (import.meta.env[key] as string | undefined) || '';
}

// 豆包 API 配置
// 密钥不要写死在代码里。优先读取 .env.local，其次读取设置页写入的 localStorage。
export const DOUBAO_CONFIG: ApiConfig = {
  apiKey: readEnvValue('VITE_DOUBAO_API_KEY') || readStoredValue('qiyuan.doubao.apiKey'),
  apiUrl: '/api/chat/completions',
  model: readEnvValue('VITE_DOUBAO_MODEL') || readStoredValue('qiyuan.doubao.model') || 'doubao-seed-2-0-pro-260215',
  temperature: 0.8,
  topP: 0.95,
  maxTokens: 1024,
};

// 根据环境选择配置
export const getApiConfig = (): ApiConfig => {
  return DOUBAO_CONFIG;
};

export default getApiConfig();
