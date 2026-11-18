// #2120: neighbours' window routines (src/windowschedule.js): deterministic per window, a plausible share lit per hour,
// bounded colours and TV flicker, soft switching. node --test tools/windowscheduletest.mjs
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs';
import { windowHabit, windowLevel, windowRgb, tvOn, tvFlicker } from '../src/windowschedule.js';
import { WINDOW_SCHEDULE as W } from '../src/config.js';
const keys = Array.from({ length: 4000 }, (_, i) => `${(i % 97) * 3.1 - 140},${1.55 + (i % 7) * 3},${Math.floor(i / 97) * 2.3 - 60}`);
const habits = keys.map(k => windowHabit(k));
const share = (hour) => habits.reduce((s, h) => s + (windowLevel(h, hour) > 0.5), 0) / habits.length;
test('the same window key always gets the same habit; different keys differ', () => {
  assert.deepEqual(windowHabit(keys[5]), windowHabit(keys[5]));
  assert.deepEqual(windowHabit('Hus A:s:2:4.5'), windowHabit('Hus A:s:2:4.5'));
  assert.equal(new Set(habits.map(h => h.on)).size > 3900, true);
  assert(!/Math\.random/.test(readFileSync('src/windowschedule.js', 'utf8')));
});
test('share lit per hour: few in the afternoon, most in the evening, few after midnight, a handful of night owls', () => {
  const s = Object.fromEntries([12, 16, 17, 18, 20, 21, 22, 23, 0, 1, 2, 4, 6.5].map(h => [h, share(h)]));
  console.log(Object.entries(s).map(([h, v]) => `${h}:${(v * 100).toFixed(0)}%`).join(' '));
  assert(s[12] < 0.02, 'midday dark'); assert(s[16] > 0.03 && s[16] < 0.2, 'early ones at 16');
  assert(s[17] > s[16] && s[17] < 0.35, 'some at 17');
  for (const h of [20, 21]) assert(s[h] > 0.6 && s[h] < 0.9, `most at ${h}`);
  assert(s[23] > 0.25 && s[23] < s[21], 'fewer at 23');
  assert(s[1] < 0.2, 'most off after midnight'); assert(s[2] > 0.01 && s[2] < 0.1, 'a few night owls at 2');
  assert(s[4] < s[2]); assert(s[6.5] > 0.05 && s[6.5] < 0.4, 'morning risers');
  for (const h of habits) assert(h.off - h.on >= W.minLit - 1e-9);
});
test('switching is soft: the level ramps over the fade and stays within 0…1', () => {
  const h = habits.find(x => x.home && !x.morning);
  const mid = windowLevel(h, h.on), a = windowLevel(h, h.on - W.fade / 2 - 0.01), b = windowLevel(h, h.on + W.fade / 2 + 0.01);
  assert.equal(a, 0); assert.equal(b, 1); assert(mid > 0.3 && mid < 0.7);
  for (const x of habits.slice(0, 300)) for (let t = 0; t < 24; t += 0.05) { const v = windowLevel(x, t); assert(v >= 0 && v <= 1); }
  for (const x of habits.filter(x => !x.home)) assert.equal(windowLevel(x, 20), 0);
});
test('colours vary but stay bounded; TVs are rare, blue, evening-only and flicker within the depth', () => {
  const rgbs = habits.map(h => h.rgb);
  for (const c of rgbs) for (const v of c) assert(v >= 0 && v <= 1);
  const blueish = rgbs.filter(c => c[2] > 0.85).length / rgbs.length, warm = rgbs.filter(c => c[2] < 0.55).length / rgbs.length;
  assert(blueish > 0.1 && blueish < 0.3, 'cool share'); assert(warm > 0.3 && warm < 0.6, 'warm share');
  const tvs = habits.filter(h => h.tv), tvShare = tvs.length / habits.length;
  assert(tvShare > 0.05 && tvShare < 0.15, 'TV share ' + tvShare);
  for (const h of tvs.slice(0, 100)) {
    assert(!tvOn(h, 15)); assert.deepEqual(windowRgb(h, 15), h.rgb);
    for (let t = 0; t < 30; t += 0.07) { const f = tvFlicker(h, t); assert(f >= 1 - W.tv.depth - 1e-9 && f <= 1); }
    assert.equal(tvFlicker(h, 12.34), tvFlicker(h, 12.34));
  }
  const on = tvs.filter(h => tvOn(h, 21)); assert(on.length > tvs.length * 0.5); for (const h of on) assert.deepEqual(windowRgb(h, 21), W.tv.rgb);
  const fl = tvs[0], vals = new Set(); for (let t = 0; t < 20; t += 0.1) vals.add(tvFlicker(fl, t).toFixed(2)); assert(vals.size > 10, 'it flickers');
});
test('surroundings uses the schedule for the window lights without new materials or lights', () => {
  const src = readFileSync('src/surroundings.js', 'utf8'), fn = src.slice(src.indexOf('export function buildWindowLights'), src.indexOf('/** Horizontal strip'));
  assert(/windowHabit\(/.test(fn) && /windowLevel\(/.test(fn) && /tvFlicker\(/.test(fn));
  assert.equal((fn.match(/new THREE\.(\w+Material|InstancedMesh|\w*Light)\(/g) ?? []).length, 2, 'only the existing window material and instanced mesh');
  assert(!/onBeforeCompile/.test(fn));
});
