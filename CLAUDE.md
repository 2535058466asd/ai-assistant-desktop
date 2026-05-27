# CLAUDE.md — Nova AI 工作台项目指南

## 项目概述

Nova 是一个基于 Electron + React + TypeScript 的桌面 AI 工作台，定位为办公 AI Agent（不是代码助手）。核心能力：RAG 知识库、长期记忆、Function Calling 工具系统、多模型支持、语音交互和 traceId 可观测日志。

## 技术栈

- **前端**: React 18 + TypeScript + Vite + CSS Modules
- **桌面端**: Electron 33
- **向量库**: ChromaDB (本地)
- **记忆**: SQLite
- **模型**: 豆包 / MiMo / OpenAI-compatible

## 常用命令

```bash
# 开发
npm run electron:dev          # 启动开发模式（Vite + Electron）

# 构建
npm run build                 # 生产构建
npm run electron:build        # 打包 Electron 应用

# 类型检查
npx tsc --noEmit              # 检查 TypeScript 错误
```

## 目录结构

```
src/
├── main/                     # Electron 主进程（Node.js 环境）
│   ├── tools/                # 主进程工具实现（文件、网页、剪贴板、系统、RAG等）
│   └── services/             # 主进程服务（RAG、记忆、TTS/ASR）
├── preload/
│   └── preload.ts            # IPC 安全桥接（白名单 API）
└── renderer/                 # 渲染进程（React，浏览器环境）
    ├── core/                 # 核心 AI 逻辑
    │   ├── orchestrator.ts   # 入口：流程编排
    │   ├── agent/            # AgentLoop：Function Calling 循环
    │   ├── model/            # 模型抽象层（Provider 模式）
    │   ├── tools/            # 工具定义和执行
    │   ├── history/          # 历史管理
    │   ├── context/          # 上下文压缩
    │   └── events/           # 事件桥接
    ├── components/           # React UI 组件
    ├── config/               # 配置文件
    ├── services/             # 渲染进程服务
    └── utils/                # 工具函数（storage.ts）
```

## 开发规范

### 代码风格
- 不写注释，除非有隐藏的 why（工作区、特殊约束）
- 优先使用 `utils/storage.ts` 里的工具函数（readStored/writeStored/upsertById）
- 组件用 CSS Modules，不用内联样式

### 架构约束
- `main/` 下的工具需要通过 preload IPC 调用，不能直接在 renderer 使用
- `renderer/` 不能直接用 fs、child_process 等 Node.js API
- 模型 Provider 统一走 `core/model/index.ts` 的 getModelProvider()
- 工具注册在 `core/tools/toolRegistry.ts`，不要在其他地方单独注册

### Git 提交
- 使用英文提交信息
- 格式：`type: 简短描述`
- 类型：feat / fix / refactor / docs / chore

## 工具系统

模型当前可见 24 个工具，按风险等级管理：
- `read`：读取类工具，自动执行并记录日志
- `low_write`：低风险写入，执行并记录日志
- `system`：系统级能力，高风险命令或敏感场景需要确认
- `destructive`：删除等不可逆操作，强确认
- `external_send`：对外发送类能力的预留等级，后续应强确认

工具定义在 `renderer/core/tools/toolRegistry.ts`。工具系统的层次、调用链路和新增规范见 `docs/dev/tool-system.md`。

## 多模型支持

三个 Provider：
- `doubao`：豆包（火山引擎）
- `mimo`：小米 MiMo
- `openai-compatible`：通用 OpenAI 兼容

配置优先级：localStorage > .env > 代码默认值

切换模型：`renderer/core/model/modelRuntime.ts` 的 `syncProviderConfigForModel()`

## 注意事项

- 流式输出期间不要写 localStorage（性能问题）
- 消息合并使用 `upsertById()` 工具函数
- 启动时需要恢复历史消息（hydratedChatIdRef 机制）
- `qiyuan.*` 是旧的 localStorage 键，已迁移到 `nova.*`
