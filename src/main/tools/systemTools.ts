import { ipcMain } from 'electron';
import { createLogger } from '../../shared/logger';

const logger = createLogger('tool');

export function registerSystemTools() {
  ipcMain.handle('getCurrentTime', async () => {
    try {
      const now = new Date();
      const result = {
        timestamp: now.getTime(),
        iso: now.toISOString(),
        local: now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
        date: now.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }),
        time: now.toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai' }),
        dayOfWeek: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][now.getDay()],
      };
      return { success: true, data: JSON.stringify(result) };
    } catch (error: any) {
      logger.error('获取时间失败', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('getSystemInfo', async () => {
    try {
      const os = require('os');
      const result = {
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        cpuModel: os.cpus()[0]?.model || 'unknown',
        cpuCores: os.cpus().length,
        totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024 * 100) / 100 + ' GB',
        freeMemory: Math.round(os.freemem() / 1024 / 1024 / 1024 * 100) / 100 + ' GB',
        memoryUsage: Math.round((1 - os.freemem() / os.totalmem()) * 100) + '%',
        uptime: Math.round(os.uptime() / 3600 * 10) / 10 + ' 小时',
        homeDir: os.homedir(),
      };
      return { success: true, data: JSON.stringify(result) };
    } catch (error: any) {
      logger.error('获取系统信息失败', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('notify', async (_event, title: string, body: string) => {
    try {
      const { Notification } = require('electron');
      if (Notification.isSupported()) {
        const notification = new Notification({
          title: title || 'Nova',
          body: body || '',
          silent: false,
        });
        notification.show();
        return { success: true, data: '通知已发送' };
      }
      return { success: false, error: '当前系统不支持通知' };
    } catch (error: any) {
      logger.error('发送通知失败', error);
      return { success: false, error: error.message };
    }
  });
}
