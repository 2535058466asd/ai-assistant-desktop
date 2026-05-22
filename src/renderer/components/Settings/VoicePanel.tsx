import React, { useState, useEffect } from 'react';
import { getASRManager } from '../../core/asr/asrManager';
import { getTTSManager } from '../../core/tts/ttsManager';
import type { ASRType } from '../../core/asr/asrManager';
import type { TTSType } from '../../core/tts/ttsManager';
import { createLogger } from '../../../shared/logger';
import styles from './VoicePanel.module.css';

const logger = createLogger('ui');

const ASR_ENGINES = [
  { value: 'web-speech', label: '浏览器内置 Web Speech（推荐）' },
  { value: 'volcengine', label: '火山引擎 ASR' },
];

const TTS_ENGINES = [
  { value: 'mimo', label: '小米 MiMo TTS' },
  { value: 'volcengine', label: '火山引擎 TTS' },
  { value: 'web-speech', label: '浏览器内置 Web Speech' },
];

const TTS_VOICES = [
  { value: 'zh_female_vv_uranus_bigtts', label: 'Vivi (女声)' },
  { value: 'zh_male_chunshui_uranus_bigtts', label: '春水 (男声)' },
  { value: 'zh_female_tianmei_uranus_bigtts', label: '甜美 (女声)' },
];

const MIMO_VOICES = [
  { value: 'mimo_default', label: '默认 (Mimo)' },
  { value: '冰糖', label: '冰糖 (女声)' },
  { value: '茉莉', label: '茉莉 (女声)' },
  { value: '苏打', label: '苏打 (男声)' },
  { value: '白桦', label: '白桦 (男声)' },
  { value: 'Mia', label: 'Mia (女声)' },
  { value: 'Chloe', label: 'Chloe (女声)' },
  { value: 'Milo', label: 'Milo (男声)' },
  { value: 'Dean', label: 'Dean (男声)' },
];

function readStored(key: string, fallback: string = ''): string {
  return localStorage.getItem(key) || fallback;
}

export default function VoicePanel() {
  const [asrType, setAsrType] = useState('web-speech');
  const [ttsType, setTtsType] = useState('volcengine');
  const [voice, setVoice] = useState('zh_female_vv_uranus_bigtts');
  const [mimoVoice, setMimoVoice] = useState('mimo_default');
  const [speed, setSpeed] = useState(1.0);
  const [pitch, setPitch] = useState(1.0);
  const [volume, setVolume] = useState(1.0);
  const [appId, setAppId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [mimoBaseUrl, setMimoBaseUrl] = useState('https://token-plan-cn.xiaomimimo.com/v1');
  const [mimoApiKey, setMimoApiKey] = useState('');
  const [mimoModel, setMimoModel] = useState('mimo-v2.5-tts');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setAsrType(readStored('nova.asr.type', 'web-speech'));
    setTtsType(readStored('nova.tts.type', 'volcengine'));
    setVoice(readStored('nova.tts.voice', 'zh_female_vv_uranus_bigtts'));
    setMimoVoice(readStored('nova.mimo.voice', 'mimo_default'));
    setSpeed(parseFloat(readStored('nova.tts.speed', '1.0')));
    setPitch(parseFloat(readStored('nova.tts.pitch', '1.0')));
    setVolume(parseFloat(readStored('nova.tts.volume', '1.0')));
    setAppId(readStored('nova.volcengine.appId'));
    setAccessToken(readStored('nova.volcengine.accessToken'));
    setMimoBaseUrl(readStored('nova.mimo.baseUrl', 'https://token-plan-cn.xiaomimimo.com/v1'));
    setMimoApiKey(readStored('nova.mimo.apiKey'));
    setMimoModel(readStored('nova.mimo.model', 'mimo-v2.5-tts'));
  }, []);

  const needsVolcengine = asrType === 'volcengine' || ttsType === 'volcengine';
  const needsMimo = ttsType === 'mimo';

  const handleSave = () => {
    localStorage.setItem('nova.asr.type', asrType);
    localStorage.setItem('nova.tts.type', ttsType);
    localStorage.setItem('nova.tts.voice', voice);
    localStorage.setItem('nova.mimo.voice', mimoVoice);
    localStorage.setItem('nova.tts.speed', String(speed));
    localStorage.setItem('nova.tts.pitch', String(pitch));
    localStorage.setItem('nova.tts.volume', String(volume));
    localStorage.setItem('nova.volcengine.appId', appId);
    localStorage.setItem('nova.volcengine.accessToken', accessToken);
    localStorage.setItem('nova.mimo.baseUrl', mimoBaseUrl);
    localStorage.setItem('nova.mimo.apiKey', mimoApiKey);
    localStorage.setItem('nova.mimo.model', mimoModel);

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
        voice,
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
        format: 'mp3' as const,
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
        <p className={styles.sectionDesc}>负责听你说话并转成文字。它可以和聊天模型、TTS 分开选择，日常推荐浏览器内置方案。</p>
        <select
          className={styles.select}
          value={asrType}
          onChange={(e) => setAsrType(e.target.value)}
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
              {TTS_VOICES.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
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
          <p className={styles.sectionDesc}>小米 MiMo 语音合成。ASR 暂不接入小米，先使用浏览器或火山引擎。</p>
          <label className={styles.label}>API Base URL</label>
          <input
            className={styles.input}
            type="text"
            value={mimoBaseUrl}
            onChange={(e) => setMimoBaseUrl(e.target.value)}
            placeholder="https://token-plan-cn.xiaomimimo.com/v1"
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
