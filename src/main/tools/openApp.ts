import { ipcMain, shell } from 'electron'
import { execFileSync, execSync } from 'child_process'
import iconv from 'iconv-lite'

/**
 * 检查 target 是否安全（防止命令注入）
 * 只允许：URL、英文字母/数字/中文/常见符号
 */
function isTargetSafe(target: string): boolean {
  // URL 白名单
  if (/^https?:\/\//.test(target)) return true;
  // 应用名：只允许中文、英文、数字、空格、点、横线、下划线
  if (/^[\w\u4e00-\u9fff\s.\-]+$/.test(target)) return true;
  return false;
}

function getTargetAliases(target: string): string[] {
  const normalized = target.trim();
  const aliases: Record<string, string[]> = {
    'QQ音乐': ['QQ音乐', 'QQMusic', 'Tencent QQMusic'],
    'qq音乐': ['QQ音乐', 'QQMusic', 'Tencent QQMusic'],
    'QQMusic': ['QQMusic', 'QQ音乐', 'Tencent QQMusic'],
    'qqmusic': ['QQMusic', 'QQ音乐', 'Tencent QQMusic'],
    'QQ': ['QQ', '腾讯QQ'],
    '腾讯QQ': ['腾讯QQ', 'QQ'],
  };
  return Array.from(new Set([...(aliases[normalized] || []), normalized]));
}

function quoteCmdArg(value: string): string {
  return value.replace(/"/g, '""');
}

function findStartApp(targets: string[]): { name: string; appId: string } | null {
  if (process.platform !== 'win32') return null;
  const escapedTargets = targets.map((item) => item.replace(/'/g, "''"));
  const script = `
$targets = @('${escapedTargets.join("','")}')
$apps = Get-StartApps
foreach ($target in $targets) {
  $match = $apps | Where-Object { $_.Name -eq $target } | Select-Object -First 1
  if (-not $match) { $match = $apps | Where-Object { $_.Name -like "*$target*" } | Select-Object -First 1 }
  if ($match) {
    [pscustomobject]@{ Name = $match.Name; AppID = $match.AppID } | ConvertTo-Json -Compress
    exit 0
  }
}
`;
  try {
    const output = execFileSync('powershell.exe', ['-NoProfile', '-Command', script], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
      windowsHide: true,
    }).trim();
    if (!output) return null;
    const result = JSON.parse(output);
    if (result?.Name && result?.AppID) {
      return { name: result.Name, appId: result.AppID };
    }
  } catch {
    return null;
  }
  return null;
}

// open_app — 智能打开应用或网页
export function registerOpenApp() {
  ipcMain.handle('open-app', async (_event, target: string) => {
    try {
      // 安全检查：防止命令注入
      if (!isTargetSafe(target)) {
        return { success: false, error: `不安全的输入: "${target}"，仅支持应用名或URL` };
      }
      // 1. 是 URL → 用 shell 打开浏览器
      if (target.startsWith('http://') || target.startsWith('https://')) {
        shell.openExternal(target);
        return { success: true, data: `已打开网页: ${target}` };
      }

      const targetAliases = getTargetAliases(target);

      // 2. 查注册表 App Paths（Windows 专有）
      if (process.platform === 'win32') {
        for (const alias of targetAliases) {
          try {
            const appName = alias.toLowerCase().endsWith('.exe') ? alias : `${alias}.exe`;
            const escapedAppName = quoteCmdArg(appName);
            const regResult = execSync(
              `reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${escapedAppName}" /ve & reg query "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${escapedAppName}" /ve`,
              { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
            );
            const match = regResult.match(/REG_SZ\s+(.+)/);
            if (match && match[1]) {
              const appPath = match[1].trim();
              shell.openPath(appPath);
              return { success: true, data: `已打开: ${target}（路径: ${appPath}）` };
            }
          } catch {
            // 注册表没找到，继续下一步
          }
        }

        // 3. 搜索开始菜单快捷方式
        for (const alias of targetAliases) {
          try {
            const userMenu = process.env.APPDATA || '';
            const publicMenu = process.env.ALLUSERSPROFILE || '';
            const escapedAlias = quoteCmdArg(alias);
            const searchCmd = `dir /s /b "${userMenu}\\Microsoft\\Windows\\Start Menu\\Programs\\*${escapedAlias}*.lnk" 2>nul & dir /s /b "${publicMenu}\\Microsoft\\Windows\\Start Menu\\Programs\\*${escapedAlias}*.lnk" 2>nul`;
            const lnkBuffer = execSync(searchCmd, { stdio: ['pipe', 'pipe', 'pipe'] });
            const lnkResult = iconv.decode(lnkBuffer, 'gbk').trim();
            if (lnkResult) {
              const lnkPath = lnkResult.split('\n')[0].trim();
              execSync(`start "" "${quoteCmdArg(lnkPath)}"`, { stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000, windowsHide: true });
              return { success: true, data: `已打开: ${target}（快捷方式: ${lnkPath}）` };
            }
          } catch {
            // 开始菜单也没找到，继续下一步
          }
        }

        // 4. Windows 开始菜单 AppID（Get-StartApps 对中文应用更可靠）
        const startApp = findStartApp(targetAliases);
        if (startApp) {
          try {
            const appUri = `shell:AppsFolder\\${startApp.appId}`;
            execSync(`start "" "${quoteCmdArg(appUri)}"`, { stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000, windowsHide: true });
            return { success: true, data: `已打开: ${startApp.name}（AppID: ${startApp.appId}）` };
          } catch {
            // AppID 启动失败，继续兜底
          }
        }

        // 5. 兜底：直接 start（windowsHide 防止弹窗）
        for (const alias of targetAliases) {
          try {
            execSync(`start "" "${quoteCmdArg(alias)}"`, { stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000, windowsHide: true });
            return { success: true, data: `已打开: ${alias}` };
          } catch {
            // start 也失败了
          }
        }
      } else {
        // Mac / Linux
        const cmd = process.platform === 'darwin' ? `open -a "${target}"` : `xdg-open "${target}"`;
        execSync(cmd, { stdio: 'ignore', timeout: 10000 });
        return { success: true, data: `已打开: ${target}` };
      }

      return { success: false, error: `找不到应用: ${target}` };
    } catch (error: any) {
      return { success: false, error: `无法打开 "${target}": ${error.message}` };
    }
  });
}
