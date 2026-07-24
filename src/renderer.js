'use strict';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const Physics = window.DudePhysics;
const Character3D = window.DudeCharacter3D;
const Autonomy = window.DudeAutonomy;

if (!Physics) throw new Error('Dude Physics failed to load.');
if (!Character3D) throw new Error('Dude 3D renderer failed to load.');
if (!Autonomy || Autonomy.BEHAVIORS.length !== 50) throw new Error('Dude autonomy catalog failed to load.');

const stage = $('#stage');
const actorTemplate = $('#actorTemplate');
const speech = $('#speech');
const speechText = $('#speechText');
const quickPanel = $('#quickPanel');
const settingsPanel = $('#settingsPanel');
const permissionsPanel = $('#permissionsPanel');
const permissionDialog = $('#permissionDialog');
const toast = $('#toast');

const SIZE = Object.freeze({ width: 180, height: 270 });
const OUTFITS = Object.freeze(['night', 'ember', 'moon', 'forest', 'frost', 'rose']);
const PROPS = Object.freeze(['laptop', 'chair', 'coffee', 'sword', 'foam-blaster', 'skateboard', 'umbrella', 'book', 'headphones']);
const STATUS = Object.freeze({
  idle: 'just vibing',
  walk: 'feet planted, mostly',
  jump: 'gravity appointment',
  land: 'absorbing impact',
  lie: 'recalculating dignity',
  tumble: 'limbs have opinions',
  getup: 'nothing happened',
  exit: 'going offscreen',
  sit: 'tiny break',
  hang: 'ceiling business',
  ledge: 'window-top stroll',
  climb: 'wall expedition',
  'ceiling-crawl': 'ceiling commute',
  drag: 'wheee',
  wardrobe: 'privacy protocol',
  wave: 'social protocol',
  stretch: 'joint maintenance',
  look: 'situational awareness',
  dance: 'tiny choreography',
  nap: 'power-saving dream',
  read: 'research department',
  work: 'tiny business',
  balance: 'insurance pending',
  ponder: 'thinking visibly',
  celebrate: 'micro victory',
  greet: 'companion diplomacy',
  sneak: 'stealth commute'
});
const ACTIONS = Object.freeze({
  search: ['Search the web', 'Opens your default browser with this search.'],
  'open-url': ['Open a web link', 'Opens this HTTPS or HTTP address in your default browser.'],
  'open-app': ['Open an application', 'Activates the named macOS application.'],
  'close-app': ['Close an application', 'Asks the named macOS application to quit. Unsaved work may require confirmation.'],
  type: ['Type into another app', 'Uses macOS Accessibility to type this exact text into the focused app.'],
  click: ['Click the screen', 'Uses macOS Accessibility to click the requested screen coordinates.'],
  wallpaper: ['Change the wallpaper', 'Changes every desktop to use this local image.'],
  download: ['Open a download', 'Opens this verified HTTPS download in your browser.']
});

let settings = {
  character: 'male',
  outfit: 'night',
  quiet: false,
  motion: 0.85,
  speaking: 'rare',
  launchAtLogin: false,
  permissions: {},
  reminders: [],
  positions: {},
  position: null
};

const actors = new Map();
let activeActorId = 'dude';
let openPanel = null;
let speechTimer = null;
let toastTimer = null;
let systemTimer = null;
let reminderTimer = null;
let autonomyTimer = null;
let lastInteraction = Date.now();
let lastFrame = performance.now();
let lastBreakBucket = -1;
let currentSystem = null;
let saveChain = Promise.resolve();
let destroyed = false;
let cursorPoint = { x: innerWidth / 2, y: innerHeight / 2 };

const reducedMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function activeController() {
  return actors.get(activeActorId) || actors.values().next().value || null;
}

function characterName(controller = activeController()) {
  return controller?.gender === 'female' ? 'Dudette' : 'Dude';
}

function defaultPosition(id, total = 1) {
  const ground = innerHeight - SIZE.height - 8;
  if (total === 2) return { x: id === 'dude' ? innerWidth - 520 : innerWidth - 280, y: ground };
  return { x: innerWidth - 280, y: ground };
}

function savedPosition(id, total) {
  const exact = settings.positions?.[id];
  if (exact && Number.isFinite(exact.x) && Number.isFinite(exact.y)) return exact;
  if (settings.position && Number.isFinite(settings.position.x) && Number.isFinite(settings.position.y)) return settings.position;
  return defaultPosition(id, total);
}

function setRigOutfit(rig) {
  for (const outfit of OUTFITS) rig.classList.remove(`outfit-${outfit}`);
  rig.classList.add(`outfit-${settings.outfit}`);
}

function setActorGender(controller, gender) {
  controller.gender = gender;
  controller.rig.classList.toggle('male', gender === 'male');
  controller.rig.classList.toggle('female', gender === 'female');
  controller.element.dataset.actor = controller.id;
  controller.element.setAttribute('aria-label', `${gender === 'female' ? 'Dudette' : 'Dude'} desktop companion. Right click to chat, double click to personalize, drag and release to throw.`);
  controller.character3d.setGender(gender);
}

function selectActor(controller) {
  if (!controller) return;
  activeActorId = controller.id;
  actors.forEach((item) => item.element.classList.toggle('is-selected', item.id === controller.id));
  $('#companionName').textContent = characterName(controller);
}

function updateStateClass(controller) {
  if (controller.renderedState !== controller.model.state) {
    if (controller.renderedState) controller.element.classList.remove(`state-${controller.renderedState}`);
    controller.renderedState = controller.model.state;
    controller.element.classList.add(`state-${controller.renderedState}`);
  }
  controller.element.classList.toggle('is-dragging', controller.model.dragging);
  controller.status.textContent = controller.behaviorLabel || STATUS[controller.model.state] || controller.model.state;
}

function createController(id, gender, position, index) {
  const element = actorTemplate.content.firstElementChild.cloneNode(true);
  stage.insertBefore(element, speech);
  const model = Physics.createActor({
    id,
    x: clamp(position.x, -SIZE.width * 0.42, innerWidth - SIZE.width * 0.58),
    y: clamp(position.y, -SIZE.height * 0.52, innerHeight - SIZE.height - 8),
    width: SIZE.width,
    height: SIZE.height,
    motion: settings.motion,
    reducedMotion: reducedMotionQuery.matches,
    seed: id === 'dude' ? 87211 : 41927,
    walkDirection: index === 0 ? -1 : 1
  });
  const controller = {
    id,
    gender,
    element,
    model,
    rig: element.querySelector('.rig'),
    canvas: element.querySelector('.character-canvas'),
    shadow: element.querySelector('.shadow'),
    status: element.querySelector('.status-pill'),
    character3d: null,
    activeProp: null,
    wardrobe: null,
    renderedState: null,
    decisionPending: false,
    propTimer: null,
    behaviorTimer: null,
    behaviorLabel: null
  };
  controller.character3d = new Character3D.CharacterRenderer(controller.canvas, { gender });
  setActorGender(controller, gender);
  setRigOutfit(controller.rig);
  bindActorInput(controller);
  updateStateClass(controller);
  actors.set(id, controller);
  return controller;
}

function removeController(id) {
  const controller = actors.get(id);
  if (!controller) return;
  clearTimeout(controller.propTimer);
  clearTimeout(controller.behaviorTimer);
  controller.character3d.destroy();
  controller.element.remove();
  actors.delete(id);
}

function syncActors() {
  const wanted = settings.character === 'both'
    ? [['dude', 'male'], ['dudette', 'female']]
    : settings.character === 'female'
      ? [['dudette', 'female']]
      : [['dude', 'male']];
  const wantedIds = new Set(wanted.map(([id]) => id));
  [...actors.keys()].forEach((id) => { if (!wantedIds.has(id)) removeController(id); });
  wanted.forEach(([id, gender], index) => {
    const existing = actors.get(id);
    if (existing) {
      setActorGender(existing, gender);
      existing.model.motion = settings.motion;
      existing.model.reducedMotion = reducedMotionQuery.matches;
      return;
    }
    createController(id, gender, savedPosition(id, wanted.length), index);
  });
  if (!actors.has(activeActorId)) activeActorId = wanted[0][0];
  selectActor(actors.get(activeActorId));
}

function applySettings() {
  settings.outfit = OUTFITS.includes(settings.outfit) ? settings.outfit : 'night';
  syncActors();
  actors.forEach((controller) => {
    controller.model.motion = settings.motion;
    controller.model.reducedMotion = reducedMotionQuery.matches;
    setRigOutfit(controller.rig);
  });
  $('#motionRange').value = Math.round(settings.motion * 100);
  $('#motionOutput').value = `${Math.round(settings.motion * 100)}%`;
  $('#launchToggle').checked = settings.launchAtLogin;
  $('#quietToggle').setAttribute('aria-pressed', String(settings.quiet));
  $('#quietToggle span').textContent = settings.quiet ? 'On' : 'Off';
  $$('[data-character]').forEach((button) => button.setAttribute('aria-checked', String(button.dataset.character === settings.character)));
  $$('[data-outfit]').forEach((button) => button.setAttribute('aria-checked', String(button.dataset.outfit === settings.outfit)));
}

function persistSettings() {
  settings.positions = Object.fromEntries([...actors].map(([id, controller]) => [id, {
    x: Math.round(controller.model.body.x),
    y: Math.round(controller.model.body.y)
  }]));
  const snapshot = JSON.parse(JSON.stringify(settings));
  saveChain = saveChain
    .catch(() => undefined)
    .then(() => window.dude.saveSettings(snapshot))
    .then((saved) => { settings = { ...settings, ...saved }; return settings; });
  return saveChain;
}

function movePanelsNearActor(panel) {
  const controller = activeController();
  if (!controller) return;
  const width = 348;
  const panelHeight = Math.min(panel.scrollHeight || 400, innerHeight - 24);
  const preferLeft = controller.model.body.x > innerWidth / 2;
  const x = preferLeft ? controller.model.body.x - width - 16 : controller.model.body.x + SIZE.width + 16;
  const y = clamp(controller.model.body.y + 18, 12, innerHeight - panelHeight - 12);
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
  movePanelsNearActor(panel);
  window.dude.setPanelOpen(true);
  requestAnimationFrame(() => panel.querySelector('input, button')?.focus());
}

function say(message, duration = 5200, controller = activeController()) {
  if (!message || (settings.quiet && duration > 0)) return;
  clearTimeout(speechTimer);
  speechText.textContent = message;
  speech.hidden = false;
  const width = Math.min(270, speech.offsetWidth || 250);
  const x = controller?.model.body.x ?? innerWidth / 2;
  const y = controller?.model.body.y ?? innerHeight / 2;
  speech.style.left = `${clamp(x + SIZE.width / 2 - width, 10, innerWidth - width - 10)}px`;
  speech.style.top = `${clamp(y - 54, 10, innerHeight - 90)}px`;
  if (duration) speechTimer = setTimeout(() => { speech.hidden = true; }, duration);
}

function showToast(message, duration = 3400) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, duration);
}

function setControllerState(controller, state, duration = 0, label = null) {
  if (!controller) return;
  clearTimeout(controller.behaviorTimer);
  controller.behaviorLabel = label;
  if (label && duration > 0) {
    controller.behaviorTimer = setTimeout(() => {
      controller.behaviorLabel = null;
      updateStateClass(controller);
    }, duration * 1000);
  }
  Physics.setState(controller.model, state, duration);
  updateStateClass(controller);
}

function launchJump(controller = activeController()) {
  if (!controller) return;
  Physics.launch(controller.model, (Math.random() - 0.5) * 0.6);
  updateStateClass(controller);
}

function sit(controller = activeController(), duration = 10) {
  if (!controller) return;
  controller.model.body.vx = 0;
  controller.model.body.vy = 0;
  setControllerState(controller, 'sit', duration);
}

function localRect(rect) {
  if (!rect) return null;
  const originX = Number(currentSystem?.bounds?.x) || 0;
  const originY = Number(currentSystem?.bounds?.y) || 0;
  const left = Number(rect.x) - originX;
  const top = Number(rect.y) - originY;
  const width = Number(rect.width);
  const height = Number(rect.height);
  if (![left, top, width, height].every(Number.isFinite) || width < SIZE.width * 0.8 || height < 80) return null;
  return { left, right: left + width, y: top, kind: 'window', app: rect.app || 'active window' };
}

function activeWindowSurface() {
  const surface = localRect(currentSystem?.activeWindow);
  if (!surface || surface.y < 24 || surface.y > innerHeight - SIZE.height * 0.25) return null;
  return surface;
}

function dockSurface() {
  const bounds = currentSystem?.bounds || { x: 0, y: 0 };
  const area = currentSystem?.workArea;
  const y = area ? area.y - bounds.y + area.height : innerHeight - 8;
  return { left: 0, right: innerWidth, y: clamp(y, 80, innerHeight - 8), kind: 'dock' };
}

function standOnSurface(controller, surface, state = 'sit', duration = 12, label = null) {
  if (!controller || !surface) return false;
  const minX = surface.left - SIZE.width * 0.2;
  const maxX = surface.right - SIZE.width * 0.8;
  controller.model.body.x = clamp(controller.model.body.x, minX, Math.max(minX, maxX));
  Physics.setSupport(controller.model, surface);
  controller.model.body.vx = 0;
  controller.model.body.vy = 0;
  controller.model.body.angle = 0;
  controller.model.body.angularVelocity = 0;
  setControllerState(controller, state, duration, label);
  return true;
}

function hang(controller = activeController()) {
  if (!controller) return;
  Physics.clearSupport(controller.model);
  controller.model.body.vx = 0;
  controller.model.body.vy = 0;
  controller.model.body.angle = 0;
  controller.model.body.angularVelocity = 0;
  controller.model.body.y = -SIZE.height * 0.55;
  controller.model.body.x = clamp(controller.model.body.x, 30, innerWidth - SIZE.width - 30);
  setControllerState(controller, 'hang', 14);
  say('I have reviewed gravity. Mixed notes.', 4200, controller);
}

function perch(controller = activeController(), speak = true) {
  if (!controller) return;
  const windowTop = activeWindowSurface();
  const surface = windowTop || dockSurface();
  standOnSurface(controller, surface, 'sit', 12, windowTop ? 'window-edge perch' : 'dock-edge perch');
  if (speak) say(windowTop
    ? `Top edge of ${windowTop.app} acquired. Please respect my highly technical perch.`
    : 'Dock edge acquired. Please respect my highly technical perch.', 4200, controller);
}

function ledgeWalk(controller = activeController(), speak = false) {
  if (!controller) return;
  const surface = activeWindowSurface() || dockSurface();
  controller.model.walkDirection = controller.model.body.x > (surface.left + surface.right) / 2 ? -1 : 1;
  standOnSurface(controller, surface, 'ledge', 7.5, surface.kind === 'window' ? 'window-top stroll' : 'dock-edge stroll');
  if (speak) say(surface.kind === 'window' ? 'This window has excellent walkability.' : 'No window access yet. Auditing the dock instead.', 3600, controller);
}

function climbWall(controller = activeController(), edge = null) {
  if (!controller) return;
  Physics.clearSupport(controller.model);
  controller.model.climbEdge = edge || (controller.model.body.x < innerWidth / 2 ? 'left' : 'right');
  controller.model.climbDirection = controller.model.body.y < innerHeight * 0.42 ? 1 : -1;
  controller.model.body.x = controller.model.climbEdge === 'left' ? -SIZE.width * 0.28 : innerWidth - SIZE.width * 0.72;
  controller.model.body.y = clamp(controller.model.body.y, -SIZE.height * 0.28, innerHeight - SIZE.height - 26);
  controller.model.body.vx = 0;
  controller.model.body.vy = 0;
  setControllerState(controller, 'climb', 9, `${controller.model.climbEdge}-wall climb`);
}

function ceilingCrawl(controller = activeController()) {
  if (!controller) return;
  Physics.clearSupport(controller.model);
  controller.model.body.x = clamp(controller.model.body.x, 20, innerWidth - SIZE.width - 20);
  controller.model.body.y = -SIZE.height * 0.48;
  controller.model.body.vx = 0;
  controller.model.body.vy = 0;
  controller.model.walkDirection = controller.model.body.x > innerWidth / 2 ? -1 : 1;
  setControllerState(controller, 'ceiling-crawl', 9, 'ceiling commute');
}

function snapToNearbySurface(controller, desired, pointerSpeed) {
  if (!controller || pointerSpeed > 260) return false;
  controller.model.body.x = desired.x;
  controller.model.body.y = desired.y;
  if (desired.y < -SIZE.height * 0.30) {
    if (Math.abs(desired.x - innerWidth / 2) < innerWidth * 0.34) ceilingCrawl(controller);
    else hang(controller);
    return true;
  }
  if (desired.x < -SIZE.width * 0.12) { climbWall(controller, 'left'); return true; }
  if (desired.x > innerWidth - SIZE.width * 0.88) { climbWall(controller, 'right'); return true; }
  const bottom = desired.y + SIZE.height;
  const surfaces = [activeWindowSurface(), dockSurface()].filter(Boolean);
  const surface = surfaces.find((candidate) => bottom >= candidate.y - 82
    && bottom <= candidate.y + 58
    && desired.x + SIZE.width * 0.74 >= candidate.left
    && desired.x + SIZE.width * 0.26 <= candidate.right);
  if (!surface) return false;
  return standOnSurface(controller, surface, 'sit', 12, surface.kind === 'window' ? 'placed on window edge' : 'placed on dock edge');
}

function startWalk(controller = activeController(), direction = null, label = null) {
  if (!controller || controller.model.dragging || openPanel || settings.motion < 0.15) return;
  controller.model.walkDirection = direction || (controller.model.body.x > innerWidth * 0.55 ? -1 : 1);
  const onRaisedSurface = controller.model.support.active && controller.model.support.kind !== 'ground';
  setControllerState(controller, onRaisedSurface ? 'ledge' : 'walk', 4.2 + Math.random() * 3, label);
}

function startActivity(controller, state, duration, prop = null, label = null) {
  if (!controller || controller.model.dragging || openPanel) return;
  controller.model.body.vx = state === 'sneak' ? controller.model.body.vx : 0;
  controller.model.body.vy = 0;
  if (prop) showProp(controller, prop, duration * 1000);
  setControllerState(controller, state, duration, label);
}

function showProp(controller, name, duration = 7000) {
  if (!controller || !PROPS.includes(name)) return;
  clearTimeout(controller.propTimer);
  controller.activeProp = name;
  controller.propTimer = setTimeout(() => {
    if (controller.activeProp === name) controller.activeProp = null;
  }, duration);
}

async function decideNext(controller, context) {
  if (!controller || controller.decisionPending || controller.model.dragging) return;
  controller.decisionPending = true;
  try {
    const result = await window.dude.decide({ ...context, current: controller.model.state, actor: controller.gender });
    applyDecision(controller, result.decision);
  } finally {
    controller.decisionPending = false;
  }
}

function applyDecision(controller, decision) {
  if (!controller || controller.model.dragging) return;
  if (decision === 'lie') {
    controller.model.body.vx = 0;
    controller.model.body.vy = 0;
    setControllerState(controller, 'lie', 6.5 + Math.random() * 5);
    return;
  }
  if (decision === 'getup') return setControllerState(controller, 'getup', 1.55);
  if (decision === 'sit') return sit(controller);
  if (decision === 'wave') return setControllerState(controller, 'wave', 2.6);
  if (decision === 'stretch') return setControllerState(controller, 'stretch', 3.2);
  if (decision === 'look') return setControllerState(controller, 'look', 4.4);
  if (decision === 'dance') return startActivity(controller, 'dance', 5.2);
  if (decision === 'nap') return startActivity(controller, 'nap', 10.5);
  if (decision === 'read') return startActivity(controller, 'read', 9, 'book');
  if (decision === 'work') return startActivity(controller, 'work', 9, 'laptop');
  if (decision === 'balance') return startActivity(controller, 'balance', 6, 'skateboard');
  if (decision === 'ponder') return startActivity(controller, 'ponder', 5.4);
  if (decision === 'celebrate') return startActivity(controller, 'celebrate', 4.2);
  if (decision === 'sneak') {
    controller.model.walkDirection = controller.model.body.x > innerWidth * 0.55 ? -1 : 1;
    return startActivity(controller, 'sneak', 6.5);
  }
  if (decision === 'greet') {
    const partner = [...actors.values()].find((actor) => actor !== controller && !actor.model.dragging);
    startActivity(controller, 'greet', 3.8);
    if (partner) {
      controller.model.walkDirection = partner.model.body.x > controller.model.body.x ? 1 : -1;
      partner.model.walkDirection = -controller.model.walkDirection;
      startActivity(partner, 'greet', 3.8);
    }
    return;
  }
  if (decision === 'perch') return perch(controller);
  if (decision === 'hang') return hang(controller);
  if (decision === 'ledge') return ledgeWalk(controller, true);
  if (decision === 'climb-left') return climbWall(controller, 'left');
  if (decision === 'climb-right') return climbWall(controller, 'right');
  if (decision === 'ceiling-crawl') return ceilingCrawl(controller);
  if (decision === 'walk-left' || decision === 'walk-right') return startWalk(controller, decision === 'walk-left' ? -1 : 1);
  if (decision === 'exit-left' || decision === 'exit-right') {
    controller.model.exitDirection = decision === 'exit-left' ? -1 : 1;
    controller.model.walkDirection = controller.model.exitDirection;
    controller.model.body.vx = controller.model.exitDirection * (170 + settings.motion * 80);
    return setControllerState(controller, 'exit', 0);
  }
  if (PROPS.includes(decision)) {
    if (decision === 'book') startActivity(controller, 'read', 9, decision);
    else if (decision === 'laptop') startActivity(controller, 'work', 9, decision);
    else if (decision === 'skateboard') startActivity(controller, 'balance', 6, decision);
    else {
      showProp(controller, decision);
      sit(controller);
    }
    if (!settings.quiet) {
      const lines = {
        laptop: 'Very important tiny business.',
        chair: 'Ergonomics, but make it portable.',
        coffee: 'This cup is 40% of my body mass.',
        sword: 'Cardboard-grade conflict resolution.',
        'foam-blaster': 'Non-lethal. Mildly inconvenient.',
        skateboard: 'Four wheels. Questionable insurance.',
        umbrella: 'Weather defense, dramatic edition.',
        book: 'I am reading the terms and conditions for once.',
        headphones: 'Tiny head. Stadium sound.'
      };
      say(lines[decision], 3800, controller);
    }
  }
}

function runAutonomousBehavior(controller, behavior) {
  if (!controller || !behavior) return;
  const { action, label, prop } = behavior;
  if (prop) showProp(controller, prop, 7200);
  if (action === 'walk') return startWalk(controller, null, label);
  if (action === 'sneak') {
    controller.model.walkDirection = controller.model.body.x > innerWidth / 2 ? -1 : 1;
    return startActivity(controller, 'sneak', 6.5, prop, label);
  }
  if (action === 'ledge') return ledgeWalk(controller);
  if (action === 'climb-left') return climbWall(controller, 'left');
  if (action === 'climb-right') return climbWall(controller, 'right');
  if (action === 'ceiling-crawl') return ceilingCrawl(controller);
  if (action === 'hang') return hang(controller);
  if (action === 'perch-window') return perch(controller, false);
  if (action === 'perch-dock') return standOnSurface(controller, dockSurface(), 'sit', 10, label);
  if (action === 'edge-peek') {
    const surface = activeWindowSurface() || dockSurface();
    controller.model.body.x = surface.right - SIZE.width * 0.82;
    standOnSurface(controller, surface, 'look', 5, label);
    return;
  }
  if (action === 'jump' || action === 'landing-drill') {
    Physics.launch(controller.model, action === 'landing-drill' ? 0.28 : (Math.random() - 0.5) * 0.5);
    return setControllerState(controller, 'jump', 1.1, label);
  }
  if (action === 'exit-left' || action === 'exit-right') {
    applyDecision(controller, action);
    return setControllerState(controller, 'exit', 0, label);
  }
  if (action === 'mirror' || action === 'high-five') {
    const partner = [...actors.values()].find((actor) => actor !== controller && !actor.model.dragging);
    startActivity(controller, 'greet', 3.8, null, label);
    if (partner) {
      controller.model.walkDirection = partner.model.body.x > controller.model.body.x ? 1 : -1;
      partner.model.walkDirection = -controller.model.walkDirection;
      startActivity(partner, action === 'mirror' ? 'dance' : 'greet', 3.8, null, label);
    }
    return;
  }
  if (action === 'race') {
    const direction = controller.model.body.x > innerWidth / 2 ? -1 : 1;
    actors.forEach((actor, index) => startWalk(actor, direction, index === 0 ? label : 'friendly desktop race'));
    return;
  }
  if (action === 'cursor-follow' || action === 'cursor-dodge') {
    const toward = cursorPoint.x > controller.model.body.x + SIZE.width / 2 ? 1 : -1;
    return startWalk(controller, action === 'cursor-follow' ? toward : -toward, label);
  }
  if (action === 'getup-practice') {
    Physics.clearSupport(controller.model);
    controller.model.body.angle = controller.model.body.x > innerWidth / 2 ? -1.48 : 1.48;
    controller.model.recoverySide = controller.model.body.angle >= 0 ? 1 : -1;
    return setControllerState(controller, 'getup', 1.55, label);
  }
  if (action === 'lie') return setControllerState(controller, 'lie', 7, label);
  if (action === 'idle') return startActivity(controller, 'ponder', 4.5, null, label);
  const durations = { sit: 8, nap: 10.5, read: 9, work: 9, dance: 5.2, stretch: 3.2, wave: 2.6, ponder: 5.4, celebrate: 4.2, balance: 6, look: 4.4 };
  return startActivity(controller, action, durations[action] || 5, prop, label);
}

function changeOutfit(outfit) {
  if ([...actors.values()].some((controller) => controller.rig.classList.contains('changing'))) return;
  const next = outfit || OUTFITS[(OUTFITS.indexOf(settings.outfit) + 1) % OUTFITS.length];
  const target = OUTFITS.includes(next) ? next : 'night';
  if (target === settings.outfit) return;
  closePanels();
  const startedAt = performance.now();
  actors.forEach((controller) => {
    controller.rig.classList.add('changing');
    controller.wardrobe = { from: settings.outfit, to: target, startedAt, duration: 3600, phase: 0 };
    setControllerState(controller, 'wardrobe', 3.6);
  });
  const selected = activeController();
  const line = settings.character === 'both'
    ? 'Coordinated wardrobe protocol. Two privacy patches, zero incidents.'
    : selected?.gender === 'female'
      ? 'Turning around. Couture has protocols.'
      : 'Deploying the legally required modesty rectangle.';
  say(line, 2800, selected);
  setTimeout(() => {
    settings.outfit = target;
    actors.forEach((controller) => setRigOutfit(controller.rig));
    $$('[data-outfit]').forEach((button) => button.setAttribute('aria-checked', String(button.dataset.outfit === settings.outfit)));
  }, 2050);
  setTimeout(() => {
    actors.forEach((controller) => {
      controller.wardrobe = null;
      controller.rig.classList.remove('changing');
    });
    persistSettings();
  }, 3650);
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
  if (choice === 'cancel') return say('Cancelled. Your computer, your call.', 3000);
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
  if (!Number.isFinite(count) || count < 1 || count > 10080) return null;
  return { text: match[3].trim().slice(0, 240), dueAt: Date.now() + count * multiplier * 60000 };
}

async function handleChat(raw) {
  const input = raw.trim().slice(0, 1000);
  if (!input) return;
  lastInteraction = Date.now();
  const controller = activeController();
  const reminder = parseReminder(input);
  if (reminder) {
    settings.reminders.push(reminder);
    await persistSettings();
    return say(`Reminder armed. I will remember “${reminder.text}” so you do not have to.`, 4800, controller);
  }
  let match;
  if ((match = input.match(/^search(?: for)?\s+(.+)/i))) return runApprovedAction({ kind: 'search', value: match[1] });
  if ((match = input.match(/^open\s+(https?:\/\/\S+)/i))) return runApprovedAction({ kind: 'open-url', value: match[1] });
  if ((match = input.match(/^open\s+(.+)/i))) return runApprovedAction({ kind: 'open-app', value: match[1] });
  if ((match = input.match(/^(?:close|quit)\s+(.+)/i))) return runApprovedAction({ kind: 'close-app', value: match[1] });
  if ((match = input.match(/^type\s+(.+)/i))) return runApprovedAction({ kind: 'type', value: match[1] });
  if ((match = input.match(/^click\s+(-?\d+\s*,\s*-?\d+)/i))) return runApprovedAction({ kind: 'click', value: match[1] });
  if ((match = input.match(/^(?:set\s+)?wallpaper\s+(.+)/i))) return runApprovedAction({ kind: 'wallpaper', value: match[1] });
  if ((match = input.match(/^download\s+(https:\/\/\S+)/i))) return runApprovedAction({ kind: 'download', value: match[1] });
  if (/\bjump\b/i.test(input)) { launchJump(controller); return say('Up is a temporary lifestyle.', 2800, controller); }
  if (/\bsit\b/i.test(input)) { sit(controller); return say('Productivity posture: compact.', 2800, controller); }
  if (/\bwave\b/i.test(input)) return setControllerState(controller, 'wave', 2.6);
  if (/\bstretch\b/i.test(input)) return setControllerState(controller, 'stretch', 3.2);
  if (/look around|\blook\b/i.test(input)) return setControllerState(controller, 'look', 4.4);
  if (/\bdance\b/i.test(input)) return startActivity(controller, 'dance', 5.2);
  if (/\bnap\b|\bsleep\b/i.test(input)) return startActivity(controller, 'nap', 10.5);
  if (/\bread\b/i.test(input)) return startActivity(controller, 'read', 9, 'book');
  if (/\bwork\b|\blaptop\b/i.test(input)) return startActivity(controller, 'work', 9, 'laptop');
  if (/\bbalance\b|\bskate/i.test(input)) return startActivity(controller, 'balance', 6, 'skateboard');
  if (/\bthink\b|\bponder\b/i.test(input)) return startActivity(controller, 'ponder', 5.4);
  if (/\bcelebrate\b/i.test(input)) return startActivity(controller, 'celebrate', 4.2);
  if (/\bperch\b|\bdock\b/i.test(input)) return perch(controller);
  if (/\bledge\b|window top/i.test(input)) return ledgeWalk(controller, true);
  if (/\bclimb\b/i.test(input)) return climbWall(controller);
  if (/ceiling crawl/i.test(input)) return ceilingCrawl(controller);
  if (/\bhang\b/i.test(input)) return hang(controller);
  if (/outfit|clothes|wardrobe/i.test(input)) return changeOutfit();
  const prop = PROPS.find((name) => input.toLowerCase().includes(name.replace('-', ' '))) || (/weapon/i.test(input) ? 'sword' : null);
  if (prop) return applyDecision(controller, prop);
  if (/cpu|gpu|memory|system|screen time/i.test(input)) {
    const stats = await window.dude.systemSnapshot();
    const gpu = stats.gpu?.name ? `, GPU ${stats.gpu.name}` : '';
    return say(`CPU ${stats.cpu}%, memory ${stats.memory}%${gpu}, active for ${stats.activeMinutes}m. Nothing is on fire.`, 6200, controller);
  }
  const aiReply = await window.dude.chat({ message: input });
  if (aiReply?.reply) return say(aiReply.reply, 7200, controller);
  const replies = [
    'I heard you. I am small, not inattentive.',
    'A bold proposal. My hooded advisory board is considering it.',
    'I can search, open apps, type, click, change wallpaper, set reminders, or simply provide moral support.',
    'Noted. I have placed it in the important-looking part of my tiny coat.'
  ];
  say(replies[Math.floor(Math.random() * replies.length)], 5000, controller);
}

function checkReminders() {
  const now = Date.now();
  const due = settings.reminders.filter((item) => Number(item.dueAt) <= now);
  if (!due.length) return;
  settings.reminders = settings.reminders.filter((item) => Number(item.dueAt) > now);
  persistSettings();
  for (const item of due) {
    window.dude.notify({ title: `${characterName()} reminder`, body: item.text });
    say(`Heads up: ${item.text}`, 9000);
  }
}

async function updateSystem() {
  try {
    const stats = await window.dude.systemSnapshot();
    currentSystem = stats;
    $('#cpuValue').textContent = `${stats.cpu}%`;
    $('#memoryValue').textContent = `${stats.memory}%`;
    $('#gpuValue').textContent = stats.gpu?.shortName || 'aware';
    $('#gpuValue').title = stats.gpu?.name || 'GPU telemetry unavailable';
    $('#screenValue').textContent = `${stats.activeMinutes}m`;
    const bucket = Math.floor(stats.activeMinutes / 90);
    if (!settings.quiet && !openPanel && stats.activeMinutes >= 90 && bucket > lastBreakBucket) {
      lastBreakBucket = bucket;
      say('Ninety active minutes. Your eyes have filed a polite request for distance.', 7000);
    }
  } catch {
    $('#cpuValue').textContent = '—';
    $('#memoryValue').textContent = '—';
    $('#gpuValue').textContent = '—';
  }
}

function renderActor(controller) {
  const pose = Physics.pose(controller.model);
  if (controller.wardrobe) {
    controller.wardrobe.phase = clamp((performance.now() - controller.wardrobe.startedAt) / controller.wardrobe.duration, 0, 1);
  }
  controller.element.style.transform = `translate3d(${pose.x.toFixed(2)}px, ${pose.y.toFixed(2)}px, 0) rotate(${pose.angle.toFixed(2)}deg)`;
  controller.rig.style.transform = `translate3d(0, ${pose.visual.offsetY.toFixed(2)}px, 0)`;
  controller.character3d.render(pose, {
    outfit: settings.outfit,
    prop: controller.activeProp,
    wardrobe: controller.wardrobe,
    selected: controller.id === activeActorId
  });
  controller.element.dataset.renderMode = 'high-detail-360';
  controller.element.dataset.yaw = String(pose.visual.yaw);
  controller.element.dataset.jointCount = String(Object.keys(pose.joints).length);
  controller.element.dataset.movingJoints = String(Object.values(pose.joints).filter((degrees) => Math.abs(degrees) > 0.05).length);
  controller.element.dataset.wardrobeActive = String(Boolean(controller.wardrobe && controller.wardrobe.phase > 0.18 && controller.wardrobe.phase < 0.91));
  controller.element.dataset.wardrobeFrom = controller.wardrobe?.from || '';
  controller.element.dataset.wardrobeTo = controller.wardrobe?.to || '';
  const renderInspection = controller.character3d.inspect();
  controller.element.dataset.coatHemVisible = String(Boolean(renderInspection?.coatHemVisible));
  controller.element.dataset.hipPivotsVisible = String(Boolean(renderInspection?.hipPivotsVisible));
  controller.element.dataset.highDetail = String(Boolean(renderInspection?.highDetail));
  controller.element.dataset.viewFrom = renderInspection?.viewFrom || '';
  controller.element.dataset.viewTo = renderInspection?.viewTo || '';
  controller.element.dataset.viewMix = String(renderInspection?.viewMix ?? 0);
  controller.element.dataset.supportKind = controller.model.support.active ? controller.model.support.kind : '';
  controller.element.dataset.supportY = controller.model.support.active ? String(controller.model.support.y) : '';
  controller.element.dataset.bodyAngle = String(pose.angle);

  const ground = innerHeight - SIZE.height - 8;
  const altitude = clamp((ground - pose.y) / 220, 0, 1);
  controller.shadow.style.transform = `scale(${(1 - altitude * 0.45).toFixed(3)})`;
  controller.shadow.style.opacity = `${(0.74 - altitude * 0.52).toFixed(3)}`;
  updateStateClass(controller);
}

function processPhysicsEvents(controller) {
  for (const event of Physics.drainEvents(controller.model)) {
    if (event.type === 'impact') {
      if (event.impact > 900 && !settings.quiet) say('Excellent throw. My knees have submitted separate reports.', 4200, controller);
      if (event.edge !== 'ground' && event.impact > 720 && controller.model.state !== 'tumble') {
        setControllerState(controller, 'tumble', 0.82);
      }
    } else if (event.type === 'decision') {
      decideNext(controller, { speed: Math.hypot(controller.model.body.vx, controller.model.body.vy), impact: 0, edge: 'ground', reason: event.reason });
    }
  }
}

function physicsFrame(now) {
  if (destroyed) return;
  const elapsed = clamp((now - lastFrame) / 1000, 0, 1 / 15);
  lastFrame = now;
  const bounds = { width: innerWidth, height: innerHeight };
  actors.forEach((controller) => {
    controller.model.motion = settings.motion;
    Physics.step(controller.model, elapsed, bounds);
    processPhysicsEvents(controller);
    renderActor(controller);
  });
  requestAnimationFrame(physicsFrame);
}

function bindActorInput(controller) {
  controller.element.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    lastInteraction = Date.now();
    selectActor(controller);
    Physics.beginDrag(controller.model, event.clientX, event.clientY, performance.now() / 1000);
    controller.element.setPointerCapture(event.pointerId);
    updateStateClass(controller);
    closePanels();
  });

  controller.element.addEventListener('pointermove', (event) => {
    if (!controller.model.dragging) return;
    Physics.moveDrag(controller.model, event.clientX, event.clientY, performance.now() / 1000);
  });

  const release = () => {
    if (!controller.model.dragging) return;
    const desired = {
      x: controller.model.drag.targetX - controller.model.drag.offsetX,
      y: controller.model.drag.targetY - controller.model.drag.offsetY
    };
    const pointerVx = Physics.regressionVelocity(controller.model.drag.samples, 'x');
    const pointerVy = Physics.regressionVelocity(controller.model.drag.samples, 'y');
    Physics.releaseDrag(controller.model);
    snapToNearbySurface(controller, desired, Math.hypot(pointerVx, pointerVy));
    updateStateClass(controller);
    persistSettings();
  };
  controller.element.addEventListener('pointerup', release);
  controller.element.addEventListener('pointercancel', release);

  controller.element.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    selectActor(controller);
    showPanel(quickPanel);
  });

  controller.element.addEventListener('dblclick', (event) => {
    event.preventDefault();
    selectActor(controller);
    showPanel(settingsPanel);
  });

  controller.element.addEventListener('keydown', (event) => {
    selectActor(controller);
    if (event.key === 'Enter') showPanel(quickPanel);
    if (event.key === ' ') { event.preventDefault(); launchJump(controller); }
  });
}

document.addEventListener('mousemove', (event) => {
  cursorPoint = { x: event.clientX, y: event.clientY };
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
  ({
    jump: launchJump,
    sit,
    hang,
    perch,
    ledge: (controller) => ledgeWalk(controller, true),
    climb: (controller) => climbWall(controller),
    ceiling: (controller) => ceilingCrawl(controller),
    dance: (controller) => startActivity(controller, 'dance', 5.2),
    read: (controller) => startActivity(controller, 'read', 9, 'book'),
    work: (controller) => startActivity(controller, 'work', 9, 'laptop')
  })[button.dataset.move]?.(activeController());
}));

$('#wardrobeQuick').addEventListener('click', () => changeOutfit());
$$('[data-outfit]').forEach((button) => button.addEventListener('click', () => changeOutfit(button.dataset.outfit)));

$$('[data-character]').forEach((button) => button.addEventListener('click', async () => {
  settings.character = button.dataset.character;
  applySettings();
  await persistSettings();
  const line = settings.character === 'female'
    ? 'Dudette reporting. Same clearance. Better ponytail physics.'
    : settings.character === 'both'
      ? 'Package deal activated. Two independent skeletons, one tiny committee.'
      : 'Dude reporting. Hood and knees calibrated.';
  say(line, 4200);
}));

$('#motionRange').addEventListener('input', (event) => {
  settings.motion = Number(event.target.value) / 100;
  $('#motionOutput').value = `${event.target.value}%`;
  actors.forEach((controller) => { controller.model.motion = settings.motion; });
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
  actors.forEach((controller) => {
    controller.model.body.x = clamp(controller.model.body.x, -SIZE.width * 0.42, innerWidth - SIZE.width * 0.58);
    controller.model.body.y = clamp(controller.model.body.y, -SIZE.height * 0.52, innerHeight - SIZE.height - 8);
  });
  if (openPanel) movePanelsNearActor(openPanel);
});

reducedMotionQuery.addEventListener('change', (event) => {
  actors.forEach((controller) => { controller.model.reducedMotion = event.matches; });
});

async function init() {
  settings = { ...settings, ...(await window.dude.loadSettings()) };
  settings.positions = settings.positions && typeof settings.positions === 'object' ? settings.positions : {};
  settings.reminders = Array.isArray(settings.reminders) ? settings.reminders : [];
  settings.permissions = settings.permissions && typeof settings.permissions === 'object' ? settings.permissions : {};
  const smokeMode = new URLSearchParams(location.search).get('smoke');
  if (['articulation', 'wardrobe', 'surfaces'].includes(smokeMode)) {
    settings.character = 'both';
    settings.motion = 1;
    settings.positions = {
      dude: { x: innerWidth * 0.29, y: innerHeight - SIZE.height - 8 },
      dudette: { x: innerWidth * 0.61, y: innerHeight - SIZE.height - 8 }
    };
  } else if (['impact', 'sit', 'getup', 'turntable'].includes(smokeMode)) {
    settings.character = 'male';
    settings.motion = 1;
    settings.positions = { dude: { x: innerWidth * 0.45, y: smokeMode === 'impact' ? innerHeight - SIZE.height - 360 : innerHeight - SIZE.height - 8 } };
  }
  applySettings();
  await updateSystem();
  if (smokeMode === 'articulation') {
    startWalk(actors.get('dude'), 1);
    startWalk(actors.get('dudette'), -1);
  } else if (smokeMode === 'impact') {
    const actor = actors.get('dude');
    actor.model.body.vx = 1180;
    actor.model.body.vy = 520;
    Physics.setState(actor.model, 'jump', 2);
  } else if (smokeMode === 'wardrobe') {
    changeOutfit('rose');
  } else if (smokeMode === 'sit') {
    sit(actors.get('dude'), 8);
  } else if (smokeMode === 'getup') {
    const actor = actors.get('dude');
    actor.model.body.angle = 1.48;
    actor.model.recoverySide = 1;
    Physics.setState(actor.model, 'getup', 1.55);
  } else if (smokeMode === 'surfaces') {
    const dude = actors.get('dude');
    const dudette = actors.get('dudette');
    dude.model.body.x = innerWidth * 0.25;
    standOnSurface(dude, { left: innerWidth * 0.14, right: innerWidth * 0.58, y: innerHeight * 0.48, kind: 'window-smoke' }, 'ledge', 8, 'window-top stroll');
    dudette.model.body.x = innerWidth - SIZE.width * 0.72;
    dudette.model.body.y = innerHeight * 0.38;
    climbWall(dudette, 'right');
  } else if (smokeMode === 'turntable') {
    setControllerState(actors.get('dude'), 'look', 6, 'continuous turn');
  }
  systemTimer = setInterval(updateSystem, 15000);
  reminderTimer = setInterval(checkReminders, 15000);
  autonomyTimer = setInterval(() => {
    if (Date.now() - lastInteraction < 14000 || settings.quiet || openPanel) return;
    const idle = [...actors.values()].filter((controller) => controller.model.state === 'idle' && !controller.model.dragging);
    if (!idle.length) return;
    const controller = idle[Math.floor(Math.random() * idle.length)];
    if ((currentSystem?.cpu || 0) > 82) return startActivity(controller, 'nap', 8.5);
    let catalog = Autonomy.BEHAVIORS;
    if (settings.character !== 'both') catalog = catalog.filter((behavior) => !['greet-partner', 'mirror-partner', 'high-five', 'race'].includes(behavior.id));
    const behavior = catalog[Math.floor(Math.random() * catalog.length)];
    runAutonomousBehavior(controller, behavior);
  }, 7000);
  requestAnimationFrame(physicsFrame);
  if (!smokeMode) setTimeout(() => say('Right-click me to chat. Double-click to personalize. Swing responsibly—my elbows are real now.', 7600), 900);
}

window.addEventListener('beforeunload', () => {
  destroyed = true;
  clearInterval(systemTimer);
  clearInterval(reminderTimer);
  clearInterval(autonomyTimer);
  clearTimeout(speechTimer);
  clearTimeout(toastTimer);
  actors.forEach((controller) => {
    clearTimeout(controller.propTimer);
    clearTimeout(controller.behaviorTimer);
    controller.character3d.destroy();
  });
  persistSettings();
});

init().catch((error) => {
  showToast(`Dude could not start: ${error.message}`, 10000);
  console.error(error);
});
