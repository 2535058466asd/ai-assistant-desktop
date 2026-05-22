# 语音对话模式实现记录

状态：已完成

## 已实现内容

- 创建 `src/renderer/core/voiceChat/VoiceChatMode.ts`，支持 `idle -> listening -> thinking -> speaking -> idle` 状态循环。
- 在 `App.tsx` 集成 `voiceChatState`、`isVoiceChatEnabled` 和语音模式回调。
- 在 `AppLayout.tsx` 向 `InputArea.tsx` 传递语音模式 props。
- 在 `InputArea.tsx` 添加语音对话模式按钮和状态提示。
- 在 `InputArea.module.css` 添加语音模式按钮和状态样式。
- TTS 播放完成后可回到监听状态，支持半双工连续对话。

## 当前说明

- 当前阶段语音链路先保持半双工稳定，不继续追全双工、边生成边播放或复杂打断逻辑。
- ASR 当前可使用浏览器 Web Speech；MiMo ASR 目前更接近本地开源模型或多模态音频理解，不是明确的低延迟云端 ASR endpoint。
- TTS 侧已调研豆包语音和 MiMo TTS。MiMo TTS 文档显示低延迟流式输出暂不可用，调用可能会在推理完成后一次性返回音频。
- 语音功能优先级低于文本聊天稳定性、模型切换、上下文和 `reasoning_content` 展示。
- 火山引擎语音链路调研见 [`../dev/volcengine-voice-research.md`](../dev/volcengine-voice-research.md)，MiMo 平台调研见 [`../dev/mimo-platform-research.md`](../dev/mimo-platform-research.md)。

## 后续可优化

- 把 ASR/TTS 中的调试日志迁移到统一 logger。
- 增加语音模式异常状态提示。
- 增加麦克风权限/设备不可用时的用户提示。
- 在文本对话稳定后，再评估是否接入更低延迟的云端 ASR/TTS 或全双工交互。
