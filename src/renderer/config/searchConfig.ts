const SEARCH_ENGINE_KEY = 'nova.search.preferredEngine';
const LEGACY_SEARCH_ENGINE_KEY = 'qiyuan.search.preferredEngine';
const SEARXNG_URL_KEY = 'nova.search.searxngUrl';
const LEGACY_SEARXNG_URL_KEY = 'qiyuan.search.searxngUrl';

export type SearchEngine = 'auto' | 'searxng' | 'baidu' | 'bing';

export interface SearchConfig {
  preferredEngine: SearchEngine;
  searxngUrl: string;
}

function readStored(key: string, fallback: string, legacyKey?: string): string {
  return localStorage.getItem(key) || (legacyKey ? localStorage.getItem(legacyKey) : null) || fallback;
}

export function readSearchConfig(): SearchConfig {
  const storedEngine = readStored(SEARCH_ENGINE_KEY, 'auto', LEGACY_SEARCH_ENGINE_KEY);
  const preferredEngine: SearchEngine = ['auto', 'searxng', 'baidu', 'bing'].includes(storedEngine)
    ? storedEngine as SearchEngine
    : 'auto';

  return {
    preferredEngine,
    searxngUrl: readStored(SEARXNG_URL_KEY, 'http://localhost:8888', LEGACY_SEARXNG_URL_KEY),
  };
}

export function saveSearchConfig(config: SearchConfig): void {
  localStorage.setItem(SEARCH_ENGINE_KEY, config.preferredEngine);
  localStorage.removeItem(LEGACY_SEARCH_ENGINE_KEY);
  localStorage.setItem(SEARXNG_URL_KEY, config.searxngUrl);
  localStorage.removeItem(LEGACY_SEARXNG_URL_KEY);
}

export async function syncSearchConfig(config: SearchConfig = readSearchConfig()): Promise<void> {
  await window.electronAPI?.searchSetConfig(config);
}
