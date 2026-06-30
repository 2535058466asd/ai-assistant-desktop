// ==========================================
// 音频工具函数
// ==========================================

/**
 * PCM 音频数据转 WAV 格式
 * TTS 返回的是原始 PCM 数据，需要添加 WAV 头部才能在浏览器中播放
 */
export function pcmToWav(pcmData: ArrayBuffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): ArrayBuffer {
  const pcmBytes = new Uint8Array(pcmData);
  const wavBuffer = new ArrayBuffer(44 + pcmBytes.length);
  const view = new DataView(wavBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + pcmBytes.length, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bitsPerSample / 8, true);
  view.setUint16(32, numChannels * bitsPerSample / 8, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, pcmBytes.length, true);

  const output = new Uint8Array(wavBuffer);
  output.set(pcmBytes, 44);
  return output.buffer;
}
