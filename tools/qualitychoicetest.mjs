// #1509: the saved graphics choice (Auto / manual level, 30/60 FPS target) vs the last auto level and URL locks.
// `node tools/qualitychoicetest.mjs` (no browser).
import assert from 'node:assert/strict';
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { Quality } = await import('../src/quality.js');
const feed = (q, dt, n) => { for (let i = 0; i < n; i++) q.update(dt); };
let n = 0; const ok = (v, m) => { assert.ok(v, m); console.log('PASS', m); n++; };

// migration: an old install only has lunden.quality
store.set('lunden.quality', '1');
let q = new Quality({ start: 3 });
ok(q.mode === 'auto' && q.level === 1 && q.autoLevel === 1 && q.target === 60, 'old lunden.quality counts as Auto at the same level (no reset)');
ok(!store.has('lunden.quality.mode') && !store.has('lunden.quality.manual'), 'migration writes no new keys');

// manual choice is saved separately and leaves the last auto level alone
q.choose(3);
ok(q.level === 3 && q.mode === 'manual' && store.get('lunden.quality') === '1' && store.get('lunden.quality.manual') === '3', 'manual level applied; lunden.quality (last auto level) untouched');
feed(q, 1 / 60, 60); feed(q, 1 / 10, 100);
ok(q.level === 3 && store.get('lunden.quality') === '1', 'Auto never steps or overwrites while manual');
q = new Quality({ start: 3 });
ok(q.mode === 'manual' && q.level === 3 && q.manualLevel === 3 && q.autoLevel === 1, 'manual choice restored after reload');

// back to Auto returns to the last auto level
q.choose('auto');
ok(q.mode === 'auto' && q.level === 1 && store.get('lunden.quality.mode') === 'auto', 'Auto resumes at the last auto level');
feed(q, 1 / 60, 60 * 40);
ok(q.level >= 2 && store.get('lunden.quality') === String(q.level) && store.get('lunden.quality.manual') === '3', 'Auto saves its own level, keeps the manual one');
q = new Quality({ start: 3 });
ok(q.mode === 'auto' && q.level === q.autoLevel, 'Auto restored after reload');

// FPS target steers Auto's thresholds
const run = (fps) => { const a = new Quality({ start: 3, remember: false }); a.target = fps; feed(a, 1 / 60, 60); feed(a, 1 / 24, 120); return a.level; };
ok(run(60) < 3 && run(30) === 3, '24 fps steps down with a 60 target but is accepted with a 30 target');
q.setTarget(30);
ok(store.get('lunden.quality.fps') === '30' && new Quality({ start: 3 }).target === 30, '30 FPS target saved and restored');
q.setTarget(60);
ok(new Quality({ start: 3 }).target === 60, '60 FPS target saved');

// URL / test / shot lock
store.clear(); store.set('lunden.quality', '2'); store.set('lunden.quality.mode', 'manual'); store.set('lunden.quality.manual', '0'); store.set('lunden.quality.fps', '30');
const snap = JSON.stringify([...store]);
const l = new Quality({ start: 1, remember: false });
ok(l.locked && l.level === 1 && l.target === 60 && l.mode === 'auto', 'lock ignores the saved choice');
ok(!l.choose(3) && !l.setTarget(30) && l.level === 1, 'lock refuses changes');
l.set(0, 'testmode');
ok(JSON.stringify([...store]) === snap, 'lock never writes the saved choices');
ok(new Quality({ start: 3 }).level === 0 && new Quality({ start: 3 }).mode === 'manual', 'saved manual choice still there after a locked visit');

// garbage
store.clear(); store.set('lunden.quality.mode', 'manual'); store.set('lunden.quality.manual', 'x'); store.set('lunden.quality', '9');
q = new Quality({ start: 3 });
ok(q.mode === 'auto' && q.level === 3, 'bad manual value falls back to Auto and a clamped level');
// #1512 Ultra: an explicit choice above Auto's range, only where `top` allows it
store.clear();
q = new Quality({ start: 3, top: 4 });
ok(q.max === 3 && q.top === 4 && q.level === 3 && q.mode === 'auto', 'Auto starts at Hög even where Ultra is allowed');
feed(q, 1 / 60, 60 * 120);
ok(q.level === 3 && q.log.every((e) => (e.to ?? 0) <= 3), 'Auto with headroom never steps or trials into Ultra');
q.choose(4);
ok(q.level === 4 && q.mode === 'manual' && store.get('lunden.quality.manual') === '4' && store.get('lunden.quality') === undefined, 'manual Ultra applied and saved apart from Auto');
ok(new Quality({ start: 3, top: 4 }).level === 4, 'manual Ultra restored after reload where allowed');
ok(new Quality({ start: 3 }).level === 3, 'saved Ultra clamps to Hög on a device without Ultra (light profile / phone)');
const noUltra = new Quality({ start: 3 }); noUltra.choose(4);
ok(noUltra.level === 3 && noUltra.top === 3, 'choosing Ultra without top stays at Hög');
q.choose('auto');
ok(q.mode === 'auto' && q.level === 3, 'back to Auto leaves Ultra for Auto\'s last level');
ok(new Quality({ start: 4, top: 4, remember: false }).level === 4 && new Quality({ start: 4, remember: false }).level === 3, 'URL pin quality=4 reaches Ultra only where allowed');
console.log(`ALL PASS (${n})`);
