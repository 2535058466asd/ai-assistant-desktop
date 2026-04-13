# 启源 AI 助手 - 桌面端智能助手

一个基于 Electron + React + TypeScript 的桌面 AI Agent 助手，集成 LLM/ASR/TTS 实现多模态交互，基于 Function Calling 实现多工具自动编排，支持语音对话与系统控制。

---

## ✨ 核心特性

### 🤖 AI Agent 工具调用
- **Function Calling 全链路**：AI 推理 → 工具执行 → 结果返回 → 继续推理
- **12 个系统工具**：文件操作、网页搜索/抓取、应用启动、剪贴板、截图等
- **多工具自动编排**：AI 自主决定调用顺序，无需人工编排
- **模块化架构**：工具独立文件，支持热扩展

### 🔍 后台静默搜索
- **多源降级策略**：SearXNG → 百度 → 必应，自动切换
- **HTML 转纯文本**：不依赖正则解析，稳定可靠
- **网页内容抓取**：AI 可自主获取任意网页内容

### 🎙️ 语音交互
- **流式语音识别（ASR）**：对接火山引擎 WebSocket 二进制协议
- **流式语音合成（TTS）**：实时音频播放，低延迟
- **半双工对话模式**：类对讲机，ASR → LLM → TTS 完整链路
- **音频采集与编码**：PCM/Float32 → Int16，GZIP 压缩

### 🖥️ 桌面原生能力
- **智能应用启动**：注册表 → 开始菜单 → 兜底三级查找
- **文件操作**：读写、列目录、按名搜索、按内容搜索
- **路径自动映射**：`/Desktop/` 自动转为用户真实桌面路径
- **剪贴板读写**、**屏幕截图**

### 🎨 悬浮球 UI
- **Canvas 2D 高级渲染**：液态生命风格
- **4 种状态**：待机 / 聆听 / 思考 / 说话，实时动态切换
- **分形噪声变形 + 多层 3D 球体渲染**

### 🧠 记忆系统
- **用户偏好自动提取**：聊天时自动识别并存储
- **长期记忆持久化**：JSON 本地存储
- **上下文管理**：50 条会话记忆 + 记忆注入

---

## 🛠️ 技术栈

| 技术 | 用途 |
|------|------|
| **Electron** | 桌面应用框架（主进程/渲染进程/IPC） |
| **React** + **TypeScript** | 前端 UI 框架 |
| **Vite** | 构建工具 |
| **Canvas 2D** | 悬浮球动画渲染 |
| **豆包 API** | 大模型对话 + Function Calling |
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
│       ├── core/
│       │   ├── tools/                 # 工具定义与执行
│       │   │   ├── toolDefinitions.ts # 12个工具的 JSON Schema
│       │   │   └── toolExecutor.ts    # 工具分发与结果处理
│       │   ├── orchestrator.ts        # 核心编排器
│       │   ├── tts/                   # TTS 管理器
│       │   └── asr/                   # ASR 管理器
│       ├── services/                  # 渲染进程服务
│       ├── config/                    # 配置文件
│       └── types/                     # TypeScript 类型定义
```

---

## 🔧 12 个工具

| 工具 | 类别 | 说明 |
|------|------|------|
| `exec_command` | 系统 | 执行终端命令（带安全限制） |
| `read_file` | 文件 | 读取文件内容 |
| `write_file` | 文件 | 写入文件（自动创建目录、路径映射） |
| `list_dir` | 文件 | 列出目录内容 |
| `search_files` | 文件 | 按文件名搜索（支持通配符） |
| `grep_content` | 文件 | 按内容搜索文件 |
| `web_search` | 网页 | 后台静默搜索（多源降级） |
| `web_fetch` | 网页 | 抓取网页纯文本内容 |
| `clipboard_read` | 剪贴板 | 读取剪贴板 |
| `clipboard_write` | 剪贴板 | 写入剪贴板 |
| `screenshot` | 截图 | 屏幕截图 |
| `open_app` | 应用 | 智能打开应用或网页 |

---

## 🏗️ 架构设计

### 工具调用流程

```
用户输入（语音/文字）
    ↓
ASR（语音识别）→ 文字
    ↓
豆包 API（Function Calling）
    ↓
AI 决定调用哪些工具（自动编排）
    ↓
toolExecutor 分发 → preload IPC → 主进程 tools/
    ↓
工具执行结果返回给 AI
    ↓
AI 继续推理（可能调用更多工具）
    ↓
最终回复 → TTS（语音合成）→ 播放
```

### 工具设计原则

> **代码聪明 + 描述简短**

- 代码处理所有边界情况（编码、路径、权限）
- 工具描述一句话，AI 自己决定怎么用
- 不需要"技能层"编排，AI 自动组合工具

### 搜索降级策略

```
方案1: SearXNG（本地自建，返回干净 JSON）
    ↓ 失败
方案2: 百度搜索（HTML 转纯文本）
    ↓ 失败
方案3: cn.bing.com（HTML 转纯文本）
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

## 💡 使用示例

### 示例1：语音控制
> 用户（语音）："帮我打开微信"
> 启源（语音）："好的，正在为你打开微信～"
> （自动打开微信应用）

### 示例2：搜索 + 文件操作
> 用户："查一下北京天气，保存到桌面"
> 启源：调用 web_search → 获取天气信息 → 调用 write_file → 保存到桌面/天气.txt
> 启源："已帮你查到北京今天的天气并保存到桌面了～"

### 示例3：多工具协作
> 用户："帮我搜索 AI Agent 开发教程，把链接复制到剪贴板"
> 启源：调用 web_search → 提取链接 → 调用 clipboard_write
> 启源："已找到教程链接并复制到剪贴板了～"

---

## 📄 License

MIT

---

## 👤 作者

李子豪 — 独立开发
