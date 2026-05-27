# Agentic Personal Workspace（Nova）

一个基于 Electron + React + TypeScript 的个人 AI 工作台。项目定位不是普通聊天助手，而是面向个人项目管理的 Agentic AI Workspace：支持 RAG 知识库、长期记忆、项目连续性、工具调用、调用日志、Eval 面板和桌面端部署。

这个项目用于展示应用层 AI 工程能力：把 LLM 接入真实产品系统，并让系统可维护、可观察、可评估。

## 当前定位

Nova 是一个桌面办公 AI Agent，不是代码助手。第一阶段能力边界是文件、知识库、剪贴板、网页搜索、任务管理和轻量系统控制；不做自动写代码、连续键鼠桌控、自动发消息或高风险系统操作。

## 快速启动

```bash
npm install
copy .env.example .env
npm run electron:dev
```

`npm run electron:dev` 会启动 Vite 开发服务器作为 Electron 渲染进程，但不会打开浏览器；它只会打开 Nova 桌面端窗口。`npm run dev` 只启动 Vite，适合单独调试前端渲染层。开发环境下可用 `F12` 或 `Ctrl+Shift+I` 重新打开/关闭桌面端 DevTools。

生产构建检查：

```bash
npm run build
```

## Provider 配置

当前支持三个模型 Provider：豆包、小米 MiMo 和通用 OpenAI-compatible 服务。设置页保存到 localStorage 的配置优先于 `.env`，因此日常切换模型不需要改环境变量或重启应用。

```env
VITE_MODEL_PROVIDER=doubao
VITE_DOUBAO_API_KEY=
VITE_DOUBAO_MODEL=doubao-seed-2-0-pro-260215

VITE_OPENAI_COMPATIBLE_BASE_URL=
VITE_OPENAI_COMPATIBLE_API_KEY=
VITE_OPENAI_COMPATIBLE_MODEL=

VITE_MIMO_BASE_URL=
VITE_MIMO_API_KEY=
VITE_MIMO_MODEL=
```

推荐把 `.env` 当作默认值，把设置页当作运行时配置入口。模型切换、上下文和长期记忆的细节见 [docs/dev/model-provider-and-context.md](docs/dev/model-provider-and-context.md)。

## Demo 场景

1. **知识库问答**：导入一份 PDF/Word/Excel/TXT/MD，提问后展示检索片段、来源、分类和 chunk 信息。
2. **本地文件助手**：让 Agent 读取一个本地文本文件，总结内容，并把下一步记录到任务面板。
3. **剪贴板助手**：读取剪贴板内容，让 Agent 分析报错、英文文本或网页片段，并给出建议。

## 安全边界

工具按风险等级管理：

- `read`：读取类工具，自动执行。
- `low_write`：低风险写入，执行并记录日志。
- `system`：打开应用、系统命令，执行前确认。
- `destructive`：删除、批量移动、覆盖等，默认禁止或强确认。
- `external_send`：发消息、发邮件、提交表单，强确认。

渲染进程只通过 preload 暴露的白名单 IPC 调用主进程能力；不暴露任意 `invoke(channel)`。

## 开发规则

较大功能开发前先做轻量调研，记录到 [docs/development-research.md](docs/development-research.md)：

- 查 2-3 个成熟 GitHub 项目或官方文档。
- 只吸收适合本项目的架构和接口设计。
- 不为了追框架而全面迁移 LangChain；复杂工作流后续再考虑局部引入 LangGraph 思想。

---

## 核心能力

### 项目驾驶舱
- 首页展示项目状态、下一步、阻塞点、任务队列、最近记忆和知识库统计
- 内置 `Project` / `Task` 数据模型，支持 Agent 通过工具创建任务、更新项目
- 适合展示“AI 持续管理项目上下文”，而不是单轮问答

### RAG 知识库
- 支持 PDF、Word、Excel、TXT、Markdown 和图片识别导入
- 文档解析后按 chunk 切分，写入 ChromaDB 向量库
- 检索结果带来源、分类和相似度，设置页提供检索调试入口

### 长期记忆
- 使用 SQLite 持久化记忆，支持查看、搜索、删除和清空
- 记忆包含类别、重要性、更新时间、访问次数
- 对话结束后自动提取关键事实，下一轮对话可注入相关记忆

### Agent 工具调用
- **Function Calling 全链路**：AI 推理 → 工具执行 → 结果返回 → 继续推理
- **系统工具**：文件操作、网页搜索/抓取、应用启动、剪贴板等
- **知识库工具**：知识库搜索、文档导入、图片识别导入
- **工作台工具**：创建任务、更新项目状态/下一步/阻塞点
- **多工具自动编排**：AI 自主决定调用顺序，无需人工编排
- **可观测性**：每次工具调用记录工具名、参数摘要、结果摘要、状态和耗时

### Eval 评估面板
- 内置 20 条测试问题，覆盖 RAG、记忆、工具调用、规划和安全
- 支持按类别筛选、标记通过/失败、复制 Eval Set
- 用于面试展示“不是凭感觉判断回答好坏，而是有固定评估集”

### 语音交互
- **ASR 管理器**：当前可使用浏览器 Web Speech，后续保留云端 ASR Provider 扩展点
- **TTS 管理器**：支持豆包语音和 MiMo TTS 调研路径，当前优先保持稳定链路
- **半双工对话模式**：类对讲机，ASR → LLM → TTS 完整链路
- **阶段策略**：语音交互暂不追全双工，优先稳定文本对话、模型切换和上下文

### 桌面原生能力
- **智能应用启动**：注册表 → 开始菜单 → 兜底三级查找（含命令注入防护）
- **文件操作**：读写、列目录、按名搜索、按内容搜索
- **路径自动映射**：`/Desktop/` 自动转为用户真实桌面路径
- **剪贴板读写**

---

## 技术栈

| 技术 | 用途 |
|------|------|
| **Electron** | 桌面应用框架（主进程/渲染进程/IPC） |
| **React** + **TypeScript** | 前端 UI 框架 |
| **Vite** | 构建工具 |
| **CSS Modules** | 样式隔离 |
| **豆包 API** | 大模型对话 + Function Calling |
| **小米 MiMo** | OpenAI-compatible 聊天、推理内容和多模态/语音调研 |
| **OpenAI-compatible Provider** | 兼容 DeepSeek、OpenRouter、本地代理等服务 |
| **火山引擎** | 豆包语音 TTS / ASR 调研与接入 |
| **ChromaDB** | 本地向量知识库 |
| **SQLite** | 长期记忆持久化 |
| **pdf-parse / mammoth / xlsx** | 文档解析 |

---

## 项目结构

```
nova/
├── src/
│   ├── main/                          # Electron 主进程
│   │   ├── index.ts                   # 主进程入口（窗口创建、生命周期）
│   │   ├── tools/                     # 工具模块
│   │   │   ├── index.ts               # 工具注册中心 registerAllTools()
│   │   │   ├── execCommand.ts         # exec_command（系统命令执行）
│   │   │   ├── fileOps.ts             # read/write/list/search/grep（文件操作）
│   │   │   ├── webTools.ts            # web_search/web_fetch（搜索与抓取）
│   │   │   ├── clipboard.ts           # clipboard_read/write（剪贴板）
│   │   │   ├── ragTools.ts            # knowledge_*（知识库工具）
│   │   │   └── openApp.ts             # open_app（智能应用启动）
│   │   └── services/                  # 主进程服务
│   │       ├── memoryServiceBackend.ts # 记忆服务
│   │       ├── ragService.ts          # ChromaDB RAG 服务
│   │       ├── documentParser.ts      # 文档解析与 chunk
│   │       └── imageRecognizer.ts     # 图片识别导入
│   │
│   ├── preload/                       # 预加载脚本
│   │   └── preload.ts                 # IPC 桥接（工具、模型代理、主进程能力）
│   │
│   └── renderer/                      # 渲染进程（React）
│       ├── components/                # React 组件
│       │   ├── Workspace/             # 项目驾驶舱
│       │   ├── Knowledge/             # RAG 知识库面板
│       │   ├── Memory/                # 长期记忆面板
│       │   ├── Observability/         # Agent 工具调用日志
│       │   ├── Eval/                  # Eval 测试集面板
│       │   ├── sidebar/               # 侧边栏（对话管理）
│       │   ├── header/                # 顶部栏（模型切换、主题、设置）
│       │   ├── chat/                  # 聊天区域
│       │   ├── Settings/              # 设置面板
│       │   └── AppLayout/             # 整体布局
│       ├── core/
│       │   ├── orchestrator.ts        # 核心编排器（Agent循环）
│       │   ├── history/               # 短期上下文与对话历史
│       │   ├── model/                 # Provider 抽象与模型传输
│       │   ├── tools/                 # 工具定义与执行
│       │   │   ├── toolRegistry.ts    # 工具 schema、风险元数据和执行映射
│       │   │   └── toolExecutor.ts    # 工具分发、日志和结果处理
│       │   ├── tts/                   # TTS 管理器
│       │   ├── asr/                   # ASR 管理器
│       │   └── voiceChat/             # 语音对话模式
│       ├── services/                  # 渲染进程服务和本地 workspace store
│       ├── config/                    # 配置文件
│       └── types/                     # TypeScript 类型定义
```

---

## 工具清单

| 工具 | 类别 | 说明 |
|------|------|------|
| `exec_command` | 系统 | 执行终端命令 |
| `read_file` | 文件 | 读取文件内容 |
| `write_file` | 文件 | 写入文件 |
| `create_dir` | 文件 | 创建目录 |
| `copy_file` | 文件 | 复制文件或目录 |
| `move_file` | 文件 | 移动或重命名文件/目录 |
| `delete_file` | 文件 | 删除文件或目录（强确认） |
| `list_dir` | 文件 | 列出目录内容 |
| `search_files` | 文件 | 按文件名搜索（支持通配符） |
| `grep_content` | 文件 | 按内容搜索文件 |
| `web_search` | 网页 | 后台静默搜索（多源降级） |
| `web_fetch` | 网页 | 抓取网页纯文本内容（含 SSRF 防护） |
| `clipboard_read` | 剪贴板 | 读取剪贴板 |
| `clipboard_write` | 剪贴板 | 写入剪贴板 |
| `open_app` | 应用 | 智能打开应用或网页（含命令注入防护） |
| `notify` | 系统 | 发送系统通知 |
| `get_current_time` | 系统 | 获取当前时间 |
| `get_system_info` | 系统 | 获取系统信息 |
| `knowledge_search` | RAG | 检索本地知识库 |
| `knowledge_add` | RAG | 添加知识片段 |
| `knowledge_import_file` | RAG | 导入 PDF/Word/Excel/TXT/MD |
| `knowledge_import_image` | RAG | 识别图片并导入知识库 |
| `workspace_create_task` | 项目管理 | 创建项目任务 |
| `workspace_update_project` | 项目管理 | 更新项目状态、下一步、阻塞点 |

工具系统的分层设计、风险等级和新增工具规范见 [docs/dev/tool-system.md](docs/dev/tool-system.md)。

---

## 架构设计

### 工具调用流程

```
用户输入（语音/文字）
    ↓
ASR（语音识别）→ 文字
    ↓
Orchestrator（编排器）→ 构建系统提示词 + 对话历史
    ↓
ModelProvider（豆包 / MiMo / OpenAI-compatible）
    ↓
AI 决定调用哪些工具（自动编排，最多5轮）
    ↓
toolExecutor 分发 → preload IPC → 主进程 tools/
    ↓
写入工具调用日志（状态、耗时、参数摘要、结果摘要）
    ↓
工具执行结果返回给 AI
    ↓
AI 继续推理（可能调用更多工具）
    ↓
最终回复 → TTS（语音合成）→ 播放
```

### 数据流与状态

```
前端（React）
  ↕ props/callbacks
App.tsx（状态管理）
  ↕ ref
Orchestrator（AI编排 + ContextManager）
  ↕ ModelProvider
modelTransport（主进程代理请求）
  ↕ IPC (preload)
主进程（Electron）
  ↕ HTTPS / 系统调用
模型 API / 操作系统

本地持久化：
- localStorage：项目、任务、工具调用日志、Eval Set
- SQLite：长期记忆
- ChromaDB：RAG 向量知识库
```

---

## 快速开始

### 前置要求
- Node.js 18+
- npm

### 安装依赖
```bash
npm install
```

### 开发模式启动
```bash
npm run electron:dev
```

### 构建生产版本
```bash
npm run electron:build
```

---

## 面试展示建议

1. 打开首页项目驾驶舱，展示项目状态、下一步、阻塞点和任务队列。
2. 在知识库导入一份 PDF 或 Markdown，搜索问题并展示来源引用。
3. 发起需要工具的对话，例如读取文件、搜索文件或创建任务，然后打开 Agent 日志查看调用链。
4. 打开 Eval 面板，说明如何用 20 条测试问题评估 RAG、记忆、工具调用和安全。
5. 讲清楚工程边界：模型、embedding、向量库用成熟轮子；业务状态、编排、可观测和评估由项目实现。

---

## 已知限制 & 待优化

| 项目 | 说明 | 优先级 |
|------|------|--------|
| 多 Provider 稳定性 | 豆包、MiMo、OpenAI-compatible 的模型名、鉴权和错误提示还需要继续收敛 | 高 |
| reasoning_content 展示 | MiMo thinking mode 会返回 `reasoning_content`，前端展示和多轮传回仍需打磨 | 高 |
| Eval 自动化 | 当前 Eval 面板支持测试集管理和人工标注，后续可接 LLM-as-judge | 高 |
| 引用结构化 | RAG 检索结果已有来源文本，后续可将 citation 结构化到消息 UI | 高 |
| 成本统计 | 工具日志已有耗时，后续可加入 token 和人民币成本估算 | 中 |
| 语音实时性 | 当前先保持半双工链路稳定，不追全双工和边生成边播放 | 中 |
| 模型随对话保存 | 切换对话后是否恢复当时模型，需要产品决策和实现 | 低 |

---

## 📄 License

MIT

---

## 👤 作者

李子豪 — 独立开发
