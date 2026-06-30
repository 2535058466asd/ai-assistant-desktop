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
  const [model, setModel] = useState('');
  const [temperature, setTemperature] = useState(0.8);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  useEffect(() => {
    const config = getActiveModelConfig();
    setProvider(config.provider);
    setApiKey(config.apiKey);
    setBaseUrl(config.baseUrl);
    setModel(config.model);
    setTemperature(config.temperature);
    setMaxTokens(config.maxTokens);
  }, []);

  const handleProviderChange = (newProvider: ModelProviderId) => {
    setProvider(newProvider);
    const config = getModelConfigForProvider(newProvider);
    console.log('[Settings] 切换 Provider', { newProvider, apiKey: config.apiKey?.slice(0, 10) + '...', baseUrl: config.baseUrl, model: config.model });
    setApiKey(config.apiKey);
    setBaseUrl(config.baseUrl);
    setModel(config.model);
    setAvailableModels([]);
  };

  const handleSave = () => {
    const nextConfig = saveProviderConnectionConfig({
      provider,
      apiKey,
      baseUrl,
      model,
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

  const handleFetchModels = async () => {
    if (!apiKey || !baseUrl) return;
    setFetchingModels(true);
    setAvailableModels([]);
    try {
      // 去掉末尾的 /chat/completions 再拼 /models
      const base = baseUrl.replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
      const url = base + '/models';
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}，该服务商可能不支持模型列表接口`);
      }
      const data = await res.json();
      const ids = (data.data || []).map((m: any) => m.id).sort();
      if (ids.length === 0) throw new Error('返回的模型列表为空');
      setAvailableModels(ids);
      if (ids.length > 0 && !model) setModel(ids[0]);
    } catch (e: any) {
      setTestResult({ ok: false, message: `获取模型失败: ${e.message}` });
    }
    setFetchingModels(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const testConfig = { provider, apiKey, baseUrl, temperature: 0.1, maxTokens: 32, model, compactModel: model };
      const testProvider = createModelProvider(testConfig);
      const response = await testProvider.chatWithTools({
        model: testConfig.model,
        messages: [{ role: 'user', content: 'hi' }],
        stream: false,
      });
      if (response.error) {
        setTestResult({ ok: false, message: response.error.message || '请求失败' });
      } else {
        setTestResult({ ok: true, message: '连接成功' });
      }
    } catch (e: any) {
      setTestResult({ ok: false, message: e.message || '连接失败' });
    }
    setTesting(false);
  };

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
          placeholder="sk-..."
        />
        <label className={styles.label}>Base URL</label>
        <input
          className={styles.input}
          type="text"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder={provider === 'doubao' ? 'https://ark.cn-beijing.volces.com/api/v3/chat/completions' : provider === 'mimo' ? 'https://api.xiaomimimo.com/v1' : 'https://api.deepseek.com/v1'}
        />
        <label className={styles.label}>
          模型名称
          <button
            type="button"
            className={styles.btnFetch}
            onClick={handleFetchModels}
            disabled={fetchingModels || !apiKey || !baseUrl}
          >
            {fetchingModels ? '获取中...' : '获取模型列表'}
          </button>
        </label>
        {availableModels.length > 0 ? (
          <select
            className={styles.select}
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            {availableModels.map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
        ) : (
          <input
            className={styles.input}
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={provider === 'doubao' ? 'doubao-seed-2-0-pro-260215' : provider === 'mimo' ? 'mimo-v2.5' : 'deepseek-chat'}
          />
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

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <button className={styles.btnPrimary} onClick={handleSave}>
          {saved ? '已保存' : '保存配置'}
        </button>
        <button
          className={styles.btnPrimary}
          onClick={handleTest}
          disabled={testing || !apiKey}
          style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
        >
          {testing ? '测试中...' : '测试连接'}
        </button>
        {testResult && (
          <span style={{ fontSize: '13px', color: testResult.ok ? '#22c55e' : '#ef4444' }}>
            {testResult.message}
          </span>
        )}
      </div>
    </div>
  );
}
