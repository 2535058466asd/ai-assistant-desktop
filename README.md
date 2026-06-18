# Nova 桌面 AI Agent 工作台

Nova 是一个基于 **Electron + React + TypeScript** 的桌面 AI Agent 工作台。项目目标不是做一个普通聊天窗口，而是把多模型对话、Agent 工具调用、本地 RAG 知识库、长期记忆、语音交互和可观测日志整合到一个真实可运行的桌面应用里。

这个项目用于展示应用层 AI 工程能力：如何把多个 AI 服务、Electron 安全边界、本地存储、上下文治理、知识检索、记忆系统和桌面端交互组织成一个可维护系统。

## 项目亮点

- **桌面端架构**：Electron Main / Preload / Renderer 三层隔离，敏感能力放在主进程。
- **多模型接入**：支持豆包、小米 MiMo 和 OpenAI-compatible Provider。
- **Agent 工具调用**：统一管理文件、网页、剪贴板、知识库、记忆等本地工具能力。
- **本地 RAG 知识库**：支持多类型文件导入、文本解析、清洗切片、Embedding 向量化、SQLite + sqlite-vec 检索。
- **RAG 调试面板**：展示 Query、命中片段、source、chunkId、distance、片段正文和原始返回 JSON。
- **长期记忆系统**：支持显式记忆、自动提取、去重合并、状态管理和按需注入。
- **语音交互**：支持 ASR -> LLM -> TTS 的半双工语音对话，实时语音通话作为实验性能力保留。
- **可观测性**：logger 分层记录模型请求、工具调用、RAG 检索、记忆写入、语音链路和错误状态。

## 可展示场景

当前阶段适合演示这些场景：

1. 文本对话：多模型聊天、上下文保存、日志观察。
2. Agent 工具：让模型调用文件、网页、剪贴板、知识库和记忆工具完成任务。
3. RAG 知识库：导入 PDF / Word / Excel / Markdown / 图片等文件，检索相关片段并注入回答。
4. RAG 调试：查看检索命中的片段、来源、chunkId、distance 和原始返回结构。
5. 长期记忆：保存用户偏好、事实和决策，在后续对话中按需召回。
6. 语音交互：用户说话 -> ASR 识别 -> LLM 回复 -> TTS 播放。

## 系统架构

```mermaid
flowchart TB
  User["用户"] --> UI["渲染进程 UI<br/>React + TypeScript"]

  UI --> ChatUI["聊天界面"]
  UI --> VoiceUI["语音设置 / 通话界面"]
  UI --> LogUI["日志面板"]

  ChatUI --> IPC["Preload<br/>contextBridge 白名单 API"]
  VoiceUI --> IPC
  LogUI --> IPC

  IPC --> Main["Electron 主进程<br/>IPC handler / 密钥 / 本地服务"]

  Main --> LLM["大模型 Provider<br/>豆包 / MiMo / OpenAI-compatible"]
  Main --> Voice["语音服务"]
  Main --> Tools["工具层 / 类 MCP 工具层"]
  Main --> Archive["SQLite 聊天存档"]
  Main --> MemorySvc["长期记忆服务"]
  Main --> RAG["RAG 本地知识库<br/>SQLite + sqlite-vec"]

  Voice --> ASR["ASR<br/>豆包流式 ASR / MiMo ASR"]
  Voice --> TTS["TTS<br/>豆包 WebSocket v3 / MiMo TTS"]
  Voice --> Realtime["实验性实时语音<br/>端到端语音 WebSocket"]

  TTS --> Catalog["豆包 ListSpeakers<br/>seed-tts-2.0 音色目录"]
  Realtime --> DialogAPI["realtime/dialogue API"]

  LLM --> External["外部 AI 服务"]
  ASR --> External
  TTS --> External
  Catalog --> External
  DialogAPI --> External

  RAG --> Vec["知识片段 / embedding / source / chunkId / distance"]
  MemorySvc --> MemoryDB["SQLite 记忆库<br/>偏好 / 事实 / 决策"]
  Archive --> ChatDB["SQLite 对话历史"]
```

## 关键链路

### 1. 普通文本对话

```mermaid
sequenceDiagram
  participant U as 用户
  participant UI as 渲染进程 UI
  participant IPC as Preload / IPC
  participant Main as 主进程
  participant LLM as 大模型 Provider
  participant DB as SQLite / 记忆
  participant Log as 日志面板

  U->>UI: 输入文本消息
  UI->>IPC: 发送消息
  IPC->>Main: IPC 调用
  Main->>DB: 读取上下文 / 记忆
  Main->>LLM: 发送模型请求
  LLM-->>Main: 流式返回
  Main-->>UI: 推送回复片段
  Main->>DB: 保存对话
  Main->>Log: 记录请求和状态
```

### 2. 半双工语音对话

```mermaid
sequenceDiagram
  participant U as 用户
  participant UI as 渲染进程 UI
  participant ASR as ASR Provider
  participant Main as 主进程
  participant LLM as 大模型 Provider
  participant TTS as TTS Provider
  participant Player as 音频播放器

  U->>UI: 说话
  UI->>ASR: 发送麦克风音频
  ASR-->>UI: 返回识别文本
  UI->>Main: 发送识别文本
  Main->>LLM: 生成回复
  LLM-->>Main: 返回文本
  Main-->>UI: 渲染回复
  UI->>TTS: 请求语音合成
  TTS-->>UI: 返回音频
  UI->>Player: 播放音频
```

### 3. 实验性端到端实时语音通话

```mermaid
sequenceDiagram
  participant U as 用户
  participant UI as 渲染进程 UI
  participant Main as 主进程
  participant WS as realtime/dialogue WebSocket
  participant Player as 音频播放器
  participant Log as 日志面板

  U->>UI: 开始通话
  UI->>Main: realtime-dialog-connect
  Main->>WS: 建立 WebSocket 连接
  WS-->>Main: ConnectionStarted

  loop 通话中
    UI->>Main: 发送 PCM 音频分片
    Main->>WS: 转发音频帧
    WS-->>Main: 返回 AI 音频 / 事件
    Main-->>UI: 推送音频分片 / 状态
    UI->>Player: 实时播放音频
    Main->>Log: 记录事件和错误
  end

  U->>UI: 结束通话
  UI->>Main: realtime-dialog-disconnect
  Main->>WS: 关闭连接
```

### 4. RAG 知识库检索链路

```mermaid
sequenceDiagram
  participant U as 用户
  participant UI as 知识库 / 聊天 UI
  participant IPC as Preload / IPC
  participant RAG as RAG Service
  participant DB as SQLite + sqlite-vec
  participant LLM as 大模型 Provider
  participant Log as logger

  U->>UI: 导入文档 / 图片
  UI->>IPC: knowledge-import-file / image
  IPC->>RAG: 解析、清洗、切片
  RAG->>RAG: 生成 Embedding
  RAG->>DB: 写入 document / source / chunkId / embedding

  U->>UI: 提问或调试检索
  UI->>IPC: knowledge-search-structured
  IPC->>RAG: 构建查询向量
  RAG->>DB: KNN 检索 + 关键词 boost
  DB-->>RAG: 返回片段和 distance
  RAG-->>UI: source / chunkId / text / distance
  UI->>Log: 展示调试结果
  UI->>LLM: 将相关片段注入模型上下文
```

### 5. 长期记忆链路

```mermaid
sequenceDiagram
  participant U as 用户
  participant Agent as 主 Agent
  participant MemAgent as Memory Agent
  participant Policy as 记忆治理层
  participant DB as SQLite 记忆库
  participant Prompt as 系统提示词

  U->>Agent: 明确要求记住信息
  Agent->>Policy: add_memory 候选记忆
  Policy->>DB: 去重 / 合并 / 更新 / 忽略
  DB-->>Agent: 返回写入结果

  Agent->>MemAgent: 对话后异步提取候选记忆
  MemAgent->>Policy: 输出 add / update / ignore
  Policy->>DB: 统一治理后写入

  U->>Agent: 后续新问题
  Agent->>DB: 按用户输入检索相关记忆
  DB-->>Prompt: 注入 core / long_term 记忆
```

### 6. 豆包 TTS 2.0 音色链路

```mermaid
sequenceDiagram
  participant UI as 语音设置 UI
  participant IPC as Preload / IPC
  participant Main as 主进程
  participant Catalog as ListSpeakers OpenAPI
  participant TTS as TTS WebSocket v3
  participant Log as 日志面板

  UI->>IPC: 请求 seed-tts-2.0 音色列表
  IPC->>Main: volcengine-tts-list-speakers
  Main->>Catalog: ListSpeakers(ResourceIDs=["seed-tts-2.0"])
  Catalog-->>Main: 返回音色列表
  Main-->>UI: 返回显示名称 + voice_type
  UI->>UI: 选择音色

  UI->>IPC: 请求语音合成
  IPC->>Main: ttsV3Synthesize(config, text)
  Main->>Log: 记录 resourceId / voice_type / 请求体
  Main->>TTS: StartSession + TaskRequest
  TTS-->>Main: 音频分片
  Main-->>UI: tts-audio-chunk / complete
```

## Electron 安全边界

Nova 使用 Electron 的三层隔离模型：

```text
Renderer = React UI, low privilege
Preload  = 白名单桥接层，暴露 window.electronAPI
Main     = 本地后端，处理密钥、文件、数据库、WebSocket 和外部 API
```

Renderer 不直接访问 Node.js、`.env`、SQLite、文件系统或系统命令。它只能调用 Preload 暴露的白名单接口，例如：

```ts
window.electronAPI.ttsV3Synthesize(...)
window.electronAPI.knowledgeSearchStructured(...)
window.electronAPI.memoryAddMemory(...)
```

Main Process 再通过 `ipcMain.handle(...)` 注册对应能力。这样即使 Renderer 层出现 XSS 或第三方库风险，也不能直接读取本地密钥或执行任意系统操作。

## 技术栈

| 模块 | 技术 |
| --- | --- |
| 桌面端 | Electron |
| 前端 | React, TypeScript, CSS Modules |
| 构建 | Vite |
| 本地存储 | SQLite, localStorage |
| 大模型 | 豆包、MiMo、OpenAI-compatible providers |
| Agent 工具 | Function Calling、本地文件、网页、剪贴板、知识库、记忆 |
| RAG | 文档解析、文本清洗、切片、Embedding、SQLite + sqlite-vec |
| 记忆 | SQLite、FTS、显式记忆、自动提取、去重合并、按需注入 |
| 语音 | 豆包 ASR/TTS、小米 MiMo ASR/TTS、实验性实时语音 |
| 音频传输 | WebSocket、PCM 分片、流式音频播放 |
| 可观测性 | 自研 logger 面板 |
| 文档导入 | PDF / Word / Excel / Markdown / Text / 图片识别 |

## 项目结构

```text
src/
  main/
    index.ts                         # Electron 主进程和 IPC handler
    services/
      ragService.ts                   # RAG 知识库：sqlite-vec 检索
      memoryServiceBackend.ts         # 长期记忆：SQLite / FTS / 去重
      documentParser.ts               # 文档解析、清洗和切片
      realtimeDialogService.ts        # 豆包实时语音 WebSocket
      volcengineTTSVoiceCatalogService.ts
      tts/volcengineTTSWebSocketService.ts
      asr/volcengineASRWebSocketService.ts
    tools/                            # 本地工具：文件、网页、剪贴板、应用启动

  preload/
    preload.ts                        # contextBridge 白名单 API

  renderer/
    App.tsx
    components/
      Settings/                       # 语音 / 模型设置
      chat/                           # 聊天界面
      Observability/                  # 日志 / trace 面板
      Knowledge/                      # 知识库界面
      Memory/                         # 记忆界面
    core/
      model/                          # 模型 Provider
      agent/                          # Agent 循环和工具调用
      context/                        # 上下文压缩和清洗
      memory/                         # Memory Agent / Policy / Writer
      asr/                            # ASR 管理器和 Provider
      tts/                            # TTS 管理器和 Provider
      realtimeCall/                   # 实时语音通话模式
      voiceChat/                      # 半双工语音模式
```

## 本地启动

```bash
npm install
copy .env.example .env
npm run electron:dev
```

构建检查：

```bash
npm run build
npm run build:node
```

## 环境变量

从 `.env.example` 复制 `.env`，按需填写要使用的服务。

```env
# 大模型 Provider
VITE_DOUBAO_API_KEY=
VITE_DOUBAO_MODEL=
VITE_MIMO_BASE_URL=
VITE_MIMO_API_KEY=
VITE_MIMO_MODEL=

# 豆包语音合成运行时
VITE_VOLCENGINE_APP_ID=
VITE_VOLCENGINE_ACCESS_TOKEN=

# 豆包端到端实时语音（实验性）
VITE_REALTIME_DIALOG_APP_ID=
VITE_REALTIME_DIALOG_ACCESS_KEY=

# 豆包 ListSpeakers 音色目录
VOLCENGINE_ACCESS_KEY_ID=
VOLCENGINE_SECRET_ACCESS_KEY=
VOLCENGINE_REGION=cn-beijing
```

语音合成运行时使用 `VITE_VOLCENGINE_APP_ID + VITE_VOLCENGINE_ACCESS_TOKEN`。音色目录使用 `VOLCENGINE_ACCESS_KEY_ID + VOLCENGINE_SECRET_ACCESS_KEY`，因为 `ListSpeakers` 属于 OpenAPI 管理接口。

## 关键技术决策

### 为什么选择 Electron？

Nova 需要复杂 React UI、本地存储、WebSocket 音频流、桌面端能力、本地文件和调试面板。Electron 能复用成熟 Web 生态，同时通过主进程承载本地服务。

### 为什么使用 Preload，而不是让前端直接访问 Node？

Renderer 被当成低权限浏览器页面处理。密钥、文件、数据库、WebSocket 等敏感能力都经过 `window.electronAPI` 白名单方法转发，由主进程统一执行。

### 为什么把 RAG 和记忆放在本地？

Nova 的目标是桌面端 AI Agent 工作台，知识库和长期记忆都需要可控、可调试、可持久化。本地 RAG 使用 SQLite + sqlite-vec 保存知识片段、向量、来源和 chunkId；长期记忆使用 SQLite / FTS 保存偏好、事实和决策。这样可以在本地观察数据、排查检索命中，并减少对第三方平台状态的依赖。

### 为什么要做 RAG 调试面板？

RAG 的核心问题不是“能不能搜索”，而是“模型到底拿到了哪些片段”。调试面板展示 Query、命中片段、source、chunkId、distance、片段正文和原始 JSON，便于判断切片是否合理、检索是否命中、相似度排序是否异常。

### 为什么同时保留 ASR-LLM-TTS 和实时语音？

两条链路解决的问题不同：

- `ASR -> LLM -> TTS` 更容易接入工具、RAG 和记忆。
- `realtime/dialogue` 更适合验证低延迟、自然的端到端语音通话，但对工具、RAG 和记忆的可控性较弱。

因此 Nova 以普通语音链路作为主线，实时语音通话保留为实验性验证能力。

### 为什么要动态拉豆包音色列表？

豆包 TTS 2.0 要求 `voice_type` 和 `resourceId=seed-tts-2.0` 匹配。Nova 通过 `ListSpeakers` 获取官方音色列表，避免手写音色 ID 导致资源不匹配。

## 面试讲解重点

- 基于 Electron 进程隔离设计桌面 AI Agent 工作台。
- 使用 Preload 白名单 API 构建安全 IPC 边界。
- 统一封装豆包、小米 MiMo 和 OpenAI-compatible Provider。
- 设计 Agent 工具调用系统，把文件、网页、剪贴板、知识库、记忆等能力交给模型调用。
- 基于 SQLite + sqlite-vec 实现本地 RAG 知识库，完成解析、清洗、切片、向量化和语义检索。
- 开发 RAG 调试面板，观察命中片段、来源、chunkId、distance 和原始返回结构。
- 实现长期记忆系统，支持显式记忆、自动提取、去重合并、状态管理和上下文注入。
- 使用 logger 记录模型请求、工具调用、RAG 检索、记忆写入和服务错误，提升调试能力。
- 把 AI 能力组织成真实产品链路，而不是孤立 API Demo。

## 当前限制

- 实时语音模式目前主要用于实验性对话验证，还没有完整接入工具、RAG 和记忆。
- 知识库导入质量依赖文档解析效果，扫描版 PDF 和复杂表格仍需继续增强。
- RAG 当前以本地向量检索和关键词 boost 为主，还没有加入复杂 rerank。
- 长期记忆已经具备治理链路，但记忆提取策略仍需要更多真实对话验证。
- 演示稳定性依赖外部服务凭证和网络状态。

## 后续规划

- 补充项目截图。
- 优化 RAG 调试面板，增加片段预览、来源筛选和命中解释。
- 增加知识库导入质量检查和失败原因提示。
- 优化长期记忆提取策略和记忆命中解释。
- 增加 RAG、记忆和工具调用相关的评估用例。
