const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('main and renderer scripts parse', () => {
  for (const file of ['electron/main.js', 'electron/preload.js', 'src/physics-engine.js', 'src/character-3d.js', 'src/autonomy-behaviors.js', 'src/renderer.js']) {
    execFileSync(process.execPath, ['--check', path.join(root, file)]);
  }
});

test('desktop overlay contains both character assets and safety UI', () => {
  const html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
  assert.match(html, /assets\/male\.png/);
  assert.match(html, /assets\/female\.png/);
  assert.match(html, /permissionDialog/);
  assert.match(html, /privacy-zones/);
  assert.match(html, /zone-groin/);
  assert.match(html, /zone-rear/);
  assert.match(html, /character-canvas/);
  assert.match(html, /character-3d\.js/);
  assert.match(html, /autonomy-behaviors\.js/);
  assert.doesNotMatch(html, /class="tether"/);
  assert.equal(fs.existsSync(path.join(root, 'src/assets/male.png')), true);
  assert.equal(fs.existsSync(path.join(root, 'src/assets/female.png')), true);
  for (const asset of [
    'male-side.png', 'male-side-right.png', 'male-back.png', 'male-sit.png',
    'female-side.png', 'female-side-right.png', 'female-back.png', 'female-sit.png',
  ]) {
    assert.equal(fs.existsSync(path.join(root, 'src/assets', asset)), true, `missing ${asset}`);
  }
  assert.equal((html.match(/data-joint=/g) || []).length, 14);
});

test('renderer supports momentum, post-impact choices, props, and reminders', () => {
  const source = fs.readFileSync(path.join(root, 'src/renderer.js'), 'utf8');
  for (const feature of ['releaseDrag', 'decideNext', "'exit-left'", "'foam-blaster'", 'parseReminder']) {
    assert.ok(source.includes(feature), `missing ${feature}`);
  }
});

test('autonomy catalog contains fifty distinct harmless physical behaviors', () => {
  const { BEHAVIORS } = require('../src/autonomy-behaviors.js');
  assert.equal(BEHAVIORS.length, 50);
  assert.equal(new Set(BEHAVIORS.map((behavior) => behavior.id)).size, 50);
  assert.ok(BEHAVIORS.some((behavior) => behavior.action === 'ledge'));
  assert.ok(BEHAVIORS.some((behavior) => behavior.action === 'ceiling-crawl'));
  assert.ok(BEHAVIORS.some((behavior) => behavior.action === 'getup-practice'));
  const forbidden = /download|click|type|wallpaper|open-app|shell|delete/i;
  assert.ok(BEHAVIORS.every((behavior) => !forbidden.test(behavior.action)));
});

test('high-detail articulated coat occludes internal hip pivots during gait', () => {
  const source = fs.readFileSync(path.join(root, 'src/character-3d.js'), 'utf8');
  assert.match(source, /waistGuard/);
  assert.match(source, /hipPivotsVisible: false/);
  assert.match(source, /highDetail: true/);
  assert.match(source, /viewBlend/);
});

test('view selection keeps one detailed silhouette while preserving turn perspective', () => {
  const { viewBlend } = require('../src/character-3d.js');
  const turn = viewBlend(37);
  assert.equal(turn.from, 'front');
  assert.equal(turn.to, 'side-right');
  assert.ok(turn.mix > 0.2 && turn.mix < 0.8);
  assert.equal(turn.dominant, 'front');
  assert.ok(turn.perspectiveScale < 1 && turn.perspectiveScale > 0.89);
  assert.equal(viewBlend(179).to, 'back');
  assert.equal(viewBlend(-179).from, 'back');
});
