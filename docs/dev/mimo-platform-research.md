# 小米 MiMo 开放平台调研

日期：2026-05-11

## 文档来源

小米 MiMo 文档页面 `https://platform.xiaomimimo.com/docs/zh-CN/welcome` 是动态渲染页面，但官方站点暴露了静态 Markdown 文档，可以直接读取：

- 文档索引：https://platform.xiaomimimo.com/llms.txt
- 完整文档合集：https://platform.xiaomimimo.com/llms-full.txt
- 首次 API 调用：https://platform.xiaomimimo.com/static/docs/quick-start/first-api-call.md
- OpenAI 兼容 API：https://platform.xiaomimimo.com/static/docs/api/chat/openai-api.md
- Token Plan 快速接入：https://platform.xiaomimimo.com/static/docs/tokenplan/quick-access.md
- 价格和限流：https://platform.xiaomimimo.com/static/docs/pricing.md
- 音频理解：https://platform.xiaomimimo.com/static/docs/usage-guide/multimodal-understanding/audio-understanding.md
- TTS v2.5：https://platform.xiaomimimo.com/static/docs/usage-guide/speech-synthesis-v2.5.md
- TTS + ASR 发布说明：https://platform.xiaomimimo.com/static/docs/news/v2.5-tts-release.md

GitHub 上暂时没有看到“小米 MiMo 开放平台 API 文档”的官方同步仓库。相关仓库和线索：

- 官方 ASR 模型仓库：https://github.com/XiaomiMiMo/MiMo-V2.5-ASR
- 官方组织：https://github.com/XiaomiMiMo
- 第三方 Rust API 客户端：https://github.com/mzdk100/mimo
- Hermes Agent Token Plan 讨论：https://github.com/NousResearch/hermes-agent/issues/14285
- Hermes 中模型名小数点问题：https://github.com/NousResearch/hermes-agent/issues/15619

## API 兼容性

MiMo 平台兼容 OpenAI 和 Anthropic API 格式。

普通按量付费 API：

- OpenAI base URL：`https://api.xiaomimimo.com/v1`
- Chat endpoint：`POST /chat/completions`
- Anthropic base URL：`https://api.xiaomimimo.com/anthropic`

认证方式支持两种：

- `api-key: $MIMO_API_KEY`
- `Authorization: Bearer $MIMO_API_KEY`

## Token Plan

Token Plan 的 API Key 格式是 `tp-xxxxx`。按量付费 API Key 格式是 `sk-xxxxx`。

这两类 key 彼此独立，不能混用。Token Plan key 必须使用订阅控制台显示的 Token Plan 专用 Base URL。

已知 OpenAI 兼容 Token Plan Base URL：

- 中国区：`https://token-plan-cn.xiaomimimo.com/v1`
- 新加坡区：`https://token-plan-sgp.xiaomimimo.com/v1`
- 欧洲区：`https://token-plan-ams.xiaomimimo.com/v1`

已知 Anthropic 兼容 Token Plan Base URL：

- 中国区：`https://token-plan-cn.xiaomimimo.com/anthropic`
- 新加坡区：`https://token-plan-sgp.xiaomimimo.com/anthropic`
- 欧洲区：`https://token-plan-ams.xiaomimimo.com/anthropic`

本项目优先走 OpenAI 兼容路径，因为当前 Provider 抽象已经贴近 OpenAI Chat Completions。

## 本地实测结论

2026-05-19 对普通 API、Token Plan 和 LiteLLM 做过小请求验证：

- 普通 `sk-` key 应使用 `https://api.xiaomimimo.com/v1`。
- Token Plan `tp-` key 应使用 `https://token-plan-cn.xiaomimimo.com/v1`。
- `sk-` key 请求 Token Plan 地址会返回 `401 Invalid API Key`，这是 key 类型和 base URL 不匹配。
- Windows 宿主机直连 Token Plan + `tp-` key 可以成功请求。
- LiteLLM Docker 容器访问 `token-plan-cn.xiaomimimo.com:443` 时出现过连接/TLS 层错误；该问题发生在鉴权之前，不代表 Token Plan key 无效。
- LiteLLM 使用普通 `sk-` key + `https://api.xiaomimimo.com/v1` 已验证可返回 `200 OK`。

当前项目不默认接入 LiteLLM。LiteLLM 只作为外部统一网关备选方案，Nova 主项目仍直接维护自己的 Provider 抽象。

## 模型

官方文档中重要模型 ID：

- `mimo-v2.5-pro`：旗舰推理/通用模型，支持流式输出、function call、结构化输出、联网搜索。
- `mimo-v2.5`：全模态理解模型，支持图片、音频、视频输入。
- `mimo-v2-pro`：上一代 Agent 方向旗舰模型。
- `mimo-v2-omni`：全模态理解模型。
- `mimo-v2-flash`：更轻量的快速模型。
- `mimo-v2.5-tts`：内置音色 TTS。
- `mimo-v2.5-tts-voicedesign`：通过文本描述设计音色。
- `mimo-v2.5-tts-voiceclone`：通过音频样本克隆音色。
- `mimo-v2-tts`：上一代 TTS 模型。

实现注意点：模型名里的点必须保留，比如 `mimo-v2.5-pro`。有些工具会把点替换成横线，这会导致模型名错误。

## 文本和工具调用

OpenAI 兼容 Chat API 支持 `tools` 和 `tool_choice: "auto"`。

官方文档提到，在 thinking mode 的多轮工具调用中，模型可能会在 `tool_calls` 旁边返回 `reasoning_content`。为了获得更好的连续工具调用效果，后续请求最好把之前的 `reasoning_content` 保留在 `messages` 中。

第一版接入可以先忽略 `reasoning_content`，直接按普通 OpenAI 兼容流程走。如果后续发现 MiMo 工具调用质量不稳定，再加 MiMo 专属的 `reasoning_content` 保存逻辑。

## 音频理解和 ASR

音频理解可以通过多模态 Chat API 实现，支持模型：

- `mimo-v2.5`
- `mimo-v2-omni`

音频输入方式：

- 公开可访问的音频 URL。
- Base64 data URI，格式：`data:{MIME_TYPE};base64,$BASE64_AUDIO`。

2026-06-02 后，官方开放平台新增了独立的云端 ASR 文档。`mimo-v2.5-asr` 通过 OpenAI-compatible `chat/completions` 调用，`messages.content` 里传 `input_audio`，支持 `wav` / `mp3`，并可通过 `asr_options.language` 传 `auto`、`zh` 或 `en`。

发布说明里提到的 `MiMo-V2.5-ASR` 开源仓库仍然存在。GitHub 仓库提供的是本地 Python API，例如 `asr_sft()` 和 Gradio Demo，依赖 Linux、Python 3.12、CUDA >= 12.0，以及从 Hugging Face 下载模型。

实际判断：

- 桌面助手可以接入云端 `mimo-v2.5-asr`，不需要本地 CUDA 部署。
- MiMo ASR 是一次性音频提交识别，不是豆包 WebSocket 那种实时流式 ASR。
- 本地 MiMo ASR 对普通桌面项目仍偏重，除非用户有合适 NVIDIA CUDA 环境并接受本地模型部署。

## TTS

MiMo-V2.5 TTS 可以通过 OpenAI 兼容的 `chat/completions` 接口调用，并使用 `audio` 参数。

支持输出格式：

- `wav`
- `mp3`
- `pcm`
- `pcm16`

合成目标文本必须放在 `assistant` role 的 message 中。`user` role message 可以传入风格指令或对话历史。使用 `mimo-v2.5-tts-voicedesign` 时，`user` role message 是必填项。

`mimo-v2.5-tts` 内置音色包括：

- `mimo_default`
- `冰糖`
- `茉莉`
- `苏打`
- `白桦`
- `Mia`
- `Chloe`
- `Milo`
- `Dean`

价格文档标注 TTS 模型当前限时免费。

重要限制：MiMo-V2.5-TTS 系列低延迟流式输出暂不可用。文档说明流式调用目前降级为兼容模式，会在推理完成后一次性返回结果。

## 项目接入计划

当前项目已经有模型 Provider 抽象：

- `src/renderer/core/model/types.ts`
- `src/renderer/core/model/index.ts`
- `src/renderer/core/model/openAICompatibleProvider.ts`
- `src/renderer/core/model/mimoProvider.ts`

中国区 Token Plan 推荐 `.env` 配置：

```env
VITE_MODEL_PROVIDER=mimo
VITE_MIMO_BASE_URL=https://token-plan-cn.xiaomimimo.com/v1
VITE_MIMO_API_KEY=tp-xxxxx
VITE_MIMO_MODEL=mimo-v2.5-pro
```

普通按量付费 API 推荐 `.env` 配置：

```env
VITE_MODEL_PROVIDER=mimo
VITE_MIMO_BASE_URL=https://api.xiaomimimo.com/v1
VITE_MIMO_API_KEY=sk-xxxxx
VITE_MIMO_MODEL=mimo-v2.5-pro
```

真实 API Key 不进入 Git，只放本地 `.env`。

Provider 抽象的意义是：Orchestrator 只依赖统一的 `ModelProvider` 接口。以后从豆包切到 MiMo，应该只改配置和 Provider 内部实现，不重写 Agent Loop。

推荐接入顺序：

1. 优先使用普通 API 或 Token Plan 的正确 key/base URL 组合验证 MiMo 普通聊天。
2. 验证现有工具 schemas 下的 function calling。
3. 保留 MiMo 专属 `reasoning_content`，用于 thinking mode 和多轮工具调用。
4. MiMo TTS 继续走独立 TTS Provider。
5. MiMo ASR 可作为 ASR Provider 接入，但交互上要标明“停止录音后识别”。

## 待确认问题

- Token Plan 是否允许通过同一个 Token Plan Base URL 调用 TTS 模型。文档倾向于支持，但需要小请求验证。
- Token Plan 是否允许通过同一个 Token Plan Base URL 调用 ASR 模型，需要小请求验证。
