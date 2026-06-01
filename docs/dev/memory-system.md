# Nova 记忆系统

## 职责边界

Nova 中存在三类不同的数据，不应混为一谈：

```text
SQLite 聊天存档
  保存完整对话，负责重启后恢复聊天记录

HistoryManager
  保存当前对话的模型工作上下文，允许被摘要压缩

SQLite 长期记忆库
  保存跨对话仍然有价值的用户事实、偏好、项目、决策、观点和事件
```

长期记忆不是聊天记录副本，也不是每轮对话摘要。只有未来对话仍然有价值的信息才应进入长期记忆。

## 聊天存档与模型上下文

完整聊天记录和模型上下文必须分开维护：

```text
ConversationRuntime.archiveHistory
  -> 保存原始消息
  -> 供 SQLite 聊天存档写入
  -> 不允许被上下文压缩覆盖

HistoryManager
  -> 保存模型工作上下文
  -> 上下文过长时可替换为历史摘要 + 最近消息

ConversationRuntime.getModelHistory()
  -> 从模型工作上下文生成请求投影
  -> 默认最多发送最近 50 条消息
  -> 如果存在历史摘要，尽量保留最近一次摘要
```

SQLite 恢复历史对话时，会先读取完整原始消息，再用同一份消息初始化存档历史和模型工作上下文。后续压缩只修改模型工作上下文，不影响 SQLite 中的原始聊天记录。

## 写入流程

```text
一次 Agent 回复完成
  -> shouldExtractMemory 做低成本前置过滤
  -> LLM 提取候选记忆
  -> 主进程 MemoryService 做治理
     -> 低可信推断：忽略
     -> 已经过期事件：忽略
     -> 相同 memory_key 且内容接近：合并
     -> 相同 memory_key 但事实变化：旧记录 superseded，新记录 active
     -> 高相似内容：合并
     -> 其他情况：新增 active 记忆
```

## 生命周期

每条记忆都有状态：

```text
active       当前有效，可以参与检索并注入 Prompt
superseded   已被新事实替换，仅用于追溯
archived     已过期或因容量治理归档，不再注入 Prompt
```

事件记忆应尽量携带 `valid_until`。搜索记忆前会自动归档已过期事件。

启动维护还会归档内容完全一致的重复旧记录。对于无法自动判断的历史垃圾，记忆库页面提供手动归档和恢复；归档不会删除原始数据。

## 关键字段

| 字段 | 作用 |
| --- | --- |
| `memory_key` | 稳定事实键，例如 `profile.user_name`、`project.nova.focus` |
| `confidence` | 可信度，区分用户明确表达和模型推断 |
| `source_kind` | 来源类型：`explicit`、`inferred`、`manual` |
| `source_conversation` | 来源对话 ID |
| `source_message` | 来源消息 ID |
| `valid_until` | 事件过期时间 |
| `superseded_by` | 替换当前记录的新记忆 ID |

## 检索策略

当前长期记忆仍使用 SQLite FTS5 全文检索，并在失败时降级为字符串匹配。只有 `active` 且未过期的记忆会参与检索和 Prompt 注入。

向量检索属于后续增强项。应先保证写入质量和生命周期治理，再接入 Embedding。
