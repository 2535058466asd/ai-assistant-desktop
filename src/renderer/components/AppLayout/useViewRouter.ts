// ==========================================
// 视图路由 hook — 管理一级页面 + 设置标签切换
// ==========================================

import { useState, useEffect } from 'react';

const STORAGE_KEY_ACTIVE_VIEW = 'nova.activeView';
const LEGACY_STORAGE_KEY_ACTIVE_VIEW = 'qiyuan_active_view';

export type AppView = 'chat' | 'workspace' | 'knowledge' | 'memory' | 'tools' | 'settings';
export type SettingsPageTab = 'model-api' | 'voice' | 'search' | 'shortcuts' | 'diagnostics' | 'system-prompt';

function getInitialView(): AppView {
  const saved = (localStorage.getItem(STORAGE_KEY_ACTIVE_VIEW) || localStorage.getItem(LEGACY_STORAGE_KEY_ACTIVE_VIEW)) as AppView | null;
  const validViews: AppView[] = ['chat', 'workspace', 'knowledge', 'memory', 'tools', 'settings'];
  return validViews.includes(saved as AppView) ? (saved as AppView) : 'chat';
}

export function useViewRouter() {
  const [activeView, setActiveView] = useState<AppView>(getInitialView);
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsPageTab>('model-api');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ACTIVE_VIEW, activeView);
    localStorage.removeItem(LEGACY_STORAGE_KEY_ACTIVE_VIEW);
  }, [activeView]);

  return {
    activeView,
    setActiveView,
    activeSettingsTab,
    setActiveSettingsTab,
  };
}
