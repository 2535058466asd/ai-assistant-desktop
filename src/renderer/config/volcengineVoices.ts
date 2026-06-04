export interface VolcengineVoiceOption {
  value: string;
  label: string;
  note: string;
}

// 先使用官方文档中明确出现过、且能稳定用于 seed-tts-2.0 的 voice_type。
// 如需全量列表，后续再接官方 ListSpeakers API 动态拉取。
export const OFFICIAL_VOLCENGINE_TTS_VOICES: VolcengineVoiceOption[] = [
  {
    value: 'zh_female_vv_uranus_bigtts',
    label: 'Vivi 女声',
    note: '官方文档示例，当前默认音色'
  },
  {
    value: 'zh_female_cancan_mars_bigtts',
    label: '灿灿女声',
    note: '官方文档示例音色'
  }
];

export const DEFAULT_VOLCENGINE_TTS_VOICE = OFFICIAL_VOLCENGINE_TTS_VOICES[0].value;

export function normalizeVolcengineVoice(value: string | undefined | null): string {
  return value?.trim() || DEFAULT_VOLCENGINE_TTS_VOICE;
}
