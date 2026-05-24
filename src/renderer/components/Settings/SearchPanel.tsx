import React, { useState, useEffect } from 'react';
import { createLogger } from '../../../shared/logger';
import styles from './SearchPanel.module.css';

const logger = createLogger('ui');
const SEARCH_ENGINE_KEY = 'nova.search.preferredEngine';
const LEGACY_SEARCH_ENGINE_KEY = 'qiyuan.search.preferredEngine';
const SEARXNG_URL_KEY = 'nova.search.searxngUrl';
const LEGACY_SEARXNG_URL_KEY = 'qiyuan.search.searxngUrl';

const ENGINE_OPTIONS = [
  { value: 'auto', label: '自动（按优先级尝试）' },
  { value: 'searxng', label: 'SearXNG（本地自建）' },
  { value: 'baidu', label: '百度' },
  { value: 'bing', label: '必应' },
];

function readStored(key: string, fallback: string = '', legacyKey?: string): string {
  return localStorage.getItem(key) || (legacyKey ? localStorage.getItem(legacyKey) : null) || fallback;
}

export default function SearchPanel() {
  const [preferredEngine, setPreferredEngine] = useState('auto');
  const [searxngUrl, setSearxngUrl] = useState('http://localhost:8888');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPreferredEngine(readStored(SEARCH_ENGINE_KEY, 'auto', LEGACY_SEARCH_ENGINE_KEY));
    setSearxngUrl(readStored(SEARXNG_URL_KEY, 'http://localhost:8888', LEGACY_SEARXNG_URL_KEY));
  }, []);

  const handleSave = () => {
    localStorage.setItem(SEARCH_ENGINE_KEY, preferredEngine);
    localStorage.removeItem(LEGACY_SEARCH_ENGINE_KEY);
    localStorage.setItem(SEARXNG_URL_KEY, searxngUrl);
    localStorage.removeItem(LEGACY_SEARXNG_URL_KEY);

    // 推送到主进程
    try {
      (window as any).electronAPI?.searchSetConfig({ preferredEngine, searxngUrl });
    } catch (e) {
      logger.error('搜索配置推送失败', e);
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const showSearxngUrl = preferredEngine === 'searxng' || preferredEngine === 'auto';

  return (
    <div className={styles.panel}>
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>搜索引擎</h3>
        <p className={styles.sectionDesc}>
          {preferredEngine === 'auto'
            ? '自动模式：SearXNG → 百度 → 必应，依次尝试'
            : `指定使用 ${ENGINE_OPTIONS.find(o => o.value === preferredEngine)?.label}`}
        </p>
        <select
          className={styles.select}
          value={preferredEngine}
          onChange={(e) => setPreferredEngine(e.target.value)}
        >
          {ENGINE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {showSearxngUrl && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>SearXNG 配置</h3>
          <p className={styles.sectionDesc}>
            SearXNG 是本地自建的元搜索引擎，需先部署服务
          </p>
          <label className={styles.label}>服务地址</label>
          <input
            className={styles.input}
            type="text"
            value={searxngUrl}
            onChange={(e) => setSearxngUrl(e.target.value)}
            placeholder="http://localhost:8888"
          />
        </div>
      )}

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>当前状态</h3>
        <div className={styles.statusCard}>
          <div className={styles.statusRow}>
            <span className={styles.statusLabel}>优先引擎</span>
            <span className={styles.statusValue}>
              {ENGINE_OPTIONS.find(o => o.value === preferredEngine)?.label}
            </span>
          </div>
          {showSearxngUrl && (
            <div className={styles.statusRow}>
              <span className={styles.statusLabel}>SearXNG</span>
              <span className={styles.statusValue}>{searxngUrl}</span>
            </div>
          )}
        </div>
      </div>

      <button className={styles.btnPrimary} onClick={handleSave}>
        {saved ? '已保存' : '保存配置'}
      </button>
    </div>
  );
}
