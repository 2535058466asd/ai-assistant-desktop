export type MemoryCategory = 'preference' | 'fact' | 'project' | 'decision' | 'belief' | 'event';
export type MemoryScope = 'core' | 'long_term';
export type MemorySourceKind = 'explicit' | 'inferred' | 'manual';

export interface ExistingMemory {
  id: string;
  content: string;
  category: MemoryCategory;
  importance: number;
  confidence?: number;
  memory_key?: string;
  scope?: MemoryScope;
  source_kind?: MemorySourceKind;
  status?: string;
  valid_until?: number;
}

export interface MemoryOperationBase {
  action: 'add' | 'update' | 'ignore';
  content?: string;
  memoryKey?: string;
  category?: MemoryCategory;
  scope?: MemoryScope;
  importance?: number;
  confidence?: number;
  sourceKind?: MemorySourceKind;
  validUntil?: number;
  targetMemoryId?: string;
  reason: string;
}

export type MemoryOperation = MemoryOperationBase;

export interface ValidMemoryOperation extends MemoryOperationBase {
  action: 'add' | 'update' | 'ignore';
  content: string;
  category: MemoryCategory;
  scope: MemoryScope;
  importance: number;
  confidence: number;
  sourceKind: MemorySourceKind;
}

export const MEMORY_POLICY_TEXT = `记忆写入规则：
- 只保存用户主动透露的、稳定的、跨对话仍有价值的信息。
- 不保存寒暄、一次性任务、工具结果、助手推测、短暂情绪和低价值反馈。
- 已有记忆表达相同含义时输出 ignore，不要重复 add。
- 新信息比已有记忆更准确时输出 update，并复用原 memoryKey。
- 重要记忆尽量给出稳定 memoryKey，例如 profile.job_target、preference.reply_style、project.nova.focus。
- event 必须给出未来 validUntil；没有明确有效期的临时事件不要保存。
- sourceKind 只能是 explicit 或 inferred；用户明确要求记住时才是 explicit。`;

const CATEGORY_SET = new Set<MemoryCategory>(['preference', 'fact', 'project', 'decision', 'belief', 'event']);
const SOURCE_KIND_SET = new Set<MemorySourceKind>(['explicit', 'inferred', 'manual']);
const LOW_VALUE_PATTERNS = [
  /搜索功能.*好用/,
  /助手.*好用/,
  /挺好用/,
  /真棒/,
  /哈哈/,
];

export function normalizeMemoryKey(memoryKey?: string): string | undefined {
  if (!memoryKey) return undefined;
  const normalized = memoryKey.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 100);
  return /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/.test(normalized) ? normalized : undefined;
}

export function inferMemoryScope(category: MemoryCategory, memoryKey?: string, importance = 5): MemoryScope {
  if (memoryKey?.startsWith('profile.')) return 'core';
  if (memoryKey === 'preference.reply_style' || memoryKey === 'preference.language') return 'core';
  if (category === 'preference' && importance >= 7) return 'core';
  if (category === 'project' && importance >= 8) return 'core';
  return 'long_term';
}

export function validateMemoryOperation(operation: MemoryOperation): ValidMemoryOperation | null {
  if (operation.action === 'ignore') {
    return {
      ...operation,
      content: (operation.content || '').trim().slice(0, 500),
      category: normalizeCategory(operation.category),
      scope: operation.scope || 'long_term',
      importance: clampNumber(operation.importance, 1, 10, 1),
      confidence: clampNumber(operation.confidence, 0, 1, 1),
      sourceKind: normalizeSourceKind(operation.sourceKind),
      reason: operation.reason || 'ignored_by_policy',
    };
  }

  const content = (operation.content || '').trim();
  if (content.length < 4 || content.length > 500) return null;
  if (LOW_VALUE_PATTERNS.some(pattern => pattern.test(content)) && operation.sourceKind !== 'explicit') return null;

  const category = normalizeCategory(operation.category);
  const sourceKind = normalizeSourceKind(operation.sourceKind);
  const confidence = clampNumber(operation.confidence, 0, 1, sourceKind === 'explicit' ? 1 : 0.7);
  if (sourceKind === 'inferred' && confidence < 0.78) return null;

  const memoryKey = normalizeMemoryKey(operation.memoryKey);
  const importance = clampNumber(operation.importance, 1, 10, 5);
  const scope = operation.scope || inferMemoryScope(category, memoryKey, importance);

  if (category === 'event' && (!operation.validUntil || operation.validUntil <= Date.now())) return null;

  return {
    ...operation,
    content,
    category,
    scope,
    importance,
    confidence,
    sourceKind,
    memoryKey,
    reason: operation.reason || 'accepted_by_policy',
  };
}

function normalizeCategory(category?: MemoryCategory): MemoryCategory {
  return category && CATEGORY_SET.has(category) ? category : 'fact';
}

function normalizeSourceKind(sourceKind?: MemorySourceKind): MemorySourceKind {
  return sourceKind && SOURCE_KIND_SET.has(sourceKind) ? sourceKind : 'inferred';
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}
