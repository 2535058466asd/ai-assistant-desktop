import React from 'react';
import { FileCode2, FileSpreadsheet, FileText } from 'lucide-react';
import styles from './FileTypeIcon.module.css';

interface FileTypeIconProps {
  fileName: string;
}

type FileKind = 'pdf' | 'word' | 'sheet' | 'markdown' | 'text' | 'file';

function getFileKind(fileName: string): FileKind {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (extension === 'pdf') return 'pdf';
  if (extension === 'doc' || extension === 'docx') return 'word';
  if (extension === 'xls' || extension === 'xlsx') return 'sheet';
  if (extension === 'md') return 'markdown';
  if (extension === 'txt') return 'text';
  return 'file';
}

/** 统一的文件类型图标，供输入区和聊天消息附件复用。 */
const FileTypeIcon: React.FC<FileTypeIconProps> = ({ fileName }) => {
  const kind = getFileKind(fileName);
  const Icon = kind === 'sheet' ? FileSpreadsheet : kind === 'markdown' ? FileCode2 : FileText;

  return (
    <span className={`${styles.icon} ${styles[kind]}`} aria-hidden="true">
      <Icon size={24} strokeWidth={2.2} />
    </span>
  );
};

export default FileTypeIcon;
