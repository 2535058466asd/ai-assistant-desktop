export interface RealtimeCallConfig {
  enabled: boolean;
  appId: string;
  accessKey: string;
  speaker: string;
  systemRole: string;
  speakingStyle: string;
  city: string;
  recvTimeout: number;
}

function readStored(key: string, fallback = ''): string {
  if (typeof window === 'undefined') return fallback;
  return window.localStorage.getItem(key) || fallback;
}

function readEnv(key: string): string {
  return (import.meta.env[key] as string | undefined) || '';
}

export function loadRealtimeCallConfig(): RealtimeCallConfig {
  return {
    enabled: readStored('nova.realtimeCall.enabled', 'false') === 'true',
    appId: readEnv('VITE_VOLCENGINE_REALTIME_DIALOG_APP_ID') || readEnv('VITE_VOLCENGINE_APP_ID') || readStored('nova.realtimeCall.appId'),
    accessKey: readEnv('VITE_VOLCENGINE_REALTIME_DIALOG_ACCESS_KEY') || readEnv('VITE_VOLCENGINE_ACCESS_TOKEN') || readStored('nova.realtimeCall.accessKey'),
    speaker: readStored('nova.realtimeCall.speaker', 'zh_male_yunzhou_jupiter_bigtts'),
    systemRole: readStored('nova.realtimeCall.systemRole', '你使用自然、友好、简洁的中文和用户实时语音交流。'),
    speakingStyle: readStored('nova.realtimeCall.speakingStyle', '你的说话风格简洁明了，语速适中，语调自然。'),
    city: readStored('nova.realtimeCall.city', '北京'),
    recvTimeout: Number(readStored('nova.realtimeCall.recvTimeout', '10')) || 10
  };
}

export function saveRealtimeCallConfig(config: RealtimeCallConfig): void {
  localStorage.setItem('nova.realtimeCall.enabled', String(config.enabled));
  localStorage.setItem('nova.realtimeCall.appId', config.appId);
  localStorage.setItem('nova.realtimeCall.accessKey', config.accessKey);
  localStorage.setItem('nova.realtimeCall.speaker', config.speaker);
  localStorage.setItem('nova.realtimeCall.systemRole', config.systemRole);
  localStorage.setItem('nova.realtimeCall.speakingStyle', config.speakingStyle);
  localStorage.setItem('nova.realtimeCall.city', config.city);
  localStorage.setItem('nova.realtimeCall.recvTimeout', String(config.recvTimeout));
}
