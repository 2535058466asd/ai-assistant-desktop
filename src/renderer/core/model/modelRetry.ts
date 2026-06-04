import { createLogger } from '../../../shared/logger';

const logger = createLogger('model');

export interface RetryOptions {
  maxRetries?: number;
  backoffMs?: number;
  retryableCheck?: (error: any) => boolean;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  backoffMs: 1000,
  retryableCheck: (error) => error?.retryable === true,
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: any;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === opts.maxRetries || !opts.retryableCheck(error)) {
        throw error;
      }

      const delay = opts.backoffMs * Math.pow(2, attempt);
      logger.warn(`请求失败，${delay}ms 后重试 (${attempt + 1}/${opts.maxRetries})`, {
        error: (error as Error).message,
        delay,
      });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
