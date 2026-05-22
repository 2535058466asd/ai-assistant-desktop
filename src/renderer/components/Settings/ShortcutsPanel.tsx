import React from 'react';
import styles from './ShortcutsPanel.module.css';

const SHORTCUTS = [
  { keys: 'Enter', description: '发送消息' },
  { keys: 'Shift + Enter', description: '换行' },
  { keys: 'F12', description: '开发者工具（开发模式）' },
  { keys: 'Ctrl + Shift + I', description: '开发者工具（开发模式）' },
];

export default function ShortcutsPanel() {
  return (
    <div className={styles.panel}>
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>快捷键列表</h3>
        <p className={styles.sectionDesc}>当前可用的键盘快捷键</p>
      </div>
      <div className={styles.shortcutList}>
        {SHORTCUTS.map((item, index) => (
          <div key={index} className={styles.shortcutRow}>
            <span className={styles.description}>{item.description}</span>
            <div className={styles.keys}>
              {item.keys.split(' + ').map((key, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span className={styles.separator}>+</span>}
                  <kbd className={styles.keyBadge}>{key}</kbd>
                </React.Fragment>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
