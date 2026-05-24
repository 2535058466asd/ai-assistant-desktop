// ==========================================
// 工具函数模块
// 统一 localStorage 操作和数组工具
// ==========================================

// ===== localStorage 工具 =====

/**
 * 从 localStorage 读取值
 * @param key - 当前键名
 * @param fallback - 默认值
 * @param legacyKey - 旧键名（用于迁移）
 */
export function readStored(key: string, fallback: string = '', legacyKey?: string): string {
  if (typeof window === 'undefined') return fallback;
  return window.localStorage.getItem(key) || (legacyKey ? window.localStorage.getItem(legacyKey) || '' : '') || fallback;
}

/**
 * 写入 localStorage，同时清理旧键
 * @param key - 当前键名
 * @param value - 要写入的值
 * @param legacyKey - 旧键名（写入后删除）
 */
export function writeStored(key: string, value: string, legacyKey?: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, value);
  if (legacyKey) {
    window.localStorage.removeItem(legacyKey);
  }
}

/**
 * 删除 localStorage 中的键
 * @param key - 当前键名
 * @param legacyKey - 旧键名（一并删除）
 */
export function removeStored(key: string, legacyKey?: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(key);
  if (legacyKey) {
    window.localStorage.removeItem(legacyKey);
  }
}

/**
 * 读取数字类型的存储值
 */
export function readStoredNumber(key: string, fallback: number, legacyKey?: string): number {
  const value = readStored(key, '', legacyKey);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// ===== 数组工具 =====

/**
 * 按 ID 插入或更新数组中的元素
 * @param arr - 原数组
 * @param item - 要插入/更新的元素（必须有 id 字段）
 * @returns 新数组
 */
export function upsertById<T extends { id: string }>(arr: T[], item: T): T[] {
  const index = arr.findIndex((el) => el.id === item.id);
  if (index >= 0) {
    return arr.map((el) => (el.id === item.id ? { ...el, ...item } : el));
  }
  return [...arr, item];
}

/**
 * 按 ID 查找数组中的元素
 */
export function findById<T extends { id: string }>(arr: T[], id: string): T | undefined {
  return arr.find((el) => el.id === id);
}

/**
 * 按 ID 从数组中移除元素
 */
export function removeById<T extends { id: string }>(arr: T[], id: string): T[] {
  return arr.filter((el) => el.id !== id);
}
