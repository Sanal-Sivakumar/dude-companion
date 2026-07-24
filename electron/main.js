const { app, BrowserWindow, ipcMain, screen, shell, systemPreferences, Notification, powerMonitor } = require('electron');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let overlay;
let panelOpen = false;
let cpuPrevious = null;
let activeSeconds = 0;
let lastActiveTick = Date.now();
let gpuInfoPromise = null;
const smokeOutput = process.env.DUDE_SMOKE_OUTPUT ? path.resolve(process.env.DUDE_SMOKE_OUTPUT) : null;
const smokeScene = ['articulation', 'impact', 'wardrobe', 'sit', 'getup', 'surfaces', 'turntable'].includes(process.env.DUDE_SMOKE_SCENE) ? process.env.DUDE_SMOKE_SCENE : 'articulation';
const smokeDelay = Math.max(350, Math.min(5000, Number(process.env.DUDE_SMOKE_DELAY_MS) || 1800));
if (smokeOutput) app.setPath('userData', path.join(os.tmpdir(), `dude-companion-smoke-${process.pid}`));

const defaults = {
  character: 'male',
  outfit: 'night',
  quiet: false,
  motion: 0.85,
  speaking: 'rare',
  launchAtLogin: false,
  permissions: {},
  reminders: [],
  position: null,
  positions: {}
};

const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try {
    return saveSettings(JSON.parse(fs.readFileSync(settingsPath(), 'utf8')));
  } catch {
    return { ...defaults };
  }
}

function saveSettings(next) {
  const input = next && typeof next === 'object' ? next : {};
  const positions = {};
  if (input.positions && typeof input.positions === 'object') {
    for (const id of ['dude', 'dudette']) {
      const candidate = input.positions[id];
      if (candidate && Number.isFinite(Number(candidate.x)) && Number.isFinite(Number(candidate.y))) {
        positions[id] = { x: Math.round(Number(candidate.x)), y: Math.round(Number(candidate.y)) };
      }
    }
  }
  const permissions = {};
  if (input.permissions && typeof input.permissions === 'object') {
    for (const kind of ['search', 'open-url', 'open-app', 'close-app', 'type', 'click', 'wallpaper', 'download']) {
      if (input.permissions[kind] === 'always') permissions[kind] = 'always';
    }
  }
  const reminders = Array.isArray(input.reminders) ? input.reminders
    .filter((item) => item && typeof item === 'object' && Number.isFinite(Number(item.dueAt)))
    .slice(0, 30)
    .map((item) => ({ text: cleanText(item.text, 240), dueAt: Number(item.dueAt) })) : [];
  const safe = {
    ...defaults,
    character: ['male', 'female', 'both'].includes(input.character) ? input.character : 'male',
    outfit: ['night', 'ember', 'moon', 'forest', 'frost', 'rose'].includes(input.outfit) ? input.outfit : 'night',
    quiet: Boolean(input.quiet),
    motion: Math.max(0, Math.min(1, Number(input.motion) || 0)),
    speaking: ['rare', 'off'].includes(input.speaking) ? input.speaking : 'rare',
    launchAtLogin: Boolean(input.launchAtLogin),
    permissions,
    reminders,
    positions,
    position: input.position && Number.isFinite(Number(input.position.x)) && Number.isFinite(Number(input.position.y))
      ? { x: Math.round(Number(input.position.x)), y: Math.round(Number(input.position.y)) }
      : null
  };
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(safe, null, 2));
  return safe;
}

function createOverlay() {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.bounds;
  overlay = new BrowserWindow({
    x, y, width, height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    title: 'Dude Companion',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  overlay.setAlwaysOnTop(true, 'floating');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.setIgnoreMouseEvents(true, { forward: true });
  overlay.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  overlay.webContents.on('will-navigate', (event) => event.preventDefault());
  const loadOptions = smokeOutput ? { query: { smoke: smokeScene } } : undefined;
  overlay.loadFile(path.join(__dirname, '..', 'src', 'index.html'), loadOptions);
  overlay.once('ready-to-show', () => overlay.showInactive());
  if (smokeOutput) overlay.webContents.once('did-finish-load', runSmokeCapture);
  overlay.on('closed', () => { overlay = null; });
}

async function runSmokeCapture() {
  try {
    await new Promise((resolve) => setTimeout(resolve, smokeDelay));
    const diagnostics = await overlay.webContents.executeJavaScript(`(() => ({
      title: document.title,
      actorCount: document.querySelectorAll('.companion').length,
      actors: [...document.querySelectorAll('.companion')].map((actor) => ({
        id: actor.dataset.actor,
        state: [...actor.classList].find((name) => name.startsWith('state-')),
        transform: actor.style.transform,
        outfit: [...actor.querySelector('.rig').classList].find((name) => name.startsWith('outfit-')),
        renderMode: actor.dataset.renderMode,
        yaw: Number(actor.dataset.yaw),
        rigTransform: actor.querySelector('.rig').style.transform,
        censorVisible: actor.dataset.wardrobeActive === 'true',
        wardrobeFrom: actor.dataset.wardrobeFrom,
        wardrobeTo: actor.dataset.wardrobeTo,
        coatHemVisible: actor.dataset.coatHemVisible === 'true',
        hipPivotsVisible: actor.dataset.hipPivotsVisible === 'true',
        supportKind: actor.dataset.supportKind,
        supportY: Number(actor.dataset.supportY),
        bodyAngle: Number(actor.dataset.bodyAngle),
        movingJoints: Number(actor.dataset.movingJoints),
        joints: Number(actor.dataset.jointCount),
        canvas: { width: actor.querySelector('canvas')?.width, height: actor.querySelector('canvas')?.height },
        privacyBlur: (() => {
          const blur = actor.querySelector('.privacy-blur');
          const style = blur ? getComputedStyle(blur) : null;
          return style ? { display: style.display, opacity: Number(style.opacity), width: blur.offsetWidth, height: blur.offsetHeight, backdropFilter: style.backdropFilter || style.webkitBackdropFilter } : null;
        })()
      })),
      csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || ''
    }))()`);
    const image = await overlay.capturePage();
    fs.mkdirSync(path.dirname(smokeOutput), { recursive: true });
    fs.writeFileSync(smokeOutput, image.toPNG());
    fs.writeFileSync(`${smokeOutput}.json`, JSON.stringify(diagnostics, null, 2));
    app.exit(0);
  } catch (error) {
    fs.mkdirSync(path.dirname(smokeOutput), { recursive: true });
    fs.writeFileSync(`${smokeOutput}.error.txt`, cleanText(error?.stack || error, 4000));
    app.exit(1);
  }
}

function cpuSnapshot() {
  const cpus = os.cpus();
  const current = cpus.map((cpu) => ({ ...cpu.times }));
  let percent = 0;
  if (cpuPrevious) {
    let idle = 0;
    let total = 0;
    current.forEach((now, i) => {
      const before = cpuPrevious[i];
      const idleDelta = now.idle - before.idle;
      const totalDelta = Object.values(now).reduce((a, b) => a + b, 0) - Object.values(before).reduce((a, b) => a + b, 0);
      idle += idleDelta;
      total += totalDelta;
    });
    percent = total > 0 ? Math.round((1 - idle / total) * 100) : 0;
  }
  cpuPrevious = current;
  return percent;
}

function runAppleScript(lines) {
  return new Promise((resolve) => {
    execFile('/usr/bin/osascript', lines.flatMap((line) => ['-e', line]), { timeout: 10000 }, (error, stdout, stderr) => {
      resolve(error ? { ok: false, error: (stderr || error.message).trim() } : { ok: true, output: stdout.trim() });
    });
  });
}

function gpuSnapshot() {
  if (!gpuInfoPromise) {
    gpuInfoPromise = new Promise((resolve) => {
      execFile('/usr/sbin/system_profiler', ['SPDisplaysDataType', '-json'], { timeout: 8000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout) => {
        if (error) return resolve({ name: 'Unavailable', shortName: 'aware', cores: null });
        try {
          const display = JSON.parse(stdout)?.SPDisplaysDataType?.[0] || {};
          const name = cleanText(display.sppci_model || display._name || 'Detected GPU', 100);
          const cores = Number.parseInt(display.sppci_cores, 10);
          resolve({ name, shortName: name.replace(/^Apple\s+/, '').slice(0, 12), cores: Number.isFinite(cores) ? cores : null });
        } catch {
          resolve({ name: 'Detected GPU', shortName: 'aware', cores: null });
        }
      });
    });
  }
  return gpuInfoPromise;
}

async function activeWindowSnapshot() {
  if (process.platform !== 'darwin' || !systemPreferences.isTrustedAccessibilityClient(false)) return null;
  const result = await runAppleScript([
    'tell application "System Events"',
    'set frontProcess to first application process whose frontmost is true',
    'set appName to name of frontProcess',
    'if appName is "Dude Companion" then return ""',
    'if (count of windows of frontProcess) is 0 then return ""',
    'set winPosition to position of front window of frontProcess',
    'set winSize to size of front window of frontProcess',
    'set AppleScript\'s text item delimiters to "|||"',
    'return {appName, item 1 of winPosition, item 2 of winPosition, item 1 of winSize, item 2 of winSize} as text',
    'end tell'
  ]);
  if (!result.ok || !result.output) return null;
  const [appName, x, y, width, height] = result.output.split('|||');
  const numbers = [x, y, width, height].map(Number);
  if (!numbers.every(Number.isFinite) || numbers[2] < 100 || numbers[3] < 80) return null;
  return { app: cleanText(appName, 80), x: numbers[0], y: numbers[1], width: numbers[2], height: numbers[3] };
}

function cleanText(value, max = 500) {
  return String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').slice(0, max);
}

const SAFE_DECISIONS = new Set(['lie', 'getup', 'sit', 'perch', 'ledge', 'climb-left', 'climb-right', 'ceiling-crawl', 'wave', 'stretch', 'look', 'dance', 'nap', 'read', 'work', 'balance', 'ponder', 'celebrate', 'greet', 'sneak', 'walk-left', 'walk-right', 'exit-left', 'exit-right', 'hang', 'laptop', 'chair', 'coffee', 'sword', 'foam-blaster', 'skateboard', 'umbrella', 'book', 'headphones']);

function localDecision(context) {
  const speed = Number(context?.speed) || 0;
  const impact = Number(context?.impact) || 0;
  const edge = cleanText(context?.edge, 12);
  const choices = impact > 11 || speed > 16
    ? ['lie', 'lie', 'getup', edge === 'left' ? 'exit-left' : 'exit-right', 'chair']
    : ['getup', 'sit', 'perch', 'ledge', 'climb-left', 'climb-right', 'ceiling-crawl', 'wave', 'stretch', 'look', 'dance', 'nap', 'read', 'work', 'balance', 'ponder', 'celebrate', 'greet', 'sneak', 'walk-left', 'walk-right', 'laptop', 'coffee', 'sword', 'book', 'headphones', 'skateboard'];
  return choices[Math.floor(Math.random() * choices.length)];
}

async function aiDecision(context) {
  const apiKey = process.env.DUDE_AI_KEY;
  const baseUrl = process.env.DUDE_AI_BASE_URL;
  const model = process.env.DUDE_AI_MODEL;
  if (!apiKey || !baseUrl || !model) return { decision: localDecision(context), source: 'local' };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.9,
        max_tokens: 20,
        messages: [
          { role: 'system', content: 'You control a witty tiny desktop mascot. Return exactly one harmless action and nothing else: lie, getup, sit, perch, ledge, climb-left, climb-right, ceiling-crawl, wave, stretch, look, dance, nap, read, work, balance, ponder, celebrate, greet, sneak, walk-left, walk-right, exit-left, exit-right, hang, laptop, chair, coffee, sword, foam-blaster, skateboard, umbrella, book, headphones. Choose from physical context, vary behavior, never perform computer actions.' },
          { role: 'user', content: JSON.stringify({ speed: Number(context?.speed) || 0, impact: Number(context?.impact) || 0, edge: cleanText(context?.edge, 12), current: cleanText(context?.current, 20) }) }
        ]
      })
    });
    clearTimeout(timer);
    if (!response.ok) throw new Error(`AI response ${response.status}`);
    const data = await response.json();
    const decision = cleanText(data?.choices?.[0]?.message?.content, 40).trim().toLowerCase();
    return { decision: SAFE_DECISIONS.has(decision) ? decision : localDecision(context), source: SAFE_DECISIONS.has(decision) ? 'ai' : 'local' };
  } catch {
    return { decision: localDecision(context), source: 'local' };
  }
}

async function aiChat(context) {
  const apiKey = process.env.DUDE_AI_KEY;
  const baseUrl = process.env.DUDE_AI_BASE_URL;
  const model = process.env.DUDE_AI_MODEL;
  if (!apiKey || !baseUrl || !model) return { reply: null, source: 'local' };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.78,
        max_tokens: 130,
        messages: [
          { role: 'system', content: 'You are Dude, an adorable witty adult chibi desktop companion. Reply naturally in at most 70 words. Be warm, concise, occasionally dry, and never claim you performed a computer action. The app separately asks permission for actions.' },
          { role: 'user', content: cleanText(context?.message, 1000) }
        ]
      })
    });
    clearTimeout(timer);
    if (!response.ok) throw new Error(`AI response ${response.status}`);
    const data = await response.json();
    const reply = cleanText(data?.choices?.[0]?.message?.content, 600).trim();
    return { reply: reply || null, source: reply ? 'ai' : 'local' };
  } catch {
    return { reply: null, source: 'local' };
  }
}

const rendererPath = path.join(__dirname, '..', 'src', 'index.html');

function trustedSender(event) {
  try {
    const url = new URL(event.senderFrame?.url || event.sender?.getURL() || '');
    return url.protocol === 'file:' && path.normalize(decodeURIComponent(url.pathname)) === path.normalize(rendererPath);
  } catch {
    return false;
  }
}

function requireTrusted(event) {
  if (!trustedSender(event)) throw new Error('Untrusted IPC sender.');
}

ipcMain.on('overlay:set-interactive', (event, interactive) => {
  if (!trustedSender(event)) return;
  if (!overlay || panelOpen) return;
  overlay.setIgnoreMouseEvents(!interactive, { forward: true });
});

ipcMain.on('overlay:set-panel-open', (event, open) => {
  if (!trustedSender(event)) return;
  panelOpen = Boolean(open);
  if (overlay) overlay.setIgnoreMouseEvents(!panelOpen, { forward: true });
});

ipcMain.handle('settings:load', (event) => { requireTrusted(event); return loadSettings(); });
ipcMain.handle('settings:save', (event, next) => { requireTrusted(event); return saveSettings(next || {}); });
ipcMain.handle('permissions:accessibility', (event, prompt) => { requireTrusted(event); return process.platform === 'darwin' && systemPreferences.isTrustedAccessibilityClient(Boolean(prompt)); });
ipcMain.handle('ai:decide', (event, context) => { requireTrusted(event); return aiDecision(context || {}); });
ipcMain.handle('ai:chat', (event, context) => { requireTrusted(event); return aiChat(context || {}); });

ipcMain.handle('system:snapshot', async (event) => {
  requireTrusted(event);
  const now = Date.now();
  if (powerMonitor.getSystemIdleTime() < 60) activeSeconds += Math.max(0, Math.round((now - lastActiveTick) / 1000));
  lastActiveTick = now;
  const total = os.totalmem();
  const free = os.freemem();
  const display = screen.getPrimaryDisplay();
  const [gpu, activeWindow] = await Promise.all([gpuSnapshot(), activeWindowSnapshot()]);
  return {
    cpu: cpuSnapshot(),
    memory: Math.round(((total - free) / total) * 100),
    activeMinutes: Math.floor(activeSeconds / 60),
    uptimeMinutes: Math.floor(os.uptime() / 60),
    battery: null,
    platform: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    gpu,
    activeWindow,
    bounds: display.bounds,
    workArea: display.workArea
  };
});

ipcMain.handle('notify', (event, payload) => {
  requireTrusted(event);
  if (!Notification.isSupported()) return false;
  new Notification({ title: cleanText(payload?.title || 'Dude Companion', 80), body: cleanText(payload?.body || '', 240), silent: Boolean(payload?.silent) }).show();
  return true;
});

ipcMain.handle('launch-at-login', (event, enabled) => {
  requireTrusted(event);
  app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true });
  const current = loadSettings();
  saveSettings({ ...current, launchAtLogin: enabled });
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.handle('action:run', async (event, action) => {
  requireTrusted(event);
  const kind = cleanText(action?.kind, 40);
  const value = cleanText(action?.value, 1000);
  if (kind === 'search') {
    await shell.openExternal(`https://www.google.com/search?q=${encodeURIComponent(value)}`);
    return { ok: true, message: `Searching for “${value}”.` };
  }
  if (kind === 'open-url') {
    let url;
    try { url = new URL(value); } catch { return { ok: false, error: 'That URL is not valid.' }; }
    if (!['https:', 'http:'].includes(url.protocol)) return { ok: false, error: 'Only web links are allowed.' };
    await shell.openExternal(url.toString());
    return { ok: true, message: 'Opened it in your browser.' };
  }
  if (kind === 'open-app') {
    if (!/^[a-zA-Z0-9 ._+-]{1,80}$/.test(value)) return { ok: false, error: 'That app name is not allowed.' };
    return runAppleScript([`tell application ${JSON.stringify(value)} to activate`]);
  }
  if (kind === 'close-app') {
    if (!/^[a-zA-Z0-9 ._+-]{1,80}$/.test(value)) return { ok: false, error: 'That app name is not allowed.' };
    if (value.toLowerCase() === 'dude companion') return { ok: false, error: 'Use the app menu to quit Dude Companion.' };
    return runAppleScript([`tell application ${JSON.stringify(value)} to quit`]);
  }
  if (kind === 'type') {
    if (!systemPreferences.isTrustedAccessibilityClient(true)) return { ok: false, error: 'Accessibility permission is required for typing.' };
    return runAppleScript(['tell application "System Events"', `keystroke ${JSON.stringify(value)}`, 'end tell']);
  }
  if (kind === 'click') {
    if (!systemPreferences.isTrustedAccessibilityClient(true)) return { ok: false, error: 'Accessibility permission is required for clicking.' };
    const [x, y] = value.split(',').map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, error: 'Use click x,y — for example click 400,300.' };
    const displays = screen.getAllDisplays();
    const onScreen = displays.some((display) => x >= display.bounds.x && x < display.bounds.x + display.bounds.width && y >= display.bounds.y && y < display.bounds.y + display.bounds.height);
    if (!onScreen) return { ok: false, error: 'Those coordinates are outside your displays.' };
    return runAppleScript(['tell application "System Events"', `click at {${Math.round(x)}, ${Math.round(y)}}`, 'end tell']);
  }
  if (kind === 'wallpaper') {
    const resolved = path.resolve(value);
    const extension = path.extname(resolved).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.heic', '.tiff', '.webp'].includes(extension)) return { ok: false, error: 'Choose a PNG, JPEG, HEIC, TIFF, or WebP image.' };
    try {
      if (!fs.statSync(resolved).isFile()) return { ok: false, error: 'That wallpaper path is not a file.' };
    } catch { return { ok: false, error: 'I cannot find that image file.' }; }
    return runAppleScript([`tell application "System Events" to tell every desktop to set picture to POSIX file ${JSON.stringify(resolved)}`]);
  }
  if (kind === 'download') {
    let url;
    try { url = new URL(value); } catch { return { ok: false, error: 'That download URL is not valid.' }; }
    if (url.protocol !== 'https:') return { ok: false, error: 'Downloads must use HTTPS.' };
    await shell.openExternal(url.toString());
    return { ok: true, message: 'Opened the verified download in your browser.' };
  }
  return { ok: false, error: 'That action is not supported yet.' };
});

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return;
  if (process.platform === 'darwin') app.dock.hide();
  createOverlay();
  app.on('activate', () => { if (!overlay) createOverlay(); });
});

app.on('second-instance', () => {
  if (overlay) overlay.showInactive();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => { if (overlay) overlay.destroy(); });
