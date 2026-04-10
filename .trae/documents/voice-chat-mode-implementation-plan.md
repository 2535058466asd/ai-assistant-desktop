# 语音对话模式实现计划

## 📋 任务概述

实现半双工语音对话模式：用户说话 → AI 回复 → 用户说话 → AI 回复...（全程不需要点击按钮）

---

## ✅ 已完成的工作

### 1. 创建语音对话模式状态管理类 ✅
- 文件：`src/renderer/core/voiceChat/VoiceChatMode.ts`
- 功能：
  - 状态管理：idle → listening → thinking → speaking → idle
  - 静音检测：用户停止说话 1.5 秒后自动发送
  - 自动循环：TTS 播放完成后自动回到监听状态

### 2. 在 App.tsx 中集成语音对话模式 ✅
- 添加了 `voiceChatState` 和 `isVoiceChatEnabled` 状态
- 设置了语音对话模式回调
- 在流式结束时自动播放 AI 回复（如果语音对话模式开启）

### 3. 修改 AppLayout.tsx 接收语音对话模式 props ✅
- 添加了 `voiceChatState`、`isVoiceChatEnabled`、`onToggleVoiceChat` props

### 4. 修改 InputArea.tsx 接收语音对话模式 props ✅
- 添加了 `voiceChatState`、`isVoiceChatEnabled`、`onToggleVoiceChat` props

---

## 🔧 剩余工作

### 1. 在 AppLayout.tsx 中传递 props 给 InputArea
**文件**：`src/renderer/components/AppLayout/AppLayout.tsx`

**修改内容**：
```tsx
<InputArea
  ref={inputRef}
  isLoading={isLoading}
  showSuggestions={showWelcome}
  onSendMessage={handleSendMessage}
  onSuggestionClick={handleSuggestionClick}
  // 添加以下 props
  voiceChatState={voiceChatState}
  isVoiceChatEnabled={isVoiceChatEnabled}
  onToggleVoiceChat={onToggleVoiceChat}
/>
```

### 2. 在 InputArea.tsx 中添加语音对话模式开关按钮
**文件**：`src/renderer/components/input/InputArea.tsx`

**添加内容**：
- 在按钮区域添加一个「语音对话模式」开关按钮
- 按钮样式：开启时高亮显示
- 点击时调用 `onToggleVoiceChat`

### 3. 添加 UI 状态提示
**文件**：`src/renderer/components/input/InputArea.tsx`

**添加内容**：
- 显示当前语音对话模式状态
- 状态提示：
  - `idle`：「点击开启语音对话」
  - `listening`：「正在听...」
  - `thinking`：「正在思考...」
  - `speaking`：「正在播放...」

### 4. 添加 CSS 样式
**文件**：`src/renderer/components/input/InputArea.module.css`

**添加内容**：
- 语音对话模式按钮样式
- 状态提示样式

---

## 🎯 最终效果

```
用户点击「语音对话模式」按钮
    ↓
自动开始监听：「正在听...」
    ↓
用户说话，ASR 识别
    ↓
用户停止说话 1.5 秒后自动发送
    ↓
「正在思考...」
    ↓
AI 返回回复，自动 TTS 播放
    ↓
「正在播放...」
    ↓
播放完成，自动回到监听
    ↓
「正在听...」（等待用户说话）
```

---

## 📁 涉及的文件

| 文件 | 状态 | 说明 |
|------|------|------|
| `src/renderer/core/voiceChat/VoiceChatMode.ts` | ✅ 已创建 | 语音对话模式状态管理 |
| `src/renderer/App.tsx` | ✅ 已修改 | 集成语音对话模式 |
| `src/renderer/components/AppLayout/AppLayout.tsx` | 🔧 部分完成 | 需要传递 props 给 InputArea |
| `src/renderer/components/input/InputArea.tsx` | 🔧 部分完成 | 需要添加按钮和状态提示 |
| `src/renderer/components/input/InputArea.module.css` | ⏳ 待修改 | 添加样式 |

---

## ⏱️ 预计剩余时间

约 15-20 分钟
