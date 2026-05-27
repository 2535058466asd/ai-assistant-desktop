# Nova 文档索引

这个目录只放和 Nova 项目直接相关的文档。

## 入口文档

- [`../README.md`](../README.md)：项目定位、启动方式、Provider 配置、Demo 场景和安全边界。
- [`development-research.md`](development-research.md)：后续开发新功能前的轻量调研规则。

## Design

- [`design/nova-ui-design-spec.md`](design/nova-ui-design-spec.md)：早期 UI 设计规范。
- [`design/nova-ui-design-spec-v2.md`](design/nova-ui-design-spec-v2.md)：新版 UI 设计规范。

## Dev

- [`dev/model-provider-and-context.md`](dev/model-provider-and-context.md)：模型 Provider、同一对话切模型、短期上下文、长期记忆和 `reasoning_content` 说明。
- [`dev/tool-system.md`](dev/tool-system.md)：Function Calling 工具系统、风险等级、IPC 白名单、执行链路和新增工具规范。
- [`dev/mimo-platform-research.md`](dev/mimo-platform-research.md)：小米 MiMo 开放平台、Token Plan、模型和语音能力调研。
- [`dev/volcengine-voice-research.md`](dev/volcengine-voice-research.md)：火山引擎语音链路调研；当前阶段语音链路先冻结，优先稳定文本对话。
- [`dev/tool-execution-research.md`](dev/tool-execution-research.md)：工具执行和安全边界调研。

## Completed

- [`completed/memory-context-v2-implementation.md`](completed/memory-context-v2-implementation.md)：记忆与上下文 V2 已完成内容记录。
- [`completed/voice-chat-mode-implementation.md`](completed/voice-chat-mode-implementation.md)：语音对话模式已完成内容记录。

这些文档是归档实现记录，只用于回溯已经完成的设计和阶段性决策。当前最新模型配置、上下文和 Provider 说明以 `dev/` 下的活跃文档为准。

## 目录规则

- `design/`：UI、交互、视觉规范。
- `dev/`：当前活跃的功能实现计划、技术方案、阶段性开发记录。
- `completed/`：已经完成的开发计划和实现记录，只作回溯，不作为当前待办。
- 项目总览、安装和演示说明放根目录 `README.md`。
- 临时工具输出、日志、构建产物不要放入 docs。
