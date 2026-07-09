# Nova

Nova 是一个本地优先的桌面 AI Agent 工作台，基于 Electron、React 和 TypeScript 构建。它将多模型对话、Agent 工具调用、本地 RAG 知识库、长期记忆、语音交互和运行观测整合在一个桌面应用中，目标是提供一个可配置、可扩展、可观察的个人 AI 工作环境。

## 核心功能

| 能力 | 说明 |
| --- | --- |
| 多模型对话 | 支持豆包、小米 MiMo、DeepSeek 以及 OpenAI-compatible 接口 |
| Agent 工具调用 | 通过工具 schema、参数校验、执行器和风险分级调用本地能力 |
| 本地 RAG 知识库 | 支持 PDF、DOCX、Excel、TXT、Markdown、图片等资料导入、切片、向量化和检索 |
| 长期记忆 | 支持偏好、事实、项目、决策等信息的保存、去重、合并和上下文注入 |
| 语音交互 | 支持 ASR / TTS 语音输入输出，可配置不同语音引擎 |
| Runtime 观测 | 查看工具调用、Token 用量、耗时、失败记录和运行日志 |
| 桌面安全边界 | Renderer 通过 Preload 白名单 API 访问文件、数据库、网络和语音能力 |
| 自定义窗口 | 使用 Electron 无边框窗口，由 React 绘制自定义标题栏和窗口控制按钮 |

## 截图

TODO: 添加应用主界面、知识库、工具调用和运行观测截图。

## 技术栈

| 模块 | 技术 |
| --- | --- |
| 桌面端 | Electron |
| 前端 | React + TypeScript + CSS Modules |
| 构建 | Vite |
| 模型接口 | OpenAI-compatible Chat Completions |
| RAG | SQLite + sqlite-vec + @huggingface/transformers |
| 文档解析 | pdf-parse、mammoth、xlsx |
| 记忆 | SQLite + FTS + 去重合并策略 |
| 语音 | 豆包 ASR/TTS、小米 MiMo ASR/TTS |

## 架构概览

```text
┌────────────────────────────────────────────────────────────┐
│ Renderer                                                    │
│ React UI / Chat / Knowledge / Memory / Tools / Runtime      │
└──────────────────────────────┬─────────────────────────────┘
                               │ window.electronAPI
┌──────────────────────────────▼─────────────────────────────┐
│ Preload                                                     │
│ contextBridge 白名单 API                                    │
└──────────────────────────────┬─────────────────────────────┘
                               │ ipcRenderer.invoke
┌──────────────────────────────▼─────────────────────────────┐
│ Main Process                                                │
│ 文件系统 / SQLite / RAG / ASR / TTS / WebSocket / 工具执行    │
└────────────────────────────────────────────────────────────┘
```

Renderer 不直接访问 Node.js、密钥或文件系统，所有敏感能力通过 Preload 暴露的白名单接口转发到主进程执行。

## 关键链路

### 多模型 Provider

Nova 使用统一的 Provider 层适配不同模型服务，支持：

- OpenAI-compatible `/chat/completions`
- 流式输出
- Function Calling / Tool Calling
- 模型切换
- 请求、响应和异常日志追踪

### Agent 工具调用

工具系统由工具定义、参数校验、风险分级和执行器组成。当前工具能力覆盖：

- 文件读取、写入、搜索和目录操作
- 网页搜索与网页抓取
- 剪贴板读取和写入
- 本地知识库检索
- 长期记忆写入和查询
- 系统信息、通知和应用打开

高风险工具会通过风险分级机制进行限制，避免模型直接执行破坏性操作。

### 本地 RAG 知识库

RAG 链路分为入库和查询两部分：

```text
资料导入
→ 文档解析
→ 文本清洗
→ 内容切片
→ Embedding 向量化
→ SQLite + sqlite-vec 存储
→ 用户问题向量化
→ 相似度检索
→ 命中片段注入上下文
→ 模型生成回答
```

知识片段会记录 `source`、`chunkId`、`category`、`distance` 等信息，便于调试检索命中情况。

### 长期记忆

长期记忆用于保存对话中沉淀的用户偏好、事实、项目和决策信息。写入时会进行基础治理：

- 内容规范化
- 相似内容去重
- 同一 memory key 的合并与替换
- 重要记忆常驻注入
- 相关记忆按用户输入检索注入

### Runtime 观测

Runtime 页面用于观察运行过程中的关键数据：

- 工具调用成功 / 失败次数
- 工具平均耗时
- Token 用量和费用趋势
- 模型请求、工具调用、RAG 检索等日志

## 项目结构

```text
src/
  main/
    index.ts                         # Electron 主进程入口
    ipc/                             # IPC 处理器
    services/
      ragService.ts                  # RAG：SQLite + sqlite-vec 检索
      documentParser.ts              # PDF / DOCX / Excel / TXT / MD 解析与切片
      memory/                        # 长期记忆存储与治理
      asr/                           # ASR 服务
      tts/                           # TTS 服务
    tools/                           # 主进程本地工具

  preload/
    preload.ts                       # contextBridge 白名单 API

  renderer/
    App.tsx                          # 渲染进程入口组件
    components/
      AppLayout/                     # 应用整体布局和自定义窗口标题栏
      chat/                          # 聊天界面
      input/                         # 输入区
      sidebar/                       # 对话侧栏
      Knowledge/                     # 知识库管理
      Memory/                        # 记忆管理
      Tools/                         # 工具管理
      Runtime/                       # 工具调用与 Token 观测
      Settings/                      # 模型、语音、提示词和快捷键配置
      Workspace/                     # 工作台概览
    core/
      agent/                         # Agent 循环
      model/                         # 多模型 Provider 和流式解析
      tools/                         # 工具注册与执行器
      memory/                        # 记忆提取与上下文构建
      cost/                          # Token 用量追踪
      conversation/                  # 会话上下文
    config/
      modelConfig.ts                 # 模型配置
      modelCatalog.ts                # 模型目录
```

## 快速开始

### 环境要求

- Node.js 18+
- npm
- Windows / macOS / Linux 桌面环境

### 安装依赖

```bash
npm install
```

### 配置环境变量

复制 `.env.example`：

```bash
cp .env.example .env
```

根据需要填写模型、ASR、TTS 等服务配置。

### 启动开发环境

```bash
npm run electron:dev
```

### 构建

```bash
npm run build
npm run build:node
```

或直接执行：

```bash
npm run electron:build
```

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务 |
| `npm run build` | 构建 Renderer |
| `npm run build:node` | 构建 Electron Main / Preload |
| `npm run electron:dev` | 启动桌面端开发环境 |
| `npm run electron:build` | 构建桌面应用 |
| `npm run test` | 运行测试 |

## 配置说明

Nova 的模型配置主要通过应用设置页和本地存储管理。不同能力可能还需要在 `.env` 中配置：

- 模型 API Key / Base URL
- 豆包 ASR / TTS 配置
- 小米 MiMo ASR / TTS 配置
- 搜索服务配置

本地数据库、聊天记录、知识库和记忆数据会写入 Electron 的 `userData` 目录。

## 当前状态

Nova 仍在持续开发中，部分能力仍处于实验阶段，接口和交互可能继续调整。当前重点包括：

- 稳定多模型和工具调用链路
- 完善本地 RAG 的导入、检索和调试体验
- 优化长期记忆的提取、去重和注入策略
- 改进 Runtime 观测面板
- 完善桌面端窗口体验和整体 UI

## 路线图

- [ ] 补充项目截图和演示说明
- [ ] 增强 RAG 命中调试与评估能力
- [ ] 支持更多文件类型和结构化资料导入
- [ ] 增加工具调用权限配置
- [ ] 完善模型费用统计和导出
- [ ] 优化语音对话的中断、续说和状态反馈
- [ ] 完善打包和自动更新流程

## License

MIT
