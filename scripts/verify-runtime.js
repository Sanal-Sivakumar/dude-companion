'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'outputs', 'runtime-v02');
const electron = path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron');

if (process.platform !== 'darwin') {
  console.log('Runtime overlay smoke tests are macOS-only.');
  process.exit(0);
}

fs.mkdirSync(outputDir, { recursive: true });

const scenes = [
  { name: 'articulation', delay: 1800 },
  { name: 'impact', delay: 650 },
  { name: 'wardrobe', delay: 3000 },
  { name: 'sit', delay: 1800 },
  { name: 'getup', delay: 620 },
  { name: 'surfaces', delay: 1400 },
  { name: 'turntable', delay: 820 }
];

for (const scene of scenes) {
  const imagePath = path.join(outputDir, `${scene.name}-smoke.png`);
  const result = spawnSync(electron, [root], {
    cwd: root,
    env: {
      ...process.env,
      DUDE_SMOKE_OUTPUT: imagePath,
      DUDE_SMOKE_SCENE: scene.name,
      DUDE_SMOKE_DELAY_MS: String(scene.delay)
    },
    encoding: 'utf8',
    timeout: 15000
  });
  assert.equal(result.status, 0, `${scene.name} Electron smoke failed:\n${result.stderr || result.stdout}`);
  assert.equal(fs.existsSync(imagePath), true, `${scene.name} screenshot was not created`);
  assert.ok(fs.statSync(imagePath).size > 25_000, `${scene.name} screenshot is unexpectedly small`);
  const diagnostics = JSON.parse(fs.readFileSync(`${imagePath}.json`, 'utf8'));
  assert.match(diagnostics.csp, /default-src 'self'/);
  if (scene.name === 'articulation') {
    assert.equal(diagnostics.actorCount, 2);
    assert.deepEqual(diagnostics.actors.map((actor) => actor.state), ['state-walk', 'state-walk']);
    assert.ok(diagnostics.actors.every((actor) => actor.movingJoints === 14), 'walking did not articulate every joint');
    assert.ok(diagnostics.actors.every((actor) => actor.renderMode === 'continuous-3d'));
    assert.ok(diagnostics.actors.every((actor) => actor.joints === 14));
    assert.ok(diagnostics.actors.every((actor) => actor.canvas.width === 360 && actor.canvas.height === 540));
    assert.ok(diagnostics.actors.every((actor) => actor.coatHemVisible), 'coat hem is missing during gait');
    assert.ok(diagnostics.actors.every((actor) => !actor.hipPivotsVisible), 'internal hip pivots escaped the coat');
    assert.notEqual(diagnostics.actors[0].transform, diagnostics.actors[1].transform);
  } else if (scene.name === 'impact') {
    assert.equal(diagnostics.actorCount, 1);
    assert.match(diagnostics.actors[0].state, /^state-(jump|land|tumble)$/);
    assert.ok(diagnostics.actors[0].movingJoints >= 12, 'impact did not transfer motion through the body');
    assert.notEqual(diagnostics.actors[0].transform, '');
  } else if (scene.name === 'wardrobe') {
    assert.equal(diagnostics.actorCount, 2);
    assert.ok(diagnostics.actors.every((actor) => actor.censorVisible));
    assert.ok(diagnostics.actors.every((actor) => actor.wardrobeFrom === 'night' && actor.wardrobeTo === 'rose'));
    assert.ok(diagnostics.actors.every((actor) => actor.privacyBlur.display === 'grid'));
    assert.ok(diagnostics.actors.every((actor) => actor.privacyBlur.opacity > 0.5));
    assert.ok(diagnostics.actors.every((actor) => actor.privacyBlur.width > 110 && actor.privacyBlur.height > 130));
    assert.ok(diagnostics.actors.every((actor) => /blur\(18px\)/.test(actor.privacyBlur.backdropFilter)));
  } else if (scene.name === 'sit') {
    assert.equal(diagnostics.actorCount, 1);
    assert.equal(diagnostics.actors[0].state, 'state-sit');
    assert.ok(diagnostics.actors[0].movingJoints >= 12, 'crossed-leg sit did not engage the full rig');
  } else if (scene.name === 'getup') {
    assert.equal(diagnostics.actorCount, 1);
    assert.equal(diagnostics.actors[0].state, 'state-getup');
    assert.ok(Math.abs(diagnostics.actors[0].bodyAngle) > 25 && Math.abs(diagnostics.actors[0].bodyAngle) < 88, 'recovery pose skipped the hand-braced press phase');
    assert.ok(diagnostics.actors[0].movingJoints >= 10);
  } else if (scene.name === 'surfaces') {
    assert.equal(diagnostics.actorCount, 2);
    assert.equal(diagnostics.actors[0].state, 'state-ledge');
    assert.equal(diagnostics.actors[0].supportKind, 'window-smoke');
    assert.equal(diagnostics.actors[1].state, 'state-climb');
    assert.ok(diagnostics.actors.every((actor) => actor.movingJoints >= 12));
  } else if (scene.name === 'turntable') {
    assert.equal(diagnostics.actorCount, 1);
    assert.equal(diagnostics.actors[0].state, 'state-look');
    const snappedDistance = Math.abs(diagnostics.actors[0].yaw % 90);
    assert.ok(snappedDistance > 4 && snappedDistance < 86, `yaw ${diagnostics.actors[0].yaw} looks direction-snapped`);
  }
  console.log(`✓ ${scene.name}: ${diagnostics.actorCount} actor(s), ${diagnostics.actors.map((actor) => `${actor.movingJoints}/14`).join(' + ')} moving joints`);
}

console.log(`Runtime evidence written to ${outputDir}`);
