import { ipcMain, shell } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import iconv from 'iconv-lite'

const execFileAsync = promisify(execFile)

function isTargetSafe(target: string): boolean {
  if (/^https?:\/\//.test(target)) return true;
  if (/^[\w一-鿿\s.\-]+$/.test(target)) return true;
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

export function registerOpenApp() {
  ipcMain.handle('open-app', async (_event, target: string) => {
    try {
      if (!isTargetSafe(target)) {
        return { success: false, error: `不安全的输入: "${target}"，仅支持应用名或URL` };
      }

      if (target.startsWith('http://') || target.startsWith('https://')) {
        shell.openExternal(target);
        return { success: true, data: `已打开网页: ${target}` };
      }

      const targetAliases = getTargetAliases(target);

      if (process.platform === 'win32') {
        const found =
          (await tryRegistryLookup(targetAliases)) ??
          (await tryStartMenuSearch(targetAliases)) ??
          (await tryStartApps(targetAliases));

        if (found) return { success: true, data: `已打开: ${found}` };

        const opened = await shell.openPath(target);
        if (opened === '') return { success: true, data: `已打开: ${target}` };
      } else {
        const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
        await execFileAsync(cmd, [target]);
        return { success: true, data: `已打开: ${target}` };
      }

      return { success: false, error: `找不到应用: ${target}` };
    } catch (error: any) {
      return { success: false, error: `无法打开 "${target}": ${error.message}` };
    }
  });
}

async function tryRegistryLookup(aliases: string[]): Promise<string | null> {
  for (const alias of aliases) {
    try {
      const appName = alias.toLowerCase().endsWith('.exe') ? alias : `${alias}.exe`;
      const script = `
        $paths = @(
          (Get-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${appName}" -ErrorAction SilentlyContinue).'(default)',
          (Get-ItemProperty -Path "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${appName}" -ErrorAction SilentlyContinue).'(default)'
        )
        $found = $paths | Where-Object { $_ } | Select-Object -First 1
        if ($found) { Write-Output $found }
      `;
      const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
        timeout: 10000,
        windowsHide: true,
        encoding: 'utf8',
      });
      const appPath = stdout.trim();
      if (appPath) {
        shell.openPath(appPath);
        return `${alias}（路径: ${appPath}）`;
      }
    } catch { /* not found, continue */ }
  }
  return null;
}

async function findLnkFile(targets: string[]): Promise<string | null> {
  const userMenu = process.env.APPDATA || '';
  const publicMenu = process.env.ALLUSERSPROFILE || '';

  for (const alias of targets) {
    try {
      const { stdout } = await execFileAsync('powershell.exe', [
        '-NoProfile', '-Command',
        `Get-ChildItem -Path "${userMenu}\\Microsoft\\Windows\\Start Menu\\Programs","${publicMenu}\\Microsoft\\Windows\\Start Menu\\Programs" -Filter "*${alias}*.lnk" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName`
      ], { timeout: 10000, windowsHide: true, encoding: 'utf8' });
      const lnkPath = stdout.trim();
      if (lnkPath) return lnkPath;
    } catch { /* not found */ }
  }
  return null;
}

async function tryStartMenuSearch(aliases: string[]): Promise<string | null> {
  const lnkPath = await findLnkFile(aliases);
  if (!lnkPath) return null;

  try {
    const opened = await shell.openPath(lnkPath);
    if (opened === '') return `${aliases[0]}（快捷方式: ${lnkPath}）`;
  } catch { /* open failed */ }
  return null;
}

async function tryStartApps(aliases: string[]): Promise<string | null> {
  const escapedTargets = aliases.map(a => a.replace(/'/g, "''"));
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
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
      timeout: 10000,
      windowsHide: true,
      encoding: 'utf8',
    });
    if (!stdout.trim()) return null;
    const result = JSON.parse(stdout.trim());
    if (result?.Name && result?.AppID) {
      const appUri = `shell:AppsFolder\\${result.AppID}`;
      const opened = await shell.openPath(appUri);
      if (opened === '') return `${result.Name}（AppID: ${result.AppID}）`;
    }
  } catch { /* not found */ }
  return null;
}
