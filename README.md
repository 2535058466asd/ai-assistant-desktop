# 启源 AI 助手 - 桌面端智能助手

一个基于 Electron + React + TypeScript 的桌面 AI 助手，具有温暖治愈的性格，支持文字聊天、系统控制和用户记忆功能。

---

## 🎯 项目简介

启源 AI 助手是一个具有"温度"的桌面智能助手，采用四层架构设计，深度集成大语言模型，不仅能完成系统操作，还能像朋友一样陪伴用户聊天、记住用户的喜好和重要信息。

---

## ✨ 核心特性

### 🏗️ 1. 四层架构设计
```
交互层 (语音↔文本) → 大脑层 (语义理解) → 规划层 (任务编排) → 执行层 (实际执行)
```
- **职责分离**：每一层只负责自己的工作，互不干扰
- **易于扩展**：新增功能只需修改对应层级
- **便于维护**：问题定位清晰，修改风险低

### 🧠 2. AI大模型深度集成
- **豆包API**：智能对话、意图识别
- **用户记忆系统**：JSON本地持久化，记住用户偏好和重要信息
- **LLM意图识别**：从关键词匹配升级到智能理解
- **情绪感知**：能感知用户情绪，先回应情绪再执行任务

### 💻 3. 桌面原生能力
- **系统控制**：打开应用、文件夹、锁屏、调节音量、关机等
- **IPC通信**：主进程与渲染进程安全通信
- **多意图支持**：一句话执行多个任务

### 🔧 4. 可扩展的模块化设计
- **适配器模式**：TTS/ASR支持多种实现（Edge-TTS、火山引擎、Web Speech）
- **单例模式**：全局服务统一管理
- **自动降级机制**：主服务失败时自动切换备用方案

---

## 🚀 功能清单

| 功能 | 状态 | 说明 |
|------|------|------|
| 文字聊天 | ✅ 完整 | 豆包大模型，多轮对话 |
| LLM意图识别 | ✅ 完整 | 智能理解用户意图 |
| 多意图识别 | ✅ 完整 | 一句话执行多个任务 |
| 用户记忆系统 | ✅ 完整 | 本地JSON持久化，聊天时自动使用 |
| 情绪感知 | ✅ 完整 | 感知用户情绪，先回应情绪 |
| 系统控制 | ✅ 完整 | 打开应用、文件夹、锁屏、音量、关机等 |
| 语音合成（TTS）| ✅ 完整 | Edge-TTS（默认）+ 火山引擎TTS |
| 语音识别（ASR）| ✅ 框架 | Web Speech + 火山引擎ASR |
| 屏幕截图 | ✅ 框架 | Electron截图，为VLM视觉理解准备 |
| 四层架构 | ✅ 完整 | 交互层、大脑层、规划层、执行层 |

---

## 🛠️ 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| **Electron** | 最新 | 桌面应用框架 |
| **React** | 18 | 前端UI框架 |
| **TypeScript** | 5.x | 类型安全 |
| **Vite** | 5.x | 构建工具 |
| **Framer Motion** | 最新 | UI动画 |
| **Axios** | 最新 | HTTP请求 |
| **豆包API** | - | 大模型对话 |
| **Edge-TTS** | - | 语音合成（免费） |

---

## 📁 项目结构

```
ai-assistant-desktop/
├── src/
│   ├── main/                          # Electron 主进程
│   │   ├── index.ts                   # 主进程入口
│   │   └── services/                  # 主进程服务
│   │       ├── doubaoApi.ts           # 豆包API
│   │       ├── memoryService.ts       # 用户记忆服务
│   │       ├── screenshotService.ts   # 屏幕截图服务
│   │       └── systemControl.ts       # 系统控制服务
│   │
│   ├── preload/                       # 预加载脚本
│   │   └── preload.ts                 # 暴露安全API
│   │
│   └── renderer/                      # 渲染进程（React）
│       ├── components/                # React组件
│       │   ├── Chat.tsx               # 聊天界面
│       │   └── Toast.tsx              # 提示组件
│       ├── config/                    # 配置文件
│       │   ├── apiConfig.ts           # API配置
│       │   ├── asrConfig.ts           # ASR配置
│       │   └── ttsConfig.ts           # TTS配置
│       ├── core/                      # 核心架构（四层）
│       │   ├── layer1-gateway/        # 第1层：交互层（语音网关）
│       │   │   ├── index.ts
│       │   │   └── wakeWordDetector.ts  # 唤醒词检测
│       │   ├── layer2-brain/          # 第2层：大脑层（语义理解）
│       │   │   ├── index.ts           # 大脑管理器
│       │   │   ├── intentClassifier.ts   # 意图分类器（LLM）
│       │   │   └── contextManager.ts   # 上下文管理器
│       │   ├── layer3-planner/        # 第3层：规划层（任务规划）
│       │   │   ├── index.ts           # 规划管理器
│       │   │   └── intentRegistry.ts   # 意图注册表
│       │   ├── layer4-executor/       # 第4层：执行层（任务执行）
│       │   │   ├── index.ts           # 执行管理器
│       │   │   └── taskExecutor.ts   # 任务执行器
│       │   ├── tts/                   # TTS模块（文字转语音）
│       │   │   ├── ttsInterface.ts     # TTS接口
│       │   │   ├── ttsManager.ts     # TTS管理器
│       │   │   ├── edgeTTS.ts          # Edge-TTS实现
│       │   │   ├── webSpeechTTS.ts     # Web Speech实现
│       │   │   ├── volcengineTTS.ts   # 火山引擎实现
│       │   │   └── index.ts
│       │   ├── asr/                   # ASR模块（语音转文字）
│       │   │   ├── asrInterface.ts     # ASR接口
│       │   │   ├── asrManager.ts     # ASR管理器
│       │   │   ├── webSpeechASR.ts     # Web Speech实现
│       │   │   ├── whisperASR.ts       # Whisper实现
│       │   │   ├── volcengineASR.ts   # 火山引擎实现
│       │   │   └── index.ts
│       │   ├── orchestrator.ts        # 核心协调器（整合四层架构）
│       │   └── qiyuanSettings.ts      # 启源人设设定
│       ├── services/                  # 渲染进程服务
│       │   ├── doubaoApi.ts           # 豆包API调用
│       │   └── memoryService.ts       # 记忆服务
│       ├── types/                     # TypeScript类型定义
│       │   └── index.ts
│       ├── App.tsx
│       ├── index.css
│       └── main.tsx
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 🏗️ 四层架构详解

### 第1层：交互层（Voice Gateway Layer）
**职责**：语音与文本互转
- **ASR**：语音识别（声音 → 文字）
- **TTS**：语音合成（文字 → 声音）
- **唤醒词检测**：喊"启源"唤醒助手

---

### 第2层：大脑层（NLP Brain Layer）
**职责**：语义理解、意图识别
- **LLM意图识别**：智能理解用户意图
- **槽位抽取**：提取关键信息
- **上下文管理**：记住对话历史
- **追问机制**：信息不足时主动追问
- **多意图识别**：支持一句话多个意图

**核心文件**：
- `intentClassifier.ts`：用LLM进行意图识别
- `contextManager.ts`：管理对话历史和上下文状态

---

### 第3层：规划层（Task Plan Layer）
**职责**：任务编排、执行步骤规划
- **意图注册表**：定义每个意图对应的执行步骤
- **创建执行计划**：根据意图生成执行步骤

**核心文件**：
- `intentRegistry.ts`：定义意图和执行步骤的映射关系

---

### 第4层：执行层（Task Execute Layer）
**职责**：实际执行任务
- 打开应用、打开文件夹
- 系统控制（锁屏、音量、关机等）
- 查询时间、搜索网页

**核心文件**：
- `taskExecutor.ts`：执行具体任务

---

## 🎮 快速开始

### 前置要求
- Node.js 18+
- npm 或 yarn

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

## 🔑 核心设计模式

### 1. 单例模式（Singleton Pattern）
**应用位置**：所有管理器（Manager）类
- 全局只有一个实例，状态统一
- 避免重复创建实例
- 全局状态统一管理

### 2. 策略模式（Strategy Pattern）
**应用位置**：意图注册表
- 每个意图都有独立的执行策略
- 可以独立变化，互不影响

### 3. 注册表模式（Registry Pattern）
**应用位置**：意图注册表
- 用Map存储意图和执行步骤的映射
- 方便扩展新意图

### 4. 自动降级机制（Fallback）
**应用位置**：TTS和ASR管理器
- 主服务失败时自动切换到备用服务
- 保证功能始终可用
- 用户体验不中断

---

## 📝 配置说明

### 豆包API配置
文件：`src/renderer/config/apiConfig.ts`

### TTS配置
文件：`src/renderer/config/ttsConfig.ts`

### ASR配置
文件：`src/renderer/config/asrConfig.ts`

---

## 🎯 求职面试要点

### 项目亮点
1. **架构清晰**：四层架构，职责分离，体现良好的设计思维
2. **AI集成**：深度集成大模型，不是简单的API调用
3. **桌面原生**：充分利用Electron能力，系统控制、IPC通信
4. **代码质量**：TypeScript类型安全，设计模式应用恰当
5. **可扩展性**：模块化设计，易于添加新功能

### 可能被问到的问题
- **为什么选择四层架构？** → 职责分离，每层独立演进，易于维护
- **记忆系统是怎么实现的？** → JSON本地持久化，聊天时自动注入提示词
- **如何保证类型安全？** → TypeScript全面应用，接口定义清晰
- **Electron主进程和渲染进程怎么通信？** → preload脚本 + contextBridge + IPC
- **如何处理多意图？** → 按顺序执行，统一反馈结果
- **情绪感知是怎么实现的？** → 关键词检测 + LLM情绪回应

---

## 💡 使用示例

### 示例1：单意图
> 用户："打开QQ音乐"
> 启源："好的，正在打开QQ音乐～"
> 启源："✅ 已打开QQ音乐"

### 示例2：多意图
> 用户："打开QQ音乐，再把音量调大"
> 启源："好的，已完成：打开QQ音乐，音量增大😊"

### 示例3：情绪感知
> 用户："今天好累啊，帮我打开QQ音乐"
> 启源："抱抱你！辛苦了一天，要不要我帮你放首歌放松一下？😊"
> （停顿0.5秒）
> 启源："好的，正在打开QQ音乐～"

---

## 📄 License

MIT

---

## 👤 作者

启源开发团队
