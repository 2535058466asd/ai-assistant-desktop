# CLAUDE.md — Nova AI 工作台项目指南

## 项目概述

Nova 是一个基于 Electron + React + TypeScript 的桌面 AI 工作台，定位为办公 AI Agent（不是代码助手）。核心能力：RAG 知识库、长期记忆、Function Calling 工具系统、多模型支持、语音交互和 traceId 可观测日志。

## 技术栈

- **前端**: React 18 + TypeScript + Vite + CSS Modules
- **桌面端**: Electron 33
- **向量库**: SQLite-vec（嵌入式向量扩展）
- **Embedding**: paraphrase-multilingual-MiniLM-L12-v2（384 维，支持中文）
- **记忆**: SQLite + 长期记忆自动提取（memoryExtractor 自动从对话中提取偏好/事实）
- **模型**: 豆包 / MiMo / OpenAI-compatible
- **语音**: 火山引擎 TTS/ASR + MiMo TTS/ASR（双引擎可切换）
- **日志**: shared/logger.ts（11 模块、traceId 链路、敏感数据脱敏）

## 常用命令

```bash
# 开发
npm run electron:dev          # 启动开发模式（Vite + Electron）

# 构建
npm run build                 # 生产构建
npm run electron:build        # 打包 Electron 应用

# 类型检查
npx tsc --noEmit              # 检查 TypeScript 错误

# 测试
npx vitest run                # 运行单元测试（14 个测试文件，118+ 用例）
```

## 目录结构

```
src/
├── shared/
│   └── logger.ts             # 统一日志系统（main/renderer 共用）
├── main/                     # Electron 主进程（Node.js 环境）
│   ├── tools/                # IPC 工具注册（文件、网页、剪贴板、系统、RAG）
│   │   ├── ragTools.ts       # 知识库 IPC：搜索/导入/解析/去重
│   │   ├── fileOps.ts        # 文件操作：读写/搜索/grep
│   │   ├── webTools.ts       # 网页抓取和搜索引擎
│   │   ├── clipboard.ts      # 剪贴板读写
│   │   ├── execCommand.ts    # 系统命令执行
│   │   ├── systemTools.ts    # 时间/系统信息/通知
│   │   └── openApp.ts        # 打开应用
│   └── services/             # 主进程服务
│       ├── ragService.ts     # RAG 核心：SQLite-vec + 向量搜索 + 关键词 boost
│       ├── documentParser.ts # 文档解析：PDF/DOCX/XLSX/TXT/MD + 标题感知分块
│       ├── imageRecognizer.ts# 图片 OCR（豆包 Vision API）
│       ├── memoryServiceBackend.ts # 长期记忆存储
│       ├── conversationArchiveService.ts # 对话归档（SQLite）
│       ├── volcengineTTSWebSocketService.ts # 火山引擎 TTS
│       ├── volcengineASRWebSocketService.ts # 火山引擎 ASR
│       └── realtimeDialogService.ts # 实时语音对话
├── preload/
│   └── preload.ts            # IPC 安全桥接（白名单 API，~60 个接口）
└── renderer/                 # 渲染进程（React，浏览器环境）
    ├── core/                 # 核心 AI 逻辑
    │   ├── orchestrator.ts   # 入口：流程编排 + System Prompt 拼装
    │   ├── novaSettings.ts   # 人设/性格/工具规则/System Prompt 模板
    │   ├── agent/
    │   │   └── agentLoop.ts  # Function Calling 循环（最多 10 轮工具调用）
    │   ├── model/
    │   │   ├── index.ts      # getModelProvider() 统一入口
    │   │   ├── doubaoProvider.ts # 豆包 Provider
    │   │   ├── mimoProvider.ts   # MiMo Provider
    │   │   ├── openAICompatibleProvider.ts # 通用 Provider
    │   │   └── modelRuntime.ts   # 模型路由（图片自动切 mimo-v2.5）
    │   ├── tools/
    │   │   ├── toolRegistry.ts   # 工具定义 + 注册（28 个工具）
    │   │   ├── toolExecutor.ts   # 工具执行引擎
    │   │   ├── toolDefinitions.ts# 工具 schema 定义
    │   │   └── skillsLoader.ts   # 技能加载器
    │   ├── conversation/
    │   │   ├── conversationContext.ts # 上下文构建（50 条消息 + MiMo reasoning 重放）
    │   │   └── conversationRuntime.ts # 对话状态管理
    │   ├── context/
    │   │   └── contextCompactor.ts # 上下文压缩（80K token 阈值，LLM 摘要）
    │   ├── history/
    │   │   └── historyManager.ts # 历史消息管理
    │   ├── memory/           # 记忆系统
    │   ├── utils/
    │   │   └── memoryExtractor.ts # 自动记忆提取（偏好/事实/情感）
    │   ├── events/
    │   │   └── agentEventBridge.ts # Agent 事件桥接（流式/工具/进度）
    │   ├── tts/              # TTS 管理器（火山/MiMo 双引擎）
    │   ├── asr/              # ASR 管理器（火山/MiMo 双引擎）
    │   ├── voice/            # 语音唤醒 + 语音网关
    │   ├── voiceChat/        # 半双工语音对话模式
    │   ├── realtimeCall/     # 实时语音通话模式
    │   ├── cost/
    │   │   └── costTracker.ts # Token 用量统计
    │   └── model/
    │       └── modelErrorHandler.ts # 错误分类 + 重试策略
    ├── components/
    │   ├── AppLayout/        # 主布局（侧边栏 + 内容区）
    │   ├── sidebar/          # 对话列表 + 新建/切换/删除
    │   ├── chat/             # 消息气泡 + 思考面板 + 工具调用展示
    │   ├── input/            # 输入区（文本/图片/文档拖拽/语音）
    │   ├── header/           # 顶栏（模型切换/设置）
    │   ├── Settings/         # 设置面板（模型 API/语音/搜索）
    │   ├── Knowledge/        # 知识库面板（上传/搜索/来源管理）
    │   ├── Memory/           # 记忆面板（查看/编辑/删除）
    │   ├── Eval/             # 评估面板（20 条测试问题）
    │   ├── Observability/    # 可观测面板（traceId/工具调用/Token 用量）
    │   └── Workspace/        # 项目驾驶舱
    ├── config/
    │   ├── modelConfig.ts    # 模型配置（Provider/API Key/Base URL）
    │   ├── modelCatalog.ts   # 模型目录（能力声明：text/image/tools）
    │   ├── ttsConfig.ts      # TTS 配置
    │   ├── asrConfig.ts      # ASR 配置
    │   ├── searchConfig.ts   # 搜索引擎配置
    │   └── realtimeCallConfig.ts # 实时通话配置
    ├── services/
    │   ├── memoryServiceClient.ts # 记忆服务客户端（IPC 桥接）
    │   └── conversationArchiveClient.ts # 对话归档客户端
    └── types/                # TypeScript 类型定义

docs/
├── dev/
│   ├── tool-system.md        # 工具系统架构文档
│   ├── voice-system.md       # 语音系统架构文档
│   ├── memory-system.md      # 记忆系统架构文档
│   ├── model-provider-and-context.md # 模型 Provider + 上下文工程文档
│   └── *.md                  # 其他设计文档
├── design/                   # UI/UX 设计文档
└── completed/                # 已完成功能记录

test/
├── unit/                     # 14 个单元测试文件
├── integration/              # 集成测试
└── e2e/                      # 端到端测试
```

## 上下文工程

每次请求发给模型的上下文由以下几层拼装：

1. **System Prompt**（动态重建）
   - `getNovaSystemPrompt()`：人设、性格、说话风格、核心原则
   - `buildEnvironmentContext()`：时间、平台、用户名、知识库数量、会话状态、自我认知（模型/TTS/ASR/工具数）
   - `memoryService.getMemoryPrompt(userInput)`：根据用户输入检索相关长期记忆
   - `skillInstructions`：当前激活技能的指令
   - `getToolGuidancePrompt()`：工具调用规则、能力边界
   - `getToolPromptSummary()`：28 个工具的名称和描述

2. **Conversation History**（最近 50 条）
   - `buildModelContextWithDiagnostics()`：归一化、MiMo reasoning 重放、图片附件处理
   - 只保留最新一轮 tool_calls + results，旧的摘要化

3. **Context Compaction**（按需）
   - 阈值：80K tokens × 80% = 64K
   - 保留最近 6 条，旧消息调 LLM 生成摘要
   - 工具结果超过 1500 tokens 自动截断

## RAG 知识库

完整链路：文件拖入 → parseFile 提取文本 → chunkText 分块 → embedText 向量化 → SQLite vec0 存储

- **解析**：documentParser.ts 支持 PDF/DOCX/XLSX/TXT/MD
- **分块**：标题感知分块（Markdown 标题 + 中文章节标题），800 字/块，150 字重叠
- **向量化**：paraphrase-multilingual-MiniLM-L12-v2（384 维，中文语义理解好）
- **存储**：SQLite vec0 虚拟表（向量 + 原文 + 元数据）
- **检索**：KNN 向量搜索 + 关键词 boost（每匹配一个关键词 -0.15 距离）
- **去重**：导入前按文件名删旧片段
- **入口**：知识库面板（永久存储）或对话框（解析为文本一次性发给模型）

## 工具系统

模型当前可见 28 个工具，按风险等级管理：
- `read`：读取类工具，自动执行并记录日志
- `low_write`：低风险写入，执行并记录日志
- `system`：系统级能力，高风险命令或敏感场景需要确认
- `destructive`：删除等不可逆操作，强确认
- `external_send`：对外发送类能力的预留等级，后续应强确认

工具定义在 `renderer/core/tools/toolRegistry.ts`。工具系统的层次、调用链路和新增规范见 `docs/dev/tool-system.md`。

## 多模型支持

三个 Provider：
- `doubao`：豆包（火山引擎）— 支持 text + image + tools
- `mimo`：小米 MiMo — mimo-v2.5 支持 image，mimo-v2.5-pro 不支持
- `openai-compatible`：通用 OpenAI 兼容

配置优先级：localStorage > .env > 代码默认值

切换模型：`renderer/core/model/modelRuntime.ts` 的 `syncProviderConfigForModel()`

图片路由：`resolveModelForRequest()` 检查整个历史是否有图片附件，有则自动路由到支持图片的模型

## 语音系统

双引擎架构，TTS 和 ASR 可独立切换：
- **火山引擎**：TTS WebSocket + ASR WebSocket，支持实时流式
- **MiMo**：小米自研 TTS/ASR
- **模式**：半双工语音对话（VoiceChatMode）+ 实时语音通话（RealtimeCallMode）

详见 `docs/dev/voice-system.md`

## 开发规范

### 代码风格
- 写中文注释，关键设计决策和模块职责必须说明
- 优先使用 `utils/storage.ts` 里的工具函数（readStored/writeStored/upsertById）
- 组件用 CSS Modules，不用内联样式

### 架构约束
- `main/` 下的工具需要通过 preload IPC 调用，不能直接在 renderer 使用
- `renderer/` 不能直接用 fs、child_process 等 Node.js API
- 模型 Provider 统一走 `core/model/index.ts` 的 getModelProvider()
- 工具注册在 `core/tools/toolRegistry.ts`，不要在其他地方单独注册

### Git 提交
- 使用中文提交信息
- 格式：`type: 简短描述`
- 类型：feat / fix / refactor / docs / chore

## 注意事项

- 流式输出期间不要写 localStorage（性能问题）
- 消息合并使用 `upsertById()` 工具函数
- 启动时需要恢复历史消息（hydratedChatIdRef 机制）
- `qiyuan.*` 是旧的 localStorage 键，已迁移到 `nova.*`
- MiMo Provider 需要重放 reasoning_content 给 tool_calls（否则 MiMo 不认）
- MiMo mimo-v2.5-pro 不支持图片，有图片时自动路由到 mimo-v2.5
- RAG embedding 模型首次下载约 120MB，之后离线可用
- embedding 模型加载失败会静默降级为关键词搜索，UI 会显示警告
