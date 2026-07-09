import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import styles from './ConfirmDialog.module.css';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'warning' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  tone = 'warning',
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
      if (event.key === 'Enter') onConfirm();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  return createPortal(
    <div className={styles.overlay} role="presentation" onMouseDown={onCancel}>
      <div
        className={`${styles.dialog} ${tone === 'danger' ? styles.danger : ''}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={styles.body}>
          <div className={styles.icon} aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
          </div>
          <div className={styles.content}>
            <h2 id="confirm-dialog-title" className={styles.title}>{title}</h2>
            <p id="confirm-dialog-message" className={styles.message}>{message}</p>
          </div>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className={`${styles.button} ${styles.confirm}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConfirmDialog;
