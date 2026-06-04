import React, { useEffect, useState } from 'react';
import { getASRManager } from '../../core/asr/asrManager';
import { getTTSManager } from '../../core/tts/ttsManager';
import type { ASRType } from '../../core/asr/asrManager';
import type { TTSType } from '../../core/tts/ttsManager';
import { readMiMoTTSModel } from '../../config/ttsConfig';
import { loadRealtimeCallConfig, saveRealtimeCallConfig } from '../../config/realtimeCallConfig';
import { DEFAULT_VOLCENGINE_TTS_VOICE, normalizeVolcengineVoice, OFFICIAL_VOLCENGINE_TTS_VOICES } from '../../config/volcengineVoices';
import { createLogger } from '../../../shared/logger';
import styles from './VoicePanel.module.css';

const logger = createLogger('ui');

const ASR_ENGINES = [
  { value: 'volcengine', label: '豆包 ASR' },
  { value: 'mimo', label: '小米 MiMo ASR' },
];

const TTS_ENGINES = [
  { value: 'volcengine', label: '豆包 TTS' },
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

const REALTIME_SPEAKERS = [
  { value: 'zh_female_vv_jupiter_bigtts', label: '中文 vv 女声' },
  { value: 'zh_female_xiaohe_jupiter_bigtts', label: '中文 xiaohe 女声' },
  { value: 'zh_male_yunzhou_jupiter_bigtts', label: '中文云洲男声' },
  { value: 'zh_male_xiaotian_jupiter_bigtts', label: '中文小天男声' },
];

function readStored(key: string, fallback = ''): string {
  return localStorage.getItem(key) || fallback;
}

function readStoredWithLegacy(key: string, legacyKey: string, fallback = ''): string {
  return readStored(key) || readStored(legacyKey) || fallback;
}

function readEnv(key: string): string {
  return (import.meta.env[key] as string | undefined) || '';
}

function readASRType(): ASRType {
  const stored = readStored('nova.asr.type');
  return stored === 'volcengine' || stored === 'mimo' ? stored : 'volcengine';
}

type VolcengineSpeakerOption = {
  value: string;
  label: string;
  resourceId?: string;
};

export default function VoicePanel() {
  const [asrType, setAsrType] = useState<ASRType>('volcengine');
  const [ttsType, setTtsType] = useState('volcengine');
  const [voice, setVoice] = useState(DEFAULT_VOLCENGINE_TTS_VOICE);
  const [volcengineVoices, setVolcengineVoices] = useState<VolcengineSpeakerOption[]>(OFFICIAL_VOLCENGINE_TTS_VOICES);
  const [volcengineVoicesLoading, setVolcengineVoicesLoading] = useState(false);
  const [mimoVoice, setMimoVoice] = useState('Chloe');
  const [speed, setSpeed] = useState(1.0);
  const [pitch, setPitch] = useState(1.0);
  const [volume, setVolume] = useState(1.0);
  const [appId, setAppId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [mimoBaseUrl, setMimoBaseUrl] = useState('https://api.xiaomimimo.com/v1');
  const [mimoApiKey, setMimoApiKey] = useState('');
  const [mimoModel, setMimoModel] = useState('mimo-v2.5-tts');
  const [mimoAsrModel, setMimoAsrModel] = useState('mimo-v2.5-asr');
  const [realtimeEnabled, setRealtimeEnabled] = useState(false);
  const [realtimeAppId, setRealtimeAppId] = useState('');
  const [realtimeAccessKey, setRealtimeAccessKey] = useState('');
  const [realtimeSpeaker, setRealtimeSpeaker] = useState('zh_male_yunzhou_jupiter_bigtts');
  const [realtimeSystemRole, setRealtimeSystemRole] = useState('你使用自然、友好、简洁的中文和用户实时语音交流。');
  const [realtimeSpeakingStyle, setRealtimeSpeakingStyle] = useState('你的说话风格简洁明了，语速适中，语调自然。');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadVoices = async () => {
      setVolcengineVoicesLoading(true);
      try {
        const result = await window.electronAPI?.volcengineTTSListSpeakers?.({ resourceId: 'seed-tts-2.0' });
        if (!cancelled && result?.success && Array.isArray(result.data) && result.data.length > 0) {
          const mapped = result.data.map((item: any) => ({
            value: String(item.value || ''),
            label: String(item.label || item.value || ''),
            resourceId: String(item.resourceId || 'seed-tts-2.0'),
          })).filter((item: VolcengineSpeakerOption) => item.value);
          if (mapped.length > 0) {
            setVolcengineVoices(mapped);
            const currentVoice = readStored('nova.tts.voice', DEFAULT_VOLCENGINE_TTS_VOICE).trim() || DEFAULT_VOLCENGINE_TTS_VOICE;
            setVoice(mapped.some((item: VolcengineSpeakerOption) => item.value === currentVoice) ? currentVoice : mapped[0].value);
          }
        }
      } catch { /* 保持默认列表 */ }
      finally { if (!cancelled) setVolcengineVoicesLoading(false); }
    };
    void loadVoices();

    setAsrType(readASRType());
    setTtsType(readStored('nova.tts.type', 'volcengine'));
    setVoice(normalizeVolcengineVoice(readStored('nova.tts.voice', DEFAULT_VOLCENGINE_TTS_VOICE)));
    setMimoVoice(readStored('nova.mimo.voice', 'Chloe'));
    setSpeed(parseFloat(readStored('nova.tts.speed', '1.0')));
    setPitch(parseFloat(readStored('nova.tts.pitch', '1.0')));
    setVolume(parseFloat(readStored('nova.tts.volume', '1.0')));
    setAppId(readEnv('VITE_VOLCENGINE_APP_ID') || readStoredWithLegacy('nova.volcengine.appId', 'qiyuan.volcengine.appId'));
    setAccessToken(readEnv('VITE_VOLCENGINE_ACCESS_TOKEN') || readStoredWithLegacy('nova.volcengine.accessToken', 'qiyuan.volcengine.accessToken'));
    setMimoBaseUrl(readEnv('VITE_MIMO_BASE_URL') || readStored('nova.mimo.baseUrl', 'https://api.xiaomimimo.com/v1'));
    setMimoApiKey(readEnv('VITE_MIMO_API_KEY') || readStored('nova.mimo.apiKey'));
    setMimoModel(readMiMoTTSModel());
    setMimoAsrModel(readStored('nova.mimo.asrModel', 'mimo-v2.5-asr'));

    const realtimeConfig = loadRealtimeCallConfig();
    setRealtimeEnabled(realtimeConfig.enabled);
    setRealtimeAppId(realtimeConfig.appId);
    setRealtimeAccessKey(realtimeConfig.accessKey);
    setRealtimeSpeaker(realtimeConfig.speaker);
    setRealtimeSystemRole(realtimeConfig.systemRole);
    setRealtimeSpeakingStyle(realtimeConfig.speakingStyle);

    return () => { cancelled = true; };
  }, []);

  const needsVolcengine = asrType === 'volcengine' || ttsType === 'volcengine';
  const needsMimo = asrType === 'mimo' || ttsType === 'mimo';

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
    localStorage.setItem('nova.mimo.asrModel', mimoAsrModel);
    saveRealtimeCallConfig({
      enabled: realtimeEnabled,
      appId: realtimeAppId,
      accessKey: realtimeAccessKey,
      speaker: realtimeSpeaker,
      systemRole: realtimeSystemRole,
      speakingStyle: realtimeSpeakingStyle,
      city: '北京',
      recvTimeout: 10,
    });

    try {
      getASRManager().initialize({
        type: asrType as ASRType,
        language: 'zh-CN',
        volcengine: { appId, accessToken, apiUrl: 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async', resourceId: 'volc.bigasr.sauc.duration', format: 'pcm', sampleRate: 16000, language: 'zh-CN' },
        mimo: { baseUrl: mimoBaseUrl, apiKey: mimoApiKey, model: mimoAsrModel, language: 'auto' as const, sampleRate: 16000 },
      });
    } catch (e) { logger.error('语音识别引擎切换失败', e); }

    try {
      getTTSManager().initialize({
        type: ttsType as TTSType,
        speed, pitch, volume,
        volcengine: { appId, accessToken, apiUrl: 'wss://openspeech.bytedance.com/api/v3/tts/bidirection', voice: normalizeVolcengineVoice(voice), model: 'seed-tts-2.0-expressive', resourceId: 'seed-tts-2.0', format: 'pcm', sampleRate: 24000, speed: 0, volume: 0, pitch: 0 },
        mimo: { baseUrl: mimoBaseUrl, apiKey: mimoApiKey, model: mimoModel, voice: mimoVoice, format: 'wav' as const },
      });
    } catch (e) { logger.error('语音合成引擎切换失败', e); }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className={styles.panel}>
      {/* 标题区 */}
      <div className={styles.header}>
        <h3 className={styles.title}>语音设置</h3>
        <p className={styles.subtitle}>管理语音识别、语音合成和实时通话的配置</p>
      </div>

      {/* ASR */}
      <section className={styles.card}>
        <h4 className={styles.cardTitle}>语音识别 (ASR)</h4>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>识别引擎</span>
          <select className={styles.select} value={asrType} onChange={(e) => setAsrType(e.target.value as ASRType)}>
            {ASR_ENGINES.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
      </section>

      {/* TTS */}
      <section className={styles.card}>
        <h4 className={styles.cardTitle}>语音合成 (TTS)</h4>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>合成引擎</span>
          <select className={styles.select} value={ttsType} onChange={(e) => setTtsType(e.target.value)}>
            {TTS_ENGINES.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>

        {ttsType === 'volcengine' ? (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>音色</span>
            <select className={styles.select} value={voice} onChange={(e) => setVoice(e.target.value)}>
              {volcengineVoices.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            {volcengineVoicesLoading && <span className={styles.helperText}>加载中...</span>}
          </div>
        ) : (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>音色</span>
            <select className={styles.select} value={mimoVoice} onChange={(e) => setMimoVoice(e.target.value)}>
              {MIMO_VOICES.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
        )}

        <div className={styles.sliderGrid}>
          {[
            { label: '语速', value: speed, set: setSpeed, min: 0.5, max: 2.0 },
            { label: '音调', value: pitch, set: setPitch, min: 0.5, max: 2.0 },
            { label: '音量', value: volume, set: setVolume, min: 0.0, max: 1.0 },
          ].map(({ label, value, set, min, max }) => (
            <div key={label} className={styles.sliderRow}>
              <span className={styles.sliderLabel}>{label}</span>
              <input className={styles.slider} type="range" min={min} max={max} step={0.1} value={value} onChange={(e) => set(parseFloat(e.target.value))} />
              <span className={styles.sliderValue}>{value.toFixed(1)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* API 凭证 */}
      {needsVolcengine && (
        <section className={styles.card}>
          <h4 className={styles.cardTitle}>火山引擎凭证</h4>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>App ID</span>
            <input className={styles.input} type="text" value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="火山引擎 App ID" />
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Access Token</span>
            <input className={styles.input} type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder="火山引擎 Access Token" />
          </div>
        </section>
      )}
      {needsMimo && (
        <section className={styles.card}>
          <h4 className={styles.cardTitle}>小米 MiMo 凭证</h4>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Base URL</span>
            <input className={styles.input} type="text" value={mimoBaseUrl} onChange={(e) => setMimoBaseUrl(e.target.value)} placeholder="https://api.xiaomimimo.com/v1" />
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>API Key</span>
            <input className={styles.input} type="password" value={mimoApiKey} onChange={(e) => setMimoApiKey(e.target.value)} placeholder="tp-xxxxx" />
          </div>
          {asrType === 'mimo' && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>ASR 模型</span>
              <select className={styles.select} value={mimoAsrModel} onChange={(e) => setMimoAsrModel(e.target.value)}>
                <option value="mimo-v2.5-asr">mimo-v2.5-asr</option>
              </select>
            </div>
          )}
          {ttsType === 'mimo' && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>TTS 模型</span>
              <select className={styles.select} value={mimoModel} onChange={(e) => setMimoModel(e.target.value)}>
                <option value="mimo-v2.5-tts">mimo-v2.5-tts</option>
                <option value="mimo-v2.5-tts-voicedesign">mimo-v2.5-tts-voicedesign</option>
                <option value="mimo-v2.5-tts-voiceclone">mimo-v2.5-tts-voiceclone</option>
                <option value="mimo-v2-tts">mimo-v2-tts</option>
              </select>
            </div>
          )}
        </section>
      )}

      {/* 实时语音通话（可选） */}
      <section className={styles.card}>
        <div className={styles.realtimeHeader}>
          <div>
            <h4 className={styles.cardTitle}>实时语音通话</h4>
            <p className={styles.cardMeta}>端到端语音交互，独立于基础 ASR/TTS 链路</p>
          </div>
          <label className={styles.toggle}>
            <input type="checkbox" checked={realtimeEnabled} onChange={(e) => setRealtimeEnabled(e.target.checked)} />
            <span className={styles.toggleTrack} />
          </label>
        </div>

        {realtimeEnabled && (
          <div className={styles.realtimeFields}>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>App ID</span>
              <input className={styles.input} type="text" value={realtimeAppId} onChange={(e) => setRealtimeAppId(e.target.value)} placeholder="端到端语音 App ID" />
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Access Key</span>
              <input className={styles.input} type="password" value={realtimeAccessKey} onChange={(e) => setRealtimeAccessKey(e.target.value)} placeholder="端到端语音 Access Key" />
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>发音人</span>
              <select className={styles.select} value={realtimeSpeaker} onChange={(e) => setRealtimeSpeaker(e.target.value)}>
                {REALTIME_SPEAKERS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>人设</span>
              <textarea className={styles.textarea} value={realtimeSystemRole} onChange={(e) => setRealtimeSystemRole(e.target.value)} rows={3} />
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>说话风格</span>
              <textarea className={styles.textarea} value={realtimeSpeakingStyle} onChange={(e) => setRealtimeSpeakingStyle(e.target.value)} rows={2} />
            </div>
          </div>
        )}
      </section>

      {/* 保存按钮 */}
      <div className={styles.actionRow}>
        <button className={styles.btnPrimary} onClick={handleSave}>
          {saved ? '已保存' : '保存配置'}
        </button>
      </div>
    </div>
  );
}
