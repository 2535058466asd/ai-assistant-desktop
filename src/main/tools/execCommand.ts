import { ipcMain } from 'electron'
import { exec } from 'child_process'
import { createLogger } from '../../shared/logger'

const logger = createLogger('tool')

const blockedPatterns = [
  /\bformat\b/i,
  /\bdiskpart\b/i,
  /\bmkfs\b/i,
  /\bdel\s+\/[fsq]/i,
  /\brd\s+\/s/i,
  /\brmdir\s+\/s/i,
  /\brm\s+-rf/i,
  /\bshutdown\b/i,
  /\brestart-computer\b/i,
  /\bremove-item\b.*\b-recurse\b/i,
  /\bset-executionpolicy\b/i,
  /\breg\s+(delete|add)\b/i,
]

// exec_command — 执行系统命令（带安全限制和超时）
export function registerExecCommand() {
  ipcMain.handle('exec-command', async (_event, command: string) => {
    if (blockedPatterns.some(pattern => pattern.test(command))) {
      logger.warn('Command blocked by policy', { command });
      return { success: false, error: `命令被安全策略拦截: ${command}` };
    }

    return new Promise((resolve) => {
      exec(command, { timeout: 15000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          resolve({
            success: false,
            error: error.message,
            data: stderr || stdout || ''
          });
        } else {
          resolve({
            success: true,
            data: stdout.trim() || '(命令执行成功，无输出)',
            stderr: stderr.trim() || undefined
          });
        }
      });
    });
  });
}
