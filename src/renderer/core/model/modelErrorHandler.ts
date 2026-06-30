import type { ModelError } from './types';
import { createLogger, type LogMeta } from '../../../shared/logger';

const logger = createLogger('modelProvider');

const ERROR_USER_MESSAGES: Record<string, string> = {
  'AccountOverdueError': '哎呀，API账号余额不足了，需要充值才能继续使用哦～',
  'RateLimitError': '请求太频繁了，稍等一下再试吧～',
  'InvalidApiKey': 'API密钥配置有误，请检查一下设置～',
  'AuthenticationError': 'API Key 格式不对或无效，请检查当前模型服务的密钥配置。',
  'OpenAICompatibleProviderError': '模型请求失败，请检查网络连接和API配置。',
  'ModelProviderError': '模型服务异常，请稍后重试。',
};

export function getErrorMessage(error: ModelError): string {
  return ERROR_USER_MESSAGES[error.code] || `出了点问题：${error.message}`;
}

export function normalizeError(error: any, providerName: string = 'Model', meta: LogMeta = {}): ModelError {
  const rawMessage = error?.message || '';
  const jsonMatch = typeof rawMessage === 'string' ? rawMessage.match(/\{.*\}\s*$/) : null;
  let parsedError: any = null;
  if (jsonMatch) {
    try {
      parsedError = JSON.parse(jsonMatch[0]);
    } catch {
      parsedError = null;
    }
  }

  const code =
    error?.code ||
    error?.error?.code ||
    error?.response?.data?.error?.code ||
    parsedError?.error?.code ||
    'ModelProviderError';
  const message =
    parsedError?.error?.message ||
    error?.error?.message ||
    error?.response?.data?.error?.message ||
    error?.message ||
    '模型请求失败';
  const isAuthError = /auth|unauthorized|invalid.?api.?key|401|403/i.test(`${code} ${message}`);

  const result: ModelError = {
    code,
    message,
    retryable: !isAuthError && /timeout|rate|429|502|503|504/i.test(`${code} ${message}`),
  };

  logger.error(`${providerName} 错误`, { ...meta, ...result });
  return result;
}
