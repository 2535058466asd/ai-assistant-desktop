export interface VolcengineVoiceOption {
  value: string;
  label: string;
  note: string;
}

// 先使用官方文档中已直接出现、且可与 seed-tts-2.0 对齐的 voice_type。
// 后续如需全量列表，建议接入官方 ListSpeakers API 以 ResourceIDs=["seed-tts-2.0"] 动态拉取。
export const OFFICIAL_VOLCENGINE_TTS_VOICES: VolcengineVoiceOption[] = [
  {
    value: 'zh_female_vv_uranus_bigtts',
    label: 'Vivi 女声',
    note: '官方文档示例，当前默认音色'
  }
];

export const DEFAULT_VOLCENGINE_TTS_VOICE = OFFICIAL_VOLCENGINE_TTS_VOICES[0].value;

export function normalizeVolcengineVoice(value: string | undefined | null): string {
  if (!value) return DEFAULT_VOLCENGINE_TTS_VOICE;
  return OFFICIAL_VOLCENGINE_TTS_VOICES.some((voice) => voice.value === value)
    ? value
    : DEFAULT_VOLCENGINE_TTS_VOICE;
}
