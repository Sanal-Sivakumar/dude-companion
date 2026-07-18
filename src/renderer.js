const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const companion = $('#companion');
const rig = $('#rig');
const speech = $('#speech');
const speechText = $('#speechText');
const quickPanel = $('#quickPanel');
const settingsPanel = $('#settingsPanel');
const permissionsPanel = $('#permissionsPanel');
const permissionDialog = $('#permissionDialog');
const toast = $('#toast');

const SIZE = { width: 220, height: 330 };
const ACTIONS = {
  search: ['Search the web', 'Opens your default browser with this search.'],
  'open-url': ['Open a web link', 'Opens this HTTPS or HTTP address in your default browser.'],
  'open-app': ['Open an application', 'Activates the named macOS application.'],
  type: ['Type into another app', 'Uses macOS Accessibility to type this exact text into the focused app.'],
  click: ['Click the screen', 'Uses macOS Accessibility to click the requested screen coordinates.'],
  wallpaper: ['Change the wallpaper', 'Changes every desktop to use this local image.'],
  download: ['Open a download', 'Opens this verified HTTPS download in your browser.']
};

let settings = {
  character: 'male', outfit: 'night', quiet: false, motion: .85,
  speaking: 'rare', launchAtLogin: false, permissions: {}, reminders: [], position: null
};

const physics = {
  x: innerWidth - 280,
  y: innerHeight - 360,
  vx: 0,
  vy: 0,
  angle: 0,
  angularVelocity: 0,
  dragging: false,
  dragX: 0,
  dragY: 0,
  targetX: 0,
  targetY: 0,
  pointerX: 0,
  pointerY: 0,
  lastPointerX: 0,
  lastPointerY: 0,
  lastPointerTime: 0,
  state: 'idle',
  decisionPending: false,
  exitDirection: 0,
  walkDirection: -1,
  grounded: true,
  stateUntil: 0,
  lastFrame: performance.now()
};

let openPanel = null;
let speechTimer = null;
let toastTimer = null;
let systemTimer = null;
let reminderTimer = null;
let lastInteraction = Date.now();

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function setState(state, duration = 0) {
  physics.state = state;
  physics.stateUntil = duration ? performance.now() + duration : 0;
  companion.className = `companion state-${state}${physics.dragging ? ' is-dragging' : ''}`;
  $('#statusPill').textContent = ({ idle: 'just vibing', walk: 'on patrol', jump: 'physics!', land: 'nailed it', lie: 'recalculating dignity', getup: 'nothing happened', exit: 'going offscreen', sit: 'tiny break', hang: 'ceiling business', drag: 'wheee' })[state] || state;
}

function applyCharacter() {
  const image = `assets/${settings.character === 'both' ? 'male' : settings.character}.png`;
  const baseImage = `assets/${settings.character === 'both' ? 'male' : settings.character}-base.png`;
  $$('.skin').forEach((node) => { node.src = image; });
  $('.base-skin').src = baseImage;
  rig.classList.toggle('male', settings.character === 'male');
  rig.classList.toggle('female', settings.character === 'female');
  rig.classList.toggle('both', settings.character === 'both');
  $('#companionName').textContent = settings.character === 'female' ? 'Dudette' : settings.character === 'both' ? 'Dude + Dudette' : 'Dude';
  $$('[data-character]').forEach((button) => button.setAttribute('aria-checked', String(button.dataset.character === settings.character)));
}

function applyOutfit() {
  rig.classList.remove('outfit-night', 'outfit-ember', 'outfit-moon');
  rig.classList.add(`outfit-${settings.outfit}`);
  $$('[data-outfit]').forEach((button) => button.setAttribute('aria-checked', String(button.dataset.outfit === settings.outfit)));
}

function applySettings() {
  applyCharacter();
  applyOutfit();
  $('#motionRange').value = Math.round(settings.motion * 100);
  $('#motionOutput').value = `${Math.round(settings.motion * 100)}%`;
  $('#launchToggle').checked = settings.launchAtLogin;
  $('#quietToggle').setAttribute('aria-pressed', String(settings.quiet));
  $('#quietToggle span').textContent = settings.quiet ? 'On' : 'Off';
  if (settings.position && Number.isFinite(settings.position.x) && Number.isFinite(settings.position.y)) {
    physics.x = clamp(settings.position.x, -SIZE.width * .45, innerWidth - SIZE.width * .55);
    physics.y = clamp(settings.position.y, -80, innerHeight - SIZE.height - 8);
  }
}

async function persistSettings() {
  settings.position = { x: Math.round(physics.x), y: Math.round(physics.y) };
  settings = await window.dude.saveSettings(settings);
}

function movePanelsNearCompanion(panel) {
  const width = 348;
  const panelHeight = Math.min(panel.scrollHeight || 400, innerHeight - 24);
  const preferLeft = physics.x > innerWidth / 2;
  const x = preferLeft ? physics.x - width - 16 : physics.x + SIZE.width + 16;
  const y = clamp(physics.y + 18, 12, innerHeight - panelHeight - 12);
  panel.style.left = `${clamp(x, 12, innerWidth - width - 12)}px`;
  panel.style.top = `${y}px`;
}

function closePanels() {
  [quickPanel, settingsPanel, permissionsPanel].forEach((panel) => { panel.hidden = true; });
  openPanel = null;
  window.dude.setPanelOpen(false);
}

function showPanel(panel) {
  closePanels();
  panel.hidden = false;
  openPanel = panel;
  movePanelsNearCompanion(panel);
  window.dude.setPanelOpen(true);
  requestAnimationFrame(() => panel.querySelector('input, button')?.focus());
}

function say(message, duration = 5200) {
  if (!message || (settings.quiet && duration > 0)) return;
  clearTimeout(speechTimer);
  speechText.textContent = message;
  speech.hidden = false;
  const width = Math.min(270, speech.offsetWidth || 250);
  const left = clamp(physics.x + SIZE.width / 2 - width, 10, innerWidth - width - 10);
  const top = clamp(physics.y - 54, 10, innerHeight - 90);
  speech.style.left = `${left}px`;
  speech.style.top = `${top}px`;
  if (duration) speechTimer = setTimeout(() => { speech.hidden = true; }, duration);
}

function showToast(message, duration = 3400) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, duration);
}

function launchJump() {
  if (physics.state === 'hang') physics.y = 20;
  physics.vy = -14 - 4 * settings.motion;
  physics.vx += (Math.random() - .5) * 4;
  physics.grounded = false;
  setState('jump', 900);
}

function sit() {
  physics.vx = 0;
  physics.vy = 0;
  setState('sit', 10000);
}

function hang() {
  physics.vx = 0;
  physics.vy = 0;
  physics.y = -52;
  physics.x = clamp(physics.x, 30, innerWidth - SIZE.width - 30);
  setState('hang', 14000);
  say('I have reviewed gravity. Mixed notes.', 4200);
}

function startWalk() {
  if (physics.dragging || openPanel || settings.motion < .15) return;
  physics.walkDirection = physics.x > innerWidth * .55 ? -1 : 1;
  setState('walk', 4200 + Math.random() * 3000);
}

function showProp(name, duration = 7000) {
  const prop = $('#prop');
  prop.dataset.prop = name;
  setTimeout(() => {
    if (prop.dataset.prop === name) delete prop.dataset.prop;
  }, duration);
}

async function decideNext(context) {
  if (physics.decisionPending || physics.dragging) return;
  physics.decisionPending = true;
  const result = await window.dude.decide({ ...context, current: physics.state });
  physics.decisionPending = false;
  applyDecision(result.decision);
}

function applyDecision(decision) {
  if (physics.dragging) return;
  if (decision === 'lie') {
    physics.vx = 0; physics.vy = 0;
    setState('lie', 6500 + Math.random() * 5000);
    return;
  }
  if (decision === 'getup') {
    setState('getup', 850);
    setTimeout(() => setState('idle'), 860);
    return;
  }
  if (decision === 'sit') return sit();
  if (decision === 'hang') return hang();
  if (decision === 'walk-left' || decision === 'walk-right') {
    physics.walkDirection = decision === 'walk-left' ? -1 : 1;
    return setState('walk', 5200);
  }
  if (decision === 'exit-left' || decision === 'exit-right') {
    physics.exitDirection = decision === 'exit-left' ? -1 : 1;
    physics.walkDirection = physics.exitDirection;
    rig.style.setProperty('--exit-lean', physics.exitDirection);
    physics.vx = physics.exitDirection * (3.4 + settings.motion * 2.2);
    return setState('exit', 9000);
  }
  if (['laptop', 'chair', 'coffee', 'sword', 'foam-blaster'].includes(decision)) {
    showProp(decision);
    sit();
    if (!settings.quiet) {
      const lines = { laptop: 'Very important tiny business.', chair: 'Ergonomics, but make it portable.', coffee: 'This cup is 40% of my body mass.', sword: 'Cardboard-grade conflict resolution.', 'foam-blaster': 'Non-lethal. Mildly inconvenient.' };
      say(lines[decision], 3800);
    }
  }
}

function changeOutfit(outfit) {
  if (rig.classList.contains('changing')) return;
  closePanels();
  rig.classList.add('changing');
  say(settings.character === 'female' ? 'Turn around. Couture has protocols.' : settings.character === 'both' ? 'Coordinated wardrobe protocol. Two patches, zero incidents.' : 'Deploying the legally required modesty rectangle.', 2800);
  setTimeout(() => {
    settings.outfit = outfit || ({ night: 'ember', ember: 'moon', moon: 'night' })[settings.outfit];
    applyOutfit();
  }, 540);
  setTimeout(() => {
    rig.classList.remove('changing');
    persistSettings();
  }, 1300);
}

function renderPermissionList() {
  const list = $('#permissionList');
  list.replaceChildren();
  const allowed = Object.entries(settings.permissions).filter(([, value]) => value === 'always');
  if (!allowed.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'No actions are permanently allowed. That is a perfectly sensible amount of trust.';
    list.append(empty);
    return;
  }
  for (const [kind] of allowed) {
    const row = document.createElement('div');
    row.className = 'permission-item';
    const label = document.createElement('span');
    label.textContent = ACTIONS[kind]?.[0] || kind;
    const revoke = document.createElement('button');
    revoke.textContent = 'Revoke';
    revoke.addEventListener('click', async () => {
      delete settings.permissions[kind];
      await persistSettings();
      renderPermissionList();
    });
    row.append(label, revoke);
    list.append(row);
  }
}

function askPermission(action) {
  if (settings.permissions[action.kind] === 'always') return Promise.resolve('once');
  const [title, description] = ACTIONS[action.kind] || ['Allow this action?', 'Dude will perform the action you requested.'];
  $('#permissionTitle').textContent = title;
  $('#permissionDescription').textContent = description;
  $('#permissionValue').textContent = action.value;
  permissionDialog.returnValue = '';
  permissionDialog.showModal();
  window.dude.setPanelOpen(true);
  return new Promise((resolve) => {
    permissionDialog.addEventListener('close', () => {
      window.dude.setPanelOpen(Boolean(openPanel));
      resolve(permissionDialog.returnValue || 'cancel');
    }, { once: true });
  });
}

async function runApprovedAction(action) {
  const choice = await askPermission(action);
  if (choice === 'cancel') {
    say('Cancelled. Your computer, your call.', 3000);
    return;
  }
  if (choice === 'always') {
    settings.permissions[action.kind] = 'always';
    await persistSettings();
  }
  const result = await window.dude.runAction(action);
  if (result.ok) say(result.message || 'Done. Tiny hands, serious follow-through.', 3800);
  else say(result.error || 'That did not work.', 5200);
}

function parseReminder(input) {
  const match = input.match(/^remind me in\s+(\d+)\s*(m|min|minutes?|h|hours?)\s+(?:to\s+)?(.+)$/i);
  if (!match) return null;
  const count = Number(match[1]);
  const multiplier = /^h/i.test(match[2]) ? 60 : 1;
  return { text: match[3].trim(), dueAt: Date.now() + count * multiplier * 60000 };
}

async function handleChat(raw) {
  const input = raw.trim();
  if (!input) return;
  lastInteraction = Date.now();
  const reminder = parseReminder(input);
  if (reminder) {
    settings.reminders.push(reminder);
    await persistSettings();
    say(`Reminder armed. I will remember “${reminder.text}” so you do not have to.`, 4800);
    return;
  }
  let match;
  if ((match = input.match(/^search(?: for)?\s+(.+)/i))) return runApprovedAction({ kind: 'search', value: match[1] });
  if ((match = input.match(/^open\s+(https?:\/\/\S+)/i))) return runApprovedAction({ kind: 'open-url', value: match[1] });
  if ((match = input.match(/^open\s+(.+)/i))) return runApprovedAction({ kind: 'open-app', value: match[1] });
  if ((match = input.match(/^type\s+(.+)/i))) return runApprovedAction({ kind: 'type', value: match[1] });
  if ((match = input.match(/^click\s+(\d+\s*,\s*\d+)/i))) return runApprovedAction({ kind: 'click', value: match[1] });
  if ((match = input.match(/^(?:set\s+)?wallpaper\s+(.+)/i))) return runApprovedAction({ kind: 'wallpaper', value: match[1] });
  if ((match = input.match(/^download\s+(https:\/\/\S+)/i))) return runApprovedAction({ kind: 'download', value: match[1] });
  if (/\bjump\b/i.test(input)) { launchJump(); return say('Up is a temporary lifestyle.', 2800); }
  if (/\bsit\b/i.test(input)) { sit(); return say('Productivity posture: compact.', 2800); }
  if (/\bhang\b/i.test(input)) return hang();
  if (/outfit|clothes|wardrobe/i.test(input)) return changeOutfit();
  if (/laptop/i.test(input)) return applyDecision('laptop');
  if (/chair/i.test(input)) return applyDecision('chair');
  if (/coffee/i.test(input)) return applyDecision('coffee');
  if (/sword|weapon/i.test(input)) return applyDecision('sword');
  if (/blaster/i.test(input)) return applyDecision('foam-blaster');
  if (/cpu|memory|system|screen time/i.test(input)) {
    const stats = await window.dude.systemSnapshot();
    return say(`CPU ${stats.cpu}%, memory ${stats.memory}%, active with me for ${stats.activeMinutes}m. Nothing is on fire.`, 5600);
  }
  const replies = [
    'I heard you. I am small, not inattentive.',
    'A bold proposal. My hooded advisory board is considering it.',
    'I can search, open apps, type, click, change wallpaper, set reminders, or simply provide moral support.',
    'Noted. I have placed it in the important-looking part of my tiny coat.'
  ];
  say(replies[Math.floor(Math.random() * replies.length)], 5000);
}

function checkReminders() {
  const now = Date.now();
  const due = settings.reminders.filter((item) => item.dueAt <= now);
  if (!due.length) return;
  settings.reminders = settings.reminders.filter((item) => item.dueAt > now);
  persistSettings();
  for (const item of due) {
    window.dude.notify({ title: settings.character === 'female' ? 'Dudette reminder' : 'Dude reminder', body: item.text });
    say(`Heads up: ${item.text}`, 9000);
  }
}

async function updateSystem() {
  const stats = await window.dude.systemSnapshot();
  $('#cpuValue').textContent = `${stats.cpu}%`;
  $('#memoryValue').textContent = `${stats.memory}%`;
  $('#screenValue').textContent = `${stats.activeMinutes}m`;
  if (!settings.quiet && !openPanel && stats.activeMinutes > 0 && stats.activeMinutes % 90 === 0) {
    say('Ninety active minutes. Your eyes have filed a polite request for distance.', 7000);
  }
}

function physicsFrame(now) {
  const dt = Math.min(2, (now - physics.lastFrame) / 16.667);
  physics.lastFrame = now;
  const ground = innerHeight - SIZE.height - 8;
  const motion = settings.motion;

  if (physics.dragging) {
    const spring = .16 + .12 * motion;
    const dx = physics.targetX - physics.x;
    const dy = physics.targetY - physics.y;
    physics.vx += dx * spring * dt;
    physics.vy += dy * spring * dt;
    physics.vx *= Math.pow(.72, dt);
    physics.vy *= Math.pow(.72, dt);
    physics.x += physics.vx * dt;
    physics.y += physics.vy * dt;
    const desiredAngle = clamp(physics.vx * 1.7, -28, 28);
    physics.angle += (desiredAngle - physics.angle) * .18 * dt;
    rig.style.setProperty('--head-lag', `${clamp(-physics.vx * .9, -12, 12)}deg`);
  } else if (physics.state === 'hang') {
    physics.angle += (0 - physics.angle) * .12 * dt;
  } else {
    if (physics.state === 'walk' || physics.state === 'exit') {
      physics.vx += physics.walkDirection * (.18 + .22 * motion) * dt;
      if (physics.state !== 'exit') physics.vx = clamp(physics.vx, -2.3 - motion, 2.3 + motion);
    }
    if (physics.y < ground || physics.vy < 0) physics.vy += (.58 + .2 * motion) * dt;
    physics.x += physics.vx * dt;
    physics.y += physics.vy * dt;
    physics.vx *= Math.pow(physics.grounded ? .91 : .994, dt);
    physics.angularVelocity += (-physics.angle * .012 - physics.angularVelocity * .11) * dt;
    physics.angle += physics.angularVelocity * dt;

    if (physics.y >= ground) {
      const impact = physics.vy;
      physics.y = ground;
      if (impact > 4) {
        physics.vy = -impact * .28 * motion;
        physics.angularVelocity += clamp(physics.vx * .04, -1.2, 1.2);
        setState('land', 180);
        if (impact > 8) setTimeout(() => decideNext({ speed: Math.hypot(physics.vx, impact), impact, edge: 'ground' }), 220);
      } else {
        physics.vy = 0;
        physics.grounded = true;
      }
    } else physics.grounded = false;

    if (physics.state === 'exit' && (physics.x < -SIZE.width - 40 || physics.x > innerWidth + 40)) {
      const fromLeft = physics.exitDirection > 0;
      physics.x = fromLeft ? -SIZE.width * .8 : innerWidth - SIZE.width * .2;
      physics.y = ground;
      physics.vx = physics.exitDirection * 1.8;
      setTimeout(() => { setState('walk', 5200); }, 1800 + Math.random() * 2600);
    } else if (physics.state !== 'exit' && physics.x < -SIZE.width * .42) {
      const impact = Math.abs(physics.vx);
      physics.x = -SIZE.width * .42;
      physics.vx = Math.abs(physics.vx) * .62;
      physics.walkDirection = 1;
      if (impact > 5) decideNext({ speed: impact, impact, edge: 'left' });
    }
    if (physics.state !== 'exit' && physics.x > innerWidth - SIZE.width * .58) {
      const impact = Math.abs(physics.vx);
      physics.x = innerWidth - SIZE.width * .58;
      physics.vx = -Math.abs(physics.vx) * .62;
      physics.walkDirection = -1;
      if (impact > 5) decideNext({ speed: impact, impact, edge: 'right' });
    }
  }

  if (physics.stateUntil && now > physics.stateUntil && !physics.dragging) {
    if (physics.state === 'lie') decideNext({ speed: 0, impact: 0, edge: 'ground' });
    else setState('idle');
  }
  companion.style.transform = `translate3d(${physics.x}px, ${physics.y}px, 0) rotate(${physics.angle}deg)`;
  const altitude = clamp((ground - physics.y) / 190, 0, 1);
  $('.shadow').style.transform = `scale(${1 - altitude * .42})`;
  $('.shadow').style.opacity = `${.74 - altitude * .48}`;
  requestAnimationFrame(physicsFrame);
}

companion.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  lastInteraction = Date.now();
  physics.dragging = true;
  physics.dragX = event.clientX - physics.x;
  physics.dragY = event.clientY - physics.y;
  physics.targetX = physics.x;
  physics.targetY = physics.y;
  physics.pointerX = event.clientX;
  physics.pointerY = event.clientY;
  physics.lastPointerX = event.clientX;
  physics.lastPointerY = event.clientY;
  physics.lastPointerTime = performance.now();
  companion.setPointerCapture(event.pointerId);
  setState('drag');
  closePanels();
});

companion.addEventListener('pointermove', (event) => {
  if (!physics.dragging) return;
  const now = performance.now();
  const dt = Math.max(8, now - physics.lastPointerTime);
  physics.pointerX = event.clientX;
  physics.pointerY = event.clientY;
  physics.targetX = event.clientX - physics.dragX;
  physics.targetY = event.clientY - physics.dragY;
  physics.vx += ((event.clientX - physics.lastPointerX) / dt) * 4.5;
  physics.vy += ((event.clientY - physics.lastPointerY) / dt) * 4.5;
  physics.lastPointerX = event.clientX;
  physics.lastPointerY = event.clientY;
  physics.lastPointerTime = now;
});

function releaseDrag() {
  if (!physics.dragging) return;
  physics.dragging = false;
  physics.vx = clamp(physics.vx * 1.45, -24, 24);
  physics.vy = clamp(physics.vy * 1.45, -24, 24);
  physics.angularVelocity = clamp(physics.vx * .08, -2.8, 2.8);
  setState('jump', 900);
  persistSettings();
}
companion.addEventListener('pointerup', releaseDrag);
companion.addEventListener('pointercancel', releaseDrag);

companion.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  showPanel(quickPanel);
});

companion.addEventListener('dblclick', (event) => {
  event.preventDefault();
  showPanel(settingsPanel);
});

companion.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') showPanel(quickPanel);
  if (event.key === ' ') { event.preventDefault(); launchJump(); }
});

document.addEventListener('mousemove', (event) => {
  const target = document.elementFromPoint(event.clientX, event.clientY);
  const interactive = Boolean(target?.closest('.companion, .panel, .speech, dialog, .toast'));
  window.dude.setInteractive(interactive);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closePanels();
});

$$('.panel-close').forEach((button) => button.addEventListener('click', closePanels));
$('#speechClose').addEventListener('click', () => { speech.hidden = true; });
$('#doneSettings').addEventListener('click', closePanels);

$$('[data-move]').forEach((button) => button.addEventListener('click', () => {
  closePanels();
  ({ jump: launchJump, sit, hang })[button.dataset.move]?.();
}));

$('#wardrobeQuick').addEventListener('click', () => changeOutfit());
$$('[data-outfit]').forEach((button) => button.addEventListener('click', () => changeOutfit(button.dataset.outfit)));

$$('[data-character]').forEach((button) => button.addEventListener('click', async () => {
  settings.character = button.dataset.character;
  applyCharacter();
  await persistSettings();
    say(settings.character === 'female' ? 'Dudette reporting. Same clearance. Better ponytail physics.' : settings.character === 'both' ? 'Package deal activated. We have formed a tiny committee.' : 'Dude reporting. Hood calibrated.', 4000);
}));

$('#motionRange').addEventListener('input', (event) => {
  settings.motion = Number(event.target.value) / 100;
  $('#motionOutput').value = `${event.target.value}%`;
});
$('#motionRange').addEventListener('change', persistSettings);

$('#launchToggle').addEventListener('change', async (event) => {
  settings.launchAtLogin = await window.dude.setLaunchAtLogin(event.target.checked);
  event.target.checked = settings.launchAtLogin;
  await persistSettings();
});

$('#quietToggle').addEventListener('click', async () => {
  settings.quiet = !settings.quiet;
  applySettings();
  await persistSettings();
  if (!settings.quiet) say('Quiet mode off. I will remain tastefully infrequent.', 3500);
});

$('#permissionsButton').addEventListener('click', () => { renderPermissionList(); showPanel(permissionsPanel); });
$('#backSettings').addEventListener('click', () => showPanel(settingsPanel));
$('#accessibilityButton').addEventListener('click', async () => {
  const trusted = await window.dude.accessibility(true);
  showToast(trusted ? 'Accessibility is enabled.' : 'Approve Dude Companion in System Settings → Privacy & Security → Accessibility.');
});

function submitChat() {
  const input = $('#chatInput');
  const value = input.value;
  input.value = '';
  closePanels();
  handleChat(value);
}
$('#sendChat').addEventListener('click', submitChat);
$('#chatInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') submitChat(); });

window.addEventListener('resize', () => {
  physics.x = clamp(physics.x, -SIZE.width * .42, innerWidth - SIZE.width * .58);
  physics.y = clamp(physics.y, -70, innerHeight - SIZE.height - 8);
  if (openPanel) movePanelsNearCompanion(openPanel);
});

async function init() {
  settings = { ...settings, ...(await window.dude.loadSettings()) };
  applySettings();
  setState('idle');
  updateSystem();
  systemTimer = setInterval(updateSystem, 15000);
  reminderTimer = setInterval(checkReminders, 15000);
  setInterval(() => {
    if (Date.now() - lastInteraction > 14000 && !settings.quiet && !openPanel && physics.state === 'idle') startWalk();
  }, 7000);
  requestAnimationFrame(physicsFrame);
  setTimeout(() => say('Right-click me to chat. Double-click to personalize. Swing responsibly.', 7000), 900);
}

window.addEventListener('beforeunload', () => {
  clearInterval(systemTimer);
  clearInterval(reminderTimer);
  persistSettings();
});

init();
