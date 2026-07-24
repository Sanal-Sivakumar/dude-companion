(function exposeAutonomy(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DudeAutonomy = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function buildAutonomy() {
  'use strict';

  const BEHAVIORS = Object.freeze([
    { id: 'desk-patrol', label: 'desk patrol', action: 'walk' },
    { id: 'stealth-patrol', label: 'stealth patrol', action: 'sneak' },
    { id: 'window-stroll', label: 'window-top stroll', action: 'ledge' },
    { id: 'left-wall-climb', label: 'left-wall expedition', action: 'climb-left' },
    { id: 'right-wall-climb', label: 'right-wall expedition', action: 'climb-right' },
    { id: 'ceiling-crawl', label: 'ceiling commute', action: 'ceiling-crawl' },
    { id: 'ceiling-hang', label: 'upside-down thinking', action: 'hang' },
    { id: 'window-perch', label: 'window-edge perch', action: 'perch-window' },
    { id: 'dock-perch', label: 'dock-edge inspection', action: 'perch-dock' },
    { id: 'edge-peek', label: 'edge peek', action: 'edge-peek' },
    { id: 'hop', label: 'small ambitious hop', action: 'jump' },
    { id: 'landing-drill', label: 'soft-landing drill', action: 'landing-drill' },
    { id: 'cross-leg-sit', label: 'cross-legged pause', action: 'sit' },
    { id: 'nap', label: 'power-saving nap', action: 'nap' },
    { id: 'read', label: 'serious tiny reading', action: 'read', prop: 'book' },
    { id: 'laptop-work', label: 'tiny laptop shift', action: 'work', prop: 'laptop' },
    { id: 'coffee-break', label: 'coffee quality control', action: 'sit', prop: 'coffee' },
    { id: 'chair-rest', label: 'ergonomic field test', action: 'sit', prop: 'chair' },
    { id: 'headphones', label: 'private concert', action: 'sit', prop: 'headphones' },
    { id: 'dance', label: 'micro choreography', action: 'dance' },
    { id: 'stretch', label: 'joint maintenance', action: 'stretch' },
    { id: 'wave', label: 'friendly wave', action: 'wave' },
    { id: 'ponder', label: 'visible pondering', action: 'ponder' },
    { id: 'celebrate', label: 'micro victory', action: 'celebrate' },
    { id: 'skate-balance', label: 'skateboard balance', action: 'balance', prop: 'skateboard' },
    { id: 'umbrella-check', label: 'umbrella inspection', action: 'ponder', prop: 'umbrella' },
    { id: 'sword-rehearsal', label: 'cardboard heroics', action: 'balance', prop: 'sword' },
    { id: 'foam-inspection', label: 'foam-blaster audit', action: 'ponder', prop: 'foam-blaster' },
    { id: 'look-around', label: 'situational scan', action: 'look' },
    { id: 'exit-left', label: 'dramatic exit left', action: 'exit-left' },
    { id: 'exit-right', label: 'dramatic exit right', action: 'exit-right' },
    { id: 'greet-partner', label: 'companion diplomacy', action: 'greet' },
    { id: 'mirror-partner', label: 'mirror routine', action: 'mirror' },
    { id: 'high-five', label: 'tiny high five', action: 'high-five' },
    { id: 'race', label: 'desktop sprint', action: 'race' },
    { id: 'quiet-breathing', label: 'quiet breathing', action: 'idle' },
    { id: 'foot-tap', label: 'impatient foot tap', action: 'balance' },
    { id: 'shoulder-roll', label: 'shoulder reset', action: 'stretch' },
    { id: 'yoga', label: 'questionable yoga', action: 'balance' },
    { id: 'star-gaze', label: 'ceiling stargaze', action: 'look' },
    { id: 'cursor-dodge', label: 'cursor evasion', action: 'cursor-dodge' },
    { id: 'cursor-follow', label: 'cursor curiosity', action: 'cursor-follow' },
    { id: 'system-check', label: 'system health pose', action: 'ponder' },
    { id: 'reminder-guard', label: 'reminder guard duty', action: 'sit' },
    { id: 'read-over-shoulder', label: 'over-shoulder reading', action: 'read', prop: 'book' },
    { id: 'fake-typing', label: 'competitive typing', action: 'work', prop: 'laptop' },
    { id: 'book-balance', label: 'book balancing', action: 'balance', prop: 'book' },
    { id: 'rain-rehearsal', label: 'indoor rain rehearsal', action: 'walk', prop: 'umbrella' },
    { id: 'floor-lie-down', label: 'strategic floor time', action: 'lie' },
    { id: 'get-up-practice', label: 'hand-braced recovery drill', action: 'getup-practice' }
  ]);

  return { BEHAVIORS };
}));
