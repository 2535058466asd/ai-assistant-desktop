export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogModule =
  | 'agent'
  | 'model'
  | 'tool'
  | 'rag'
  | 'memory'
  | 'asr'
  | 'tts'
  | 'ipc'
  | 'ui'
  | 'voice'
  | 'history';

export interface LogMeta {
  traceId?: string;
  chatId?: string | null;
  sessionId?: string;
  messageId?: string;
  phase?: 'input' | 'context' | 'model' | 'tool' | 'output' | 'persist' | 'ui' | 'voice' | 'history';
  durationMs?: number;
  [key: string]: unknown;
}

const levelWeight: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const moduleLabel: Record<LogModule, string> = {
  agent: '智能体',
  model: '模型',
  tool: '工具',
  rag: '知识库',
  memory: '记忆',
  asr: '语音识别',
  tts: '语音合成',
  ipc: '进程通信',
  ui: '界面',
  voice: '语音',
  history: '历史',
};

const moduleColor: Record<LogModule, string> = {
  agent: '#8b5cf6',
  model: '#10b981',
  tool: '#f59e0b',
  rag: '#06b6d4',
  memory: '#ec4899',
  asr: '#eab308',
  tts: '#f97316',
  ipc: '#64748b',
  ui: '#3b82f6',
  voice: '#a855f7',
  history: '#38bdf8',
};

export function createTraceId(): string {
  return `trc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getMinLevel(): LogLevel {
  const envLevel =
    typeof process !== 'undefined'
      ? (process.env.LOG_LEVEL as LogLevel | undefined)
      : undefined;
  if (envLevel && envLevel in levelWeight) return envLevel;
  const nodeEnv = typeof process !== 'undefined' ? process.env.NODE_ENV : undefined;
  return nodeEnv === 'production' ? 'info' : 'debug';
}

function redact(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .replace(/Bearer\s+[A-Za-z0-9._\-]+/g, 'Bearer [REDACTED]')
      .replace(/(api[_-]?key|authorization|access[_-]?token|refresh[_-]?token|secret|password)["'\s:=]+[^"',\s]+/gi, '$1=[REDACTED]');
  }
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redact);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      if (/api[_-]?key|authorization|access[_-]?token|refresh[_-]?token|secret|password/i.test(key)) {
        return [key, '[REDACTED]'];
      }
      return [key, redact(item)];
    })
  );
}

export function createLogger(moduleName: LogModule) {
  const shouldLog = (level: LogLevel) => levelWeight[level] >= levelWeight[getMinLevel()];
  const supportsConsoleStyle = () => typeof window !== 'undefined';
  const writeConsole = (level: LogLevel, args: unknown[]) => {
    try {
      if (level === 'error') console.error(...args);
      else if (level === 'warn') console.warn(...args);
      else if (level === 'debug') console.debug(...args);
      else console.info(...args);
    } catch (error: any) {
      // Electron 开发环境关闭/重启子进程时 stdout/stderr 可能断开。
      // 日志不能因为 EPIPE 把主进程打崩。
      if (error?.code !== 'EPIPE') {
        throw error;
      }
    }
  };
  const emit = (level: LogLevel, message: string, meta?: unknown, ...extra: unknown[]) => {
    if (!shouldLog(level)) return;
    const prefix = `[${moduleLabel[moduleName] || moduleName}] ${message}`;
    const rawPayload = extra.length > 0 ? [meta, ...extra] : meta;
    const payload = rawPayload === undefined ? undefined : redact(rawPayload);
    const args = supportsConsoleStyle()
      ? payload === undefined
        ? [`%c${prefix}`, `color:${moduleColor[moduleName]};font-weight:600`]
        : [`%c${prefix}`, `color:${moduleColor[moduleName]};font-weight:600`, payload]
      : payload === undefined
        ? [prefix]
        : [prefix, payload];
    writeConsole(level, args);
  };

  return {
    debug: (message: string, meta?: unknown, ...extra: unknown[]) => emit('debug', message, meta, ...extra),
    info: (message: string, meta?: unknown, ...extra: unknown[]) => emit('info', message, meta, ...extra),
    warn: (message: string, meta?: unknown, ...extra: unknown[]) => emit('warn', message, meta, ...extra),
    error: (message: string, meta?: unknown, ...extra: unknown[]) => emit('error', message, meta, ...extra),
  };
}
