/**
 * SystemPromptPanel 系统提示词编辑面板
 *
 * 让用户自定义 Nova 的性格和行为规则。
 * 编辑后的内容存 localStorage，重启不丢失。
 * 恢复默认则清除 localStorage，回到代码里的默认提示词。
 */

import React, { useState, useEffect } from 'react';
import styles from './ModelApiPanel.module.css';
import { getDefaultSystemPrompt, getNovaSystemPrompt, saveCustomSystemPrompt, clearCustomSystemPrompt } from '../../core/novaSettings';

export default function SystemPromptPanel() {
  const [prompt, setPrompt] = useState('');
  const [saved, setSaved] = useState(false);
  const [isCustom, setIsCustom] = useState(false);

  useEffect(() => {
    const current = getNovaSystemPrompt();
    const defaultPrompt = getDefaultSystemPrompt();
    setPrompt(current);
    setIsCustom(current !== defaultPrompt);
  }, []);

  const handleSave = () => {
    saveCustomSystemPrompt(prompt);
    setIsCustom(true);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    const defaultPrompt = getDefaultSystemPrompt();
    clearCustomSystemPrompt();
    setPrompt(defaultPrompt);
    setIsCustom(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className={styles.panel}>
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>系统提示词</h3>
        <p className={styles.sectionDesc}>
          自定义 Nova 的性格、说话风格和行为规则。修改后点击保存，下次对话生效。
        </p>
        {isCustom && (
          <p className={styles.sectionDesc} style={{ color: 'var(--accent-cyan)' }}>
            当前使用自定义提示词。
          </p>
        )}
      </div>

      <div className={styles.section}>
        <textarea
          className={styles.input}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={20}
          style={{
            width: '100%',
            minHeight: '400px',
            resize: 'vertical',
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
            lineHeight: '1.7',
            whiteSpace: 'pre-wrap',
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: '12px' }}>
        <button className={styles.btnPrimary} onClick={handleSave}>
          {saved ? '已保存' : '保存'}
        </button>
        <button
          className={styles.btnPrimary}
          onClick={handleReset}
          style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
        >
          恢复默认
        </button>
      </div>
    </div>
  );
}
