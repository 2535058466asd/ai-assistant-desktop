/**
 * ==========================================
 * 启源 AI - 应用入口文件（main.tsx）
 * 职责：将 React 组件挂载到 DOM
 * ==========================================
 */

// 导入 React 和 ReactDOM
import React from 'react'
import ReactDOM from 'react-dom/client'

// 导入主应用组件
import App from './App.tsx'

// 导入全局样式（包含设计令牌、重置样式、动画关键帧）
import './styles/global.css'

/**
 * 渲染 React 应用到 DOM
 * 就像"投影仪"，将 App 组件投射到 index.html 的 #root 节点
 */
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
