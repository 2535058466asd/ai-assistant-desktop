# 模型 Provider 与上下文机制

日期：2026-05-20

## 当前目标

Nova 当前先收敛为一个稳定的本地桌面聊天助手：支持豆包、小米 MiMo 和通用 OpenAI-compatible Provider。LiteLLM、Claude Code、Codex CLI 等外部工具暂不接入主项目，避免把外围工具复杂度带进核心应用。

## 模型配置

统一入口是 `src/renderer/config/modelConfig.ts`。配置优先级如下：

1. 设置页写入的 localStorage。
2. `.env` 中的 `VITE_*` 默认值。
3. 代码内默认值。

Provider 类型：

- `doubao`：豆包 Ark/OpenAI-compatible 风格接口，默认稳定 fallback。
- `mimo`：小米 MiMo OpenAI-compatible 接口，支持普通 API 和 Token Plan 两类地址。
- `openai-compatible`：通用兼容入口，预留给 DeepSeek、OpenRouter、本地代理或其他兼容服务。

注意：设置页中的模型名是运行时配置，不应该被 `.env` 固定死。`.env` 只提供启动默认值；用户在顶部栏或设置页切换后，应以当前配置为准。

## 请求链路

渲染进程不再直接跨域请求模型服务，而是通过主进程代理：

```text
Orchestrator
  -> ModelProvider
  -> modelTransport
  -> preload IPC
  -> Electron main process
  -> provider baseUrl
```

这样做的目的：

- 避免浏览器 CORS 限制。
- 避免把不同 Provider 的网络错误散落在 UI 层。
- 让流式和非流式请求都走同一条传输路径。

## 同一对话切换模型

同一个对话里的历史消息属于当前会话，不属于某一个模型。切换模型后，新的 Provider 会收到同一段短期上下文，但请求参数会换成当前 Provider 的 `baseUrl`、`apiKey`、`model`、`temperature` 和 `maxTokens`。

因此同一对话切模型时要注意：

- 历史 user/assistant/tool 消息会继续参与下一轮请求。
- 模型名、鉴权和 base URL 必须来自当前激活配置。
- 不同厂商对特殊字段的支持不同，Provider 层要做兼容处理。

当前不把“每条消息由哪个模型生成”作为请求过滤条件；它更适合作为 UI 元数据和调试信息。

## 短期上下文与长期记忆

短期上下文由 renderer 内存里的 `ContextManager` 管理，用于当前会话的连续对话和工具调用循环。它不是 localStorage，也不是 SQLite。

长期记忆由 SQLite 持久化。每次用户请求时，Orchestrator 可以检索相关长期记忆并注入当前请求上下文；它不是只在新对话创建时注入。记忆提取失败不应该阻断主聊天，只记录错误和降级。

简单理解：

```text
短期上下文：当前对话正在发生什么
长期记忆：跨对话保留的重要事实
```

## reasoning_content

小米 MiMo thinking mode 可能返回 `reasoning_content`。这个字段和普通 `content` 不一样：

- `content`：最终给用户看的回答。
- `reasoning_content`：模型思考过程或推理过程。

MiMo 在多轮工具调用或 thinking mode 下，后续请求可能要求把上一轮 `reasoning_content` 带回 API，否则会出现类似错误：

```text
The reasoning_content in the thinking mode must be passed back to the API.
```

当前策略：

- 前端应把 `reasoning_content` 显示在“思考”区域，而不是混入最终回答。
- Provider/ContextManager 需要保留必要的 `reasoning_content`，用于同一轮或后续多轮请求。
- 豆包不应强行套用 MiMo 专属字段，避免 Provider 之间串协议。

## 当前边界

- 暂不把 LiteLLM 作为 Nova 的默认内置网关。
- 暂不把 Claude Code、Codex CLI、Trae 的配置接入 Nova。
- 暂不重构语音链路为全双工。
- 优先稳定文本对话、模型切换、工具调用、上下文和错误提示。
