// ==========================================
// 系统控制服务
// 负责执行Windows系统操作
// ==========================================

import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

/**
 * 系统控制服务类
 */
export class SystemControlService {
  constructor() {
    console.log('⚙️  系统控制服务初始化成功');
  }

  /**
   * 打开应用程序
   */
  async openApp(appName: string): Promise<{ success: boolean; message: string }> {
    try {
      const platform = os.platform();
      
      if (platform === 'win32') {
        return await this.openAppWindows(appName);
      } else if (platform === 'darwin') {
        // macOS
        await execAsync(`open -a "${appName}"`);
        return { success: true, message: `已成功打开${appName}😊` };
      } else {
        // Linux
        await execAsync(`xdg-open "${appName}"`);
        return { success: true, message: `已成功打开${appName}😊` };
      }
    } catch (error) {
      console.error('❌ 打开应用失败:', error);
      return { 
        success: false, 
        message: `打开${appName}失败了😔，你可以试试：\n1. 确认软件名称是否正确\n2. 或者直接说"打开浏览器"、"打开记事本"等系统软件` 
      };
    }
  }

  /**
   * Windows下打开应用程序（简化版 - 类似 OpenClaw 的 launch 命令）
   * 
   * 策略：
   * 1. 先尝试常见系统软件（notepad、calc 等）- 用 start 命令
   * 2. 再尝试用 PowerShell Start-Process 启动应用
   */
  private async openAppWindows(appName: string): Promise<{ success: boolean; message: string }> {
    const normalizedAppName = appName.toLowerCase().trim();
    
    console.log(`🔍 正在打开应用: ${appName}`);

    // 策略1: 常见系统软件（直接用 start 命令，最可靠）
    const systemApps: Record<string, string> = {
      '记事本': 'notepad',
      'notepad': 'notepad',
      '计算器': 'calc',
      'calc': 'calc',
      '浏览器': 'explorer',
      'chrome': 'chrome',
      'edge': 'msedge',
      'cmd': 'cmd',
      '命令提示符': 'cmd',
      'powershell': 'powershell',
      '任务管理器': 'taskmgr',
      'taskmgr': 'taskmgr',
      '资源管理器': 'explorer',
      'explorer': 'explorer'
    };

    // 检查是否是系统软件
    for (const [key, command] of Object.entries(systemApps)) {
      if (normalizedAppName === key || normalizedAppName.includes(key)) {
        console.log(`🎯 匹配到系统软件: ${command}`);
        try {
          exec(`start "" "${command}"`);
          return { success: true, message: `已成功打开 ${appName} 😊` };
        } catch (e) {
          console.log(`❌ 打开系统软件 ${command} 失败:`, e);
        }
      }
    }

    // 策略2: 用 PowerShell Start-Process 尝试启动应用（类似 OpenClaw 的 launch）
    try {
      console.log('⚡ 使用 PowerShell Start-Process 启动...');
      
      // 构造 PowerShell 命令
      const psCommand = `
        $appName = '${appName}'
        
        # 方法1: 尝试按名称启动
        try {
          Start-Process $appName -ErrorAction Stop
          Write-Output "SUCCESS: 已成功启动 $appName"
          exit 0
        } catch {}
        
        # 方法2: 从开始菜单查找
        $app = Get-StartApps | Where-Object { $_.Name -like "*$appName*" } | Select-Object -First 1
        if ($app) {
          Start-Process shell:AppsFolder\\$($app.AppId)
          Write-Output "SUCCESS: 从开始菜单启动 $appName"
          exit 0
        }
        
        # 方法3: 从桌面快捷方式查找
        $desktopPath = [Environment]::GetFolderPath('Desktop')
        $shortcut = Get-ChildItem -Path $desktopPath -Filter "*.lnk" | Where-Object { $_.Name -like "*$appName*" } | Select-Object -First 1
        if ($shortcut) {
          Start-Process $shortcut.FullName
          Write-Output "SUCCESS: 从桌面快捷方式启动 $appName"
          exit 0
        }
        
        Write-Output "ERROR: 未找到应用 $appName"
        exit 1
      `;
      
      const { stdout, stderr } = await execAsync(
        `powershell -NoProfile -Command "${psCommand.replace(/\n/g, '; ')}"`,
        { timeout: 10000 }
      );
      
      console.log('PowerShell 输出:', stdout);
      console.log('PowerShell 错误:', stderr);
      
      if (stdout.includes('SUCCESS:')) {
        console.log('✅ PowerShell 启动成功');
        return { success: true, message: `已成功打开 ${appName} 😊` };
      } else {
        console.log('❌ PowerShell 未找到应用');
        throw new Error(`PowerShell 未找到应用: ${appName}`);
      }
      
    } catch (e: any) {
      console.log('❌ PowerShell 启动失败:', e.message);
    }

    // 所有策略都失败
    throw new Error(`无法找到或启动应用: ${appName}。请确认应用名称是否正确。`);
  }

  /**
   * 策略1: 常见系统软件（用PowerShell检查，不弹Windows错误框）
   */
  private async tryOpenSystemApps(normalizedAppName: string): Promise<{ success: boolean; message: string }> {
    const systemApps: Record<string, string> = {
      '浏览器': 'chrome',
      'chrome': 'chrome',
      'edge': 'msedge',
      '计算器': 'calc',
      '记事本': 'notepad',
      'notepad': 'notepad',
      'cmd': 'cmd',
      '命令提示符': 'cmd',
      'powershell': 'powershell',
      '任务管理器': 'taskmgr',
      'taskmgr': 'taskmgr'
    };

    for (const [key, command] of Object.entries(systemApps)) {
      if (normalizedAppName.includes(key)) {
        console.log(`🎯 匹配到系统软件: ${key}`);
        try {
          // 先用PowerShell检查命令是否存在
          const { stdout } = await execAsync(`powershell -Command "Get-Command '${command}' -ErrorAction SilentlyContinue"`);
          if (stdout && stdout.trim()) {
            // start命令即使成功也可能返回非零退出码，所以不等待它完成
            exec(`start "" "${command}"`);
            console.log(`✅ 成功打开系统软件: ${command}`);
            return { success: true, message: `已成功打开${key}😊` };
          }
        } catch (e) {
          console.log(`系统软件 ${key} 不存在或打开失败`);
        }
      }
    }

    return { success: false, message: '' };
  }

  /**
   * 策略2: 用PowerShell查找并打开应用
   */
  private async tryOpenWithPowerShell(appName: string): Promise<{ success: boolean; message: string }> {
    try {
      // 用PowerShell的Get-StartApps查找开始菜单中的应用
      const { stdout } = await execAsync(
        `powershell -Command "Get-StartApps | Where-Object { $_.Name -like '*${appName}*' } | Select-Object -First 1 -ExpandProperty Name"`
      );
      
      if (stdout && stdout.trim()) {
        const foundAppName = stdout.trim();
        console.log(`📋 PowerShell找到应用: ${foundAppName}`);
        // 用shell:AppsFolder打开，PowerShell命令即使成功也可能返回非零退出码，所以不等待它完成
        exec(`powershell -Command "Start-Process shell:AppsFolder\\$(Get-StartApps | Where-Object { $_.Name -eq '${foundAppName}' } | Select-Object -ExpandProperty AppId)"`);
        return { success: true, message: `已成功打开${appName}😊` };
      }
    } catch (e) {
      console.log('PowerShell查找失败:', e);
    }

    return { success: false, message: '' };
  }

  /**
   * 策略3: 从桌面快捷方式查找
   */
  private async tryOpenFromDesktopShortcuts(appName: string): Promise<{ success: boolean; message: string }> {
    const desktopPath = path.join(os.homedir(), 'Desktop');
    const publicDesktopPath = path.join('C:\\Users\\Public\\Desktop');
    
    const pathsToCheck = [desktopPath, publicDesktopPath];
    
    for (const basePath of pathsToCheck) {
      if (!fs.existsSync(basePath)) continue;
      
      try {
        const files = fs.readdirSync(basePath);
        for (const file of files) {
          if (file.toLowerCase().includes('.lnk') && 
              file.toLowerCase().includes(appName.toLowerCase())) {
            const shortcutPath = path.join(basePath, file);
            console.log(`🔗 找到桌面快捷方式: ${shortcutPath}`);
            // start命令即使成功也可能返回非零退出码，所以不等待它完成
            exec(`start "" "${shortcutPath}"`);
            return { success: true, message: `已成功打开${appName}😊` };
          }
        }
      } catch (e) {
        console.log(`扫描 ${basePath} 失败:`, e);
      }
    }
    
    return { success: false, message: '' };
  }

  /**
   * 策略4: 从开始菜单查找
   */
  private async tryOpenFromStartMenu(appName: string): Promise<{ success: boolean; message: string }> {
    const startMenuPaths = [
      path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
      path.join('C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs')
    ];
    
    for (const basePath of startMenuPaths) {
      if (!fs.existsSync(basePath)) continue;
      
      try {
        const result = await this.searchInDirectory(basePath, appName);
        if (result.success) {
          return result;
        }
      } catch (e) {
        console.log(`扫描开始菜单 ${basePath} 失败:`, e);
      }
    }
    
    return { success: false, message: '' };
  }

  /**
   * 在目录中递归查找快捷方式
   */
  private async searchInDirectory(dirPath: string, appName: string): Promise<{ success: boolean; message: string }> {
    if (!fs.existsSync(dirPath)) {
      return { success: false, message: '' };
    }

    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(dirPath, item.name);
      
      if (item.isDirectory()) {
        const result = await this.searchInDirectory(fullPath, appName);
        if (result.success) {
          return result;
        }
      } else if (item.isFile() && item.name.toLowerCase().includes('.lnk')) {
        if (item.name.toLowerCase().includes(appName.toLowerCase())) {
          console.log(`📋 找到开始菜单快捷方式: ${fullPath}`);
          // start命令即使成功也可能返回非零退出码，所以不等待它完成
          exec(`start "" "${fullPath}"`);
          return { success: true, message: `已成功打开${appName}😊` };
        }
      }
    }
    
    return { success: false, message: '' };
  }

  /**
   * 策略5: 从常见安装路径查找
   */
  private async tryOpenFromCommonPaths(appName: string): Promise<{ success: boolean; message: string }> {
    const commonInstallPaths = [
      process.env['PROGRAMFILES'],
      process.env['PROGRAMFILES(X86)'],
      path.join(process.env['LOCALAPPDATA'] || '', 'Programs')
    ].filter(Boolean) as string[];

    for (const basePath of commonInstallPaths) {
      if (!fs.existsSync(basePath)) continue;
      
      try {
        const dirs = fs.readdirSync(basePath, { withFileTypes: true });
        for (const dir of dirs) {
          if (dir.isDirectory() && dir.name.toLowerCase().includes(appName.toLowerCase())) {
            const appDir = path.join(basePath, dir.name);
            console.log(`📁 找到安装目录: ${appDir}`);
            
            // 查找这个目录下的exe文件
            const exeFiles = fs.readdirSync(appDir).filter(f => f.toLowerCase().endsWith('.exe'));
            for (const exeFile of exeFiles) {
              try {
                const exePath = path.join(appDir, exeFile);
                // start命令即使成功也可能返回非零退出码，所以不等待它完成
                exec(`start "" "${exePath}"`);
                console.log(`✅ 成功打开: ${exePath}`);
                return { success: true, message: `已成功打开${appName}😊` };
              } catch (e) {
                continue;
              }
            }
          }
        }
      } catch (e) {
        console.log(`扫描 ${basePath} 失败:`, e);
      }
    }
    
    return { success: false, message: '' };
  }

  /**
   * 打开文件夹
   */
  async openFolder(folderName: string): Promise<{ success: boolean; message: string }> {
    try {
      const platform = os.platform();
      const homeDir = os.homedir();
      
      const folderMap: Record<string, string> = {
        'desktop': path.join(homeDir, 'Desktop'),
        'documents': path.join(homeDir, 'Documents'),
        'downloads': path.join(homeDir, 'Downloads'),
        'pictures': path.join(homeDir, 'Pictures'),
        'music': path.join(homeDir, 'Music'),
        'videos': path.join(homeDir, 'Videos'),
        'mycomputer': '',
        'explorer': ''
      };

      const folderPath = folderMap[folderName];
      
      if (folderPath === undefined) {
        return { success: false, message: '未找到该文件夹' };
      }

      if (platform === 'win32') {
        if (folderName === 'mycomputer' || folderName === 'explorer') {
          // explorer命令即使成功也可能返回非零退出码，所以不等待它完成
          exec('explorer ::{20D04FE0-3AEA-1069-A2D8-08002B30309D}');
        } else {
          // explorer命令即使成功也可能返回非零退出码，所以不等待它完成
          exec(`explorer "${folderPath}"`);
        }
      } else if (platform === 'darwin') {
        // macOS
        if (folderName === 'mycomputer' || folderName === 'explorer') {
          await execAsync('open /');
        } else {
          await execAsync(`open "${folderPath}"`);
        }
      } else {
        // Linux
        if (folderName === 'mycomputer' || folderName === 'explorer') {
          await execAsync('xdg-open /');
        } else {
          await execAsync(`xdg-open "${folderPath}"`);
        }
      }

      const folderNames: Record<string, string> = {
        'desktop': '桌面',
        'documents': '文档',
        'downloads': '下载',
        'pictures': '图片',
        'music': '音乐',
        'videos': '视频',
        'mycomputer': '我的电脑',
        'explorer': '文件资源管理器'
      };

      return { success: true, message: `已成功打开${folderNames[folderName] || folderName}` };
    } catch (error) {
      console.error('❌ 打开文件夹失败:', error);
      return { success: false, message: '打开文件夹失败' };
    }
  }

  /**
   * 锁定屏幕
   */
  async lockScreen(): Promise<{ success: boolean; message: string }> {
    try {
      const platform = os.platform();
      
      if (platform === 'win32') {
        // rundll32命令即使成功也可能返回非零退出码，所以不等待它完成
        exec('rundll32.exe user32.dll,LockWorkStation');
      } else if (platform === 'darwin') {
        // macOS
        await execAsync('osascript -e \'tell application "System Events" to keystroke "q" using {command down, control down}\'');
      } else {
        // Linux (GNOME)
        await execAsync('gnome-screensaver-command -l');
      }

      return { success: true, message: '屏幕已锁定' };
    } catch (error) {
      console.error('❌ 锁定屏幕失败:', error);
      return { success: false, message: '锁定屏幕失败' };
    }
  }

  /**
   * 调节音量
   */
  async adjustVolume(volume?: number, direction?: 'up' | 'down'): Promise<{ success: boolean; message: string }> {
    try {
      const platform = os.platform();

      if (platform === 'win32') {
        if (volume !== undefined) {
          const vol = Math.max(0, Math.min(100, volume));
          console.log('🔊 设置音量到:', vol);
          
          const keyCount = Math.round(vol / 2);
          console.log('🔊 按', keyCount, '次增大音量键');
          
          try {
            await execAsync(`powershell -Command "$wsh = New-Object -ComObject WScript.Shell; for ($i = 0; $i -lt 50; $i++) { $wsh.SendKeys([char]174); Start-Sleep -Milliseconds 150 }; Start-Sleep -Milliseconds 500; for ($i = 0; $i -lt ${keyCount}; $i++) { $wsh.SendKeys([char]175); Start-Sleep -Milliseconds 150 }"`);
            console.log('✅ 执行完成!');
          } catch (e) {
            console.log('❌ 出错，改用 exec:', e);
            exec(`powershell -Command "$wsh = New-Object -ComObject WScript.Shell; for ($i = 0; $i -lt 50; $i++) { $wsh.SendKeys([char]174); Start-Sleep -Milliseconds 150 }; Start-Sleep -Milliseconds 500; for ($i = 0; $i -lt ${keyCount}; $i++) { $wsh.SendKeys([char]175); Start-Sleep -Milliseconds 150 }"`);
          }
          
          return { success: true, message: `已将音量调至${vol}%` };
        } else if (direction === 'up') {
          console.log('🔊 增大音量');
          
          try {
            await execAsync('powershell -Command "$wsh = New-Object -ComObject WScript.Shell; for ($i = 0; $i -lt 5; $i++) { $wsh.SendKeys([char]175); Start-Sleep -Milliseconds 150 }"');
          } catch (e) {
            exec('powershell -Command "$wsh = New-Object -ComObject WScript.Shell; for ($i = 0; $i -lt 5; $i++) { $wsh.SendKeys([char]175); Start-Sleep -Milliseconds 150 }"');
          }
          
          return { success: true, message: '音量已增大' };
        } else if (direction === 'down') {
          console.log('🔉 减小音量');
          
          try {
            await execAsync('powershell -Command "$wsh = New-Object -ComObject WScript.Shell; for ($i = 0; $i -lt 5; $i++) { $wsh.SendKeys([char]174); Start-Sleep -Milliseconds 150 }"');
          } catch (e) {
            exec('powershell -Command "$wsh = New-Object -ComObject WScript.Shell; for ($i = 0; $i -lt 5; $i++) { $wsh.SendKeys([char]174); Start-Sleep -Milliseconds 150 }"');
          }
          
          return { success: true, message: '音量已减小' };
        }
      } else if (platform === 'darwin') {
        if (volume !== undefined) {
          await execAsync(`osascript -e 'set volume output volume ${volume}'`);
          return { success: true, message: `已将音量调至${volume}%` };
        } else if (direction === 'up') {
          await execAsync('osascript -e "set volume output volume (output volume of (get volume settings) + 10)"');
          return { success: true, message: '音量已增大' };
        } else if (direction === 'down') {
          await execAsync('osascript -e "set volume output volume (output volume of (get volume settings) - 10)"');
          return { success: true, message: '音量已减小' };
        }
      } else {
        if (volume !== undefined) {
          await execAsync(`amixer set Master ${volume}%`);
          return { success: true, message: `已将音量调至${volume}%` };
        } else if (direction === 'up') {
          await execAsync('amixer set Master 10%+');
          return { success: true, message: '音量已增大' };
        } else if (direction === 'down') {
          await execAsync('amixer set Master 10%-');
          return { success: true, message: '音量已减小' };
        }
      }

      return { success: false, message: '音量调节参数不正确' };
    } catch (error) {
      console.error('❌ 调节音量失败:', error);
      return { success: false, message: '调节音量失败' };
    }
  }

  /**
   * 静音/取消静音
   */
  async toggleMute(action?: 'mute' | 'unmute'): Promise<{ success: boolean; message: string }> {
    try {
      const platform = os.platform();
      
      if (platform === 'win32') {
        console.log('🔇 切换静音状态');
        
        try {
          await execAsync('powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]173)"');
        } catch (e) {
          exec('powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]173)"');
        }
        
        const message = action === 'mute' ? '已静音' : action === 'unmute' ? '已取消静音' : '已切换静音状态';
        return { success: true, message };
      } else if (platform === 'darwin') {
        if (action === 'mute') {
          await execAsync('osascript -e "set volume with output muted"');
          return { success: true, message: '已静音' };
        } else if (action === 'unmute') {
          await execAsync('osascript -e "set volume without output muted"');
          return { success: true, message: '已取消静音' };
        } else {
          await execAsync('osascript -e "set volume output muted not (output muted of (get volume settings))"');
          return { success: true, message: '已切换静音状态' };
        }
      } else {
        if (action === 'mute') {
          await execAsync('amixer set Master mute');
          return { success: true, message: '已静音' };
        } else if (action === 'unmute') {
          await execAsync('amixer set Master unmute');
          return { success: true, message: '已取消静音' };
        } else {
          await execAsync('amixer set Master toggle');
          return { success: true, message: '已切换静音状态' };
        }
      }
    } catch (error) {
      console.error('❌ 切换静音失败:', error);
      return { success: false, message: '切换静音失败' };
    }
  }

  /**
   * 搜索网页
   */
  async searchWeb(query: string): Promise<{ success: boolean; message: string }> {
    try {
      const platform = os.platform();
      const encodedQuery = encodeURIComponent(query);
      const searchUrl = `https://www.baidu.com/s?wd=${encodedQuery}`;
      
      if (platform === 'win32') {
        // start命令即使成功也可能返回非零退出码，所以不等待它完成
        exec(`start msedge "${searchUrl}"`);
      } else if (platform === 'darwin') {
        await execAsync(`open "${searchUrl}"`);
      } else {
        await execAsync(`xdg-open "${searchUrl}"`);
      }
      
      return { success: true, message: `已为你搜索"${query}"` };
    } catch (error) {
      console.error('❌ 搜索网页失败:', error);
      return { success: false, message: '搜索网页失败' };
    }
  }

  /**
   * 关闭电脑
   */
  async shutdownComputer(): Promise<{ success: boolean; message: string }> {
    try {
      const platform = os.platform();
      
      if (platform === 'win32') {
        await execAsync('shutdown /s /t 60');
        return { success: true, message: '电脑将在60秒后关机，你可以使用"取消关机"来停止' };
      } else if (platform === 'darwin') {
        await execAsync('sudo shutdown -h +1');
        return { success: true, message: '电脑将在1分钟后关机' };
      } else {
        await execAsync('sudo shutdown -h +1');
        return { success: true, message: '电脑将在1分钟后关机' };
      }
    } catch (error) {
      console.error('❌ 关机失败:', error);
      return { success: false, message: '关机失败' };
    }
  }

  /**
   * 重启电脑
   */
  async restartComputer(): Promise<{ success: boolean; message: string }> {
    try {
      const platform = os.platform();
      
      if (platform === 'win32') {
        await execAsync('shutdown /r /t 60');
        return { success: true, message: '电脑将在60秒后重启' };
      } else if (platform === 'darwin') {
        await execAsync('sudo shutdown -r +1');
        return { success: true, message: '电脑将在1分钟后重启' };
      } else {
        await execAsync('sudo shutdown -r +1');
        return { success: true, message: '电脑将在1分钟后重启' };
      }
    } catch (error) {
      console.error('❌ 重启失败:', error);
      return { success: false, message: '重启失败' };
    }
  }

  /**
   * 取消关机/重启
   */
  async cancelShutdown(): Promise<{ success: boolean; message: string }> {
    try {
      const platform = os.platform();
      
      if (platform === 'win32') {
        await execAsync('shutdown /a');
        return { success: true, message: '已取消关机/重启' };
      } else {
        return { success: true, message: '已取消关机/重启' };
      }
    } catch (error) {
      console.error('❌ 取消关机失败:', error);
      return { success: false, message: '取消关机失败' };
    }
  }

  /**
   * 休眠电脑
   */
  async sleepComputer(): Promise<{ success: boolean; message: string }> {
    try {
      const platform = os.platform();
      
      if (platform === 'win32') {
        // rundll32命令即使成功也可能返回非零退出码，所以不等待它完成
        exec('rundll32.exe powrprof.dll,SetSuspendState 0,1,0');
        return { success: true, message: '电脑即将休眠' };
      } else if (platform === 'darwin') {
        await execAsync('pmset sleepnow');
        return { success: true, message: '电脑即将休眠' };
      } else {
        await execAsync('systemctl suspend');
        return { success: true, message: '电脑即将休眠' };
      }
    } catch (error) {
      console.error('❌ 休眠失败:', error);
      return { success: false, message: '休眠失败' };
    }
  }

  /**
   * 清空回收站
   */
  async emptyRecycleBin(): Promise<{ success: boolean; message: string }> {
    try {
      const platform = os.platform();
      
      if (platform === 'win32') {
        // PowerShell命令即使成功也可能返回非零退出码，所以不等待它完成
        exec('powershell -Command "Clear-RecycleBin -Force"');
        return { success: true, message: '回收站已清空' };
      } else if (platform === 'darwin') {
        await execAsync('rm -rf ~/.Trash/*');
        return { success: true, message: '回收站已清空' };
      } else {
        await execAsync('rm -rf ~/.local/share/Trash/*');
        return { success: true, message: '回收站已清空' };
      }
    } catch (error) {
      console.error('❌ 清空回收站失败:', error);
      return { success: false, message: '清空回收站失败' };
    }
  }
}

// 创建单例
let systemControlServiceInstance: SystemControlService | null = null;

export function getSystemControlService(): SystemControlService {
  if (!systemControlServiceInstance) {
    systemControlServiceInstance = new SystemControlService();
  }
  return systemControlServiceInstance;
}
