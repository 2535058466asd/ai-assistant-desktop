# Nova 工具系统说明

Nova 的工具系统不是一组散落的 `console` 或 IPC 调用，而是一个分层的 Function Calling 执行链路。目标是让模型知道能做什么，让应用知道风险有多高，让执行层只走白名单能力，并且让日志能追踪每次工具调用。

## 当前状态

工具系统分成六层：

1. `toolRegistry.ts`：定义模型可见工具、参数 schema、分类、风险等级、只读标记、超时时间和执行函数。
2. `toolExecutor.ts`：统一执行入口，负责记录工具调用日志、耗时、结果和错误。
3. `preload.ts`：把渲染进程允许调用的能力暴露为 `window.electronAPI` 白名单。
4. `src/main/tools/*`：主进程真正执行文件、系统、网络、剪贴板、知识库等能力。
5. `agentLoop.ts`：把工具 schema 传给模型，接收模型返回的 tool calls，再把结果回填给模型继续推理。
6. `logger.ts` / `workspaceStore.ts`：记录 traceId、工具类别、风险等级、参数摘要、结果摘要和耗时。

这几层的边界必须保持清楚：模型只看 schema，渲染进程只调用白名单 API，主进程才接触系统资源。

## 工具调用链路

```text
用户输入
  ↓
Orchestrator 构建上下文
  ↓
AgentLoop 获取 getToolDefinitions()
  ↓
ModelProvider 发送 messages + tools
  ↓
模型返回 tool_calls
  ↓
ToolExecutor.executeTool(name, args, meta)
  ↓
toolRegistry.executeRegisteredTool()
  ↓
window.electronAPI.*
  ↓
preload IPC 白名单
  ↓
main/tools/* IPC handler
  ↓
操作系统 / 网络 / 本地服务
  ↓
工具结果回填给模型
  ↓
模型继续推理或输出最终回复
```

## 当前模型可见工具

| 工具 | 分类 | 风险 | 只读 | 说明 |
|---|---|---|---|---|
| `exec_command` | system | system | 否 | 执行系统命令，高风险命令会确认 |
| `read_file` | file | read | 是 | 读取文件内容 |
| `write_file` | file | low_write | 否 | 创建或修改文件 |
| `create_dir` | file | low_write | 否 | 创建目录 |
| `copy_file` | file | low_write | 否 | 复制文件或目录，不删除源文件 |
| `move_file` | file | low_write | 否 | 移动或重命名文件/目录 |
| `delete_file` | file | destructive | 否 | 删除文件或目录，强确认 |
| `list_dir` | file | read | 是 | 列出目录 |
| `search_files` | file | read | 是 | 按文件名搜索 |
| `grep_content` | file | read | 是 | 按内容搜索 |
| `web_search` | web | read | 是 | 搜索互联网 |
| `web_fetch` | web | read | 是 | 抓取网页文本 |
| `clipboard_read` | clipboard | read | 是 | 读取剪贴板 |
| `clipboard_write` | clipboard | low_write | 否 | 写入剪贴板 |
| `open_app` | app | system | 否 | 打开应用或 URL |
| `notify` | system | low_write | 否 | 发送系统通知 |
| `get_current_time` | system | read | 是 | 获取当前时间 |
| `get_system_info` | system | read | 是 | 获取系统信息 |
| `knowledge_search` | knowledge | read | 是 | 检索知识库 |
| `knowledge_add` | knowledge | low_write | 否 | 添加知识片段 |
| `knowledge_import_file` | knowledge | low_write | 否 | 导入本地文档到知识库 |
| `knowledge_import_image` | knowledge | low_write | 否 | 图片识别并导入知识库 |
| `workspace_create_task` | workspace | low_write | 否 | 创建任务 |
| `workspace_update_project` | workspace | low_write | 否 | 更新项目状态、下一步和阻塞点 |

主进程还注册了部分 UI/服务专用 IPC，例如知识库统计和来源管理。这些不是全部都暴露给模型。

## 风险等级

| 风险等级 | 含义 | 当前策略 |
|---|---|---|
| `read` | 读取本地、网络或状态信息 | 自动执行并记录日志 |
| `low_write` | 低风险写入，例如创建任务、写文件、写剪贴板 | 自动执行并记录日志 |
| `system` | 可能影响系统状态，例如命令执行、打开应用 | 高风险命令或敏感场景确认 |
| `destructive` | 删除、不可逆修改 | 强确认 |
| `external_send` | 对外发送消息、邮件、表单 | 预留，后续应强确认 |

风险等级不是给模型看的装饰字段，而是应用侧权限控制和日志筛选的基础。

## 路径处理

文件类工具统一走 `src/main/tools/fileOps.ts` 的 `resolvePath()`，避免不同工具各自解析路径导致行为不一致。

当前支持：

- `~/Desktop`、`~/Documents`、`~/Downloads`
- `桌面/xxx`、`文档/xxx`、`下载/xxx`
- `C:/xxx`、`D:/xxx` 等绝对路径

新增文件工具时不要在 renderer 或单个 handler 里重新手写路径解析，应该复用 `resolvePath()`。

## 日志与可观测性

每次工具执行都会记录：

- `traceId`
- `chatId` / `sessionId`
- `toolName`
- `category`
- `riskLevel`
- `isReadOnly`
- `timeoutMs`
- `durationMs`
- `argsPreview`
- `resultPreview`
- `success` / `error`

这让一次 Agent 执行链路可以从“用户提交消息”追到“模型请求”“工具执行”“结果回填”“最终回复”。

## 新增工具规范

新增工具时按这个顺序做：

1. 在主进程 `src/main/tools/*` 实现 IPC handler。
2. 在 `src/main/tools/index.ts` 注册 handler。
3. 在 `src/preload/preload.ts` 暴露白名单 API 和 TypeScript 类型。
4. 在 `src/renderer/core/tools/toolRegistry.ts` 添加 `ToolSpec`。
5. 设置准确的 `category`、`riskLevel`、`isReadOnly`、`timeoutMs`。
6. 如有删除、覆盖、对外发送、系统级变更，添加 `requiresConfirmation`。
7. 跑 `npm run build`。
8. 用一次真实对话或工具调用检查日志里是否有 traceId、分类、风险和耗时。

不要只在系统提示词里描述能力，也不要只在主进程写 handler。模型可见工具、执行实现、权限元数据必须同步。

## 后续优化方向

- 路径风险策略：区分普通用户目录、项目目录、系统目录，对系统目录默认强确认或禁止。
- 工具结果结构化：让每个工具返回统一的 `data`、`summary`、`artifacts`、`warnings`。
- 工具测试集：为文件工具、系统工具、知识库工具补最小集成测试。
- 工具面板筛选：按 `category`、`riskLevel`、`traceId` 筛选工具日志。
