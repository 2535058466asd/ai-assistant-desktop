# Development Research Notes

这个项目后续新增较大功能前，先做轻量调研，再实现。

## 调研规则

- 每个大功能先看 2-3 个成熟 GitHub 项目或官方文档。
- 只记录和本项目有关的架构、接口、错误处理、UI 表达。
- 不盲目迁移框架；优先吸收可验证的设计思想。

## 优先参考方向

- LangChain / LangGraph：工具注册、状态图、人机确认、持久化执行。
- OpenAI / Anthropic / Vercel AI SDK：流式输出、tool call event、结构化输出。
- Continue / AnythingLLM / Open WebUI / Dify：Provider 抽象、RAG、日志、设置页。

## 当前采纳的设计

- 保留自研 Function Calling Agent Loop。
- 通过 `ModelProvider` 抽象模型调用，默认豆包，预留 MiMo 和 OpenAI-compatible。
- 通过 Tool Registry 管理工具、风险等级和执行入口。
- 结构化 Logger 替代散乱 console，按模块和级别输出。
