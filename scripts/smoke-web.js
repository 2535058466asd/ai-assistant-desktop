const { spawn } = require('node:child_process');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const BASE_URL = process.env.NOVA_SMOKE_URL || 'http://127.0.0.1:5173';
const OUTPUT_DIR = path.join(ROOT, 'output', 'playwright');

const result = {
  ok: false,
  baseUrl: BASE_URL,
  startedDevServer: false,
  steps: [],
  localStorage: {},
  errors: [],
  warnings: [],
  screenshots: [],
};

function pushStep(name, ok, details) {
  result.steps.push({ name, ok, ...(details ? { details } : {}) });
}

async function isReachable(url) {
  try {
    const response = await fetch(url, { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForReachable(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isReachable(url)) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function startDevServer() {
  const child = spawn('npm run dev -- --host 127.0.0.1', {
    cwd: ROOT,
    env: { ...process.env, BROWSER: 'none' },
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    if (/error/i.test(text)) result.warnings.push(`[dev-server stdout] ${text.trim()}`);
  });
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString().trim();
    if (text) result.warnings.push(`[dev-server stderr] ${text}`);
  });

  result.startedDevServer = true;
  return child;
}

function stopDevServer(child) {
  if (!child || child.killed) return;
  if (process.platform === 'win32') {
    try {
      execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' });
      return;
    } catch {
      // Fall through to kill for non-standard shells.
    }
  }
  child.kill();
}

async function launchBrowser() {
  let lastError;
  const executableCandidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);

  for (const executablePath of executableCandidates) {
    if (!fs.existsSync(executablePath)) continue;
    try {
      return await chromium.launch({
        executablePath,
        headless: true,
      });
    } catch (error) {
      lastError = error;
    }
  }

  const attempts = [
    { channel: 'msedge' },
    { channel: 'chrome' },
    {},
  ];

  for (const options of attempts) {
    try {
      return await chromium.launch({
        ...options,
        headless: true,
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

async function clickFirstVisible(page, locators, label) {
  for (const locator of locators) {
    const count = await locator.count().catch(() => 0);
    for (let i = 0; i < count; i += 1) {
      const item = locator.nth(i);
      if (await item.isVisible().catch(() => false)) {
        await item.click();
        return;
      }
    }
  }
  throw new Error(`Cannot find visible control: ${label}`);
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let devServer = null;
  if (!(await isReachable(BASE_URL))) {
    devServer = startDevServer();
    const ready = await waitForReachable(BASE_URL);
    if (!ready) {
      throw new Error(`Vite dev server did not become ready: ${BASE_URL}`);
    }
  }

  let browser = null;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    await page.addInitScript(() => {
      const ok = (data) => Promise.resolve({ success: true, data });
      const emptyOk = () => Promise.resolve({ success: true });

      window.electronAPI = {
        conversationList: () => ok([]),
        conversationGetMessages: () => ok([]),
        conversationSave: emptyOk,
        conversationDelete: emptyOk,
        conversationRename: emptyOk,
        conversationSetPinned: emptyOk,
        conversationImportLegacy: () => Promise.resolve({ success: true, data: { conversations: 0, messages: 0 } }),
        attachmentSave: (input) => ok({
          id: `mock-${Date.now()}`,
          type: 'image',
          name: input.name,
          mimeType: input.mimeType,
          sizeBytes: 0,
          relativePath: `mock/${input.name}`,
        }),
        attachmentReadDataUrl: () => ok('data:image/png;base64,'),
        attachmentDeleteByChat: emptyOk,
        knowledgeStats: () => ok({ count: 0, collections: [] }),
        knowledgeSources: () => ok([]),
        knowledgeSearchStructured: () => ok([]),
        knowledgeSearch: () => ok(''),
        knowledgeAdd: () => Promise.resolve({ success: true, count: 0 }),
        knowledgeDeleteBySource: () => Promise.resolve({ success: true, deletedCount: 0 }),
        knowledgeImportFile: () => Promise.resolve({ success: true, chunks: 0 }),
        knowledgeImportImage: () => Promise.resolve({ success: true, count: 0 }),
        showOpenDialog: () => ok([]),
        parseFileToText: () => Promise.resolve({ success: false, error: 'mock parse unavailable' }),
        memorySetPreference: () => Promise.resolve(),
        memoryGetPreference: () => Promise.resolve(null),
        memoryGetAllPreferences: () => Promise.resolve({}),
        memoryAddMemory: () => Promise.resolve({ action: 'ignored', content: '' }),
        memoryGetAllMemories: () => Promise.resolve([]),
        memoryGetPrompt: () => Promise.resolve(''),
        memorySearchMemories: () => Promise.resolve([]),
        memoryDeleteMemory: () => Promise.resolve(),
        memorySetStatus: () => Promise.resolve(),
        memoryClearAllMemories: () => Promise.resolve(),
        searchSetConfig: emptyOk,
        volcengineTTSListSpeakers: () => ok([]),
        ttsCacheCheck: () => Promise.resolve({ exists: false }),
        ttsCacheSave: emptyOk,
        modelFetch: () => Promise.resolve({ ok: false, status: 501, statusText: 'Mocked', body: '' }),
        modelFetchStream: () => Promise.resolve({ ok: false, status: 501, statusText: 'Mocked', body: '' }),
        ttsV3Connect: emptyOk,
        ttsV3Synthesize: emptyOk,
        ttsV3Disconnect: emptyOk,
        asrV3Connect: emptyOk,
        asrV3StartRecognition: emptyOk,
        asrV3SendAudio: emptyOk,
        asrV3StopRecognition: emptyOk,
        realtimeDialogConnect: emptyOk,
        realtimeDialogSendAudio: emptyOk,
        realtimeDialogDisconnect: emptyOk,
        getFilePaths: () => [],
        clipboardReadFiles: () => ok([]),
        clipboardRead: () => ok(''),
        clipboardWrite: emptyOk,
        execCommand: emptyOk,
        readFile: emptyOk,
        writeFile: emptyOk,
        createDir: emptyOk,
        copyFile: emptyOk,
        moveFile: emptyOk,
        deleteFile: emptyOk,
        webSearch: emptyOk,
        webFetch: emptyOk,
        listDir: emptyOk,
        searchFiles: emptyOk,
        grepContent: emptyOk,
        openApp: emptyOk,
        getCurrentTime: () => ok(new Date().toISOString()),
        getSystemInfo: () => ok('mock system'),
        notify: emptyOk,
        on: () => () => {},
      };
    });

    page.on('console', (message) => {
      const text = message.text();
      if (message.type() === 'error') {
        result.errors.push(text);
      } else if (message.type() === 'warning') {
        result.warnings.push(text);
      }
    });
    page.on('pageerror', (error) => {
      result.errors.push(error.message);
    });

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.getByText('Nova').first().waitFor({ timeout: 15000 });
    pushStep('open_web_ui', true);

    await clickFirstVisible(
      page,
      [
        page.getByRole('button', { name: /settings|设置/i }),
        page.getByText('设置'),
      ],
      'settings'
    );
    await page.waitForTimeout(500);

    await clickFirstVisible(
      page,
      [
        page.getByRole('tab', { name: /voice|语音/i }),
        page.getByText('语音'),
      ],
      'voice settings'
    );
    pushStep('open_voice_settings', true);

    const selects = page.locator('select');
    const selectCount = await selects.count();
    if (selectCount < 2) {
      throw new Error(`Expected at least ASR and TTS selects, got ${selectCount}`);
    }
    const ttsCombo = selects.nth(1);
    await ttsCombo.selectOption('mimo');
    await page.waitForFunction(() => localStorage.getItem('nova.tts.type') !== 'mimo').catch(() => {});
    const selectedTtsType = await ttsCombo.inputValue();
    if (selectedTtsType !== 'mimo') {
      throw new Error(`Failed to select MiMo TTS, current value: ${selectedTtsType}`);
    }
    await page.locator('select').filter({ hasText: /mimo-v2\.5-tts/i }).selectOption('mimo-v2.5-tts');

    await clickFirstVisible(
      page,
      [
        page.getByRole('button', { name: /保存|save/i }),
        page.getByText('保存配置'),
      ],
      'save voice settings'
    );
    await page.waitForTimeout(500);

    result.localStorage = await page.evaluate(() => ({
      mimoChatModel: localStorage.getItem('nova.mimo.model'),
      mimoTtsModel: localStorage.getItem('nova.mimo.ttsModel'),
      ttsType: localStorage.getItem('nova.tts.type'),
      mimoVoice: localStorage.getItem('nova.mimo.voice'),
      mimoBaseUrl: localStorage.getItem('nova.mimo.baseUrl'),
    }));

    if (result.localStorage.ttsType !== 'mimo') {
      throw new Error(`TTS type was not saved as mimo: ${result.localStorage.ttsType}`);
    }
    if (result.localStorage.mimoTtsModel !== 'mimo-v2.5-tts') {
      throw new Error(`MiMo TTS model was not saved: ${result.localStorage.mimoTtsModel}`);
    }
    if (result.localStorage.mimoChatModel === 'mimo-v2.5-tts') {
      throw new Error('MiMo TTS model leaked into chat model localStorage key');
    }
    pushStep('save_mimo_tts_without_polluting_chat_model', true);

    await clickFirstVisible(
      page,
      [
        page.getByRole('button', { name: /chat|聊天/i }),
        page.getByText('聊天'),
      ],
      'chat'
    );
    await page.waitForTimeout(500);

    const input = page.locator('textarea, [contenteditable="true"], input[type="text"]').last();
    await input.fill('smoke test');
    await page.getByRole('button').last().waitFor({ timeout: 5000 });
    pushStep('chat_input_available', true);

    const screenshot = path.join(OUTPUT_DIR, `smoke-web-${Date.now()}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    result.screenshots.push(screenshot);

    const unexpectedErrors = result.errors.filter((error) => (
      !/electronAPI.*不可用/i.test(error)
      && !/Autofill\.(enable|setAddresses)/i.test(error)
    ));
    if (unexpectedErrors.length > 0) {
      throw new Error(`Unexpected console errors: ${unexpectedErrors.join(' | ')}`);
    }

    result.ok = true;
  } finally {
    if (browser) await browser.close();
    if (devServer) stopDevServer(devServer);
  }
}

main()
  .catch((error) => {
    result.ok = false;
    result.error = error.message;
    result.stack = error.stack;
    const lastStep = result.steps[result.steps.length - 1];
    if (!lastStep || lastStep.ok) {
      pushStep('smoke_web_failed', false, error.message);
    }
    process.exitCode = 1;
  })
  .finally(() => {
    console.log(JSON.stringify(result, null, 2));
  });
