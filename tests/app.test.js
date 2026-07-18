const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('main and renderer scripts parse', () => {
  for (const file of ['electron/main.js', 'electron/preload.js', 'src/renderer.js']) {
    execFileSync(process.execPath, ['--check', path.join(root, file)]);
  }
});

test('desktop overlay contains both character assets and safety UI', () => {
  const html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
  assert.match(html, /assets\/male\.png/);
  assert.match(html, /assets\/female\.png/);
  assert.match(html, /permissionDialog/);
  assert.match(html, /censor/);
  assert.equal(fs.existsSync(path.join(root, 'src/assets/male.png')), true);
  assert.equal(fs.existsSync(path.join(root, 'src/assets/female.png')), true);
});

test('renderer supports momentum, post-impact choices, props, and reminders', () => {
  const source = fs.readFileSync(path.join(root, 'src/renderer.js'), 'utf8');
  for (const feature of ['releaseDrag', 'decideNext', "'exit-left'", "'foam-blaster'", 'parseReminder']) {
    assert.ok(source.includes(feature), `missing ${feature}`);
  }
});
