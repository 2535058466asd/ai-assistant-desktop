import { ipcMain, app } from 'electron'
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'

export function resolvePath(filePath: string): string {
  const home = app.getPath('home');
  const desktop = app.getPath('desktop');
  const documents = app.getPath('documents');
  const downloads = app.getPath('downloads');

  if (process.platform === 'win32' && filePath.includes('%')) {
    filePath = filePath.replace(/%([^%]+)%/g, (_, varName) => {
      return process.env[varName] || `%${varName}%`;
    });
  }

  const normalized = filePath.replace(/\\/g, '/');

  if (/^[A-Za-z]:\//.test(normalized) || normalized.startsWith('/')) {
    const publicDesktop = app.getPath('desktop').replace(/\/[^/]+$/, '/Public/Desktop');
    if (normalized.toLowerCase().startsWith(publicDesktop.toLowerCase().replace(/\\/g, '/'))) {
      const rest = normalized.slice(publicDesktop.length);
      return path.join(desktop, rest);
    }
    const publicDocuments = app.getPath('documents').replace(/\/[^/]+$/, '/Public/Documents');
    if (normalized.toLowerCase().startsWith(publicDocuments.toLowerCase().replace(/\\/g, '/'))) {
      const rest = normalized.slice(publicDocuments.length);
      return path.join(documents, rest);
    }
    return filePath;
  }

  const dirMap: Record<string, string> = {
    'desktop': desktop, '桌面': desktop,
    'documents': documents, '文档': documents,
    'downloads': downloads, '下载': downloads,
  };

  for (const [key, resolved] of Object.entries(dirMap)) {
    const pattern = new RegExp(`^~?/?${key}/?`, 'i');
    if (pattern.test(normalized)) {
      const rest = normalized.replace(pattern, '');
      return path.join(resolved, rest);
    }
  }

  if (normalized.startsWith('~/')) {
    const rest = normalized.replace(/^~/, '');
    return path.join(home, rest);
  }

  return filePath;
}

export function registerReadFile() {
  ipcMain.handle('read-file', async (_event, filePath: string) => {
    try {
      filePath = resolvePath(filePath);
      const content = await fsp.readFile(filePath, 'utf-8');
      return { success: true, data: content };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}

export function registerWriteFile() {
  ipcMain.handle('write-file', async (_event, filePath: string, content: string) => {
    try {
      filePath = resolvePath(filePath);
      const dir = path.dirname(filePath);
      await fsp.mkdir(dir, { recursive: true });
      await fsp.writeFile(filePath, content, 'utf-8');
      return { success: true, data: `文件已保存: ${filePath}` };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}

export function registerCreateDir() {
  ipcMain.handle('create-dir', async (_event, dirPath: string) => {
    try {
      dirPath = resolvePath(dirPath);
      await fsp.mkdir(dirPath, { recursive: true });
      return { success: true, data: `目录已创建: ${dirPath}` };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}

export function registerCopyFile() {
  ipcMain.handle('copy-file', async (_event, sourcePath: string, targetPath: string) => {
    try {
      sourcePath = resolvePath(sourcePath);
      targetPath = resolvePath(targetPath);
      await fsp.access(sourcePath).catch(() => {
        throw new Error(`源路径不存在: ${sourcePath}`);
      });
      const targetDir = path.dirname(targetPath);
      await fsp.mkdir(targetDir, { recursive: true });
      await fsp.cp(sourcePath, targetPath, { recursive: true, force: false, errorOnExist: true });
      return { success: true, data: `已复制: ${sourcePath} -> ${targetPath}` };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}

export function registerMoveFile() {
  ipcMain.handle('move-file', async (_event, sourcePath: string, targetPath: string) => {
    try {
      sourcePath = resolvePath(sourcePath);
      targetPath = resolvePath(targetPath);
      await fsp.access(sourcePath).catch(() => {
        throw new Error(`源路径不存在: ${sourcePath}`);
      });
      const targetDir = path.dirname(targetPath);
      await fsp.mkdir(targetDir, { recursive: true });
      try {
        await fsp.access(targetPath);
        return { success: false, error: `目标路径已存在: ${targetPath}` };
      } catch { /* 目标不存在，继续 */ }
      await fsp.rename(sourcePath, targetPath);
      return { success: true, data: `已移动: ${sourcePath} -> ${targetPath}` };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}

export function registerDeleteFile() {
  ipcMain.handle('delete-file', async (_event, filePath: string) => {
    try {
      filePath = resolvePath(filePath);
      const stat = await fsp.stat(filePath).catch(() => null);
      if (!stat) {
        return { success: false, error: `路径不存在: ${filePath}` };
      }
      if (stat.isDirectory()) {
        await fsp.rm(filePath, { recursive: true, force: true });
      } else {
        await fsp.unlink(filePath);
      }
      return { success: true, data: `已删除: ${filePath}` };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}

export function registerListDir() {
  ipcMain.handle('list-dir', async (_event, dirPath: string) => {
    try {
      dirPath = resolvePath(dirPath);
      const stat = await fsp.stat(dirPath).catch(() => null);
      if (!stat) {
        return { success: false, error: `目录不存在: ${dirPath}` };
      }
      if (!stat.isDirectory()) {
        return { success: false, error: `不是目录: ${dirPath}` };
      }
      const items = await fsp.readdir(dirPath);
      const result = await Promise.all(items.map(async (item) => {
        try {
          const itemStat = await fsp.stat(path.join(dirPath, item));
          return itemStat.isDirectory() ? `${item}/` : item;
        } catch {
          return item;
        }
      }));
      return { success: true, data: result.join('\n') || '(空目录)' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export function registerSearchFiles() {
  ipcMain.handle('search-files', async (_event, dirPath: string, pattern: string) => {
    try {
      dirPath = resolvePath(dirPath);
      const stat = await fsp.stat(dirPath).catch(() => null);
      if (!stat) {
        return { success: false, error: `目录不存在: ${dirPath}` };
      }
      const regexStr = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
      const regex = new RegExp(regexStr, 'i');
      const results: string[] = [];

      async function walkDir(dir: string, depth: number = 0) {
        if (depth > 10) return;
        try {
          const items = await fsp.readdir(dir);
          for (const item of items) {
            if (item.startsWith('.') || item === 'node_modules' || item === '.git') continue;
            const fullPath = path.join(dir, item);
            try {
              const itemStat = await fsp.stat(fullPath);
              if (itemStat.isDirectory()) {
                await walkDir(fullPath, depth + 1);
              } else if (regex.test(item)) {
                results.push(`${fullPath} (${formatSize(itemStat.size)}, ${formatDate(itemStat.mtimeMs)})`);
              }
            } catch { /* skip */ }
          }
        } catch { /* skip */ }
      }

      await walkDir(dirPath);
      if (results.length > 50) {
        return { success: true, data: results.slice(0, 50).join('\n') + `\n\n...(共找到 ${results.length} 个文件，已显示前50个)` };
      }
      return { success: true, data: results.join('\n') || '未找到匹配的文件' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}

export function registerGrepContent() {
  ipcMain.handle('grep-content', async (_event, dirPath: string, keyword: string, filePattern?: string, options?: { regex?: boolean; context_lines?: number }) => {
    try {
      dirPath = resolvePath(dirPath);
      const stat = await fsp.stat(dirPath).catch(() => null);
      if (!stat) {
        return { success: false, error: `目录不存在: ${dirPath}` };
      }
      const results: string[] = [];
      const fileRegex = filePattern ? new RegExp(filePattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.'), 'i') : null;
      const useRegex = options?.regex ?? false;
      const contextLines = options?.context_lines ?? 0;
      let matchFn: (line: string) => boolean;
      try {
        if (useRegex) {
          const re = new RegExp(keyword, 'i');
          matchFn = (line: string) => re.test(line);
        } else {
          const lower = keyword.toLowerCase();
          matchFn = (line: string) => line.toLowerCase().includes(lower);
        }
      } catch (e: any) {
        return { success: false, error: `正则表达式无效: ${e.message}` };
      }

      async function walkDir(dir: string, depth: number = 0) {
        if (depth > 10) return;
        try {
          const items = await fsp.readdir(dir);
          for (const item of items) {
            if (item.startsWith('.') || item === 'node_modules' || item === '.git') continue;
            const fullPath = path.join(dir, item);
            try {
              const itemStat = await fsp.stat(fullPath);
              if (itemStat.isDirectory()) {
                await walkDir(fullPath, depth + 1);
              } else if (itemStat.size < 1024 * 1024) {
                if (fileRegex && !fileRegex.test(item)) continue;
                try {
                  const content = await fsp.readFile(fullPath, 'utf-8');
                  const lines = content.split('\n');
                  for (let i = 0; i < lines.length; i++) {
                    if (matchFn(lines[i])) {
                      if (contextLines > 0) {
                        const start = Math.max(0, i - contextLines);
                        const end = Math.min(lines.length - 1, i + contextLines);
                        const block: string[] = [];
                        for (let j = start; j <= end; j++) {
                          const prefix = j === i ? '>' : ' ';
                          block.push(`${prefix} ${j + 1}: ${lines[j]}`);
                        }
                        results.push(`--- ${fullPath}:${i + 1} ---\n${block.join('\n')}`);
                      } else {
                        results.push(`${fullPath}:${i + 1}: ${lines[i].trim()}`);
                      }
                      if (results.length >= 30) return;
                    }
                  }
                } catch { /* skip binary */ }
              }
            } catch { /* skip */ }
          }
        } catch { /* skip */ }
      }

      await walkDir(dirPath);
      if (results.length >= 30) {
        return { success: true, data: results.join('\n') + `\n\n...(结果过多，已显示前30条)` };
      }
      return { success: true, data: results.join('\n') || '未找到匹配的内容' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}
