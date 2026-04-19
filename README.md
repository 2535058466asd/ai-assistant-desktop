# 启源 AI 助手（Nova）- 桌面端智能助手

一个基于 Electron + React + TypeScript 的桌面 AI Agent 助手，集成 LLM/ASR/TTS 实现多模态交互，基于 Function Calling 实现多工具自动编排，支持语音对话与系统控制。

---

## ✨ 核心特性

### 🤖 AI Agent 工具调用
- **Function Calling 全链路**：AI 推理 → 工具执行 → 结果返回 → 继续推理
- **16 个系统工具**：文件操作、网页搜索/抓取、应用启动、剪贴板、截图等
- **多工具自动编排**：AI 自主决定调用顺序，无需人工编排
- **模块化架构**：工具独立文件，支持热扩展

### 🔍 后台静默搜索
- **多源降级策略**：百度 → 必应，自动切换
- **HTML 转纯文本**：不依赖正则解析，稳定可靠
- **网页内容抓取**：AI 可自主获取任意网页内容（含 SSRF 防护）

### 🎙️ 语音交互
- **流式语音识别（ASR）**：对接火山引擎 WebSocket 二进制协议
- **流式语音合成（TTS）**：实时音频播放，低延迟
- **半双工对话模式**：类对讲机，ASR → LLM → TTS 完整链路
- **音频采集与编码**：PCM/Float32 → Int16，GZIP 压缩

### 🖥️ 桌面原生能力
- **智能应用启动**：注册表 → 开始菜单 → 兜底三级查找（含命令注入防护）
- **文件操作**：读写、列目录、按名搜索、按内容搜索
- **路径自动映射**：`/Desktop/` 自动转为用户真实桌面路径
- **剪贴板读写**、**屏幕截图**

### 🧠 记忆与上下文管理
- **三层分离架构**：短期上下文（自动压缩）+ 记忆库（AI自动提取持久化）+ 知识库（用户上传RAG检索）
- **上下文自动压缩**：接近token上限时AI自动压缩历史，保留最近对话+压缩摘要
- **记忆自动提取**：对话中自动识别并存储用户偏好、项目信息等关键事实
- **长期记忆持久化**：跨会话保留，下次对话自动注入上下文

### 🎨 桌面客户端 UI
- **侧边栏**：对话管理（新建/搜索/重命名/删除/置顶）、三点菜单、右键菜单
- **聊天区域**：Markdown 渲染、代码高亮、消息复制
- **设置面板**：主题切换（暗色/亮色）、模型切换
- **Toast 通知**：关键操作反馈（语音状态、复制结果、错误提示）

---

## 🛠️ 技术栈

| 技术 | 用途 |
|------|------|
| **Electron** | 桌面应用框架（主进程/渲染进程/IPC） |
| **React** + **TypeScript** | 前端 UI 框架 |
| **Vite** | 构建工具 |
| **CSS Modules** | 样式隔离 |
| **豆包 API** | 大模型对话 + Function Calling（doubao-seed-2-0-pro） |
| **火山引擎** | 流式 TTS / ASR（WebSocket 二进制协议） |
| **iconv-lite** | Windows GBK 编码处理 |

---

## 📁 项目结构

```
ai-assistant-desktop/
├── src/
│   ├── main/                          # Electron 主进程
│   │   ├── index.ts                   # 主进程入口（窗口创建、生命周期）
│   │   ├── tools/                     # 工具模块（12个工具）
│   │   │   ├── index.ts               # 工具注册中心 registerAllTools()
│   │   │   ├── execCommand.ts         # exec_command（系统命令执行）
│   │   │   ├── fileOps.ts             # read/write/list/search/grep（文件操作）
│   │   │   ├── webTools.ts            # web_search/web_fetch（搜索与抓取）
│   │   │   ├── clipboard.ts           # clipboard_read/write（剪贴板）
│   │   │   ├── screenshot.ts          # screenshot（屏幕截图）
│   │   │   └── openApp.ts             # open_app（智能应用启动）
│   │   └── services/                  # 主进程服务
│   │       ├── doubaoApi.ts           # 豆包 API
│   │       ├── memoryServiceBackend.ts # 记忆服务
│   │       ├── screenshotService.ts   # 截图服务
│   │       ├── tts/                   # TTS 模块
│   │       └── asr/                   # ASR 模块
│   │
│   ├── preload/                       # 预加载脚本
│   │   └── preload.ts                 # IPC 桥接（12个工具 API）
│   │
│   └── renderer/                      # 渲染进程（React）
│       ├── components/                # React 组件
│       │   ├── sidebar/               # 侧边栏（对话管理）
│       │   ├── header/                # 顶部栏（模型切换、主题、设置）
│       │   ├── chat/                  # 聊天区域
│       │   ├── Settings/              # 设置面板
│       │   ├── WelcomeScreen/         # 欢迎页
│       │   └── AppLayout/             # 整体布局
│       ├── core/
│       │   ├── orchestrator.ts        # 核心编排器（Agent循环）
│       │   ├── tools/                 # 工具定义与执行
│       │   │   ├── toolDefinitions.ts # 16个工具的 JSON Schema
│       │   │   └── toolExecutor.ts    # 工具分发与结果处理
│       │   ├── tts/                   # TTS 管理器
│       │   ├── asr/                   # ASR 管理器
│       │   └── voiceChat/             # 语音对话模式
│       ├── services/                  # 渲染进程服务
│       ├── config/                    # 配置文件
│       └── types/                     # TypeScript 类型定义
```

---

## 🔧 16 个工具

| 工具 | 类别 | 说明 |
|------|------|------|
| `exec_command` | 系统 | 执行终端命令 |
| `read_file` | 文件 | 读取文件内容 |
| `write_file` | 文件 | 写入文件（自动创建目录、路径映射） |
| `list_dir` | 文件 | 列出目录内容 |
| `search_files` | 文件 | 按文件名搜索（支持通配符） |
| `grep_content` | 文件 | 按内容搜索文件 |
| `web_search` | 网页 | 后台静默搜索（多源降级） |
| `web_fetch` | 网页 | 抓取网页纯文本内容（含 SSRF 防护） |
| `clipboard_read` | 剪贴板 | 读取剪贴板 |
| `clipboard_write` | 剪贴板 | 写入剪贴板 |
| `screenshot` | 截图 | 屏幕截图 |
| `open_app` | 应用 | 智能打开应用或网页（含命令注入防护） |

---

## 🏗️ 架构设计

### 工具调用流程

```
用户输入（语音/文字）
    ↓
ASR（语音识别）→ 文字
    ↓
Orchestrator（编排器）→ 构建系统提示词 + 对话历史
    ↓
豆包 API（Function Calling）
    ↓
AI 决定调用哪些工具（自动编排，最多5轮）
    ↓
toolExecutor 分发 → preload IPC → 主进程 tools/
    ↓
工具执行结果返回给 AI
    ↓
AI 继续推理（可能调用更多工具）
    ↓
最终回复 → TTS（语音合成）→ 播放
```

### 数据流

```
前端（React）
  ↕ props/callbacks
App.tsx（状态管理）
  ↕ ref
Orchestrator（AI编排）
  ↕ fetch
豆包 API
  ↕ IPC (preload)
主进程（Electron）
  ↕ 系统调用
操作系统
```

---

## 🚀 快速开始

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

## 📋 已知限制 & 待优化

| 项目 | 说明 | 优先级 |
|------|------|--------|
| 假流式输出 | 当前为 `stream: false`，等待完整响应后一次性显示 | 高 |
| 设置面板空壳 | 6个子页面均为占位文字 | 中 |
| 废弃代码层 | IntentClassifier/ContextManager/WakeWordDetector 未清理 | 低 |
| 模型不随对话保存 | 切换对话后模型选择不恢复 | 低 |

---

## 📄 License

MIT

---

## 👤 作者

李子豪 — 独立开发
