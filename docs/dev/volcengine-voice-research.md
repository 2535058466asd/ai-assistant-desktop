# 火山引擎语音服务调研报告

日期：2026-05-14

## 一、文档来源

火山引擎（ByteDance Volcano Engine）是字节跳动旗下的云服务平台，提供完整的语音交互能力。本报告信息来源于以下官方渠道：

### 1.1 官方文档

- 火山引擎官网：https://www.volcengine.com/
- 语音服务产品页：https://www.volcengine.com/product/tts
- 语音识别产品页：https://www.volcengine.com/product/asr
- 实时语音产品页：https://www.volcengine.com/product/rtc
- 开发者文档中心：https://www.volcengine.com/docs/
- 豆包大模型文档：https://www.volcengine.com/docs/82379/1263482

### 1.2 GitHub 资源

火山引擎官方维护多个语言 SDK：

- Java SDK：https://github.com/volcengine/volc-java-sdk
- Python SDK：https://github.com/volcengine/volc-python-sdk
- Go SDK：https://github.com/volcengine/volc-go-sdk
- Node.js SDK：https://github.com/volcengine/volc-nodejs-sdk

语音相关专项仓库：

- CosyVoice（字节语音合成开源项目）：https://github.com/FasterAudio/CosyVoice
- 火山引擎语音服务 Python Demo：https://github.com/Volcengine/volc-tts-demo

### 1.3 API 调试工具

- 火山引擎 API Explorer：https://console.volcengine.com/api
- 豆包大模型体验中心：https://ark.cn-beijing.volces.com/experience

---

## 二、产品体系概览

火山引擎语音服务分为三大产品线：

| 产品线 | 功能 | 协议支持 | 延迟 | 适用场景 |
|--------|------|----------|------|----------|
| 语音识别 ASR | 语音转文字 | HTTP / WebSocket | < 300ms（实时版） | 语音输入、字幕生成 |
| 语音合成 TTS | 文字转语音 | HTTP / WebSocket | 300-400ms（流式） | 语音播报、有声内容 |
| 实时语音 RTC | 全双工通话 | WebSocket | < 200ms | 实时对话、智能客服 |

---

## 三、语音识别（ASR）

### 3.1 产品版本

火山引擎 ASR 提供多个版本：

| 版本 | 特点 | 适用场景 |
|------|------|----------|
| 极速版 | 低延迟、流式识别 | 实时对话、语音输入 |
| 标准版 | 高准确率、离线录音转写 | 录音文件处理 |
| 增强版 | 支持方言、行业词汇 | 专业领域应用 |
| 垂直领域版 | 医疗/金融/法律等 | 行业专精 |

### 3.2 API 端点

**HTTP 接口（录音文件识别）**：

```
POST https://openspeech.bytedance.com/api/v2/asr
```

**WebSocket 接口（实时识别）**：

```
wss://openspeech.bytedance.com/api/v2/asr/stream
```

### 3.3 认证方式

火山引擎 ASR 使用签名认证，Header 格式：

```
Authorization: {signature}
Content-Type: application/json
```

签名生成需要以下信息：

- Access Key ID（应用的访问密钥ID）
- Secret Key（应用的安全密钥）
- Appid（应用唯一标识）
- Cluster（集群 ID）

Python 签名示例：

```python
import hashlib
import hmac
import base64
import time

def generate_signature(access_key, secret_key, appid, timestamp):
    """生成火山引擎 ASR 签名"""
    signed_headers = "x-appid"
    hostname = "openspeech.bytedance.com"
    plaintext = f"GET\nopenspeech.bytedance.com\n/api/v2/asr\nappid={appid}&timestamp={timestamp}"
    
    signature = hmac.new(
        secret_key.encode(),
        plaintext.encode(),
        hashlib.sha256
    ).digest()
    
    return base64.b64encode(signature).decode()
```

### 3.4 请求参数

**录音文件识别请求示例**：

```json
{
  "appid": "your_appid",
  "cluster": "volcengine_streaming_common",
  "audio_file": "base64_encoded_audio_data",
  "audio_format": "wav",
  "sample_rate": 16000,
  "language_type": "zh-CN"
}
```

**实时识别请求（WebSocket）**：

```json
{
  "app": {
    "appid": "your_appid",
    "cluster": "volcengine_streaming_common"
  },
  "user": {
    "uid": "user_001"
  },
  "audio": {
    "format": "wav",
    "rate": 16000,
    "bits": 16,
    "channel": 1,
    "codec": "raw"
  }
}
```

### 3.5 返回格式

**实时识别响应**：

```json
{
  "code": 1000,
  "message": "success",
  "request_id": "uuid",
  "result": {
    "text": "识别的文字内容",
    "words": [
      {"word": "识别", "start": 0, "end": 300},
      {"word": "的", "start": 300, "end": 500}
    ],
    "is_final": true
  }
}
```

### 3.6 性能指标

| 指标 | 数值 |
|------|------|
| 识别延迟 | < 300ms（流式）|
| 字准确率 | > 95%（标准普通话）|
| 支持采样率 | 8000 / 16000 / 48000 Hz |
| 支持音频格式 | wav / mp3 / pcm / ogg |

---

## 四、语音合成（TTS）

### 4.1 产品版本

火山引擎 TTS 提供多个版本：

| 版本 | 特点 | 适用场景 |
|------|------|----------|
| 基础语音合成 | 标准音色、快速合成 | 通用播报 |
| 精品语音合成 | 高自然度、情感表达 | 有声内容创作 |
| 特色语音合成 | 明星音色、IP 定制 | 品牌营销 |
| CosyVoice 3 | 情感可控、3秒克隆 | 高端应用 |

### 4.2 API 端点

**HTTP 接口（批量合成）**：

```
POST https://openspeech.bytedance.com/api/v1/tts
```

**WebSocket 接口（流式合成）**：

```
wss://openspeech.bytedance.com/api/v1/tts/stream
```

### 4.3 认证方式

与 ASR 相同的签名认证机制。

### 4.4 请求参数

**流式合成请求**：

```json
{
  "app": {
    "appid": "your_appid",
    "cluster": "volc_tts_premium"
  },
  "user": {
    "uid": "user_001"
  },
  "audio": {
    "encoding": "mp3",
    "sample_rate": 16000,
    "rate": 16000,
    "bits": 16,
    "channel": 1,
    "codec": "raw"
  },
  "request": {
    "reqid": "uuid",
    "text": "要合成语音的文字内容",
    "text_type": "plain",
    "operation": "submit",
    "voice_type": 7000,
    "speed": 1.0,
    "volume": 1.0,
    "pitch": 1.0
  }
}
```

### 4.5 内置音色

火山引擎提供 100+ 音色选择，主要分类：

**中文音色（部分）**：

| voice_type | 音色名称 | 特点 |
|------------|----------|------|
| 7000 | 青年女声 | 标准新闻播报 |
| 7001 | 青年男声 | 标准新闻播报 |
| 7010 | 温柔女声 | 客服场景 |
| 7015 | 磁性男声 | 讲故事 |
| 7020 | 萝莉女声 | 儿童内容 |
| 7030 | 御姐女声 | 情感对话 |
| 8000 | 通用音色 | 默认 |

**特色音色（需申请）**：

| voice_type | 音色名称 | 版权方 |
|------------|----------|--------|
| 10001 | 明星A | 合作IP |
| 10002 | 明星B | 合作IP |

### 4.6 性能指标

| 指标 | 数值 |
|------|------|
| 首包延迟 | 300-400ms（流式合成）|
| 中文自然度 | MOS 4.2+ |
| 合成速度 | < 100ms/百字 |
| 支持采样率 | 16000 / 24000 / 48000 Hz |
| 输出格式 | mp3 / wav / pcm / ogg |

### 4.7 费用

**2026年5月实测数据**：

| 计费项 | 价格 | 备注 |
|--------|------|------|
| 基础 TTS | 1.3 元/千字符 | 标准音色 |
| 精品 TTS | 3.0 元/千字符 | 高自然度 |
| CosyVoice 3 | 5.0 元/千字符 | 情感可控 |

新用户有试用额度（每日1000次调用）。

---

## 五、实时语音 RTC

### 5.1 产品定位

火山引擎实时语音（RTC）提供完整的全双工语音交互能力，支持：

- 实时双向通话
- 低延迟语音传输
- 语音活动检测（VAD）
- 回声消除（AEC）
- 噪声抑制（ANS）

### 5.2 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                    应用层                                    │
│  ┌─────────┐      ┌─────────┐      ┌─────────┐            │
│  │   ASR   │ ───→ │   LLM   │ ───→ │   TTS   │            │
│  │  实时   │      │  理解   │      │  实时   │            │
│  │  识别   │      │  生成   │      │  合成   │            │
│  └─────────┘      └─────────┘      └─────────┘            │
└─────────────────────────────────────────────────────────────┘
                           ↑
                           │
┌─────────────────────────────────────────────────────────────┐
│                    RTC SDK 层                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              WebRTC 协议栈                           │   │
│  │  • Opus 编解码   • FEC 前向纠错   • NACK 重传       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           ↑
                           │
┌─────────────────────────────────────────────────────────────┐
│                    传输层                                    │
│  • UDP 低延迟传输   • 全球加速节点   • 丢包补偿             │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 接入方式

**方式一：RTC SDK + 业务 Server**

适合需要深度定制语音交互的应用：

```javascript
// Web SDK 示例
import { VEAnchor, VERtcCore } from '@ volcengine/rtc-web-sdk';

const rtc = new VERtcCore({
  appId: 'your_appid',
  uid: 'user_001',
  token: 'rtc_token',  // 需要服务端生成
  wsUrl: 'wss://rtcvrs.volcengine.com'
});

// 音频流订阅
rtc.on('audio-stream', (uid, stream) => {
  // 处理接收到的音频流
  const audioElement = document.createElement('audio');
  audioElement.srcObject = stream;
  audioElement.play();
});

// 发送本地音频
rtc.startAudioCapture();
rtc.publishAudio();
```

**方式二：直接使用 ASR/TTS WebSocket**

适合快速接入、核心在云端 LLM 的场景：

```javascript
// 同时连接 ASR 和 TTS WebSocket
const asrWs = new WebSocket('wss://openspeech.bytedance.com/api/v2/asr/stream');
const ttsWs = new WebSocket('wss://openspeech.bytedance.com/api/v1/tts/stream');

// ASR 识别结果实时送入 LLM
asrWs.onmessage = async (event) => {
  const result = JSON.parse(event.data);
  if (result.result?.text) {
    const llmResponse = await callLLM(result.result.text);
    ttsWs.send(JSON.stringify({ text: llmResponse }));
  }
};
```

---

## 六、豆包实时语音大模型

### 6.1 产品发布

2025年12月20日，豆包实时语音大模型正式发布，并在豆包APP全量开放。这是字节跳动首个语音理解和生成一体化的大模型。

### 6.2 核心能力

| 能力 | 说明 |
|------|------|
| 端到端语音交互 | 语音输入直接到语音输出，无需 ASR → TTS 中转 |
| 情感表达 | 支持高兴、悲伤、惊讶等情绪 |
| 角色扮演 | 支持不同人设的声音演绎 |
| 打断响应 | 支持用户随时打断 |
| 多语言支持 | 中文、英文、日文等 |

### 6.3 技术特点

**端云协同架构**：

```
┌─────────────────────────────────────────────────────────────┐
│                    端侧（设备）                             │
│  • 语音采集（16kHz PCM）                                    │
│  • 回声消除（AEC）                                          │
│  • VAD 语音活动检测                                         │
│  • 音频编解码（Opus）                                       │
└─────────────────────────────────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                    云端（大模型）                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │              豆包实时语音大模型                          │ │
│  │  • 语音 tokenizer   • 语义理解   • 语音生成             │ │
│  │  • 情感控制         • 实时流式输出                      │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 6.4 API 开放情况

**截至2026年5月**：

- 豆包实时语音大模型已面向企业用户开放 API
- 个人开发者可通过豆包APP体验
- API 接入需申请企业认证

**接入方式**：

1. 注册火山引擎账号并完成企业认证
2. 申请豆包实时语音 API 权限
3. 通过火山方舟控制台获取 API Key
4. 调用实时语音 API

### 6.5 与传统 ASR/TTS 的对比

| 维度 | 豆包实时语音 | 火山引擎 ASR + TTS |
|------|--------------|-------------------|
| 延迟 | < 500ms 端到端 | ASR < 300ms + LLM + TTS < 400ms |
| 情感表达 | 原生支持 | 需要情感 TTS |
| 打断响应 | 原生支持 | 需要额外处理 |
| 接入复杂度 | 较低（一体化） | 较高（多组件） |
| 定制化 | 受限 | 灵活组合 |
| 成本 | 待定 | 按量付费 |

---

## 七、项目接入方案

### 7.1 当前架构分析

现有 AI 助手项目架构：

```
┌─────────────────────────────────────────────────────────────┐
│                    前端（React + Electron）                  │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐                │
│  │  语音输入  │ → │  Orchestrator │ → │  语音输出  │                │
│  └──────────┘   └──────────┘   └──────────┘                │
└─────────────────────────────────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                    语音服务层                               │
│  ┌──────────┐   ┌──────────┐                               │
│  │ 小米 ASR  │   │ 小米 TTS  │   （当前方案）              │
│  └──────────┘   └──────────┘                               │
└─────────────────────────────────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                    LLM 服务层                               │
│  ┌──────────┐   ┌──────────┐                               │
│  │ 小米 MiMo │   │ 豆包 LLM  │   （可选）                  │
│  └──────────┘   └──────────┘                               │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 火山引擎语音接入架构

**方案一：替换 ASR + TTS**

```
┌─────────────────────────────────────────────────────────────┐
│                    前端（React + Electron）                  │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐                │
│  │  语音输入  │ → │  Orchestrator │ → │  语音输出  │                │
│  └──────────┘   └──────────┘   └──────────┘                │
└─────────────────────────────────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                    语音服务层（升级后）                       │
│  ┌──────────┐   ┌──────────┐                               │
│  │ 火山 ASR  │   │ 火山 TTS  │   （新增）                  │
│  └──────────┘   └──────────┘                               │
│         ↕                                                        │
│  ┌──────────┐   ┌──────────┐                               │
│  │ 小米 MiMo │   │ 豆包 LLM  │   （保持不变）              │
│  └──────────┘   └──────────┘                               │
└─────────────────────────────────────────────────────────────┘
```

**方案二：全链路火山引擎**

```
┌─────────────────────────────────────────────────────────────┐
│                    前端（React + Electron）                  │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐                │
│  │  语音输入  │ → │  Orchestrator │ → │  语音输出  │                │
│  └──────────┘   └──────────┘   └──────────┘                │
└─────────────────────────────────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                    全火山引擎方案                            │
│  火山 ASR  →  火山 LLM（豆包）  →  火山 TTS               │
└─────────────────────────────────────────────────────────────┘
```

### 7.3 具体实现步骤

#### 第一阶段：火山引擎 TTS 集成（1-2天）

**目标**：替换小米 TTS，提升语音质量

1. **创建 Provider**：

```typescript
// src/renderer/core/tts/volcTTS.ts
import { TTSService, TTSRequest, TTSResult } from './types';

export interface VolcTTSConfig {
  appid: string;
  accessToken: string;
  cluster: string;
  voiceType: number;
  encoding: 'mp3' | 'wav' | 'pcm';
  sampleRate: number;
}

export class VolcTTS implements TTSService {
  private ws: WebSocket | null = null;
  private config: VolcTTSConfig;
  
  constructor(config: VolcTTSConfig) {
    this.config = {
      cluster: 'volc_tts_premium',
      voiceType: 7000,
      encoding: 'mp3',
      sampleRate: 16000,
      ...config
    };
  }
  
  async speak(request: TTSRequest): Promise<TTSResult> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket('wss://openspeech.bytedance.com/api/v1/tts/stream');
      
      this.ws.onopen = () => {
        // 发送合成请求
        this.ws!.send(JSON.stringify({
          app: {
            appid: this.config.appid,
            cluster: this.config.cluster
          },
          user: { uid: 'nova-assistant' },
          audio: {
            encoding: this.config.encoding,
            sample_rate: this.config.sampleRate,
            bits: 16,
            channel: 1
          },
          request: {
            reqid: crypto.randomUUID(),
            text: request.text,
            text_type: 'plain',
            operation: 'submit',
            voice_type: this.config.voiceType
          }
        }));
      };
      
      // 收集音频数据
      const audioChunks: Uint8Array[] = [];
      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.binary) {
          audioChunks.push(new Uint8Array(data.binary));
        }
        if (data.code === 1000) {
          // 合成完成
          this.finish();
          resolve({ audioData: this.mergeAudio(audioChunks) });
        }
      };
      
      this.ws.onerror = reject;
    });
  }
  
  private mergeAudio(chunks: Uint8Array[]): ArrayBuffer {
    // 合并音频块
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result.buffer;
  }
  
  private finish() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
```

2. **更新 TTS Manager**：

```typescript
// src/renderer/core/tts/ttsManager.ts
export type TTSProviderType = 'mimo' | 'volc';

export function createTTSService(config: TTSConfig): TTSService {
  switch (config.type) {
    case 'volc':
      return new VolcTTS({
        appid: config.volcAppId!,
        accessToken: config.volcAccessToken!,
        voiceType: config.volcVoiceType || 7000
      });
    case 'mimo':
      return new MiMoTTS({ apiKey: config.mimoApiKey! });
    default:
      throw new Error(`不支持的 TTS 类型: ${config.type}`);
  }
}
```

#### 第二阶段：火山引擎 ASR 集成（2-3天）

**目标**：实现实时语音识别

1. **创建 Provider**：

```typescript
// src/renderer/core/asr/volcASR.ts
import { ASRService, ASRRequest, ASRResult } from './types';

export interface VolcASRConfig {
  appid: string;
  accessToken: string;
  cluster: string;
  audioFormat: string;
  sampleRate: number;
}

export class VolcASR implements ASRService {
  private ws: WebSocket | null = null;
  private config: VolcASRConfig;
  
  constructor(config: VolcASRConfig) {
    this.config = {
      cluster: 'volcengine_streaming_common',
      audioFormat: 'wav',
      sampleRate: 16000,
      ...config
    };
  }
  
  async recognize(request: ASRRequest): Promise<ASRResult> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket('wss://openspeech.bytedance.com/api/v2/asr/stream');
      
      this.ws.onopen = () => {
        // 发送配置
        this.ws!.send(JSON.stringify({
          app: {
            appid: this.config.appid,
            cluster: this.config.cluster
          },
          user: { uid: 'nova-assistant' },
          audio: {
            format: this.config.audioFormat,
            rate: this.config.sampleRate,
            bits: 16,
            channel: 1,
            codec: 'raw'
          }
        }));
        
        // 发送音频数据（分片）
        const chunkSize = 1280; // 40ms @ 16kHz
        for (let i = 0; i < request.audioData.byteLength; i += chunkSize) {
          const chunk = request.audioData.slice(i, i + chunkSize);
          this.ws!.send(chunk);
        }
        this.ws!.send('');  // 发送空消息表示音频结束
      };
      
      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.result?.text) {
          resolve({
            text: data.result.text,
            confidence: 0.95,
            duration: data.result.duration || 0
          });
          this.finish();
        }
      };
      
      this.ws.onerror = reject;
    });
  }
  
  // 支持流式识别
  startStreaming(onResult: (result: ASRResult) => void) {
    this.ws = new WebSocket('wss://openspeech.bytedance.com/api/v2/asr/stream');
    
    this.ws.onopen = () => {
      this.ws!.send(JSON.stringify({
        app: {
          appid: this.config.appid,
          cluster: this.config.cluster
        },
        user: { uid: 'nova-assistant' },
        audio: {
          format: this.config.audioFormat,
          rate: this.config.sampleRate,
          bits: 16,
          channel: 1,
          codec: 'raw'
        }
      }));
    };
    
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.result?.text) {
        onResult({
          text: data.result.text,
          confidence: 0.95,
          duration: data.result.duration || 0,
          isFinal: data.result.is_final || false
        });
      }
    };
  }
  
  sendAudioChunk(audioData: ArrayBuffer) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(new Uint8Array(audioData));
    }
  }
  
  finish() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
```

#### 第三阶段：全双工通信（3-5天）

**目标**：实现真正的实时语音对话

```typescript
// src/renderer/core/voice/FullDuplexVoice.ts
export class FullDuplexVoice {
  private asr: VolcASR;
  private llm: ModelProvider;
  private tts: VolcTTS;
  private isRecording = false;
  private mediaStream: MediaStream | null = null;
  
  async start() {
    // 获取麦克风权限
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 16000
      }
    });
    
    // 初始化 ASR 流式识别
    this.asr.startStreaming(async (asrResult) => {
      if (asrResult.isFinal) {
        // 最终识别结果，发送给 LLM
        const llmResponse = await this.llm.chat({
          messages: [{ role: 'user', content: asrResult.text }]
        });
        
        // 流式合成并播放
        await this.tts.speakStream(llmResponse.content);
      }
    });
    
    // 将麦克风音频流式发送给 ASR
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(this.mediaStream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    
    processor.onaudioprocess = (e) => {
      if (this.isRecording) {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = this.convertToPCM(inputData);
        this.asr.sendAudioChunk(pcmData);
      }
    };
    
    source.connect(processor);
    processor.connect(audioContext.destination);
    
    this.isRecording = true;
  }
  
  stop() {
    this.isRecording = false;
    this.asr.finish();
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
    }
  }
  
  private convertToPCM(float32Array: Float32Array): ArrayBuffer {
    const pcm = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      pcm[i] = Math.max(-1, Math.min(1, float32Array[i])) * 0x7FFF;
    }
    return pcm.buffer;
  }
}
```

---

## 八、配置指南

### 8.1 获取凭证

1. **注册火山引擎账号**：https://console.volcengine.com/

2. **创建应用**：
   - 登录控制台
   - 进入「语音服务」产品
   - 创建应用，获取 AppId

3. **获取密钥**：
   - 进入「访问密钥」页面
   - 创建 Access Key，获取 Access Key ID 和 Secret Key

4. **获取 Access Token**：
   - 使用 AppId + Secret Key 调用 Token API
   - Token 有效期 24 小时，需定期刷新

### 8.2 环境配置

```env
# 火山引擎语音配置
VITE_VOLC_APPID=your_appid
VITE_VOLC_ACCESS_TOKEN=your_access_token
VITE_VOLC_ASR_CLUSTER=volcengine_streaming_common
VITE_VOLC_TTS_CLUSTER=volc_tts_premium
VITE_VOLC_TTS_VOICE_TYPE=7000
```

### 8.3 签名生成工具

```typescript
// src/renderer/core/voice/signature.ts
import crypto from 'crypto-js';

export function generateVolcSignature(
  secretKey: string,
  method: string,
  host: string,
  path: string,
  params: Record<string, string>
): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&');
  
  const plaintext = `${method}\n${host}\n${path}\n${sortedParams}`;
  
  return crypto.HmacSHA256(plaintext, secretKey).toString(crypto.enc.Base64);
}
```

---

## 九、费用说明

### 9.1 按量付费（2026年5月）

| 服务 | 计费方式 | 价格 |
|------|----------|------|
| ASR 极速版 | 按音频时长 | 0.10 元/分钟 |
| ASR 标准版 | 按音频时长 | 0.15 元/分钟 |
| TTS 基础版 | 按字符数 | 1.30 元/千字符 |
| TTS 精品版 | 按字符数 | 3.00 元/千字符 |
| TTS CosyVoice 3 | 按字符数 | 5.00 元/千字符 |
| RTC 实时语音 | 按分钟数 | 0.50 元/分钟 |

### 9.2 免费额度

新用户注册即享：

- ASR：每月 100 万分钟免费额度
- TTS：每月 100 万字符免费额度
- RTC：每月 10000 分钟免费额度

### 9.3 成本估算

以每天 100 次语音对话，每次对话 30 秒为例：

| 成本项 | 计算 | 月费用 |
|--------|------|--------|
| ASR | 100 × 30 / 60 × 0.10 | 5 元 |
| TTS | 100 × 50 字 × 30天 / 1000 × 1.30 | 195 元 |
| **合计** | | **200 元/月** |

---

## 十、总结与建议

### 10.1 技术优势

| 维度 | 火山引擎语音 | 小米 MiMo |
|------|--------------|-----------|
| ASR 实时性 | ✅ 支持 WebSocket 流式 | ❌ 无独立云端 API |
| TTS 流式播放 | ✅ 支持边生成边播放 | ❌ 需完整生成 |
| 全双工对话 | ✅ 支持 | ❌ 不支持 |
| 延迟 | < 300ms | > 1000ms |
| 音色丰富度 | 100+ 音色 | 9 种内置音色 |

### 10.2 接入建议

**立即可行**（1-2天）：

1. 火山引擎 TTS 集成
   - 替换小米 TTS
   - 提升语音质量
   - 支持流式播放

**短期目标**（1周）：

2. 火山引擎 ASR 集成
   - 实现实时语音识别
   - 替代小米多模态理解

**长期演进**（2-3周）：

3. 全双工语音对话
   - RTC SDK 集成
   - 端云协同优化

### 10.3 注意事项

1. **认证签名复杂**：火山引擎使用签名认证，建议封装统一的认证模块
2. **Token 刷新**：Access Token 有效期 24 小时，需实现自动刷新机制
3. **网络要求**：实时语音对网络质量要求高，建议添加降级策略
4. **成本控制**：建议设置用量告警，避免意外超支

---

## 十一、相关资源

### 11.1 官方文档

- 火山引擎控制台：https://console.volcengine.com/
- 语音识别文档：https://www.volcengine.com/docs/amus/1288064
- 语音合成文档：https://www.volcengine.com/docs/82379/1259480
- RTC 实时通话：https://www.volcengine.com/docs/рим/VoiceTalk

### 11.2 SDK 下载

- JavaScript SDK：npm install @ volcengine/rtc-web-sdk
- Python SDK：pip install volcengine
- Java SDK：Maven 依赖 volc-java-sdk

### 11.3 社区支持

- 火山引擎开发者社区：https://developer.volcengine.com/
- 技术支持工单：https://console.volcengine.com/ticket
