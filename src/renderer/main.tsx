// 导入 React 和 ReactDOM
import React from 'react'
import ReactDOM from 'react-dom/client'
// 导入主应用组件
import App from './App.tsx'
// 导入样式文件
import './index.css'

/**
 * 渲染 React 应用
 * 就像"投影仪"，将 React 组件投射到 DOM 中
 */
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
