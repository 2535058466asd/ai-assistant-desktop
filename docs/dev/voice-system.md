# Nova 语音系统说明

Nova 的语音系统分成三层：ASR、TTS 和半双工语音对话编排。ASR 和 TTS 是两个独立 Provider 系统，不和聊天模型 Provider 绑定。

## 三层职责

| 层 | 职责 | 当前 Provider |
|---|---|---|
| ASR | 麦克风语音转文字 | 火山 ASR |
| TTS | AI 回复文字转音频 | 火山 TTS、MiMo TTS |
| VoiceChat | 半双工流程编排 | 使用当前 ASR + 当前 TTS |

ASR 不负责播放，TTS 不负责识别，VoiceChat 不直接关心具体供应商 API。

## 三条运行链路

### 单独语音输入

```text
用户点击输入框麦克风
  -> 当前 ASR Provider 开始监听
  -> 识别结果填入输入框
  -> 用户手动发送
```

这条线只读取 ASR 配置，不读取 TTS 配置。

### 语音播放

```text
AI 回复文本
  -> 当前 TTS Provider 合成音频
  -> 播放音频
```

这条线只读取 TTS 配置，不读取 ASR 配置。

### 半双工语音对话

```text
idle
  -> listening: 当前 ASR 听用户说话
  -> thinking: 识别文本发给 Agent
  -> speaking: 当前 TTS 播放 AI 回复
  -> listening: 播放结束后继续监听
```

半双工模式不是第三套 Provider，只是把当前 ASR、Agent 和当前 TTS 顺序串起来。

## 默认策略

默认组合：

```text
ASR = 火山 ASR
TTS = 火山 TTS
```

如果凭证缺失，Manager 现在会直接报配置错误，不再自动降级到浏览器 Web Speech。

正式演示和主力使用可以按服务商分组选择：豆包 ASR + 豆包 TTS，或小米 MiMo ASR + MiMo TTS。

## MiMo ASR 状态

MiMo ASR 之前不是正统实时 ASR，而是：

```text
录一段音频
  -> 把音频发给 MiMo 多模态模型
  -> 提示模型“请转写这段音频”
  -> 返回文字
```

这更像“音频理解转写模拟”，不是专门的实时语音识别。

2026-06-02 后，小米开放平台已经提供 `mimo-v2.5-asr` 云端 API。Nova 当前接入策略是：

- 豆包 ASR 保留 WebSocket 实时流式识别。
- MiMo ASR 使用 `chat/completions` 一次性提交 WAV 音频，停止录音后返回文字。
- MiMo TTS 保留，ASR/TTS 共用 MiMo Base URL 和 API Key。

## 后续优化方向

- 给 ASR/TTS 增加诊断信息：支持状态、初始化状态、最近错误、麦克风权限。
- 将 VoiceChat 编排层继续收敛为更纯粹的状态机，减少 Provider 细节泄漏。
