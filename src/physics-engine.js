(function exposePhysics(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DudePhysics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildPhysics() {
  'use strict';

  const FIXED_STEP = 1 / 120;
  const MAX_FRAME = 1 / 15;
  const DEG = Math.PI / 180;
  const RAD = 180 / Math.PI;

  const JOINTS = Object.freeze({
    head:      { min: -24, max: 24, stiffness: 128, damping: 20, inertia: 0.80 },
    torso:     { min: -20, max: 20, stiffness: 142, damping: 22, inertia: 0.55 },
    shoulderL: { min: -82, max: 82, stiffness: 105, damping: 18, inertia: 1.00 },
    shoulderR: { min: -82, max: 82, stiffness: 105, damping: 18, inertia: 1.00 },
    elbowL:    { min: -34, max: 92, stiffness: 98, damping: 17, inertia: 0.80 },
    elbowR:    { min: -92, max: 34, stiffness: 98, damping: 17, inertia: 0.80 },
    wristL:    { min: -48, max: 48, stiffness: 112, damping: 19, inertia: 0.50 },
    wristR:    { min: -48, max: 48, stiffness: 112, damping: 19, inertia: 0.50 },
    hipL:      { min: -54, max: 50, stiffness: 150, damping: 22, inertia: 1.10 },
    hipR:      { min: -50, max: 54, stiffness: 150, damping: 22, inertia: 1.10 },
    kneeL:     { min: -16, max: 92, stiffness: 140, damping: 21, inertia: 0.90 },
    kneeR:     { min: -92, max: 16, stiffness: 140, damping: 21, inertia: 0.90 },
    ankleL:    { min: -38, max: 38, stiffness: 152, damping: 22, inertia: 0.62 },
    ankleR:    { min: -38, max: 38, stiffness: 152, damping: 22, inertia: 0.62 }
  });

  const STATE_DURATIONS = Object.freeze({
    land: 0.24,
    getup: 1.55,
    tumble: 0.82,
    jump: 0.72,
    wardrobe: 1.3
  });

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
  }

  function smoothstep(value) {
    const x = clamp(value, 0, 1);
    return x * x * (3 - 2 * x);
  }

  function mix(a, b, t) {
    return a + (b - a) * t;
  }

  function shortestAngle(target, current) {
    let delta = (target - current) % (Math.PI * 2);
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    return delta;
  }

  function seededRandom(seed) {
    let state = (seed >>> 0) || 0x6d2b79f5;
    return function random() {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createJoint(name) {
    const config = JOINTS[name];
    return {
      name,
      angle: 0,
      velocity: 0,
      target: 0,
      min: config.min * DEG,
      max: config.max * DEG,
      stiffness: config.stiffness,
      damping: config.damping,
      inertia: config.inertia
    };
  }

  function createActor(options = {}) {
    const width = finite(options.width, 220);
    const height = finite(options.height, 330);
    const seed = Number.isInteger(options.seed) ? options.seed : 1;
    const joints = {};
    Object.keys(JOINTS).forEach((name) => { joints[name] = createJoint(name); });
    return {
      id: String(options.id || 'dude'),
      body: {
        x: finite(options.x, 0),
        y: finite(options.y, 0),
        vx: finite(options.vx, 0),
        vy: finite(options.vy, 0),
        angle: 0,
        angularVelocity: 0,
        yaw: 0,
        yawVelocity: 0,
        yawTarget: 0
      },
      size: { width, height },
      joints,
      state: 'idle',
      previousState: 'idle',
      stateAge: 0,
      stateDuration: 0,
      grounded: true,
      dragging: false,
      drag: {
        offsetX: width * 0.5,
        offsetY: height * 0.28,
        targetX: 0,
        targetY: 0,
        samples: []
      },
      gait: {
        active: false,
        swing: 'L',
        progress: 0,
        duration: 0.34,
        left: { x: 0, y: 0, planted: true },
        right: { x: 0, y: 0, planted: true }
      },
      walkDirection: options.walkDirection === -1 ? -1 : 1,
      exitDirection: 0,
      climbDirection: -1,
      climbEdge: 'left',
      support: { active: false, y: 0, left: 0, right: 0, kind: 'ground' },
      recoveryAngle: 0,
      recoverySide: 1,
      motion: clamp(finite(options.motion, 0.85), 0, 1),
      reducedMotion: Boolean(options.reducedMotion),
      accumulator: 0,
      clock: 0,
      impactCooldown: 0,
      settleTime: 0,
      breathing: 0,
      visual: { squashX: 1, squashY: 1, offsetY: 0, turnY: 0, yaw: 0 },
      random: seededRandom(seed),
      events: []
    };
  }

  function setState(actor, state, duration = STATE_DURATIONS[state] || 0) {
    if (!actor || typeof state !== 'string') return;
    if (actor.state !== state) {
      actor.previousState = actor.state;
      actor.state = state;
      actor.stateAge = 0;
      actor.stateDuration = Math.max(0, finite(duration, 0));
      actor.gait.active = false;
      if (state === 'jump') actor.grounded = false;
      if (state === 'getup') {
        actor.recoveryAngle = Math.abs(actor.body.angle) > 0.2
          ? actor.body.angle
          : (actor.recoverySide || 1) * 1.48;
        actor.recoverySide = actor.recoveryAngle >= 0 ? 1 : -1;
        actor.body.angularVelocity = 0;
        actor.body.vx = 0;
        actor.body.vy = 0;
      }
    } else if (duration > 0) {
      actor.stateDuration = duration;
      actor.stateAge = 0;
    }
  }

  function pushEvent(actor, type, detail = {}) {
    actor.events.push({ type, actorId: actor.id, ...detail });
  }

  function drainEvents(actor) {
    return actor.events.splice(0, actor.events.length);
  }

  function setSupport(actor, support = {}) {
    if (!actor) return;
    const left = finite(support.left, 0);
    const right = finite(support.right, left + actor.size.width * 2);
    const y = finite(support.y, 0);
    actor.support = {
      active: right > left,
      y,
      left: Math.min(left, right),
      right: Math.max(left, right),
      kind: String(support.kind || 'ledge').slice(0, 24)
    };
    if (actor.support.active) {
      actor.body.y = y - actor.size.height;
      actor.body.vy = 0;
      actor.grounded = true;
    }
  }

  function clearSupport(actor) {
    if (!actor) return;
    actor.support = { active: false, y: 0, left: 0, right: 0, kind: 'ground' };
  }

  function resetFeet(actor, bounds) {
    const surfaceY = actor.support.active ? actor.support.y : bounds.height - 8;
    const footY = surfaceY - actor.size.height * 0.035;
    actor.gait.left.x = actor.body.x + actor.size.width * 0.39;
    actor.gait.right.x = actor.body.x + actor.size.width * 0.61;
    actor.gait.left.y = footY;
    actor.gait.right.y = footY;
    actor.gait.left.planted = true;
    actor.gait.right.planted = true;
    actor.gait.swing = actor.walkDirection > 0 ? 'L' : 'R';
    actor.gait.progress = 0;
    actor.gait.active = true;
  }

  function solveLeg(actor, side, foot) {
    const isLeft = side === 'L';
    const hipX = actor.body.x + actor.size.width * (isLeft ? 0.43 : 0.57);
    const hipY = actor.body.y + actor.size.height * 0.70;
    const scale = actor.size.height / 330;
    const thigh = 45 * scale;
    const shin = 48 * scale;
    const dx = foot.x - hipX;
    const dy = foot.y - hipY;
    const distance = clamp(Math.hypot(dx, dy), Math.abs(thigh - shin) + 0.1, thigh + shin - 0.1);
    const vectorAngle = Math.atan2(dx, dy);
    const hipOffset = Math.acos(clamp((thigh * thigh + distance * distance - shin * shin) / (2 * thigh * distance), -1, 1));
    const kneeBend = Math.PI - Math.acos(clamp((thigh * thigh + shin * shin - distance * distance) / (2 * thigh * shin), -1, 1));
    const bendSign = isLeft ? 1 : -1;
    return {
      hip: vectorAngle - bendSign * hipOffset * 0.34,
      knee: bendSign * kneeBend
    };
  }

  function updateGait(actor, dt, bounds, targets) {
    if (!actor.gait.active) resetFeet(actor, bounds);
    const gait = actor.gait;
    const direction = actor.walkDirection;
    const speed = Math.abs(actor.body.vx);
    gait.duration = clamp(0.39 - speed / 950, 0.25, 0.39);
    gait.progress += dt / gait.duration;

    const swing = gait.swing === 'L' ? gait.left : gait.right;
    const stance = gait.swing === 'L' ? gait.right : gait.left;
    swing.planted = false;
    stance.planted = true;
    const sideOffset = gait.swing === 'L' ? actor.size.width * 0.39 : actor.size.width * 0.61;
    const startX = swing.x;
    const targetX = actor.body.x + sideOffset + direction * (30 + speed * 0.055);
    const surfaceY = actor.support.active ? actor.support.y : bounds.height - 8;
    const groundFootY = surfaceY - actor.size.height * 0.035;
    const progress = smoothstep(gait.progress);
    swing.x = mix(startX, targetX, clamp(dt / Math.max(0.001, gait.duration * (1 - gait.progress + dt / gait.duration)), 0, 1));
    swing.y = groundFootY - Math.sin(progress * Math.PI) * (17 + actor.motion * 10);
    stance.y = groundFootY;

    if (gait.progress >= 1) {
      swing.x = targetX;
      swing.y = groundFootY;
      swing.planted = true;
      gait.swing = gait.swing === 'L' ? 'R' : 'L';
      gait.progress = 0;
    }

    const left = solveLeg(actor, 'L', gait.left);
    const right = solveLeg(actor, 'R', gait.right);
    targets.hipL = clamp(left.hip, -32 * DEG, 32 * DEG);
    targets.hipR = clamp(right.hip, -32 * DEG, 32 * DEG);
    targets.kneeL = clamp(left.knee, -10 * DEG, 46 * DEG);
    targets.kneeR = clamp(right.knee, -46 * DEG, 10 * DEG);
    const phase = gait.swing === 'L' ? progress : 1 + progress;
    const arm = Math.sin(phase * Math.PI) * 22 * DEG * direction;
    targets.shoulderL = -arm;
    targets.shoulderR = arm;
    targets.elbowL = (8 + Math.max(0, -arm * RAD) * 0.22) * DEG;
    targets.elbowR = -(8 + Math.max(0, arm * RAD) * 0.22) * DEG;
    targets.wristL = Math.sin(phase * Math.PI * 2 + 0.8) * 10 * DEG;
    targets.wristR = -Math.sin(phase * Math.PI * 2 + 0.8) * 10 * DEG;
    targets.ankleL = clamp(-targets.kneeL * 0.32 + Math.sin(progress * Math.PI) * 9 * DEG, -32 * DEG, 32 * DEG);
    targets.ankleR = clamp(-targets.kneeR * 0.32 - Math.sin(progress * Math.PI) * 9 * DEG, -32 * DEG, 32 * DEG);
    targets.torso = -Math.sin(phase * Math.PI * 2) * 4.8 * DEG - direction * 2 * DEG;
    targets.head = -targets.torso * 1.55 + Math.sin(phase * Math.PI) * 1.5 * DEG;
  }

  function poseTargets(actor, dt, bounds) {
    const t = actor.stateAge;
    const targets = Object.fromEntries(Object.keys(JOINTS).map((name) => [name, 0]));
    actor.visual.squashX += (1 - actor.visual.squashX) * clamp(dt * 13, 0, 1);
    actor.visual.squashY += (1 - actor.visual.squashY) * clamp(dt * 13, 0, 1);
    actor.visual.offsetY += (0 - actor.visual.offsetY) * clamp(dt * 10, 0, 1);
    actor.visual.turnY += (0 - actor.visual.turnY) * clamp(dt * 10, 0, 1);

    if (['walk', 'exit', 'sneak', 'ledge'].includes(actor.state)) {
      updateGait(actor, dt, bounds, targets);
    } else if (actor.state === 'idle') {
      const sway = Math.sin(actor.clock * 1.7 + actor.id.length) * (actor.reducedMotion ? 0.7 : 1.8) * DEG;
      targets.head = sway;
      targets.torso = -sway * 0.35;
      targets.shoulderL = -2 * DEG;
      targets.shoulderR = 2 * DEG;
      targets.elbowL = 5 * DEG;
      targets.elbowR = -5 * DEG;
      targets.wristL = Math.sin(actor.clock * 1.3) * 3 * DEG;
      targets.wristR = -Math.sin(actor.clock * 1.3) * 3 * DEG;
      targets.ankleL = -sway * 0.5;
      targets.ankleR = sway * 0.5;
    } else if (actor.state === 'jump') {
      const lift = clamp(-actor.body.vy / 620, -1, 1);
      targets.shoulderL = (-26 - lift * 19) * DEG;
      targets.shoulderR = (26 + lift * 19) * DEG;
      targets.elbowL = 20 * DEG;
      targets.elbowR = -20 * DEG;
      targets.wristL = -18 * DEG;
      targets.wristR = 18 * DEG;
      targets.hipL = (-8 + Math.max(0, lift) * 12) * DEG;
      targets.hipR = (8 - Math.max(0, lift) * 12) * DEG;
      targets.kneeL = (18 + Math.max(0, lift) * 24) * DEG;
      targets.kneeR = -(18 + Math.max(0, lift) * 24) * DEG;
      targets.ankleL = -22 * DEG;
      targets.ankleR = 22 * DEG;
      targets.head = clamp(-actor.body.vx / 70, -9, 9) * DEG;
    } else if (actor.state === 'land') {
      const recover = smoothstep(t / Math.max(0.01, actor.stateDuration));
      targets.hipL = mix(-18, 0, recover) * DEG;
      targets.hipR = mix(18, 0, recover) * DEG;
      targets.kneeL = mix(42, 0, recover) * DEG;
      targets.kneeR = mix(-42, 0, recover) * DEG;
      targets.shoulderL = mix(18, 0, recover) * DEG;
      targets.shoulderR = mix(-18, 0, recover) * DEG;
      targets.elbowL = mix(26, 5, recover) * DEG;
      targets.elbowR = mix(-26, -5, recover) * DEG;
      targets.wristL = mix(-16, 0, recover) * DEG;
      targets.wristR = mix(16, 0, recover) * DEG;
      targets.ankleL = mix(-24, 0, recover) * DEG;
      targets.ankleR = mix(24, 0, recover) * DEG;
      actor.visual.squashX = mix(1.11, 1, recover);
      actor.visual.squashY = mix(0.86, 1, recover);
      actor.visual.offsetY = mix(17, 0, recover);
    } else if (['sit', 'read', 'work', 'nap'].includes(actor.state)) {
      targets.torso = -7 * DEG;
      targets.head = 10 * DEG;
      // Left thigh crosses over the right; the feet counter-rotate so the pose reads as seated, not squashed.
      targets.hipL = 43 * DEG;
      targets.hipR = -18 * DEG;
      targets.kneeL = 78 * DEG;
      targets.kneeR = -72 * DEG;
      targets.ankleL = -32 * DEG;
      targets.ankleR = 26 * DEG;
      targets.shoulderL = 12 * DEG;
      targets.shoulderR = -15 * DEG;
      targets.elbowL = 38 * DEG;
      targets.elbowR = -34 * DEG;
      targets.wristL = -18 * DEG;
      targets.wristR = 15 * DEG;
      actor.visual.offsetY = 38;
      if (actor.state === 'read') {
        targets.head = 18 * DEG;
        targets.shoulderL = 28 * DEG;
        targets.shoulderR = -28 * DEG;
        targets.elbowL = 55 * DEG;
        targets.elbowR = -55 * DEG;
        targets.wristL = -26 * DEG;
        targets.wristR = 26 * DEG;
      } else if (actor.state === 'work') {
        targets.head = 14 * DEG;
        targets.torso = 6 * DEG;
        targets.shoulderL = 18 * DEG;
        targets.shoulderR = -18 * DEG;
        targets.elbowL = 44 * DEG;
        targets.elbowR = -44 * DEG;
        targets.wristL = Math.sin(t * 8) * 13 * DEG;
        targets.wristR = -Math.sin(t * 8 + 0.8) * 13 * DEG;
      } else if (actor.state === 'nap') {
        targets.head = 22 * DEG + Math.sin(t * 1.1) * 3 * DEG;
        targets.torso = 10 * DEG;
        targets.shoulderL = 21 * DEG;
        targets.shoulderR = -20 * DEG;
        targets.elbowL = 48 * DEG;
        targets.elbowR = -46 * DEG;
        actor.visual.offsetY = 44;
      }
    } else if (actor.state === 'hang') {
      targets.shoulderL = -62 * DEG;
      targets.shoulderR = 62 * DEG;
      targets.elbowL = 9 * DEG;
      targets.elbowR = -9 * DEG;
      targets.wristL = -11 * DEG;
      targets.wristR = 11 * DEG;
      targets.hipL = 7 * DEG;
      targets.hipR = -7 * DEG;
      targets.kneeL = 12 * DEG;
      targets.kneeR = -12 * DEG;
      targets.ankleL = Math.sin(t * 2.3) * 8 * DEG;
      targets.ankleR = -Math.sin(t * 2.3) * 8 * DEG;
    } else if (actor.state === 'lie' || actor.state === 'tumble') {
      const loosen = actor.state === 'tumble' ? 1 : 0.55;
      targets.head = clamp(-actor.body.angularVelocity * 0.05, -14 * DEG, 14 * DEG);
      targets.shoulderL = -17 * DEG * loosen;
      targets.shoulderR = 24 * DEG * loosen;
      targets.elbowL = 28 * DEG;
      targets.elbowR = -18 * DEG;
      targets.wristL = -23 * DEG;
      targets.wristR = 16 * DEG;
      targets.hipL = -13 * DEG;
      targets.hipR = 18 * DEG;
      targets.kneeL = 27 * DEG;
      targets.kneeR = -35 * DEG;
      targets.ankleL = -18 * DEG;
      targets.ankleR = 21 * DEG;
      actor.visual.offsetY = actor.state === 'lie' ? 76 : 24;
    } else if (actor.state === 'getup') {
      const recover = smoothstep(t / Math.max(0.01, actor.stateDuration));
      const brace = smoothstep(clamp(t / Math.max(0.01, actor.stateDuration * 0.34), 0, 1));
      const stand = smoothstep(clamp((recover - 0.48) / 0.52, 0, 1));
      const side = actor.recoverySide || 1;
      // Plant the near hand, tuck the opposite knee, then press upright.
      targets.torso = mix(-16 * side, 0, stand) * DEG;
      targets.head = mix(18 * side, 0, recover) * DEG;
      if (side > 0) {
        targets.shoulderL = mix(62, 0, stand) * DEG;
        targets.elbowL = mix(-30, 5, stand) * DEG;
        targets.wristL = mix(-12, 0, stand) * DEG;
        targets.shoulderR = mix(-22, 0, recover) * DEG;
        targets.elbowR = mix(-48, -5, recover) * DEG;
        targets.wristR = mix(25, 0, recover) * DEG;
        targets.hipL = mix(-18, 0, stand) * DEG;
        targets.hipR = mix(39, 0, stand) * DEG;
        targets.kneeL = mix(34, 0, stand) * DEG;
        targets.kneeR = mix(-82, 0, stand) * DEG;
      } else {
        targets.shoulderL = mix(22, 0, recover) * DEG;
        targets.elbowL = mix(48, 5, recover) * DEG;
        targets.wristL = mix(-25, 0, recover) * DEG;
        targets.shoulderR = mix(-62, 0, stand) * DEG;
        targets.elbowR = mix(30, -5, stand) * DEG;
        targets.wristR = mix(12, 0, stand) * DEG;
        targets.hipL = mix(-39, 0, stand) * DEG;
        targets.hipR = mix(18, 0, stand) * DEG;
        targets.kneeL = mix(82, 0, stand) * DEG;
        targets.kneeR = mix(-34, 0, stand) * DEG;
      }
      targets.ankleL = mix(-28, 0, stand) * DEG;
      targets.ankleR = mix(28, 0, stand) * DEG;
      actor.visual.offsetY = mix(70, mix(48, 0, stand), brace);
    } else if (actor.state === 'climb') {
      const reach = Math.sin(t * 5.2);
      const opposing = Math.sin(t * 5.2 + Math.PI);
      targets.torso = (actor.climbEdge === 'left' ? -7 : 7) * DEG;
      targets.head = -targets.torso * 1.4;
      targets.shoulderL = (-48 + reach * 26) * DEG;
      targets.shoulderR = (48 + opposing * 26) * DEG;
      targets.elbowL = (38 + opposing * 20) * DEG;
      targets.elbowR = (-38 + reach * 20) * DEG;
      targets.wristL = -reach * 18 * DEG;
      targets.wristR = -opposing * 18 * DEG;
      targets.hipL = reach * 25 * DEG;
      targets.hipR = opposing * 25 * DEG;
      targets.kneeL = (28 + Math.max(0, opposing) * 45) * DEG;
      targets.kneeR = -(28 + Math.max(0, reach) * 45) * DEG;
      targets.ankleL = -reach * 18 * DEG;
      targets.ankleR = opposing * 18 * DEG;
    } else if (actor.state === 'ceiling-crawl') {
      const crawl = Math.sin(t * 4.7);
      const counter = Math.sin(t * 4.7 + Math.PI);
      targets.head = -crawl * 5 * DEG;
      targets.torso = crawl * 7 * DEG;
      targets.shoulderL = (-52 + crawl * 27) * DEG;
      targets.shoulderR = (52 + counter * 27) * DEG;
      targets.elbowL = (45 + Math.max(0, counter) * 26) * DEG;
      targets.elbowR = -(45 + Math.max(0, crawl) * 26) * DEG;
      targets.wristL = -crawl * 20 * DEG;
      targets.wristR = counter * 20 * DEG;
      targets.hipL = counter * 24 * DEG;
      targets.hipR = crawl * 24 * DEG;
      targets.kneeL = (36 + Math.max(0, crawl) * 36) * DEG;
      targets.kneeR = -(36 + Math.max(0, counter) * 36) * DEG;
      targets.ankleL = -counter * 16 * DEG;
      targets.ankleR = crawl * 16 * DEG;
    } else if (actor.state === 'wardrobe') {
      const turn = Math.sin(clamp(t / Math.max(actor.stateDuration, 0.01), 0, 1) * Math.PI);
      actor.visual.turnY = turn * 84;
      targets.shoulderL = -34 * DEG;
      targets.shoulderR = 34 * DEG;
      targets.elbowL = 48 * DEG;
      targets.elbowR = -48 * DEG;
      targets.wristL = -32 * DEG;
      targets.wristR = 32 * DEG;
      targets.head = Math.sin(t * 7) * 3 * DEG;
    } else if (actor.state === 'drag') {
      targets.head = clamp(-actor.body.vx / 62, -17, 17) * DEG;
      targets.torso = clamp(-actor.body.vx / 130, -10, 10) * DEG;
      targets.shoulderL = clamp(actor.body.vy / 42 - 13, -50, 40) * DEG;
      targets.shoulderR = clamp(-actor.body.vy / 42 + 13, -40, 50) * DEG;
      targets.elbowL = 25 * DEG;
      targets.elbowR = -25 * DEG;
      targets.wristL = clamp(actor.body.angularVelocity * 9, -38, 38) * DEG;
      targets.wristR = clamp(-actor.body.angularVelocity * 9, -38, 38) * DEG;
      targets.hipL = clamp(-actor.body.vx / 56, -38, 38) * DEG;
      targets.hipR = clamp(-actor.body.vx / 56, -38, 38) * DEG;
      targets.kneeL = 28 * DEG;
      targets.kneeR = -28 * DEG;
      targets.ankleL = -22 * DEG;
      targets.ankleR = 22 * DEG;
    } else if (actor.state === 'wave') {
      targets.torso = -5 * DEG;
      targets.head = 7 * DEG;
      targets.shoulderR = -68 * DEG;
      targets.elbowR = -72 * DEG;
      targets.wristR = Math.sin(t * 10) * 34 * DEG;
      targets.shoulderL = 5 * DEG;
      targets.elbowL = 10 * DEG;
    } else if (actor.state === 'stretch') {
      const reach = smoothstep(Math.min(t * 2.5, 1));
      targets.torso = -10 * DEG * reach;
      targets.head = 12 * DEG * reach;
      targets.shoulderL = -74 * DEG * reach;
      targets.shoulderR = 74 * DEG * reach;
      targets.elbowL = 12 * DEG;
      targets.elbowR = -12 * DEG;
      targets.wristL = -20 * DEG;
      targets.wristR = 20 * DEG;
      targets.hipL = -8 * DEG;
      targets.hipR = 8 * DEG;
      targets.ankleL = -9 * DEG;
      targets.ankleR = 9 * DEG;
    } else if (actor.state === 'look') {
      targets.torso = Math.sin(t * 2.1) * 7 * DEG;
      targets.head = Math.sin(t * 2.1 + 0.45) * 17 * DEG;
      targets.shoulderL = -4 * DEG;
      targets.shoulderR = 4 * DEG;
      targets.wristL = 4 * DEG;
      targets.wristR = -4 * DEG;
    } else if (actor.state === 'dance') {
      const beat = Math.sin(t * 6.4);
      const offbeat = Math.sin(t * 6.4 + Math.PI / 2);
      targets.torso = beat * 13 * DEG;
      targets.head = -beat * 9 * DEG;
      targets.shoulderL = (-34 + offbeat * 34) * DEG;
      targets.shoulderR = (34 + offbeat * 34) * DEG;
      targets.elbowL = (32 + beat * 22) * DEG;
      targets.elbowR = (-32 + beat * 22) * DEG;
      targets.wristL = offbeat * 29 * DEG;
      targets.wristR = -offbeat * 29 * DEG;
      targets.hipL = beat * 20 * DEG;
      targets.hipR = beat * 20 * DEG;
      targets.kneeL = (20 + Math.max(0, offbeat) * 28) * DEG;
      targets.kneeR = -(20 + Math.max(0, -offbeat) * 28) * DEG;
      targets.ankleL = -beat * 18 * DEG;
      targets.ankleR = beat * 18 * DEG;
      actor.visual.offsetY = Math.abs(beat) * -5;
    } else if (actor.state === 'balance') {
      const wobble = Math.sin(t * 3.7);
      targets.torso = wobble * 9 * DEG;
      targets.head = -wobble * 12 * DEG;
      targets.shoulderL = -72 * DEG;
      targets.shoulderR = 72 * DEG;
      targets.elbowL = 15 * DEG;
      targets.elbowR = -15 * DEG;
      targets.wristL = wobble * 22 * DEG;
      targets.wristR = -wobble * 22 * DEG;
      targets.hipL = -12 * DEG;
      targets.hipR = 12 * DEG;
      targets.kneeL = 31 * DEG;
      targets.kneeR = -31 * DEG;
      targets.ankleL = -wobble * 17 * DEG;
      targets.ankleR = wobble * 17 * DEG;
      actor.visual.offsetY = 8;
    } else if (actor.state === 'ponder') {
      targets.torso = -6 * DEG;
      targets.head = 17 * DEG + Math.sin(t * 1.8) * 4 * DEG;
      targets.shoulderR = -24 * DEG;
      targets.elbowR = -78 * DEG;
      targets.wristR = -18 * DEG;
      targets.shoulderL = 8 * DEG;
      targets.elbowL = 14 * DEG;
      targets.hipL = -5 * DEG;
      targets.hipR = 5 * DEG;
    } else if (actor.state === 'celebrate') {
      const bounce = Math.abs(Math.sin(t * 5.2));
      targets.torso = Math.sin(t * 5.2) * 6 * DEG;
      targets.head = -targets.torso;
      targets.shoulderL = (-76 + bounce * 10) * DEG;
      targets.shoulderR = (76 - bounce * 10) * DEG;
      targets.elbowL = 17 * DEG;
      targets.elbowR = -17 * DEG;
      targets.wristL = Math.sin(t * 10) * 26 * DEG;
      targets.wristR = -Math.sin(t * 10) * 26 * DEG;
      targets.hipL = -9 * DEG;
      targets.hipR = 9 * DEG;
      targets.kneeL = bounce * 22 * DEG;
      targets.kneeR = -bounce * 22 * DEG;
      actor.visual.offsetY = -bounce * 9;
    } else if (actor.state === 'greet') {
      targets.torso = -8 * DEG;
      targets.head = 9 * DEG;
      targets.shoulderL = -51 * DEG;
      targets.shoulderR = 51 * DEG;
      targets.elbowL = 38 * DEG;
      targets.elbowR = -38 * DEG;
      targets.wristL = Math.sin(t * 8) * 18 * DEG;
      targets.wristR = -Math.sin(t * 8) * 18 * DEG;
      targets.hipL = -6 * DEG;
      targets.hipR = 6 * DEG;
    }
    return targets;
  }

  function jointStiffnessScale(actor) {
    if (actor.state === 'tumble') return 0.17;
    if (actor.state === 'lie') return 0.42;
    if (actor.state === 'drag') return 0.56;
    return actor.reducedMotion ? 1.25 : 1;
  }

  function integrateJoints(actor, dt, targets, accelerationX, accelerationY) {
    const stiffnessScale = jointStiffnessScale(actor);
    for (const [name, joint] of Object.entries(actor.joints)) {
      joint.target = finite(targets[name], 0);
      const lateralInertia = -accelerationX * 0.00042 * joint.inertia;
      const verticalInertia = name.startsWith('shoulder') ? accelerationY * 0.00007 * (name.endsWith('L') ? -1 : 1) : 0;
      const spring = (joint.target - joint.angle) * joint.stiffness * stiffnessScale;
      const damping = -joint.velocity * joint.damping * Math.sqrt(stiffnessScale);
      joint.velocity += (spring + damping + lateralInertia + verticalInertia) * dt;
      joint.velocity = clamp(finite(joint.velocity), -8, 8);
      joint.angle += joint.velocity * dt;
      if (joint.angle < joint.min) {
        joint.angle = joint.min;
        if (joint.velocity < 0) joint.velocity *= -0.16;
      } else if (joint.angle > joint.max) {
        joint.angle = joint.max;
        if (joint.velocity > 0) joint.velocity *= -0.16;
      }
      joint.angle = finite(joint.angle);
    }
  }

  function impactJoints(actor, impulse, direction) {
    const amount = clamp(Math.abs(impulse) / 780, 0, 2.4) * (actor.reducedMotion ? 0.35 : 1);
    const sign = direction || (actor.random() > 0.5 ? 1 : -1);
    actor.joints.head.velocity += sign * amount * 1.9;
    actor.joints.torso.velocity -= sign * amount * 0.8;
    actor.joints.shoulderL.velocity += sign * amount * 1.2;
    actor.joints.shoulderR.velocity -= sign * amount * 1.4;
    actor.joints.elbowL.velocity -= sign * amount * 1.1;
    actor.joints.elbowR.velocity += sign * amount * 0.9;
    actor.joints.wristL.velocity += sign * amount * 1.7;
    actor.joints.wristR.velocity -= sign * amount * 1.6;
    actor.joints.hipL.velocity -= sign * amount * 0.8;
    actor.joints.hipR.velocity += sign * amount;
    actor.joints.kneeL.velocity += sign * amount * 0.7;
    actor.joints.kneeR.velocity -= sign * amount * 0.8;
    actor.joints.ankleL.velocity -= sign * amount * 1.2;
    actor.joints.ankleR.velocity += sign * amount * 1.1;
  }

  function beginDrag(actor, pointerX, pointerY, time = actor.clock) {
    clearSupport(actor);
    actor.dragging = true;
    actor.drag.offsetX = pointerX - actor.body.x;
    actor.drag.offsetY = pointerY - actor.body.y;
    actor.drag.targetX = pointerX;
    actor.drag.targetY = pointerY;
    actor.drag.samples = [{ x: pointerX, y: pointerY, t: finite(time, actor.clock) }];
    setState(actor, 'drag');
  }

  function moveDrag(actor, pointerX, pointerY, time = actor.clock) {
    if (!actor.dragging) return;
    actor.drag.targetX = finite(pointerX, actor.drag.targetX);
    actor.drag.targetY = finite(pointerY, actor.drag.targetY);
    actor.drag.samples.push({ x: actor.drag.targetX, y: actor.drag.targetY, t: finite(time, actor.clock) });
    const cutoff = finite(time, actor.clock) - 0.18;
    actor.drag.samples = actor.drag.samples.filter((sample) => sample.t >= cutoff).slice(-12);
  }

  function regressionVelocity(samples, axis) {
    if (samples.length < 2) return 0;
    const latest = samples[samples.length - 1].t;
    let weightSum = 0;
    let meanT = 0;
    let meanV = 0;
    for (const sample of samples) {
      const weight = 0.25 + clamp((sample.t - (latest - 0.18)) / 0.18, 0, 1);
      weightSum += weight;
      meanT += sample.t * weight;
      meanV += sample[axis] * weight;
    }
    meanT /= weightSum;
    meanV /= weightSum;
    let covariance = 0;
    let variance = 0;
    for (const sample of samples) {
      const weight = 0.25 + clamp((sample.t - (latest - 0.18)) / 0.18, 0, 1);
      covariance += weight * (sample.t - meanT) * (sample[axis] - meanV);
      variance += weight * (sample.t - meanT) * (sample.t - meanT);
    }
    return variance > 1e-6 ? covariance / variance : 0;
  }

  function releaseDrag(actor) {
    if (!actor.dragging) return { vx: actor.body.vx, vy: actor.body.vy };
    const pointerVx = regressionVelocity(actor.drag.samples, 'x');
    const pointerVy = regressionVelocity(actor.drag.samples, 'y');
    actor.dragging = false;
    clearSupport(actor);
    const throwScale = actor.reducedMotion ? 0.42 : 0.88 + actor.motion * 0.28;
    const maxThrow = actor.reducedMotion ? 760 : 1900;
    actor.body.vx = clamp(actor.body.vx * 0.28 + pointerVx * throwScale, -maxThrow, maxThrow);
    actor.body.vy = clamp(actor.body.vy * 0.28 + pointerVy * throwScale, -maxThrow, maxThrow);
    actor.body.angularVelocity = clamp(actor.body.angularVelocity + actor.body.vx * 0.0018, -5.5, 5.5);
    actor.body.yawVelocity = clamp(actor.body.yawVelocity + actor.body.vx * 0.0012, -4.5, 4.5);
    setState(actor, 'jump', 1.2);
    return { vx: actor.body.vx, vy: actor.body.vy };
  }

  function launch(actor, direction = 0) {
    clearSupport(actor);
    if (actor.state === 'hang') actor.body.y = -22;
    actor.body.vy = -(590 + actor.motion * 180) * (actor.reducedMotion ? 0.55 : 1);
    actor.body.vx += direction * (90 + actor.motion * 55);
    actor.grounded = false;
    setState(actor, 'jump', 1.1);
  }

  function collide(actor, bounds) {
    const body = actor.body;
    const width = actor.size.width;
    const height = actor.size.height;
    const worldGround = bounds.height - height - 8;
    const overlapsSupport = actor.support.active
      && body.x + width * 0.78 >= actor.support.left
      && body.x + width * 0.22 <= actor.support.right;
    if (actor.support.active && !overlapsSupport && !['climb', 'ceiling-crawl'].includes(actor.state)) clearSupport(actor);
    const ground = overlapsSupport ? actor.support.y - height : worldGround;
    const left = -width * 0.42;
    const right = bounds.width - width * 0.58;
    let collision = null;

    if (body.y >= ground) {
      const impact = body.vy;
      body.y = ground;
      if (impact > 45) {
        body.vy = -impact * (actor.reducedMotion ? 0.08 : 0.22 + actor.motion * 0.08);
        body.vx *= 0.82;
        impactJoints(actor, impact, body.vx >= 0 ? 1 : -1);
        collision = { edge: 'ground', impact };
        actor.visual.squashX = 1.12;
        actor.visual.squashY = 0.82;
        actor.body.angularVelocity += clamp(body.vx * 0.0011, -1.2, 1.2);
        actor.body.yawVelocity += clamp(body.vx * 0.0008, -1, 1);
        if (impact > 760 && !actor.reducedMotion) setState(actor, 'tumble', 0.9);
        else setState(actor, 'land', 0.24);
      } else {
        body.vy = 0;
        actor.grounded = true;
      }
    } else {
      actor.grounded = false;
    }

    const horizontalLeft = actor.support.active && actor.state === 'ledge' ? actor.support.left - width * 0.28 : left;
    const horizontalRight = actor.support.active && actor.state === 'ledge' ? actor.support.right - width * 0.72 : right;

    if (actor.state !== 'exit' && body.x < horizontalLeft) {
      const impact = Math.abs(body.vx);
      body.x = horizontalLeft;
      body.vx = Math.abs(body.vx) * (actor.reducedMotion ? 0.18 : 0.46);
      body.angularVelocity += clamp(impact * 0.0035, 0, 3.6);
      body.yawVelocity += clamp(impact * 0.0018, 0, 2.2);
      actor.walkDirection = 1;
      impactJoints(actor, impact, 1);
      if (impact > 120) collision = { edge: 'left', impact };
    } else if (actor.state !== 'exit' && body.x > horizontalRight) {
      const impact = Math.abs(body.vx);
      body.x = horizontalRight;
      body.vx = -Math.abs(body.vx) * (actor.reducedMotion ? 0.18 : 0.46);
      body.angularVelocity -= clamp(impact * 0.0035, 0, 3.6);
      body.yawVelocity -= clamp(impact * 0.0018, 0, 2.2);
      actor.walkDirection = -1;
      impactJoints(actor, impact, -1);
      if (impact > 120) collision = { edge: 'right', impact };
    }

    if (body.y < -height * 0.52 && !['hang', 'ceiling-crawl', 'climb'].includes(actor.state)) {
      const impact = Math.abs(body.vy);
      body.y = -height * 0.52;
      body.vy = Math.abs(body.vy) * 0.31;
      body.angularVelocity += clamp(body.vx * 0.002, -2, 2);
      impactJoints(actor, impact, body.vx >= 0 ? -1 : 1);
      if (impact > 160) collision = { edge: 'ceiling', impact };
    }
    return collision;
  }

  function integrateOne(actor, dt, bounds) {
    const body = actor.body;
    const oldVx = body.vx;
    const oldVy = body.vy;
    actor.clock += dt;
    actor.stateAge += dt;
    actor.impactCooldown = Math.max(0, actor.impactCooldown - dt);
    actor.breathing = Math.sin(actor.clock * 2.1) * (actor.reducedMotion ? 0.001 : 0.006);

    if (['walk', 'exit', 'sneak', 'ledge', 'ceiling-crawl'].includes(actor.state)) {
      // A three-quarter travel angle keeps the face and both limb chains readable;
      // yaw still interpolates continuously through every angle while turning.
      body.yawTarget = actor.walkDirection * Math.PI * 0.31;
    } else if (actor.state === 'climb') {
      body.yawTarget = actor.climbEdge === 'left' ? -Math.PI * 0.5 : Math.PI * 0.5;
    } else if (actor.state === 'wardrobe') {
      body.yawTarget = actor.id === 'dudette' ? Math.PI : 0;
    } else if (actor.state === 'look') {
      body.yawTarget = Math.sin(actor.stateAge * 1.8) * Math.PI * 0.72;
    } else if (actor.state === 'wave') {
      body.yawTarget = actor.walkDirection * Math.PI * 0.18;
    } else if (['sit', 'read', 'work', 'nap'].includes(actor.state)) {
      body.yawTarget = 0;
    } else if (['jump', 'drag'].includes(actor.state) && Math.abs(body.vx) > 55) {
      body.yawTarget = Math.sign(body.vx) * Math.PI * 0.5;
    } else if (!['tumble', 'lie', 'sit', 'read', 'work', 'nap', 'hang'].includes(actor.state)) {
      body.yawTarget = 0;
    }
    const yawStrength = actor.state === 'tumble' ? 1.2 : actor.reducedMotion ? 22 : 15;
    const yawDamping = actor.state === 'tumble' ? 0.7 : actor.reducedMotion ? 9 : 6.8;
    body.yawVelocity += (shortestAngle(body.yawTarget, body.yaw) * yawStrength - body.yawVelocity * yawDamping) * dt;

    if (actor.dragging) {
      const desiredX = actor.drag.targetX - actor.drag.offsetX;
      const desiredY = actor.drag.targetY - actor.drag.offsetY;
      const dx = desiredX - body.x;
      const dy = desiredY - body.y;
      const spring = actor.reducedMotion ? 32 : 43 + actor.motion * 18;
      const damping = actor.reducedMotion ? 13 : 11.8;
      body.vx += (dx * spring - body.vx * damping) * dt;
      body.vy += (dy * spring - body.vy * damping) * dt;
      const grabLever = (actor.drag.offsetY / actor.size.height) - 0.28;
      const targetAngle = clamp((dx * 0.004 + body.vx * 0.00055) * (0.5 + Math.abs(grabLever)), -0.48, 0.48);
      body.angularVelocity += ((targetAngle - body.angle) * 25 - body.angularVelocity * 8) * dt;
    } else if (actor.state === 'hang') {
      const targetY = -actor.size.height * 0.63;
      body.vy += ((targetY - body.y) * 50 - body.vy * 14) * dt;
      body.vx *= Math.exp(-8 * dt);
      body.angularVelocity += ((Math.PI - body.angle) * 24 - body.angularVelocity * 8) * dt;
    } else if (actor.state === 'climb') {
      const edgeX = actor.climbEdge === 'right' ? bounds.width - actor.size.width * 0.72 : -actor.size.width * 0.28;
      body.vx += ((edgeX - body.x) * 40 - body.vx * 13) * dt;
      const climbSpeed = 64 + actor.motion * 46;
      body.vy += (actor.climbDirection * climbSpeed - body.vy) * clamp(dt * 7, 0, 1);
      body.angularVelocity += ((0 - body.angle) * 18 - body.angularVelocity * 8) * dt;
      if (body.y < -actor.size.height * 0.34) actor.climbDirection = 1;
      if (body.y > bounds.height - actor.size.height - 26) actor.climbDirection = -1;
    } else if (actor.state === 'ceiling-crawl') {
      const targetY = -actor.size.height * 0.48;
      body.vy += ((targetY - body.y) * 48 - body.vy * 14) * dt;
      const desired = actor.walkDirection * (62 + actor.motion * 55);
      body.vx += (desired - body.vx) * clamp(dt * 5.5, 0, 1);
      body.angularVelocity += ((Math.PI - body.angle) * 23 - body.angularVelocity * 8) * dt;
    } else if (actor.state === 'getup') {
      const progress = smoothstep(actor.stateAge / Math.max(actor.stateDuration, 0.01));
      const lift = smoothstep(clamp((progress - 0.2) / 0.72, 0, 1));
      body.vx *= Math.exp(-10 * dt);
      body.vy = 0;
      body.angle = mix(actor.recoveryAngle || 0, 0, lift);
      body.angularVelocity = 0;
    } else {
      if (actor.state === 'walk' || actor.state === 'exit' || actor.state === 'sneak' || actor.state === 'ledge') {
        const desired = actor.walkDirection * (actor.state === 'sneak' ? 54 + actor.motion * 34 : 96 + actor.motion * 92);
        body.vx += (desired - body.vx) * clamp(dt * 5.2, 0, 1);
      }
      const gravity = (actor.reducedMotion ? 980 : 1420 + actor.motion * 330);
      if (!actor.grounded || body.vy < 0) body.vy += gravity * dt;
      const desiredAngle = actor.state === 'lie' ? (body.angle >= 0 ? 1.48 : -1.48) : 0;
      const angleStrength = actor.state === 'tumble' ? 1.5 : actor.state === 'lie' ? 7 : actor.state === 'getup' ? 18 : 10;
      const angularDamping = actor.state === 'tumble' ? 0.8 : 4.8;
      body.angularVelocity += ((desiredAngle - body.angle) * angleStrength - body.angularVelocity * angularDamping) * dt;
    }

    body.vx = clamp(finite(body.vx), -2200, 2200);
    body.vy = clamp(finite(body.vy), -2200, 2400);
    body.angularVelocity = clamp(finite(body.angularVelocity), -9, 9);
    body.yawVelocity = clamp(finite(body.yawVelocity), -6.5, 6.5);
    body.x += body.vx * dt;
    body.y += body.vy * dt;
    body.angle += body.angularVelocity * dt;
    body.yaw += body.yawVelocity * dt;
    if (Math.abs(body.angle) > Math.PI * 4) body.angle %= Math.PI * 2;
    if (Math.abs(body.yaw) > Math.PI * 4) body.yaw %= Math.PI * 2;

    const collision = collide(actor, bounds);
    if (collision && actor.impactCooldown <= 0) {
      actor.impactCooldown = 0.14;
      pushEvent(actor, 'impact', {
        edge: collision.edge,
        impact: Math.round(collision.impact),
        speed: Math.round(Math.hypot(body.vx, body.vy))
      });
    }

    const ground = actor.support.active ? actor.support.y - actor.size.height : bounds.height - actor.size.height - 8;
    if (actor.grounded && !actor.dragging && !['walk', 'exit', 'sneak', 'ledge', 'jump', 'tumble', 'hang', 'climb', 'ceiling-crawl'].includes(actor.state)) {
      body.vx *= Math.exp(-8.5 * dt);
    } else if (!actor.dragging) {
      body.vx *= Math.exp(-(actor.grounded ? 2.4 : 0.035) * dt);
    }

    if (actor.state === 'exit' && (body.x < -actor.size.width - 45 || body.x > bounds.width + 45)) {
      pushEvent(actor, 'exited', { direction: actor.exitDirection || actor.walkDirection });
      body.x = actor.exitDirection > 0 ? -actor.size.width * 0.78 : bounds.width - actor.size.width * 0.22;
      body.y = ground;
      body.vx = (actor.exitDirection || actor.walkDirection) * 75;
      setState(actor, 'walk', 4.5);
    }

    const accelerationX = (body.vx - oldVx) / dt;
    const accelerationY = (body.vy - oldVy) / dt;
    const targets = poseTargets(actor, dt, bounds);
    integrateJoints(actor, dt, targets, accelerationX, accelerationY);

    if (actor.stateDuration > 0 && actor.stateAge >= actor.stateDuration && !actor.dragging) {
      if (actor.state === 'lie') pushEvent(actor, 'decision', { reason: 'rested' });
      else if (actor.state === 'tumble') {
        setState(actor, 'lie', 4.5 + actor.random() * 3.5);
        pushEvent(actor, 'decision', { reason: 'impact' });
      } else if (actor.state === 'exit') {
        // Exit completion is driven by crossing the edge.
      } else {
        const finished = actor.state;
        setState(actor, 'idle');
        pushEvent(actor, 'state-finished', { state: finished });
      }
    }
  }

  function step(actor, elapsed, bounds) {
    const safeBounds = {
      width: Math.max(actor.size.width, finite(bounds?.width, 1440)),
      height: Math.max(actor.size.height, finite(bounds?.height, 900))
    };
    actor.accumulator += clamp(finite(elapsed), 0, MAX_FRAME);
    let iterations = 0;
    while (actor.accumulator >= FIXED_STEP && iterations < 12) {
      integrateOne(actor, FIXED_STEP, safeBounds);
      actor.accumulator -= FIXED_STEP;
      iterations += 1;
    }
    if (iterations === 12) actor.accumulator = 0;
    return actor;
  }

  function pose(actor) {
    const joints = {};
    for (const [name, joint] of Object.entries(actor.joints)) joints[name] = joint.angle * RAD;
    return {
      x: actor.body.x,
      y: actor.body.y,
      angle: actor.body.angle * RAD,
      joints,
      state: actor.state,
      grounded: actor.grounded,
      breathing: actor.breathing,
      visual: { ...actor.visual, yaw: actor.body.yaw * RAD },
      velocity: { x: actor.body.vx, y: actor.body.vy, angular: actor.body.angularVelocity, yaw: actor.body.yawVelocity }
    };
  }

  function snapshot(actor) {
    return JSON.parse(JSON.stringify({
      id: actor.id,
      body: actor.body,
      state: actor.state,
      stateAge: actor.stateAge,
      grounded: actor.grounded,
      support: actor.support,
      joints: Object.fromEntries(Object.entries(actor.joints).map(([name, joint]) => [name, {
        angle: joint.angle,
        velocity: joint.velocity,
        min: joint.min,
        max: joint.max
      }]))
    }));
  }

  return {
    FIXED_STEP,
    JOINTS,
    clamp,
    createActor,
    setState,
    step,
    pose,
    snapshot,
    drainEvents,
    beginDrag,
    moveDrag,
    releaseDrag,
    launch,
    setSupport,
    clearSupport,
    impactJoints,
    regressionVelocity
  };
});
