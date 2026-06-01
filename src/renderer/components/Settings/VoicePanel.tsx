import React, { useState, useEffect } from 'react';
import { getASRManager } from '../../core/asr/asrManager';
import { getTTSManager } from '../../core/tts/ttsManager';
import type { ASRType } from '../../core/asr/asrManager';
import type { TTSType } from '../../core/tts/ttsManager';
import { readMiMoTTSModel } from '../../config/ttsConfig';
import { DEFAULT_VOLCENGINE_TTS_VOICE, normalizeVolcengineVoice, OFFICIAL_VOLCENGINE_TTS_VOICES } from '../../config/volcengineVoices';
import { createLogger } from '../../../shared/logger';
import styles from './VoicePanel.module.css';

const logger = createLogger('ui');

const ASR_ENGINES = [
  { value: 'volcengine', label: '火山引擎 ASR（推荐）' },
];

const TTS_ENGINES = [
  { value: 'volcengine', label: '火山引擎 TTS' },
  { value: 'mimo', label: '小米 MiMo TTS' },
];

const MIMO_VOICES = [
  { value: 'Chloe', label: 'Chloe (女声)' },
  { value: 'Mia', label: 'Mia (女声)' },
  { value: 'Milo', label: 'Milo (男声)' },
  { value: 'Dean', label: 'Dean (男声)' },
  { value: '冰糖', label: '冰糖 (女声)' },
  { value: '茉莉', label: '茉莉 (女声)' },
  { value: '苏打', label: '苏打 (男声)' },
  { value: '白桦', label: '白桦 (男声)' },
];

function readStored(key: string, fallback: string = ''): string {
  return localStorage.getItem(key) || fallback;
}

function readStoredWithLegacy(key: string, legacyKey: string, fallback: string = ''): string {
  return readStored(key) || readStored(legacyKey) || fallback;
}

function readEnv(key: string): string {
  return (import.meta.env[key] as string | undefined) || '';
}

function readASRType(): ASRType {
  const stored = readStored('nova.asr.type');
  return stored === 'volcengine' ? stored : 'volcengine';
}

export default function VoicePanel() {
  const [asrType, setAsrType] = useState<ASRType>('volcengine');
  const [ttsType, setTtsType] = useState('volcengine');
  const [voice, setVoice] = useState(DEFAULT_VOLCENGINE_TTS_VOICE);
  const [mimoVoice, setMimoVoice] = useState('Chloe');
  const [speed, setSpeed] = useState(1.0);
  const [pitch, setPitch] = useState(1.0);
  const [volume, setVolume] = useState(1.0);
  const [appId, setAppId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [mimoBaseUrl, setMimoBaseUrl] = useState('https://api.xiaomimimo.com/v1');
  const [mimoApiKey, setMimoApiKey] = useState('');
  const [mimoModel, setMimoModel] = useState('mimo-v2.5-tts');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const normalizedVolcVoice = normalizeVolcengineVoice(readStored('nova.tts.voice'));
    localStorage.setItem('nova.tts.voice', normalizedVolcVoice);

    setAsrType(readASRType());
    setTtsType(readStored('nova.tts.type', 'volcengine'));
    setVoice(normalizedVolcVoice);
    setMimoVoice(readStored('nova.mimo.voice', 'Chloe'));
    setSpeed(parseFloat(readStored('nova.tts.speed', '1.0')));
    setPitch(parseFloat(readStored('nova.tts.pitch', '1.0')));
    setVolume(parseFloat(readStored('nova.tts.volume', '1.0')));
    setAppId(readEnv('VITE_VOLCENGINE_APP_ID') || readStoredWithLegacy('nova.volcengine.appId', 'qiyuan.volcengine.appId'));
    setAccessToken(readEnv('VITE_VOLCENGINE_ACCESS_TOKEN') || readStoredWithLegacy('nova.volcengine.accessToken', 'qiyuan.volcengine.accessToken'));
    setMimoBaseUrl(readEnv('VITE_MIMO_BASE_URL') || readStored('nova.mimo.baseUrl', 'https://api.xiaomimimo.com/v1'));
    setMimoApiKey(readEnv('VITE_MIMO_API_KEY') || readStored('nova.mimo.apiKey'));
    setMimoModel(readMiMoTTSModel());
  }, []);

  const needsVolcengine = asrType === 'volcengine' || ttsType === 'volcengine';
  const needsMimo = ttsType === 'mimo';

  const handleSave = () => {
    localStorage.setItem('nova.asr.type', asrType);
    localStorage.setItem('nova.tts.type', ttsType);
    localStorage.setItem('nova.tts.voice', normalizeVolcengineVoice(voice));
    localStorage.setItem('nova.mimo.voice', mimoVoice);
    localStorage.setItem('nova.tts.speed', String(speed));
    localStorage.setItem('nova.tts.pitch', String(pitch));
    localStorage.setItem('nova.tts.volume', String(volume));
    localStorage.setItem('nova.volcengine.appId', appId);
    localStorage.setItem('nova.volcengine.accessToken', accessToken);
    localStorage.setItem('nova.mimo.baseUrl', mimoBaseUrl);
    localStorage.setItem('nova.mimo.apiKey', mimoApiKey);
    localStorage.setItem('nova.mimo.ttsModel', mimoModel);

    const nextAsrConfig = {
      type: asrType as ASRType,
      language: 'zh-CN',
      volcengine: {
        appId,
        accessToken,
        apiUrl: 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async',
        resourceId: 'volc.bigasr.sauc.duration',
        format: 'pcm',
        sampleRate: 16000,
        language: 'zh-CN',
      },
    };

    const nextTtsConfig = {
      type: ttsType as TTSType,
      speed,
      pitch,
      volume,
      volcengine: {
        appId,
        accessToken,
        apiUrl: 'wss://openspeech.bytedance.com/api/v3/tts/bidirection',
        voice: normalizeVolcengineVoice(voice),
        model: 'seed-tts-2.0-expressive',
        resourceId: 'seed-tts-2.0',
        format: 'pcm',
        sampleRate: 24000,
        speed: 0,
        volume: 0,
        pitch: 0,
      },
      mimo: {
        baseUrl: mimoBaseUrl,
        apiKey: mimoApiKey,
        model: mimoModel,
        voice: mimoVoice,
        format: 'wav' as const,
      },
    };

    // 重新初始化 ASR。ASR 是“听你说话”，可以和聊天模型/TTS 独立选择。
    try {
      const asrManager = getASRManager();
      asrManager.initialize(nextAsrConfig);
    } catch (e) {
      logger.error('语音识别引擎切换失败', e);
    }

    // 重新初始化 TTS。TTS 是“AI 说话的声音”，切到小米时会带上小米自己的 voice。
    try {
      const ttsManager = getTTSManager();
      ttsManager.initialize(nextTtsConfig);
    } catch (e) {
      logger.error('语音合成引擎切换失败', e);
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className={styles.panel}>
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>语音识别 (ASR)</h3>
        <p className={styles.sectionDesc}>负责听你说话并转成文字。当前只保留火山 ASR，不再自动降级到浏览器内置识别。</p>
        <select
          className={styles.select}
          value={asrType}
          onChange={(e) => setAsrType(e.target.value as ASRType)}
        >
          {ASR_ENGINES.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>语音合成 (TTS)</h3>
        <p className={styles.sectionDesc}>负责把 AI 回复读出来。这里决定声音质量和延迟，不需要和 ASR 使用同一家服务。</p>
        <select
          className={styles.select}
          value={ttsType}
          onChange={(e) => setTtsType(e.target.value)}
        >
          {TTS_ENGINES.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {ttsType === 'volcengine' && (
          <>
            <label className={styles.label}>声音</label>
            <select
              className={styles.select}
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
            >
              {OFFICIAL_VOLCENGINE_TTS_VOICES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </>
        )}

        {ttsType === 'mimo' && (
          <>
            <label className={styles.label}>声音</label>
            <select
              className={styles.select}
              value={mimoVoice}
              onChange={(e) => setMimoVoice(e.target.value)}
            >
              {MIMO_VOICES.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </>
        )}
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>语音参数</h3>
        <div className={styles.sliderRow}>
          <span className={styles.sliderLabel}>语速</span>
          <input
            className={styles.slider}
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
          />
          <span className={styles.sliderValue}>{speed.toFixed(1)}</span>
        </div>
        <div className={styles.sliderRow}>
          <span className={styles.sliderLabel}>音调</span>
          <input
            className={styles.slider}
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={pitch}
            onChange={(e) => setPitch(parseFloat(e.target.value))}
          />
          <span className={styles.sliderValue}>{pitch.toFixed(1)}</span>
        </div>
        <div className={styles.sliderRow}>
          <span className={styles.sliderLabel}>音量</span>
          <input
            className={styles.slider}
            type="range"
            min="0.0"
            max="1.0"
            step="0.1"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
          />
          <span className={styles.sliderValue}>{volume.toFixed(1)}</span>
        </div>
      </div>

      {needsVolcengine && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>火山引擎凭证</h3>
          <p className={styles.sectionDesc}>ASR 和 TTS 共用同一组凭证</p>
          <label className={styles.label}>App ID</label>
          <input
            className={styles.input}
            type="text"
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
            placeholder="火山引擎应用 App ID"
          />
          <label className={styles.label}>Access Token</label>
          <input
            className={styles.input}
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder="火山引擎 Access Token"
          />
        </div>
      )}

      {needsMimo && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>小米 MiMo 凭证</h3>
          <p className={styles.sectionDesc}>小米 MiMo 只用于语音合成（TTS），不用于语音识别（ASR）。Token Plan Key 要配 Token Plan Base URL，普通 Key 要配普通 Base URL，不能混用。</p>
          <label className={styles.label}>API Base URL</label>
          <input
            className={styles.input}
            type="text"
            value={mimoBaseUrl}
            onChange={(e) => setMimoBaseUrl(e.target.value)}
            placeholder="https://api.xiaomimimo.com/v1"
          />
          <label className={styles.label}>API Key</label>
          <input
            className={styles.input}
            type="password"
            value={mimoApiKey}
            onChange={(e) => setMimoApiKey(e.target.value)}
            placeholder="tp-xxxxx"
          />
          <label className={styles.label}>模型</label>
          <select
            className={styles.select}
            value={mimoModel}
            onChange={(e) => setMimoModel(e.target.value)}
          >
            <option value="mimo-v2.5-tts">mimo-v2.5-tts</option>
            <option value="mimo-v2.5-tts-voicedesign">mimo-v2.5-tts-voicedesign</option>
            <option value="mimo-v2.5-tts-voiceclone">mimo-v2.5-tts-voiceclone</option>
            <option value="mimo-v2-tts">mimo-v2-tts</option>
          </select>
        </div>
      )}

      <button className={styles.btnPrimary} onClick={handleSave}>
        {saved ? '已保存' : '保存配置'}
      </button>
    </div>
  );
}
