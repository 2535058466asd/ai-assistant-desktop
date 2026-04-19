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

// 豆包 API 配置
// 请根据你的实际情况修改以下配置
export const DOUBAO_CONFIG: ApiConfig = {
  apiKey: '16042349-2aaa-433a-b774-d9c416d08165', // 豆包 API Key
  apiUrl: '/api/chat/completions',
  model: 'doubao-seed-2-0-pro-260215',
  temperature: 0.8,
  topP: 0.95,
  maxTokens: 1024,
};

// 根据环境选择配置
export const getApiConfig = (): ApiConfig => {
  return DOUBAO_CONFIG;
};

export default getApiConfig();
