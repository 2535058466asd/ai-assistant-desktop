// ==========================================
// 记忆系统类型定义
// ==========================================

export interface UserPreferences {
  favoriteArtist?: string;
  musicGenre?: string;
  wakeWord?: string;
  voiceSpeed?: number;
  voicePitch?: number;
  theme?: 'light' | 'dark';
  [key: string]: any;
}

export interface Memory {
  id: string;
  content: string;
  category: 'preference' | 'fact' | 'project' | 'decision' | 'belief' | 'event';
  importance: number;
  created_at: number;
  updated_at: number;
  access_count: number;
  source_conversation?: string;
  source_message?: string;
  source_kind?: MemorySourceKind;
  memory_key?: string;
  confidence: number;
  status: MemoryStatus;
  valid_from?: number;
  valid_until?: number;
  superseded_by?: string;
  scope?: MemoryScope;
  reason?: string;
  last_injected_at?: number;
  inject_count?: number;
}

export type MemoryStatus = 'active' | 'superseded' | 'archived';
export type MemorySourceKind = 'explicit' | 'inferred' | 'manual';
export type MemoryScope = 'core' | 'long_term';

export interface MemoryWriteOptions {
  sourceConversation?: string;
  sourceMessage?: string;
  sourceKind?: MemorySourceKind;
  memoryKey?: string;
  confidence?: number;
  validFrom?: number;
  validUntil?: number;
  scope?: MemoryScope;
  reason?: string;
}

export interface MemoryWriteResult {
  action: 'added' | 'merged' | 'superseded' | 'ignored';
  id?: string;
  reason: string;
}
