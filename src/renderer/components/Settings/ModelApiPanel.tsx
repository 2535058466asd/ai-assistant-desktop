import React, { useState, useEffect } from 'react';
import { createModelProvider, setModelProvider } from '../../core/model';
import { getActiveModelConfig, getModelConfigForProvider, saveProviderConnectionConfig, type ModelProviderId } from '../../config/modelConfig';
import { createLogger } from '../../../shared/logger';
import styles from './ModelApiPanel.module.css';

const logger = createLogger('ui');

const PROVIDER_OPTIONS = [
  { value: 'doubao', label: '豆包 (火山引擎)' },
  { value: 'openai-compatible', label: 'OpenAI Compatible' },
  { value: 'mimo', label: '小米 MiMo' },
];

export default function ModelApiPanel() {
  const [provider, setProvider] = useState<ModelProviderId>('doubao');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [temperature, setTemperature] = useState(0.8);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const config = getActiveModelConfig();
    setProvider(config.provider);
    setApiKey(config.apiKey);
    setBaseUrl(config.baseUrl);
    setTemperature(config.temperature);
    setMaxTokens(config.maxTokens);
  }, []);

  const handleProviderChange = (newProvider: ModelProviderId) => {
    setProvider(newProvider);
    const config = getModelConfigForProvider(newProvider);
    setApiKey(config.apiKey);
    setBaseUrl(config.baseUrl);
  };

  const handleSave = () => {
    const nextConfig = saveProviderConnectionConfig({
      provider,
      apiKey,
      baseUrl,
      temperature,
      maxTokens,
    });

    try {
      setModelProvider(createModelProvider(nextConfig));
      window.dispatchEvent(new CustomEvent('nova-model-config-saved'));
    } catch (e) {
      logger.error('模型 Provider 切换失败', e);
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const needsBaseUrl = provider === 'openai-compatible' || provider === 'mimo';

  return (
    <div className={styles.panel}>
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>模型服务配置</h3>
        <p className={styles.sectionDesc}>这里配置模型服务、密钥和默认模型；聊天页顶部下拉只负责切换当前对话使用的模型。</p>
        <select
          className={styles.select}
          value={provider}
          onChange={(e) => handleProviderChange(e.target.value as ModelProviderId)}
        >
          {PROVIDER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>连接配置</h3>
        <p className={styles.sectionDesc}>
          {provider === 'doubao' ? '填写火山引擎 ARK API Key' : '填写 API 接入信息'}
        </p>
        <label className={styles.label}>API Key</label>
        <input
          className={styles.input}
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={provider === 'mimo' ? 'sk-...' : 'sk-...'}
        />
        {needsBaseUrl && (
          <>
            <label className={styles.label}>Base URL</label>
            <input
              className={styles.input}
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={provider === 'mimo' ? 'https://api.xiaomimimo.com/v1' : 'https://api.example.com/v1'}
            />
          </>
        )}
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>生成参数</h3>
        <div className={styles.paramRow}>
          <span className={styles.paramLabel}>温度</span>
          <input
            className={styles.slider}
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
          />
          <span className={styles.paramValue}>{temperature.toFixed(1)}</span>
        </div>
        <div className={styles.paramRow}>
          <span className={styles.paramLabel}>最大 Token</span>
          <input
            className={styles.inputSmall}
            type="number"
            min="256"
            max="32768"
            step="256"
            value={maxTokens}
            onChange={(e) => setMaxTokens(parseInt(e.target.value, 10) || 1024)}
          />
        </div>
      </div>

      <button className={styles.btnPrimary} onClick={handleSave}>
        {saved ? '已保存' : '保存配置'}
      </button>
    </div>
  );
}
