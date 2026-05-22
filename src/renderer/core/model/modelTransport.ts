interface ModelFetchRequest {
  endpoint: string;
  headers?: Record<string, string>;
  body?: string;
}

interface ModelFetchResult {
  ok: boolean;
  status: number;
  statusText: string;
  body: string;
}

function getElectronAPI() {
  return typeof window !== 'undefined' ? window.electronAPI : undefined;
}

export async function modelFetch(request: ModelFetchRequest): Promise<ModelFetchResult> {
  const electronAPI = getElectronAPI();
  if (electronAPI?.modelFetch) {
    return electronAPI.modelFetch(request);
  }

  const response = await fetch(request.endpoint, {
    method: 'POST',
    headers: request.headers,
    body: request.body,
  });
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    body: await response.text(),
  };
}

export async function modelFetchStream(
  request: ModelFetchRequest,
  onChunk: (chunk: string) => void
): Promise<ModelFetchResult> {
  const electronAPI = getElectronAPI();
  if (electronAPI?.modelFetchStream) {
    return electronAPI.modelFetchStream(
      {
        requestId: `model-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
        ...request,
      },
      onChunk
    );
  }

  const response = await fetch(request.endpoint, {
    method: 'POST',
    headers: request.headers,
    body: request.body,
  });
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      statusText: response.statusText,
      body: await response.text().catch(() => ''),
    };
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value, { stream: true }));
  }

  return {
    ok: true,
    status: response.status,
    statusText: response.statusText,
    body: '',
  };
}
