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
  assert.match(html, /privacy-blur/);
  assert.match(html, /character-canvas/);
  assert.match(html, /vendor\/three\.min\.js/);
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

test('three-dimensional coat occludes internal hip pivots during gait', () => {
  const source = fs.readFileSync(path.join(root, 'src/character-3d.js'), 'utf8');
  assert.match(source, /clothes-coat-hem/);
  assert.match(source, /this\.base\.hipL\.visible = false/);
  assert.match(source, /this\.clothes\[name\]\.visible = false/);
  assert.match(source, /this\.root\.rotation\.y = yaw/);
});
