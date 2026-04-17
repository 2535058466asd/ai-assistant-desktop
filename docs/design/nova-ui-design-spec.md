# Nova UI 设计方案 - 品牌重塑 + 设置页 + 精修

> 确认日期：2026-04-17
> 风格：在现有毛玻璃/渐变基础上精修，不大改风格

---

## 一、品牌重塑

### 改动清单

| 文件 | 改动 |
|------|------|
| `src/renderer/components/header/Header.tsx` | 品牌名 "启源 AI" → "Nova" |
| `src/renderer/components/WelcomeScreen/WelcomeScreen.tsx` | 标题 "启源 AI" → "Nova" |
| `src/main/index.ts` 或 `index.html` | 窗口标题 → "Nova" |
| `package.json` | `productName` → "Nova" |

### Logo
- 保持现有青蓝渐变圆角方块形状不变
- 内部图标改为星星/光芒元素（✦ 或自定义 SVG）
- 不改尺寸（28x28 Header，80x80 WelcomeScreen）

---

## 二、设置页（抽屉式）

### 触发方式
- 侧边栏底部 ⚙️ 图标点击触发
- Header "更多"菜单中的设置项也触发（保留入口）

### 布局
- 宽度 360px，从右侧滑入
- 毛玻璃背景 `backdrop-filter: blur(20px)`，与现有风格统一
- 半透明遮罩层，点击遮罩关闭
- 动画：`transform: translateX(100%) → translateX(0)`，时长 0.3s

### 结构
```
设置面板（一级）
├── 标题栏：⚙️ 设置 + ✕ 关闭按钮
├── 菜单列表（每个板块是一行，右侧 ▸ 箭头）：
│   ├── 🤖 模型管理
│   ├── 🔑 API 配置
│   ├── 🧠 记忆管理
│   ├── 🎤 语音设置
│   ├── 🔍 搜索设置
│   ├── ⌨️ 快捷键
│   └── ℹ️ 关于
```

点击板块 → 右侧展开子面板（二级），显示该板块的具体设置内容。子面板有 ← 返回按钮。

### 新建文件
- `src/renderer/components/Settings/SettingsDrawer.tsx`
- `src/renderer/components/Settings/SettingsDrawer.module.css`

### 各子面板内容（初期只做框架，内容后续填充）

| 板块 | 初期内容 |
|------|---------|
| 模型管理 | 模型列表展示、添加/删除模型入口 |
| API 配置 | API Key 输入框（火山引擎） |
| 记忆管理 | 记忆数量统计、清空记忆按钮 |
| 语音设置 | ASR/TTS 引擎选择下拉 |
| 搜索设置 | 搜索引擎 URL 配置 |
| 快捷键 | 快捷键列表展示 |
| 关于 | 版本号、品牌名 Nova |

### Header 精简
- 移除"更多"菜单中的设置相关项（移到设置页）
- Header 只保留：侧边栏切换 + Logo + "Nova" + 模型切换 + 主题切换 + 语音按钮

---

## 三、UI 精修

### 3.1 必须修复

#### 亮色主题 token 补全
在 `global.css` 的 `[data-theme="light"]` 中添加：
```css
--accent-purple: #7c3aed;
--accent-green: #16a34a;
--gradient-brand: linear-gradient(135deg, #0891b2, #2563eb, #7c3aed);
--shadow-btn: 0 2px 8px rgba(37, 99, 235, 0.2);
--shadow-btn-hover: 0 4px 12px rgba(37, 99, 235, 0.3);
--shadow-msg-user: 0 4px 16px rgba(37, 99, 235, 0.15);
--shadow-welcome: 0 0 40px rgba(8, 145, 178, 0.15);
```

#### Toast 组件样式
在 `global.css` 或新建 `Toast.module.css` 中添加：
- 固定定位右上角
- 毛玻璃背景 + 圆角 + 阴影
- `slideInRight` 动画（已有关键帧）
- 3 秒后自动淡出消失
- 成功/错误/信息三种类型（绿色/红色/蓝色左边框）

#### AppLayout 硬编码颜色
背景渐变改用 CSS 变量：
```css
/* 暗色 */
background: linear-gradient(135deg, var(--bg-primary) 0%, #0d1b2a 40%, #1b2838 100%);
/* 亮色 */
background: linear-gradient(135deg, var(--bg-primary) 0%, #ffffff 40%, var(--bg-tertiary) 100%);
```

#### 动画时长统一
所有组件中直接写的 `0.3s`、`0.15s`、`0.12s` 改为对应的 `var(--transition-slow)`、`var(--transition-normal)`、`var(--transition-fast)`。

### 3.2 精致度提升

#### 主题切换过渡
在 `global.css` 的 `*` 选择器中添加：
```css
* {
  transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
}
```

#### 侧边栏对话项右键菜单
- 右键弹出上下文菜单（毛玻璃背景）
- 菜单项：重命名、置顶、删除
- 删除项用红色文字

#### 滚动条优化
```css
/* 非悬停时隐藏 */
.chatArea::-webkit-scrollbar-thumb {
  background: transparent;
}
.chatArea:hover::-webkit-scrollbar-thumb {
  background: var(--text-muted);
}
/* 宽度 4px */
::-webkit-scrollbar { width: 4px; }
```

#### AI 消息操作按钮 tooltip
悬停时在按钮下方显示小文字提示（"复制"、"重新生成"），用 `::after` 伪元素或 title 属性。

#### 发送按钮禁用态
输入为空时：
```css
.sendButton:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}
```

---

## 四、实施顺序

1. **品牌重塑** — 改文字，最简单，先做
2. **UI 精修 3.1** — 修复 bug，必须做
3. **设置页框架** — 新建组件，搭骨架
4. **UI 精修 3.2** — 锦上添花，逐步迭代
