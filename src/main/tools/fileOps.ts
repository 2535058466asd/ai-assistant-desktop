import { ipcMain, app } from 'electron'
import fs from 'fs'
import path from 'path'

/**
 * 解析路径：将各种格式的路径统一转换为实际路径
 * 
 * 支持的输入格式（不管LLM生成什么格式，都能正确处理）：
 * ~/Desktop/xxx → 用户桌面
 * ~/Documents/xxx → 用户文档
 * ~/Downloads/xxx → 用户下载
 * ~/xxx → 用户主目录
 * %USERPROFILE%/Desktop/xxx → 展开 Windows 环境变量
 * 桌面/xxx、文档/xxx、下载/xxx → 中文目录名
 * C:/xxx、D:/xxx → 绝对路径，原样返回
 */
function resolvePath(filePath: string): string {
  const home = app.getPath('home');
  const desktop = app.getPath('desktop');
  const documents = app.getPath('documents');
  const downloads = app.getPath('downloads');

  // 1. 展开 Windows 环境变量（如 %USERPROFILE%、%HOMEPATH%）
  if (process.platform === 'win32' && filePath.includes('%')) {
    filePath = filePath.replace(/%([^%]+)%/g, (_, varName) => {
      return process.env[varName] || `%${varName}%`;
    });
  }

  // 2. 标准化反斜杠为正斜杠（方便后续匹配）
  const normalized = filePath.replace(/\\/g, '/');

  // 3. 已经是绝对路径（C:/、D:/、/），直接返回原路径
  if (/^[A-Za-z]:\//.test(normalized) || normalized.startsWith('/')) {
    return filePath;
  }

  // 4. 特殊目录映射（支持英文和中文）
  const dirMap: Record<string, string> = {
    'desktop': desktop, '桌面': desktop,
    'documents': documents, '文档': documents,
    'downloads': downloads, '下载': downloads,
  };

  // 匹配 ~/Desktop、/Desktop、桌面 等各种写法
  for (const [key, resolved] of Object.entries(dirMap)) {
    const pattern = new RegExp(`^~?/?${key}/?`, 'i');
    if (pattern.test(normalized)) {
      const rest = normalized.replace(pattern, '');
      return path.join(resolved, rest);
    }
  }

  // 5. ~/ → 用户主目录
  if (normalized.startsWith('~/')) {
    const rest = normalized.replace(/^~/, '');
    return path.join(home, rest);
  }

  return filePath;
}

// read_file — 读取文件
export function registerReadFile() {
  ipcMain.handle('read-file', async (_event, filePath: string) => {
    try {
      filePath = resolvePath(filePath);
      const content = fs.readFileSync(filePath, 'utf-8');
      return { success: true, data: content };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}

// write_file — 写入文件
export function registerWriteFile() {
  ipcMain.handle('write-file', async (_event, filePath: string, content: string) => {
    try {
      filePath = resolvePath(filePath);
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, content, 'utf-8');
      return { success: true, data: `文件已保存: ${filePath}` };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}

// list_dir — 列出目录内容
export function registerListDir() {
  ipcMain.handle('list-dir', async (_event, dirPath: string) => {
    try {
      dirPath = resolvePath(dirPath);
      if (!fs.existsSync(dirPath)) {
        return { success: false, error: `目录不存在: ${dirPath}` };
      }
      const stat = fs.statSync(dirPath);
      if (!stat.isDirectory()) {
        return { success: false, error: `不是目录: ${dirPath}` };
      }
      const items = fs.readdirSync(dirPath);
      const result = items.map(item => {
        try {
          const itemStat = fs.statSync(path.join(dirPath, item));
          return itemStat.isDirectory() ? `${item}/` : item;
        } catch {
          return item;
        }
      });
      return { success: true, data: result.join('\n') || '(空目录)' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}

// search_files — 按文件名搜索文件
export function registerSearchFiles() {
  ipcMain.handle('search-files', async (_event, dirPath: string, pattern: string) => {
    try {
      dirPath = resolvePath(dirPath);
      if (!fs.existsSync(dirPath)) {
        return { success: false, error: `目录不存在: ${dirPath}` };
      }
      const regexStr = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
      const regex = new RegExp(regexStr, 'i');
      const results: string[] = [];

      function walkDir(dir: string, depth: number = 0) {
        if (depth > 10) return;
        try {
          const items = fs.readdirSync(dir);
          for (const item of items) {
            if (item.startsWith('.') || item === 'node_modules' || item === '.git') continue;
            const fullPath = path.join(dir, item);
            try {
              const stat = fs.statSync(fullPath);
              if (stat.isDirectory()) {
                walkDir(fullPath, depth + 1);
              } else if (regex.test(item)) {
                results.push(fullPath);
              }
            } catch { /* 跳过无权限的文件 */ }
          }
        } catch { /* 跳过无权限的目录 */ }
      }

      walkDir(dirPath);
      if (results.length > 50) {
        return { success: true, data: results.slice(0, 50).join('\n') + `\n\n...(共找到 ${results.length} 个文件，已显示前50个)` };
      }
      return { success: true, data: results.join('\n') || '未找到匹配的文件' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}

// grep_content — 按内容搜索文件
export function registerGrepContent() {
  ipcMain.handle('grep-content', async (_event, dirPath: string, keyword: string, filePattern?: string) => {
    try {
      dirPath = resolvePath(dirPath);
      if (!fs.existsSync(dirPath)) {
        return { success: false, error: `目录不存在: ${dirPath}` };
      }
      const results: string[] = [];
      const fileRegex = filePattern ? new RegExp(filePattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.'), 'i') : null;

      function walkDir(dir: string, depth: number = 0) {
        if (depth > 10) return;
        try {
          const items = fs.readdirSync(dir);
          for (const item of items) {
            if (item.startsWith('.') || item === 'node_modules' || item === '.git') continue;
            const fullPath = path.join(dir, item);
            try {
              const stat = fs.statSync(fullPath);
              if (stat.isDirectory()) {
                walkDir(fullPath, depth + 1);
              } else if (stat.size < 1024 * 1024) {
                if (fileRegex && !fileRegex.test(item)) continue;
                try {
                  const content = fs.readFileSync(fullPath, 'utf-8');
                  const lines = content.split('\n');
                  for (let i = 0; i < lines.length; i++) {
                    if (lines[i].includes(keyword)) {
                      results.push(`${fullPath}:${i + 1}: ${lines[i].trim()}`);
                      if (results.length >= 30) return;
                    }
                  }
                } catch { /* 跳过二进制文件 */ }
              }
            } catch { /* 跳过无权限的文件 */ }
          }
        } catch { /* 跳过无权限的目录 */ }
      }

      walkDir(dirPath);
      if (results.length >= 30) {
        return { success: true, data: results.join('\n') + `\n\n...(结果过多，已显示前30条)` };
      }
      return { success: true, data: results.join('\n') || '未找到匹配的内容' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}
