const test = require('node:test');
const assert = require('node:assert/strict');
const Physics = require('../src/physics-engine.js');

const BOUNDS = { width: 1440, height: 900 };

function run(actor, seconds, frame = 1 / 60) {
  const frames = Math.ceil(seconds / frame);
  for (let index = 0; index < frames; index += 1) Physics.step(actor, frame, BOUNDS);
  return actor;
}

function assertFiniteActor(actor) {
  for (const value of Object.values(actor.body)) assert.equal(Number.isFinite(value), true, `non-finite body value ${value}`);
  for (const joint of Object.values(actor.joints)) {
    assert.equal(Number.isFinite(joint.angle), true, `${joint.name} angle is not finite`);
    assert.equal(Number.isFinite(joint.velocity), true, `${joint.name} velocity is not finite`);
    assert.ok(joint.angle >= joint.min - 1e-9, `${joint.name} exceeded minimum`);
    assert.ok(joint.angle <= joint.max + 1e-9, `${joint.name} exceeded maximum`);
  }
}

test('all fourteen joints articulate and remain constrained during a walk', () => {
  const actor = Physics.createActor({ x: 500, y: 562, seed: 11, motion: 1 });
  Physics.setState(actor, 'walk', 12);
  const extrema = Object.fromEntries(Object.keys(actor.joints).map((name) => [name, { min: Infinity, max: -Infinity }]));
  for (let frame = 0; frame < 480; frame += 1) {
    Physics.step(actor, 1 / 60, BOUNDS);
    for (const [name, joint] of Object.entries(actor.joints)) {
      extrema[name].min = Math.min(extrema[name].min, joint.angle);
      extrema[name].max = Math.max(extrema[name].max, joint.angle);
    }
    assertFiniteActor(actor);
  }
  for (const [name, range] of Object.entries(extrema)) {
    assert.ok(range.max - range.min > 0.002, `${name} did not articulate`);
  }
  assert.ok(actor.body.x > 900, 'walking should move the actor through world space');
});

test('walking turns the body toward travel instead of moonwalking', () => {
  const actor = Physics.createActor({ x: 500, y: 562, seed: 17, motion: 1, walkDirection: 1 });
  Physics.setState(actor, 'walk', 5);
  run(actor, 0.9);
  assert.ok(actor.body.yaw > 0.8, `expected a right-facing yaw, got ${actor.body.yaw}`);
  actor.walkDirection = -1;
  run(actor, 1.4);
  assert.ok(actor.body.yaw < -0.65, `expected a left-facing yaw, got ${actor.body.yaw}`);
});

test('sitting settles into a crossed-leg pose with hands and feet articulated', () => {
  const actor = Physics.createActor({ x: 500, y: 562, seed: 18, motion: 0.9 });
  Physics.setState(actor, 'sit', 5);
  run(actor, 1.2);
  assert.ok(actor.joints.hipL.angle > 0.45, 'left thigh did not cross the center line');
  assert.ok(actor.joints.hipR.angle < -0.15, 'supporting thigh did not counter the crossed leg');
  assert.ok(Math.abs(actor.joints.wristL.angle) > 0.1);
  assert.ok(Math.abs(actor.joints.ankleL.angle) > 0.1);
  assertFiniteActor(actor);
});

test('gait alternates planted feet and lifts only the swing foot', () => {
  const actor = Physics.createActor({ x: 400, y: 562, seed: 9, motion: 0.9 });
  Physics.setState(actor, 'walk', 6);
  let leftSwung = false;
  let rightSwung = false;
  let observedPlant = false;
  for (let frame = 0; frame < 240; frame += 1) {
    Physics.step(actor, 1 / 60, BOUNDS);
    if (!actor.gait.left.planted) leftSwung = true;
    if (!actor.gait.right.planted) rightSwung = true;
    if (actor.gait.left.planted !== actor.gait.right.planted) observedPlant = true;
  }
  assert.equal(leftSwung, true);
  assert.equal(rightSwung, true);
  assert.equal(observedPlant, true);
});

test('release velocity comes from recent pointer history, including upward throws', () => {
  const actor = Physics.createActor({ x: 400, y: 420, seed: 3 });
  Physics.beginDrag(actor, 500, 500);
  for (let index = 1; index <= 8; index += 1) {
    const time = index * 0.02;
    Physics.moveDrag(actor, 500 + index * 18, 500 - index * 14, time);
    Physics.step(actor, 0.02, BOUNDS);
  }
  const velocity = Physics.releaseDrag(actor);
  assert.ok(velocity.vx > 500, `expected rightward momentum, got ${velocity.vx}`);
  assert.ok(velocity.vy < -350, `expected upward momentum, got ${velocity.vy}`);
  assert.equal(actor.state, 'jump');
});

test('high-energy impacts transfer impulse to limbs and emit physical context', () => {
  const actor = Physics.createActor({ x: 500, y: 100, vy: 1250, vx: 420, seed: 5 });
  run(actor, 0.65);
  const events = Physics.drainEvents(actor);
  const impact = events.find((event) => event.type === 'impact' && event.edge === 'ground');
  assert.ok(impact, 'expected a ground-impact event');
  assert.ok(impact.impact > 700, `impact was too small: ${impact.impact}`);
  assert.ok(Object.values(actor.joints).some((joint) => Math.abs(joint.velocity) > 0.1), 'impact did not reach the limbs');
  assertFiniteActor(actor);
});

test('two actors have independent bodies, gait, and deterministic random state', () => {
  const dude = Physics.createActor({ id: 'dude', x: 280, y: 562, seed: 31, walkDirection: 1 });
  const dudette = Physics.createActor({ id: 'dudette', x: 920, y: 562, seed: 32, walkDirection: -1 });
  Physics.setState(dude, 'walk', 4);
  Physics.setState(dudette, 'sit', 4);
  run(dude, 2);
  run(dudette, 2);
  assert.ok(dude.body.x > 280);
  assert.ok(Math.abs(dudette.body.x - 920) < 1);
  assert.notDeepEqual(Physics.snapshot(dude), Physics.snapshot(dudette));
});

test('fixed timestep produces nearly identical results across render frame rates', () => {
  const sixty = Physics.createActor({ x: 300, y: 562, seed: 22, motion: 0.8 });
  const thirty = Physics.createActor({ x: 300, y: 562, seed: 22, motion: 0.8 });
  Physics.setState(sixty, 'walk', 3);
  Physics.setState(thirty, 'walk', 3);
  run(sixty, 2, 1 / 60);
  run(thirty, 2, 1 / 30);
  assert.ok(Math.abs(sixty.body.x - thirty.body.x) < 0.8);
  assert.ok(Math.abs(sixty.body.y - thirty.body.y) < 0.8);
  for (const name of Object.keys(sixty.joints)) {
    assert.ok(Math.abs(sixty.joints[name].angle - thirty.joints[name].angle) < 0.025, `${name} diverged by frame rate`);
  }
});

test('ten simulated minutes across state changes never produces NaN or breaks a joint', () => {
  const actor = Physics.createActor({ x: 700, y: 562, seed: 77, motion: 1 });
  const states = ['walk', 'jump', 'sit', 'drag', 'tumble', 'getup', 'idle', 'hang', 'lie', 'wave', 'stretch', 'look'];
  for (let frame = 0; frame < 36000; frame += 1) {
    if (frame % 300 === 0) {
      const state = states[(frame / 300) % states.length];
      if (state === 'jump') Physics.launch(actor, frame % 600 ? -1 : 1);
      else if (state === 'drag') {
        Physics.beginDrag(actor, actor.body.x + 110, actor.body.y + 90);
        Physics.moveDrag(actor, 850, 250, actor.clock + 0.05);
      } else Physics.setState(actor, state, 4);
    }
    if (actor.dragging && frame % 300 === 40) Physics.releaseDrag(actor);
    Physics.step(actor, 1 / 60, BOUNDS);
    if (frame % 120 === 0) assertFiniteActor(actor);
  }
  assertFiniteActor(actor);
});

test('reduced motion caps throws and absorbs hard collisions', () => {
  const actor = Physics.createActor({ x: 400, y: 300, reducedMotion: true, motion: 1 });
  Physics.beginDrag(actor, 500, 400);
  Physics.moveDrag(actor, 900, 100, 0.1);
  const velocity = Physics.releaseDrag(actor);
  assert.ok(Math.abs(velocity.vx) <= 800);
  run(actor, 2);
  assertFiniteActor(actor);
});

test('hand-braced recovery has no angular spin and extends from a planted side', () => {
  const actor = Physics.createActor({ x: 520, y: 562, seed: 93, motion: 1 });
  actor.body.angle = 1.48;
  actor.body.angularVelocity = 7;
  Physics.setState(actor, 'getup');
  assert.equal(actor.body.angularVelocity, 0);
  run(actor, 0.38);
  assert.equal(actor.body.angularVelocity, 0);
  assert.ok(actor.joints.shoulderL.angle > 0.35, 'near shoulder did not reach into a brace');
  assert.ok(actor.joints.elbowL.angle < -0.20, 'near elbow did not extend into the planted hand');
  assert.ok(actor.joints.kneeR.angle < -0.35, 'opposite knee did not tuck under the body');
  const angleAfterBrace = actor.body.angle;
  run(actor, 0.55);
  assert.ok(Math.abs(actor.body.angle) < Math.abs(angleAfterBrace), 'body did not press upright after bracing');
  assert.equal(actor.body.angularVelocity, 0);
});

test('raised supports hold a gentle placement and constrain ledge walking', () => {
  const actor = Physics.createActor({ x: 430, y: 220, seed: 55, motion: 0.85 });
  Physics.setSupport(actor, { left: 300, right: 1000, y: 510, kind: 'window' });
  Physics.setState(actor, 'ledge', 8);
  run(actor, 2.4);
  assert.equal(actor.support.active, true);
  assert.ok(Math.abs(actor.body.y - (510 - actor.size.height)) < 0.001);
  assert.ok(actor.body.x >= 300 - actor.size.width * 0.28 - 0.1);
  assert.ok(actor.body.x <= 1000 - actor.size.width * 0.72 + 0.1);
  assert.equal(actor.grounded, true);
});

test('wall climbing and ceiling crawling use distinct vertical articulated motion', () => {
  const climber = Physics.createActor({ x: 0, y: 500, seed: 80, motion: 1 });
  climber.climbEdge = 'left';
  climber.climbDirection = -1;
  Physics.setState(climber, 'climb', 8);
  const startY = climber.body.y;
  run(climber, 1.2);
  assert.ok(climber.body.y < startY - 45, 'climb did not travel vertically');
  assert.ok(Math.abs(climber.joints.shoulderL.angle - climber.joints.shoulderR.angle) > 0.25);

  const crawler = Physics.createActor({ x: 600, y: -120, seed: 81, motion: 1 });
  Physics.setState(crawler, 'ceiling-crawl', 8);
  run(crawler, 1.4);
  assert.ok(crawler.body.y < -crawler.size.height * 0.35, 'crawler left the ceiling');
  assert.ok(Math.abs(Math.abs(crawler.body.angle) - Math.PI) < 0.25, 'crawler is not upside down');
  assertFiniteActor(crawler);
});
