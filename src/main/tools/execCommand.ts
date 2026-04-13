import { ipcMain } from 'electron'
import { exec } from 'child_process'

// exec_command — 执行系统命令（带安全限制和超时）
export function registerExecCommand() {
  ipcMain.handle('exec-command', async (_event, command: string) => {
    const blocked = ['format ', 'del /f', 'del /s', 'rm -rf', 'rd /s', 'diskpart', 'mkfs'];
    const cmdLower = command.toLowerCase();
    if (blocked.some(b => cmdLower.includes(b))) {
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
