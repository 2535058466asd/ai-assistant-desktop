# 启源AI - 记忆系统与上下文管理 V2 开发文档

> 版本：V2.0
> 日期：2026-04-16
> 状态：待开发
> 参考架构：[记忆系统调研报告](./ai-agent-memory-architecture-report.md)

---

## 一、现状分析

### 1.1 当前实现

| 模块 | 现状 | 问题 |
|------|------|------|
| **记忆提取** | 正则匹配（"我叫XX"/"我喜欢XX"/"记住XX"） | 只能识别固定模式，无法理解语义 |
| **记忆存储** | JSON文件（`userData/qiyuan-memory/`） | 无向量检索、无语义搜索 |
| **记忆注入** | `getMemoryPrompt()` 拼入system prompt | 最多20条，无相关性排序 |
| **上下文管理** | 固定20条FIFO截断 | 工具消息也占名额，实际对话<10轮 |
| **记忆上限** | 200条，按类别优先级淘汰 | 无时间衰减、无重要性评分 |

### 1.2 目标架构

```
用户输入
  │
  ▼
[短期上下文] ← 当前对话历史
  │ 接近token上限时 → AI自动压缩（保留最近N条+压缩摘要）
  │
  ▼
[记忆提取] ← 对话结束后，LLM自动提取关键事实
  │ 替代正则匹配，利用LLM理解语义
  │
  ▼
[记忆存储] ← SQLite本地持久化
  │ 每条记忆：内容、时间、类别、重要性
  │
  ▼
[记忆注入] ← 每次对话开始时，检索相关记忆注入上下文
  │ 按相关性排序，不是全量注入
```

---

## 二、开发任务清单

### 任务1：工具结果截断 + 上下文自动压缩

**目标**：工具返回结果统一截断防止单次调用撑爆上下文；当对话历史接近token上限时，AI自动压缩旧消息。

**修改文件**：`src/renderer/core/orchestrator.ts`

#### 1.1 工具结果截断

**原因**：搜索、读文件等工具可能返回大量文本（3000+ token），直接放入上下文会快速撑满窗口。AI虽然会在回复中总结，但原始结果仍占着上下文空间。

**设计**：统一截断，不区分工具类型，一刀切最省心。

```typescript
// 新增常量
private static readonly MAX_TOOL_RESULT_TOKENS = 500; // 工具返回结果最大token数

// 新增方法：工具结果截断
private truncateToolResult(result: string): string {
  const estimatedTokens = Math.ceil(result.length / 4); // 粗略估算
  if (estimatedTokens <= this.MAX_TOOL_RESULT_TOKENS) return result;
  const maxChars = this.MAX_TOOL_RESULT_TOKENS * 4;
  const truncated = result.slice(0, maxChars);
  return truncated + `\n\n[结果已截断，原文共 ${result.length} 字]`;
}
```

**使用位置**：在工具调用返回结果后、存入 `conversationHistory` 之前，统一调用 `truncateToolResult()`。

**为什么不需要LLM压缩工具结果**：
- 截断就够了，500 token 足够 AI 理解上下文
- 如果信息不够，AI 会主动再次调用工具获取（Function Calling 按需获取）
- 用 LLM 压缩 = 多花一次 API 调用 + 增加延迟 + 多维护一个提示词，收益不大

**各工具返回情况**：

| 工具 | 返回大小 | 截断频率 |
|------|---------|---------|
| 搜索 | 经常很大 | 高 |
| 读文件 | 看文件 | 中 |
| 执行命令 | 一般较短 | 低 |
| 记忆查询 | 结构化短文本 | 几乎不触发 |
| 打开应用 | 成功/失败 | 不需要 |

#### 1.2 上下文自动压缩

**目标**：当对话历史接近token上限时，AI自动压缩旧消息，保留最近N条+压缩摘要。

**设计**：

```typescript
// 新增常量
private static readonly MAX_CONTEXT_TOKENS = 80000; // 模型窗口的70%
private static readonly KEEP_RECENT_MESSAGES = 6;   // 保留最近6条不压缩
private static readonly COMPACT_THRESHOLD = 0.8;     // 使用80%时触发压缩

// 新增方法
private async shouldCompact(): Promise<boolean> {
  // 估算当前token数（粗略：中文1字≈2token，英文1词≈1.3token）
  const estimatedTokens = this.estimateTokens(this.conversationHistory);
  return estimatedTokens > this.MAX_CONTEXT_TOKENS * this.COMPACT_THRESHOLD;
}

private async compactHistory(): Promise<void> {
  // 1. 分离：需要压缩的消息 + 保留的消息
  const toCompact = this.conversationHistory.slice(
    0, this.conversationHistory.length - this.KEEP_RECENT_MESSAGES
  );
  const toKeep = this.conversationHistory.slice(
    -this.KEEP_RECENT_MESSAGES
  );

  // 2. 调用LLM压缩
  const summary = await this.callLLMForCompaction(toCompact);

  // 3. 替换：用摘要消息替代被压缩的消息
  this.conversationHistory = [
    { role: 'system', content: `[历史摘要] ${summary}` },
    ...toKeep
  ];
}
```

**压缩Prompt**：

```
你是一个对话摘要助手。请将以下对话历史压缩为简洁的摘要，保留：
1. 用户的核心需求和意图
2. 已完成的关键操作和结果
3. 重要的决策和结论
4. 未完成的待办事项

忽略：闲聊、重复确认、中间错误

摘要格式：用简洁的要点列出，每条不超过50字。
```

**注意**：压缩输入是整个对话历史数组（包含工具调用和工具返回结果），LLM 会自然地把工具结果中的关键信息吸收到摘要里，不需要区分"这是工具结果"还是"这是对话"。

**触发时机**：在 `processTextInput()` 中，push新消息后检查是否需要压缩。

**验收标准**：
- [ ] 工具返回超过500 token时自动截断，末尾标注原文长度
- [ ] 对话超过约15轮时自动触发压缩
- [ ] 压缩后保留最近6条完整消息 + 1条摘要
- [ ] 压缩不丢失关键信息（用户意图、工具执行结果）
- [ ] 压缩后token使用量明显下降

---

### 任务2：记忆提取升级（LLM替代正则）

**目标**：用LLM替代正则匹配，从对话中自动提取关键事实。

**修改文件**：`src/renderer/core/utils/memoryExtractor.ts`

**设计**：

```typescript
// 新增：LLM提取记忆
export async function extractMemoriesWithLLM(
  userText: string,
  assistantText: string
): Promise<ExtractedMemory[]> {
  const prompt = `分析以下对话，提取值得记住的关键信息。

用户：${userText}
助手：${assistantText}

提取规则：
1. 只提取事实性信息（用户偏好、项目信息、个人情况、重要决策）
2. 不提取临时性信息（"今天天气怎么样"）
3. 不提取AI的回复内容
4. 每条记忆独立、简洁、具体
5. 如果没有值得记住的信息，返回空数组

输出JSON格式：
[{"content": "记忆内容", "category": "preference|fact|project|decision", "importance": 1-10}]

只输出JSON，不要其他文字。`;

  // 调用LLM（使用mini模型，成本低）
  const response = await callMiniModel(prompt);
  return JSON.parse(response);
}
```

**类别定义**：

| 类别 | 说明 | 示例 |
|------|------|------|
| `preference` | 用户偏好 | "用户喜欢简洁的UI风格" |
| `fact` | 个人事实 | "用户是前端开发者，使用React" |
| `project` | 项目信息 | "用户当前在做电商项目，技术栈React+Node.js" |
| `decision` | 重要决策 | "用户决定不用Java做后端" |

**触发时机**：每次对话完成后（`processTextInput` 的 finally 块中）。

**验收标准**：
- [ ] 能从对话中提取用户偏好、项目信息等关键事实
- [ ] 不会把临时性信息（天气、闲聊）当成记忆
- [ ] 不会把AI的回复内容当成用户记忆
- [ ] 提取失败不影响聊天主流程（catch后静默）
- [ ] 使用mini模型控制成本

---

### 任务3：记忆存储升级（SQLite替代JSON）

**目标**：从JSON文件升级到SQLite，支持增删改查。

**修改文件**：`src/main/services/memoryServiceBackend.ts`

**数据库设计**：

```sql
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,           -- UUID
  content TEXT NOT NULL,          -- 记忆内容
  category TEXT NOT NULL,        -- preference/fact/project/decision
  importance INTEGER DEFAULT 5,   -- 重要性 1-10
  created_at INTEGER NOT NULL,    -- 创建时间戳
  updated_at INTEGER NOT NULL,    -- 更新时间戳
  access_count INTEGER DEFAULT 0, -- 被检索次数
  source_conversation TEXT        -- 来源对话ID（可选）
);

CREATE INDEX IF NOT EXISTS idx_category ON memories(category);
CREATE INDEX IF NOT EXISTS idx_importance ON memories(importance);
CREATE INDEX IF NOT EXISTS idx_created_at ON memories(created_at);
```

**保留JSON的偏好存储**：`preferences.json` 继续使用（key-value简单结构不需要数据库）。

**新增方法**：

```typescript
// 新增：添加记忆（带去重 + 自动清理）
async addMemory(content: string, category: string, importance: number): Promise<void> {
  // 1. 去重检查（内容相似度>90%则合并，不新增）
  const duplicate = await this.deduplicateMemory(content);
  if (duplicate) {
    await this.db.run(
      'UPDATE memories SET access_count = access_count + 1, updated_at = ? WHERE id = ?',
      [Date.now(), duplicate.id]
    );
    return;
  }

  // 2. 存入新记忆
  const id = crypto.randomUUID();
  await this.db.run(
    'INSERT INTO memories (id, content, category, importance, created_at, updated_at, access_count) VALUES (?, ?, ?, ?, ?, ?, 0)',
    [id, content, category, importance, Date.now(), Date.now()]
  );

  // 3. 容量检查，超限则自动淘汰（不需要定时任务，每次写入时顺便维护）
  const { count } = await this.db.get('SELECT COUNT(*) as count FROM memories');
  if (count > MAX_MEMORIES) {
    await this.evictMemories(count - MAX_MEMORIES);
  }
}

// 新增：淘汰最低分记忆
private async evictMemories(count: number): Promise<void> {
  // 淘汰规则：优先级 = importance * 0.5 + access_count + 时间衰减分
  // 时间衰减：30天内线性衰减，超过30天不再加分
  const toEvict = await this.db.all(`
    SELECT id FROM memories
    ORDER BY (
      importance * 0.5
      + access_count
      + MAX(0, 5 - (strftime('%s','now') - created_at / 1000) / 86400 / 30)
    ) ASC
    LIMIT ?
  `, [count]);

  for (const mem of toEvict) {
    await this.db.run('DELETE FROM memories WHERE id = ?', [mem.id]);
  }
}

// 新增：更新记忆（内容变更时）
async updateMemory(id: string, newContent: string): Promise<void>

// 新增：搜索记忆（关键词+类别+时间衰减+重要性加权）
async searchMemories(query: string, limit: number): Promise<Memory[]>

// 新增：获取最近N条记忆
async getRecentMemories(limit: number, category?: string): Promise<Memory[]>

// 新增：记忆去重（内容相似度>90%则合并）
private async deduplicateMemory(content: string): Promise<Memory | null>
```

**记忆自动清理机制**：

| 机制 | 说明 |
|------|------|
| **容量上限** | 最多 500 条（`MAX_MEMORIES = 500`） |
| **淘汰时机** | 每次写入新记忆时检查，不需要定时任务 |
| **淘汰规则** | 综合评分最低的先删：`importance × 0.5 + access_count + 时间衰减分` |
| **去重** | 新记忆存入前检查相似度，>90% 则合并（更新 access_count + updated_at） |
| **时间衰减** | 30天内线性衰减，超过30天不再加分 |

**验收标准**：
- [ ] SQLite数据库正常创建和读写
- [ ] 记忆增删改查功能正常
- [ ] 去重机制生效（相似内容不重复存储）
- [ ] 兼容现有JSON偏好文件（不破坏现有功能）

---

### 任务4：记忆注入优化（按相关性排序）

**目标**：每次对话开始时，检索最相关的记忆注入上下文，而不是全量注入。

**修改文件**：`src/main/services/memoryServiceBackend.ts`（检索逻辑）+ `orchestrator.ts`（注入逻辑）

**设计**：

```typescript
// 改进 getMemoryPrompt()
getMemoryPrompt(userInput: string): string {
  // 1. 偏好：全部输出（保持不变）
  // 2. 记忆：根据用户当前输入检索相关记忆
  const relevantMemories = this.searchMemories(userInput, 10);

  // 3. 按相关性排序（搜索结果已排序）
  // 4. 格式化输出
  let prompt = '\n【用户偏好】\n';
  prompt += formatPreferences(this.preferences);

  if (relevantMemories.length > 0) {
    prompt += '\n【相关记忆】\n';
    for (const mem of relevantMemories) {
      prompt += `- [${mem.category}] ${mem.content}\n`;
    }
  }

  return prompt;
}
```

**检索逻辑**（简单关键词匹配，后续可升级为向量检索）：

```typescript
async searchMemories(query: string, limit: number): Promise<Memory[]> {
  // 1. 分词：将用户输入拆分为关键词
  const keywords = query.split(/\s+/).filter(w => w.length > 1);

  // 2. 对每条记忆计算匹配分数
  const scored = this.allMemories.map(mem => {
    let score = 0;
    for (const kw of keywords) {
      if (mem.content.includes(kw)) score += 1;
    }
    // 时间衰减：越近的记忆加分
    const ageInDays = (Date.now() - mem.created_at) / (1000 * 60 * 60 * 24);
    score += Math.max(0, 5 - ageInDays / 30); // 30天内线性衰减
    // 重要性加权
    score += mem.importance * 0.5;
    return { ...mem, score };
  });

  // 3. 按分数排序，返回top N
  return scored
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
```

**验收标准**：
- [ ] 用户说"帮我写React代码"时，React相关的记忆排在前面
- [ ] 最近的记忆比旧记忆排名更高
- [ ] 重要性高的记忆排名更高
- [ ] 注入的记忆不超过10条，不浪费token

---

## 三、文件修改清单

| 文件 | 修改内容 | 新增/修改 |
|------|---------|----------|
| `orchestrator.ts` | 新增 `truncateToolResult()` 工具结果截断 | 修改 |
| `orchestrator.ts` | 工具调用返回后、存入历史前调用截断 | 修改 |
| `orchestrator.ts` | 新增 `shouldCompact()`、`compactHistory()`、`estimateTokens()` | 修改 |
| `orchestrator.ts` | `processTextInput()` 中添加压缩检查 | 修改 |
| `orchestrator.ts` | `buildSystemPrompt()` 传入用户输入用于记忆检索 | 修改 |
| `memoryExtractor.ts` | 新增 `extractMemoriesWithLLM()` | 修改 |
| `memoryExtractor.ts` | `tryExtractAndSaveMemory()` 调用LLM提取 | 修改 |
| `memoryServiceBackend.ts` | 新增SQLite数据库初始化 | 修改 |
| `memoryServiceBackend.ts` | 新增 `addMemory()`（含去重+自动清理）、`evictMemories()` | 修改 |
| `memoryServiceBackend.ts` | 新增 `updateMemory()`、`searchMemories()` | 修改 |
| `memoryServiceBackend.ts` | 改进 `getMemoryPrompt()` 支持相关性检索 | 修改 |
| `memoryServiceBackend.ts` | 新增去重逻辑 `deduplicateMemory()` | 修改 |

---

## 四、开发顺序

```
第1步：记忆存储升级（SQLite）
  └─ 因为后续功能都依赖存储层
  └─ 预计：半天

第2步：记忆提取升级（LLM替代正则）
  └─ 依赖新的存储层
  └─ 预计：1天

第3步：记忆注入优化（相关性排序）
  └─ 依赖新的存储层和检索逻辑
  └─ 预计：半天

第4步：上下文自动压缩
  └─ 独立功能，可以最后做
  └─ 预计：1天

总计：约3天
```

---

## 五、风险与注意事项

1. **LLM提取记忆会增加API调用**：每次对话结束多一次mini模型调用，成本约0.001元/次，可接受
2. **SQLite需要在main进程操作**：通过IPC从renderer调用，现有架构已支持
3. **压缩可能丢失信息**：压缩prompt需要精心设计，多次测试确保关键信息不丢失
4. **向后兼容**：保留JSON偏好文件，不破坏现有用户体验
5. **token估算不精确**：粗略估算即可，不需要精确计算（留20%余量）
6. **工具结果截断可能丢失信息**：AI会主动再次调用工具获取，不需要额外处理
7. **记忆数据库不需要定时清理**：每次写入时顺便检查容量和去重，用规则代替定时任务

---

## 六、设计决策记录

### 为什么是两层记忆（短期+长期）而不是三层？

当前架构只有短期上下文和长期记忆库，没有显式的中间层。原因是：
- **中间态 = 压缩过程本身**：短期→长期的过程就是压缩，不需要独立存储
- **个人助手场景对话量不大**：两层够用，三层是过度设计
- **可随时扩展**：如果未来遇到"压缩后信息丢失"的问题，加一个中间缓存层（TTL 30分钟）即可，改动很小

### 为什么工具结果用截断而不是LLM压缩？

- 截断是 O(1) 操作，零延迟零成本
- LLM压缩需要额外API调用，增加延迟和成本
- AI有Function Calling能力，信息不够会主动再调工具
- 500 token足够AI理解上下文并给出有用回复

### 为什么记忆清理用"每次写入时检查"而不是定时任务？

- 个人助手写入频率不高，每次写入时检查的开销可以忽略
- 不需要引入定时器，减少系统复杂度
- 实时维护比定时批量清理更及时

### 为什么不用向量数据库？

- 个人助手记忆量小（<500条），关键词匹配+时间衰减+重要性加权足够
- 向量数据库（如ChromaDB）需要额外依赖和embedding API调用
- 后续如果记忆量增大，可以平滑升级为向量检索，当前架构不阻塞

---

## 七、验收测试场景

### 场景1：记忆提取
```
用户："我叫李子豪，正在用React开发一个电商项目"
AI回复后 → 自动提取：
  - {content: "用户叫李子豪", category: "fact", importance: 8}
  - {content: "用户是前端开发者，使用React", category: "fact", importance: 7}
  - {content: "用户当前项目是电商系统", category: "project", importance: 9}
```

### 场景2：记忆注入
```
新对话开始，用户说："帮我写一个React组件"
→ 系统检索到：
  - "用户是前端开发者，使用React"（相关）
  - "用户当前项目是电商系统"（相关）
  - "用户喜欢简洁的UI风格"（相关）
→ 注入到system prompt中
```

### 场景3：上下文压缩
```
对话进行到第15轮 → 触发压缩
→ 保留最近6条完整消息
→ 前9条压缩为摘要：
  "[历史摘要]
  - 用户要求搜索Electron版本号，已通过exec_command获取
  - 用户要求保存结果到桌面，已通过write_file完成
  - 用户偏好暗色主题
  ..."
→ 对话继续，token使用量下降
```

### 场景4：记忆去重
```
第一次对话："我是前端开发者，用React"
→ 存储：{content: "用户是前端开发者，使用React", ...}

第二次对话："我用React做前端开发"
→ 检测到相似度>90%，不重复存储
```

---

*文档完成。核心原则：代码保底（防溢出、防重复），AI负责智能决策（提取什么、保留什么）。*
