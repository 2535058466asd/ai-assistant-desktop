# 记忆系统与上下文管理 V2 实现记录

状态：主体已完成，仍可继续优化

## 已实现内容

- 工具结果截断：`Orchestrator` 中通过 `MAX_TOOL_RESULT_TOKENS` 和 `truncateToolResult()` 控制工具结果进入上下文的大小。
- 上下文自动压缩：当对话历史接近阈值时，保留最近消息并调用模型生成历史摘要。
- 记忆存储：主进程 `memoryServiceBackend.ts` 使用 SQLite 持久化记忆，数据位于用户数据目录下的 `qiyuan-memory/memories.db`。
- 记忆上限：通过 `MAX_MEMORIES = 500` 控制长期记忆数量。
- 记忆提取：`memoryExtractor.ts` 在对话结束后尝试从用户输入和助手回复中提取重要信息。
- 记忆检索注入：`memoryServiceClient` / `memoryServiceBackend` 支持按用户输入生成记忆提示词并注入系统提示。

## 当前保留问题

- 记忆提取质量仍偏基础，需要更多样例和 Eval。
- 记忆分类、权重、时间衰减还可以继续打磨。
- 旧文档中的部分目标描述已经过时，后续以代码和本记录为准。
