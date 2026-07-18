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

const defaults = {
  character: 'male',
  outfit: 'night',
  quiet: false,
  motion: 0.85,
  speaking: 'rare',
  launchAtLogin: false,
  permissions: {},
  reminders: [],
  position: null
};

const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) };
  } catch {
    return { ...defaults };
  }
}

function saveSettings(next) {
  const safe = {
    ...defaults,
    ...next,
    character: ['male', 'female', 'both'].includes(next.character) ? next.character : 'male',
    outfit: ['night', 'ember', 'moon'].includes(next.outfit) ? next.outfit : 'night',
    motion: Math.max(0, Math.min(1, Number(next.motion) || 0)),
    permissions: typeof next.permissions === 'object' && next.permissions ? next.permissions : {},
    reminders: Array.isArray(next.reminders) ? next.reminders.slice(0, 30) : []
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
  overlay.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  overlay.once('ready-to-show', () => overlay.showInactive());
  overlay.on('closed', () => { overlay = null; });
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

function cleanText(value, max = 500) {
  return String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').slice(0, max);
}

const SAFE_DECISIONS = new Set(['lie', 'getup', 'sit', 'walk-left', 'walk-right', 'exit-left', 'exit-right', 'hang', 'laptop', 'chair', 'coffee', 'sword', 'foam-blaster']);

function localDecision(context) {
  const speed = Number(context?.speed) || 0;
  const impact = Number(context?.impact) || 0;
  const edge = cleanText(context?.edge, 12);
  const choices = impact > 11 || speed > 16
    ? ['lie', 'lie', 'getup', edge === 'left' ? 'exit-left' : 'exit-right', 'chair']
    : ['getup', 'sit', 'walk-left', 'walk-right', 'laptop', 'coffee', 'sword'];
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
          { role: 'system', content: 'You control a witty tiny desktop mascot. Return exactly one allowed action and nothing else: lie, getup, sit, walk-left, walk-right, exit-left, exit-right, hang, laptop, chair, coffee, sword, foam-blaster. Choose from physical context, vary behavior, never perform computer actions.' },
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

ipcMain.on('overlay:set-interactive', (_event, interactive) => {
  if (!overlay || panelOpen) return;
  overlay.setIgnoreMouseEvents(!interactive, { forward: true });
});

ipcMain.on('overlay:set-panel-open', (_event, open) => {
  panelOpen = Boolean(open);
  if (overlay) overlay.setIgnoreMouseEvents(!panelOpen, { forward: true });
});

ipcMain.handle('settings:load', () => loadSettings());
ipcMain.handle('settings:save', (_event, next) => saveSettings(next || {}));
ipcMain.handle('permissions:accessibility', (_event, prompt) => process.platform === 'darwin' && systemPreferences.isTrustedAccessibilityClient(Boolean(prompt)));
ipcMain.handle('ai:decide', (_event, context) => aiDecision(context || {}));

ipcMain.handle('system:snapshot', () => {
  const now = Date.now();
  if (powerMonitor.getSystemIdleTime() < 60) activeSeconds += Math.max(0, Math.round((now - lastActiveTick) / 1000));
  lastActiveTick = now;
  const total = os.totalmem();
  const free = os.freemem();
  return {
    cpu: cpuSnapshot(),
    memory: Math.round(((total - free) / total) * 100),
    activeMinutes: Math.floor(activeSeconds / 60),
    uptimeMinutes: Math.floor(os.uptime() / 60),
    battery: null,
    platform: `${os.type()} ${os.release()}`,
    arch: os.arch()
  };
});

ipcMain.handle('notify', (_event, payload) => {
  if (!Notification.isSupported()) return false;
  new Notification({ title: cleanText(payload?.title || 'Dude Companion', 80), body: cleanText(payload?.body || '', 240), silent: Boolean(payload?.silent) }).show();
  return true;
});

ipcMain.handle('launch-at-login', (_event, enabled) => {
  app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true });
  const current = loadSettings();
  saveSettings({ ...current, launchAtLogin: enabled });
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.handle('action:run', async (_event, action) => {
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
  if (kind === 'type') {
    if (!systemPreferences.isTrustedAccessibilityClient(true)) return { ok: false, error: 'Accessibility permission is required for typing.' };
    return runAppleScript(['tell application "System Events"', `keystroke ${JSON.stringify(value)}`, 'end tell']);
  }
  if (kind === 'click') {
    if (!systemPreferences.isTrustedAccessibilityClient(true)) return { ok: false, error: 'Accessibility permission is required for clicking.' };
    const [x, y] = value.split(',').map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, error: 'Use click x,y — for example click 400,300.' };
    return runAppleScript(['tell application "System Events"', `click at {${Math.round(x)}, ${Math.round(y)}}`, 'end tell']);
  }
  if (kind === 'wallpaper') {
    const resolved = path.resolve(value);
    if (!fs.existsSync(resolved)) return { ok: false, error: 'I cannot find that image file.' };
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

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock.hide();
  createOverlay();
  app.on('activate', () => { if (!overlay) createOverlay(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => { if (overlay) overlay.destroy(); });
