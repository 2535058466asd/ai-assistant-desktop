# 语音对话模式实现记录

状态：已完成

## 已实现内容

- 创建 `src/renderer/core/voiceChat/VoiceChatMode.ts`，支持 `idle -> listening -> thinking -> speaking -> idle` 状态循环。
- 在 `App.tsx` 集成 `voiceChatState`、`isVoiceChatEnabled` 和语音模式回调。
- 在 `AppLayout.tsx` 向 `InputArea.tsx` 传递语音模式 props。
- 在 `InputArea.tsx` 添加语音对话模式按钮和状态提示。
- 在 `InputArea.module.css` 添加语音模式按钮和状态样式。
- TTS 播放完成后可回到监听状态，支持半双工连续对话。

## 后续可优化

- 把 ASR/TTS 中的调试日志迁移到统一 logger。
- 增加语音模式异常状态提示。
- 增加麦克风权限/设备不可用时的用户提示。
