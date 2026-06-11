import { describe, expect, it } from 'vitest';
import { inferMemoryScope, normalizeMemoryKey, validateMemoryOperation } from '../../renderer/core/memory/memoryPolicy';

describe('记忆治理策略', () => {
  it('应该规范化合法 memoryKey', () => {
    expect(normalizeMemoryKey(' Profile.Job_Target ')).toBe('profile.job_target');
    expect(normalizeMemoryKey('bad key')).toBeUndefined();
  });

  it('应该把核心身份和高重要偏好设为常驻记忆', () => {
    expect(inferMemoryScope('fact', 'profile.job_target', 8)).toBe('core');
    expect(inferMemoryScope('preference', 'preference.reply_style', 7)).toBe('core');
    expect(inferMemoryScope('preference', undefined, 7)).toBe('core');
    expect(inferMemoryScope('fact', undefined, 5)).toBe('long_term');
  });

  it('应该丢弃低可信度 inferred 记忆', () => {
    expect(validateMemoryOperation({
      action: 'add',
      content: '用户可能喜欢某种不确定的回复方式',
      category: 'preference',
      importance: 5,
      confidence: 0.5,
      sourceKind: 'inferred',
      reason: '不确定推断',
    })).toBeNull();
  });

  it('应该过滤低价值反馈', () => {
    expect(validateMemoryOperation({
      action: 'add',
      content: '用户觉得助手的搜索功能挺好用',
      category: 'preference',
      importance: 5,
      confidence: 0.9,
      sourceKind: 'inferred',
      reason: '普通反馈',
    })).toBeNull();
  });

  it('应该接受明确长期偏好', () => {
    const result = validateMemoryOperation({
      action: 'add',
      content: '用户偏好正式、直接、少表情的回复风格',
      memoryKey: 'preference.reply_style',
      category: 'preference',
      importance: 8,
      confidence: 1,
      sourceKind: 'explicit',
      reason: '用户明确要求',
    });

    expect(result?.scope).toBe('core');
    expect(result?.memoryKey).toBe('preference.reply_style');
  });
});
