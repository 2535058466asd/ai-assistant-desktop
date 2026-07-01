# Nova

基于 **Electron + React + TypeScript** 的桌面 AI Agent 工作台。

## 核心能力

| 能力 | 说明 |
|------|------|
| **多模型** | 豆包、小米 MiMo、DeepSeek、OpenAI-compatible |
| **Agent 工具** | 文件、网页、剪贴板、知识库、记忆等 28 个本地工具 |
| **RAG 知识库** | PDF/DOCX/XLS/TXT/MD/图片 → 解析 → 切片 → 向量化 → SQLite+sqlite-vec 检索 |
| **长期记忆** | 显式记忆 + 自动提取 + 去重合并 + 按需注入 |
| **语音交互** | ASR → LLM → TTS 半双工对话 |
| **可观测性** | 日志面板 + 工具执行统计 + 费用趋势 |

## 快速启动

```bash
npm install
cp .env.example .env  # 填写 API Key
npm run electron:dev
```

## 项目结构

```text
src/
  main/                           # Electron 主进程
    index.ts                      # IPC handler
    services/
      ragService.ts               # RAG：sqlite-vec 检索 + 中文分词 + 距离阈值
      memoryServiceBackend.ts     # 长期记忆：SQLite / FTS / 去重
      documentParser.ts           # 文档解析、清洗、切片
    tools/                        # 本地工具注册
    ipc/                          # IPC 处理器

  preload/
    preload.ts                    # contextBridge 白名单 API

  renderer/
    App.tsx                       # 根组件
    components/
      chat/                       # 聊天界面
      Knowledge/                  # 知识库（左右分栏）
      Tools/                      # 工具管理 + 仪表盘
      Workspace/                  # 费用趋势 + 成本面板
      Settings/                   # 模型配置 + 语音设置
      Memory/                     # 记忆管理
    core/
      model/                      # 多 Provider 统一接口
      tools/                      # Agent 工具执行器
      cost/                       # Token 用量追踪
      memory/                     # 记忆治理
    config/
      modelConfig.ts              # Provider 配置（localStorage）
      modelCatalog.ts             # 模型目录
```

## 技术栈

| 模块 | 技术 |
|------|------|
| 桌面端 | Electron |
| 前端 | React + TypeScript + CSS Modules |
| 构建 | Vite |
| 大模型 | 豆包 / MiMo / DeepSeek / OpenAI-compatible |
| RAG | SQLite + sqlite-vec + 中文分词 + 距离阈值过滤 |
| 记忆 | SQLite + FTS + 去重合并 |
| 语音 | 豆包 ASR/TTS + 小米 MiMo ASR/TTS |

## 安全边界

```text
Renderer (低权限) → Preload (白名单 API) → Main (密钥/文件/数据库/WebSocket)
```

Renderer 不直接访问 Node.js、密钥或文件系统，所有敏感能力通过 `window.electronAPI` 白名单接口转发。
