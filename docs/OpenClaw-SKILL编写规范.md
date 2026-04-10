# OpenClaw SKILL.md 编写规范（综合版）

> 来源：OpenClaw 官方文档 + 8 个真实开源项目 + 社区最佳实践
> 整理日期：2026-04-05

---

## 一、核心概念

**SKILL.md 不是提示词，而是结构化知识注入系统。** 它定义了：
1. **何时加载**（触发条件）→ `description` 字段
2. **加载什么**（执行流程）→ Markdown 正文
3. **需要什么**（依赖工具）→ `metadata` 字段
4. **如何维护**（版本管理）→ `version` 等字段

---

## 二、目录结构

```
skill-name/                    ← 必须：kebab-case（小写+连字符）
├── SKILL.md                   ← ★ 唯一必须文件
├── scripts/                   ← 可选：脚本（Python/Bash）
│   └── main.py
├── references/                ← 可选：参考文档（按需加载，省 token）
│   └── api-guide.md
├── templates/                 ← 可选：输出模板
└── assets/                    ← 可选：静态资源
```

---

## 三、YAML Frontmatter 字段

### 必填（只有 2 个）

| 字段 | 说明 | 示例 |
|------|------|------|
| `name` | 技能唯一标识，必须与目录名一致 | `weather` |
| `description` | **最重要的字段**，决定技能何时被触发 | 见下方 |

### 强烈推荐

| 字段 | 说明 | 示例 |
|------|------|------|
| `version` | 语义化版本号 | `1.0.0` |
| `allowed-tools` | 限制可用工具（CSV 格式） | `"Read, Write, Bash(git:*)"` |
| `user-invocable` | 是否允许用户用 `/skill-name` 手动触发 | `true`（默认） |

### OpenClaw 扩展（metadata）

```yaml
metadata:
  {
    "openclaw": {
      "emoji": "🌤️",                              # UI 图标
      "requires": {
        "bins": ["python3", "node"],               # 需要的系统命令
        "env": ["MY_API_KEY"],                     # 需要的环境变量
        "config": ["browser.enabled"]              # 需要的配置项
      },
      "primaryEnv": "MY_API_KEY",                  # 主 API Key
      "os": ["darwin", "linux", "win32"],          # 支持的系统
      "always": false                               # 是否始终加载
    }
  }
```

### 可选

| 字段 | 说明 |
|------|------|
| `author` | 作者 |
| `license` | 开源协议 |
| `tags` | 标签数组 |
| `compatible-with` | 兼容平台：`claude-code, codex, openclaw, cursor` |

---

## 四、description 编写（最关键！）

`description` 在**每条用户消息**时都会被读取，所以必须精准。

### 黄金公式

```yaml
description: |
  一句话：做什么。

  Triggers: "关键词1", "关键词2", 场景描述

  Does NOT trigger:
  - 不应触发的场景
  - 看起来相似但不是的场景

  Output: 用户获得什么
```

### 好 vs 差的对比

| 差 ❌ | 好 ✅ |
|------|------|
| `Helps with research` | `Triggers: "帮我研究", "search for", "look up", competitive analysis` |
| `Handles various tasks` | `Executes 4-mode research pipeline (Quick/Standard/Deep/Crawl)` |
| （未提及边界） | `Does NOT trigger: simple facts you already know, user gave a specific URL` |
| （未提及输出） | `Output: structured report with sources, key findings, and recommendations` |

### 真实示例

**skill-creator（官方内置）：**
```yaml
description: Create, edit, improve, or audit AgentSkills. Use when creating a new skill from scratch or when asked to improve, review, audit, tidy up, or clean up an existing skill or SKILL.md file. Triggers on phrases like "create a skill", "author a skill", "tidy up a skill", "improve this skill", "review the skill", "clean up the skill", "audit the skill".
```

**calculator（社区）：**
```yaml
description: Precise mathematical calculations with 100% accuracy. Use for any arithmetic, percentages, unit conversions, or cost calculations. LLMs cannot reliably perform math - always use this tool for calculations.
```

**todo-local（社区）：**
```yaml
description: Append a todo item to the local ~/todo.txt file. Use when: user says '#todo <item>', 'add a todo', 'remember to...', or asks you to record a task. NOT for: project management tools, remote task services.
```

---

## 五、Markdown 正文结构

### 推荐模板

```markdown
# 技能名称

**Pattern: [Tool Wrapper / Generator / Reviewer / Inversion / Pipeline]**

## When to Use
什么情况下触发这个技能

## Prerequisites
需要什么前置条件（工具、API Key 等）

## Instructions
1. 第一步（具体动作）
2. ⛔ Gate: 验证 X 后再继续
3. 第二步
4. 第三步 → 产出输出

## Commands
| 命令 | 说明 |
|------|------|
| `command arg1 arg2` | 做什么 |

## Examples
### 成功案例 1
**Input**: "用户输入"
**Output**: "预期输出"

### 边界案例
**Input**: "模糊输入"
**Action**: 询问用户澄清

## Output Format
```json
{ "status": "success", "result": "..." }
```

## Error Handling
| 错误 | 原因 | 解决 |
|------|------|------|
| Timeout | 网络问题 | 重试一次 |

## Notes
- 注意事项 1
- 注意事项 2

## References
- 详细文档 → `{baseDir}/references/api-guide.md`
```

### 行数预算

| 组件 | 推荐上限 | 硬上限 |
|------|---------|--------|
| SKILL.md 正文 | 200 行 | 500 行 |
| 字数 | 3,500 词 | 5,000 词 |
| description | 200 字符 | 1,024 字符 |

---

## 六、五种设计模式

| 模式 | 解决的问题 | 关键机制 | 例子 |
|------|-----------|----------|------|
| **Tool Wrapper** | 上下文膨胀 | 按需加载领域知识 | firecrawl（网页抓取） |
| **Generator** | 输出不一致 | 固定模板 + 风格指南 | calculator（数学计算） |
| **Reviewer** | 混合检查标准 | 分离检查清单与执行 | python-code-review |
| **Inversion** | Agent 猜测而非询问 | 门控：信息完整前不输出 | plan-mode |
| **Pipeline** | 复杂任务跳步 | 显式阶段 + 门控 | reflection（反思系统） |

---

## 七、渐进式加载机制

```
用户消息到达
  │
  ▼
阶段 1: 发现（每条消息）
  → 只读取所有技能的 YAML frontmatter
  → 成本：~30-50 tokens/技能
  → 决策：该技能是否匹配？
  │
  ├── 不匹配 → 忽略（零额外成本）
  │
  ▼
阶段 2: 执行（仅匹配时）
  → 加载完整 SKILL.md 正文
  → 成本：数百到数千 tokens
  │
  ▼
阶段 3: 按需（执行期间）
  → 读取 references/ 文件
  → 成本：视文件而定
```

**结论**：`description` 必须精准（每条消息都读），正文可以详细（匹配时才读），重文档放 `references/`（按需读）。

---

## 八、安全规则

1. **永远不要用裸 `Bash`**，必须限定范围：`Bash(git:*)`、`Bash(npm:*)`
2. **不要硬编码 API Key**，用环境变量
3. **第三方技能视为不受信任代码**
4. **ClawHub 约 12% 技能有安全问题**，优先选安装量 10,000+ 的

---

## 九、完整示例：搜索技能（适配你的 SearXNG）

```yaml
---
name: searxng-search
description: |
  Search the internet using local SearXNG engine.
  Triggers: "搜索", "search for", "look up", "查一下", "帮我找"
  Does NOT trigger:
  - User already provided a specific URL
  - Simple factual questions the model already knows
  Output: Structured search results with titles, URLs, and snippets
version: 1.0.0
user-invocable: true
allowed-tools: "Bash(curl:*)"
metadata:
  {
    "openclaw": {
      "emoji": "🔍",
      "requires": {
        "env": ["SEARXNG_URL"]
      }
    }
  }
---

# SearXNG Search

**Pattern: Tool Wrapper**

## When to Use
User needs to search the internet for information, look up facts, or find URLs.

## Prerequisites
- SearXNG running locally (default: http://localhost:8888)
- `SEARXNG_URL` environment variable set

## Instructions
1. Extract search query from user message
2. URL-encode the query
3. Call SearXNG API
4. Parse and summarize results

## Commands

### Basic Search
```bash
curl -sS "${SEARXNG_URL}/search?q=QUERY&format=json" | head -c 5000
```

### Search with Category
```bash
curl -sS "${SEARXNG_URL}/search?q=QUERY&format=json&categories=images"
```

Categories: general, images, news, science, files

## Examples

### Example 1: Basic Search
**Input**: "帮我搜索 React 18 新特性"
**Execute**: `curl -sS "http://localhost:8888/search?q=React+18+新特性&format=json"`
**Output**: Top 10 results with titles, URLs, and snippets

### Example 2: Image Search
**Input**: "搜一下猫咪图片"
**Execute**: `curl -sS "http://localhost:8888/search?q=猫咪&format=json&categories=images"`

### Edge Case
**Input**: "搜索"（no query provided）
**Action**: Ask user what they want to search for

## Output Format
Return results as a numbered list:
1. **Title** - URL
   Snippet text...

## Error Handling
| Error | Cause | Fix |
|-------|-------|-----|
| Connection refused | SearXNG not running | Start SearXNG: `docker-compose up -d` |
| Empty results | Query too specific | Broaden search terms |
| Timeout | Network issue | Retry once |
```

---

## 十、技能存放路径

| 路径 | 优先级 | 作用域 |
|------|--------|--------|
| `<workspace>/skills/` | 最高 | 单 Agent |
| `~/.openclaw/skills/` | 中 | 所有 Agent 共享 |
| 内置技能（随安装包） | 最低 | 全局 |

---

## 十一、质量检查清单

**设计：**
- [ ] description 有触发关键词 + 负面边界
- [ ] description 在发现阶段有效（~30-50 tokens）
- [ ] 与已安装技能无触发冲突
- [ ] 单一职责（一个技能专注一个领域）

**内容：**
- [ ] 指令是编号步骤，非段落
- [ ] 至少 2 个示例 + 1 个边界案例
- [ ] 输出格式明确定义
- [ ] 错误处理覆盖常见失败

**安全：**
- [ ] `allowed-tools` 没有裸 `Bash`
- [ ] API Key 用环境变量，非硬编码
- [ ] 脚本内容可审查

**维护：**
- [ ] 版本号反映实际状态
- [ ] 有触发测试（3 个应触发 + 1 个不应触发）
