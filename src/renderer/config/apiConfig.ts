import { getActiveModelConfig } from './modelConfig';

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

export const getApiConfig = (): ApiConfig => {
  const modelConfig = getActiveModelConfig();
  return {
    apiKey: modelConfig.apiKey,
    apiUrl: modelConfig.baseUrl,
    model: modelConfig.model,
    temperature: modelConfig.temperature,
    topP: 0.95,
    maxTokens: modelConfig.maxTokens,
  };
};

export default getApiConfig();
