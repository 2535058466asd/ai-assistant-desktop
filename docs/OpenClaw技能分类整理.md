# OpenClaw 52 个技能分类整理

> 版本：OpenClaw 2026.3.13 (61d171a)
> 整理日期：2026-04-05

---

## 概览

| 指标 | 数值 |
|------|------|
| 总技能数 | 52 |
| 已就绪 | 5（healthcheck, node-connect, skill-creator, video-frames, weather） |
| 未配置 | 47（需安装依赖或 API Key） |
| 仅 macOS | 10 个 |
| 跨平台 | 42 个 |
| 分类数 | 11 个 |

---

## 1. 📝 笔记与知识管理（6 个）

| 技能 | 功能描述 | 平台 |
|------|----------|------|
| apple-notes | 管理 Apple Notes（创建、查看、编辑、搜索笔记） | macOS |
| apple-reminders | 管理 Apple 提醒事项（列表、添加、编辑、完成、删除） | macOS |
| bear-notes | 通过 grizzly CLI 创建、搜索和管理 Bear 笔记 | macOS |
| obsidian | 操作 Obsidian 知识库（Markdown 笔记）和 obsidian-cli 自动化 | 跨平台 |
| notion | Notion API 创建和管理页面、数据库和内容块 | 跨平台 |
| trello | 通过 Trello REST API 管理看板、列表和卡片 | 跨平台 |

---

## 2. 💬 即时通讯与社交（7 个）

| 技能 | 功能描述 | 平台 |
|------|----------|------|
| discord | 通过 message tool 控制 Discord（频道消息、Pin 等） | 跨平台 |
| slack | 控制 Slack（消息反应、Pin/Unpin 频道和 DM） | 跨平台 |
| bluebubbles | 通过 BlueBubbles 发送和管理 iMessage | macOS |
| imsg | iMessage/SMS CLI，列出聊天、历史记录和发送消息 | macOS |
| wacli | WhatsApp CLI，发送消息、搜索/同步聊天历史 | 跨平台 |
| xurl | X (Twitter) API CLI，发推、回复、搜索、管理关注者等 | 跨平台 |
| voice-call | 通过 OpenClaw voice-call 插件发起语音通话 | 跨平台 |

---

## 3. 📧 邮件与办公（2 个）

| 技能 | 功能描述 | 平台 |
|------|----------|------|
| himalaya | IMAP/SMTP 邮件 CLI，收发、回复、转发、搜索和组织邮件 | 跨平台 |
| gog | Google Workspace CLI（Gmail、日历、Drive、通讯录、Sheets、Docs） | 跨平台 |

---

## 4. 🔐 安全与密码（2 个）

| 技能 | 功能描述 | 平台 |
|------|----------|------|
| 1password | 1Password CLI 集成（安装、登录、读取/注入/运行密钥） | 跨平台 |
| healthcheck ✓ | 主机安全加固和风险配置审计，OpenClaw 部署安全检查 | 跨平台 |

---

## 5. 💻 开发与代码（7 个）

| 技能 | 功能描述 | 平台 |
|------|----------|------|
| coding-agent | 委托编码任务给 Codex、Claude Code 或 Pi Agent（后台进程） | 跨平台 |
| github | GitHub 操作 CLI（Issues、PR、CI、代码审查、API 查询） | 跨平台 |
| gh-issues | 获取 GitHub Issues，自动生成修复代码并提交 PR | 跨平台 |
| clawhub | ClawHub CLI 搜索、安装、更新和发布 Agent 技能 | 跨平台 |
| skill-creator ✓ | 创建、编辑、改进或审计 AgentSkill（SKILL.md 文件） | 跨平台 |
| mcporter | MCP 服务器/工具的列表、配置、认证和调用 CLI | 跨平台 |
| tmux | 远程控制 tmux 会话，发送按键和抓取面板输出 | Linux/macOS |

---

## 6. 🌐 搜索与信息获取（3 个）

| 技能 | 功能描述 | 平台 |
|------|----------|------|
| summarize | 从 URL、播客和本地文件中提取文本/转录并总结 | 跨平台 |
| blogwatcher | 监控博客和 RSS/Atom 订阅更新 | 跨平台 |
| goplaces | Google Places API 查询（地点搜索、详情、评价） | 跨平台 |

---

## 7. 🎨 AI 生成与多媒体（12 个）

| 技能 | 功能描述 | 平台 |
|------|----------|------|
| openai-image-gen | 通过 OpenAI Images API 批量生成图片 | 跨平台 |
| nano-banana-pro | 通过 Gemini 3 Pro Image 生成或编辑图片 | 跨平台 |
| openai-whisper | 本地语音转文字（Whisper CLI，无需 API Key） | 跨平台 |
| openai-whisper-api | 通过 OpenAI Audio Transcriptions API 转录音频 | 跨平台 |
| sag | ElevenLabs 文字转语音（mac 风格 say 体验） | 跨平台 |
| sherpa-onnx-tts | 本地离线文字转语音（sherpa-onnx，无需云端） | 跨平台 |
| nano-pdf | 用自然语言指令编辑 PDF（nano-pdf CLI） | 跨平台 |
| video-frames ✓ | 用 ffmpeg 从视频中提取帧或短视频片段 | 跨平台 |
| camsnap | 从 RTSP/ONVIF 摄像头抓取帧或视频片段 | 跨平台 |
| gifgrep | 搜索 GIF 提供商、下载结果、提取静态图/图片表 | 跨平台 |
| songsee | 从音频生成频谱图和特征面板可视化 | 跨平台 |
| gemini | Gemini CLI 一次性问答、摘要和生成 | 跨平台 |

---

## 8. 🎵 音乐与娱乐（3 个）

| 技能 | 功能描述 | 平台 |
|------|----------|------|
| spotify-player | 终端 Spotify 播放/搜索（spogo 或 spotify_player） | 跨平台 |
| sonoscli | 控制 Sonos 音箱（发现、状态、播放、音量、分组） | 跨平台 |
| blucli | BluOS CLI（发现、播放、分组、音量控制） | 跨平台 |

---

## 9. 🏠 智能家居与设备（2 个）

| 技能 | 功能描述 | 平台 |
|------|----------|------|
| openhue | 控制 Philips Hue 灯光和场景（OpenHue CLI） | 跨平台 |
| eightctl | 控制 Eight Sleep 智能床垫（状态、温度、闹钟、日程） | 跨平台 |

---

## 10. 📱 系统与自动化（6 个）

| 技能 | 功能描述 | 平台 |
|------|----------|------|
| peekaboo | 用 Peekaboo CLI 抓取和自动化 macOS UI | macOS |
| things-mac | 管理 Things 3 待办（添加项目、搜索任务、检查项目） | macOS |
| session-logs | 搜索和分析历史会话日志（用 jq 处理） | 跨平台 |
| model-usage | 查看 Codex 或 Claude 的按模型使用量/成本统计 | 跨平台 |
| node-connect ✓ | 诊断 OpenClaw 节点连接和配对故障 | 跨平台 |
| oracle | oracle CLI 最佳实践（提示词、文件打包、引擎、会话） | 跨平台 |

---

## 11. 🍕 生活服务（2 个）

| 技能 | 功能描述 | 平台 |
|------|----------|------|
| ordercli | Foodora 外卖 CLI（查看历史订单和活跃订单状态） | 跨平台 |
| weather ✓ | 通过 wttr.in 或 Open-Meteo 获取天气和预报（无需 API Key） | 跨平台 |

---

## 对你的项目有用的技能

| 技能 | 用途 |
|------|------|
| weather ✓ | 天气查询（已就绪），可直接使用 |
| video-frames ✓ | 视频帧提取（已就绪），可做视频处理功能 |
| skill-creator ✓ | 创建自定义技能（已就绪），可扩展能力 |
| summarize | 从 URL 提取内容并总结，可做网页摘要功能 |
| coding-agent | 委托编码任务给 Claude Code/Codex，可做 AI 编程助手 |
| github | GitHub 操作，可做代码仓库管理功能 |
| nano-pdf | PDF 编辑，可做文档处理功能 |
| openai-whisper | 本地语音转文字，可做语音输入功能 |
| sherpa-onnx-tts | 本地离线 TTS，可做语音播报功能 |
| clawhub | 技能市场，可搜索安装更多技能 |

---

## 说明

- **Skill（技能）** = 操作手册，决定 OpenClaw "怎么做"
- **Tool（工具）** = 内置器官，决定 OpenClaw "能做什么"（不在此列表中）
- 标记 **✓** 的技能已就绪，可直接通过 `/tools/invoke` API 调用
- 未就绪的技能需安装对应依赖（CLI 工具、API Key 等）才能使用
- 标记 **macOS** 的技能在 Windows 上无法使用
- 可通过 `npx clawhub search <关键词>` 搜索和安装更多技能
