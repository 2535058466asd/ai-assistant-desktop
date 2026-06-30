import { ipcMain } from 'electron';
import dns from 'dns';
import { createLogger } from '../../shared/logger';

const logger = createLogger('ipc');

function isPrivateOrReservedHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    (hostname.startsWith('172.') && (() => { const n = parseInt(hostname.split('.')[1], 10); return n >= 16 && n <= 31; })()) ||
    hostname.startsWith('169.254.') ||
    hostname.endsWith('.local') ||
    hostname === '::1' ||
    hostname === '[::1]'
  );
}

async function assertNotPrivateUrl(url: string): Promise<void> {
  try {
    const parsed = new URL(url);
    if (isPrivateOrReservedHost(parsed.hostname)) {
      throw new Error('不允许访问内网地址');
    }
    const { address } = await dns.promises.lookup(parsed.hostname);
    if (isPrivateOrReservedHost(address)) {
      throw new Error('不允许访问内网地址');
    }
  } catch (e: any) {
    if (e.message === '不允许访问内网地址') throw e;
    throw new Error('无效的 URL');
  }
}

export function registerModelProxyHandlers() {
  ipcMain.handle('model-fetch', async (_event, request: {
    endpoint: string;
    headers?: Record<string, string>;
    body?: string;
  }) => {
    try {
      await assertNotPrivateUrl(request.endpoint);
      const response = await fetch(request.endpoint, {
        method: 'POST',
        headers: request.headers,
        body: request.body,
      });
      const body = await response.text();
      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        body,
      };
    } catch (error) {
      logger.error('Model fetch failed', error);
      return {
        ok: false,
        status: 0,
        statusText: error instanceof Error ? error.message : String(error),
        body: '',
      };
    }
  });

  ipcMain.handle('model-fetch-stream', async (event, request: {
    requestId: string;
    endpoint: string;
    headers?: Record<string, string>;
    body?: string;
  }) => {
    try {
      await assertNotPrivateUrl(request.endpoint);
      const response = await fetch(request.endpoint, {
        method: 'POST',
        headers: request.headers,
        body: request.body,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        return {
          ok: false,
          status: response.status,
          statusText: response.statusText,
          body,
        };
      }

      if (!response.body) {
        return {
          ok: false,
          status: response.status,
          statusText: 'Response body is empty',
          body: '',
        };
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunkText = decoder.decode(value, { stream: true });
        event.sender.send('model-fetch-stream-chunk', request.requestId, chunkText);
      }

      event.sender.send('model-fetch-stream-end', request.requestId);
      return {
        ok: true,
        status: response.status,
        statusText: response.statusText,
        body: '',
      };
    } catch (error) {
      logger.error('Model stream fetch failed', error);
      event.sender.send('model-fetch-stream-error', request.requestId, error instanceof Error ? error.message : String(error));
      return {
        ok: false,
        status: 0,
        statusText: error instanceof Error ? error.message : String(error),
        body: '',
      };
    }
  });
}
