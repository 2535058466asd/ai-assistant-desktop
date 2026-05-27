# 记忆系统与上下文管理 V2 实现记录

状态：主体已完成，仍可继续优化

## 已实现内容

- 工具结果截断：`Orchestrator` 中通过 `MAX_TOOL_RESULT_TOKENS` 和 `truncateToolResult()` 控制工具结果进入上下文的大小。
- 上下文自动压缩：当对话历史接近阈值时，保留最近消息并调用模型生成历史摘要。
- 短期上下文：当前会话上下文由 renderer 内存中的 `ContextManager` 管理，不写入 localStorage 或 SQLite。
- 对话历史：`historyManager` 负责保留会话消息，并为同一对话中的后续请求提供上下文。
- 记忆存储：主进程 `memoryServiceBackend.ts` 使用 SQLite 持久化记忆，数据位于用户数据目录下的 `nova-memory/memories.db`；如果检测到旧版 `qiyuan-memory` 且新目录不存在，会自动复制迁移。
- 记忆上限：通过 `MAX_MEMORIES = 500` 控制长期记忆数量。
- 记忆提取：`memoryExtractor.ts` 在对话结束后尝试从用户输入和助手回复中提取重要信息。
- 记忆检索注入：`memoryServiceClient` / `memoryServiceBackend` 支持按用户输入生成记忆提示词并注入系统提示。
- 多 Provider 上下文：同一对话切换豆包、MiMo 或 OpenAI-compatible Provider 时，短期上下文继续保留，但请求配置切换为当前激活的 Provider。
- MiMo 推理内容：MiMo thinking mode 的 `reasoning_content` 需要作为 Provider 专属字段保留，前端应显示在思考区域，后续请求也可能需要带回 API。

## 当前说明

- 长期记忆不是只在新对话时注入；每次模型请求都可以按用户输入检索相关记忆并注入当前上下文。
- 记忆提取失败不应阻断主聊天，只记录错误并降级。
- 更完整的当前说明见 [`../dev/model-provider-and-context.md`](../dev/model-provider-and-context.md)。

## 当前保留问题

- 记忆提取质量仍偏基础，需要更多样例和 Eval。
- 记忆分类、权重、时间衰减还可以继续打磨。
- 同一对话切换模型后，是否在 UI 中展示“该消息由哪个模型生成”仍待产品决策。
- 旧文档中的部分目标描述已经过时，后续以代码、[`../dev/model-provider-and-context.md`](../dev/model-provider-and-context.md) 和本记录为准。
