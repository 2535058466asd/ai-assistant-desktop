# 工具执行机制调研

日期：2026-05-11

## 资料来源

- Electron shell API：https://www.electronjs.org/docs/latest/api/shell
- Electron 安全清单：https://www.electronjs.org/docs/latest/tutorial/security
- Node.js child_process API：https://nodejs.org/api/child_process.html

## 调研结论

Electron 的 `shell` API 适合做普通桌面集成：

- `shell.openExternal(url)`：打开外部 URL 或协议。
- `shell.openPath(path)`：用系统默认方式打开文件或可执行程序。
- `shell.showItemInFolder(path)`：适合后续做“在文件夹中显示这个文件”的能力。

Node 的 `child_process.exec()` 适合保留为万能命令工具，因为它通过 shell 执行，兼容用户平时输入的命令。问题是安全边界更大：如果把未校验的输入直接丢给 shell，容易造成命令注入或误操作。对于高频动作，应该优先做成专用工具；对于专用工具覆盖不到的场景，再让 `exec_command` 兜底。

Electron 安全建议与当前方向一致：

- 保持 `nodeIntegration: false`。
- 保持 `contextIsolation: true`。
- preload 只暴露明确白名单方法，不暴露通用 IPC。
- IPC 入参需要校验，不把强能力直接暴露给不可信页面。

## 当前工具形态

当前暴露给模型的工具已不包含截图能力，核心工具共 17 个：

- `exec_command`
- `read_file`
- `write_file`
- `web_search`
- `web_fetch`
- `clipboard_read`
- `clipboard_write`
- `open_app`
- `list_dir`
- `search_files`
- `grep_content`
- `knowledge_search`
- `knowledge_add`
- `knowledge_import_file`
- `knowledge_import_image`
- `workspace_create_task`
- `workspace_update_project`

截图能力已经从当前产品范围移除，因此下面只讨论保留中的工具重叠。

存在一些功能重叠：

- `open_app` 和 `exec_command start/open` 有重叠。
- `list_dir`、`search_files`、`grep_content` 和 `exec_command dir/findstr/rg` 有重叠。
- `web_search`、`web_fetch` 和浏览器自动化有部分重叠，但更轻、更容易记录日志。

这种重叠可以保留。专用工具更安全、日志更清楚、UI 展示更容易；`exec_command` 作为兜底工具存在，不应该成为所有操作的默认路径。

## 风险策略

目标策略：

- 日常操作不弹窗，直接执行。
- 高风险操作弹窗确认。
- 明确破坏性操作直接拦截，或者后续做强确认。

当前第一版策略：

- `open_app` 属于 `low_write`，不弹窗。
- `exec_command` 使用动态确认：
  - 低风险命令自动执行。
  - 命中高风险规则的命令弹窗确认。
  - 命中破坏性规则的命令仍由主进程安全策略拦截。

高风险命令示例：

- 杀进程：`taskkill`、`Stop-Process`、`kill`
- 服务和账户变更：`sc stop/delete/config`、`net user`、`net localgroup`
- 权限和系统配置：`icacls`、`takeown`、`setx`、`reg add/delete/import/restore`
- PowerShell 高危操作：`Remove-Item`、`Move-Item`、`Set-ExecutionPolicy`、`Invoke-Expression`、`iex`
- 管道执行脚本：`curl ... | powershell`、`Invoke-WebRequest ... | iex`

## 实现方向

短期：

- 保留 `exec_command` 作为万能兜底工具。
- 保留常见操作的专用工具。
- `open_app` 使用 Windows `Get-StartApps`、App Paths、开始菜单快捷方式和别名增强应用查找。
- 日志需要展示模型响应、工具调用、参数和结果摘要。

中期：

- 为高频桌面动作增加专用工具，减少模型直接写命令：
  - `show_file`
  - `open_path`
  - `list_processes`
  - `kill_process`，需要确认
  - `install_dependency`，内置镜像源策略
- 把风险判断抽到共享模块，让渲染进程确认逻辑和主进程安全校验共用。
- 增加文件写入边界策略：
  - 工作区内写入可自动执行。
  - 工作区外写入需要确认。
  - 删除、批量移动等破坏性文件操作需要强确认。

## 避免事项

- 不要让模型为了常见操作随意拼复杂 shell 脚本。
- 有平台 API 时，不优先解析复杂命令行输出。
- 工具输出不能无限返回，需要截断并保留摘要和元信息。
