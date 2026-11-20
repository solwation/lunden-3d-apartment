// #2188: the ponies' sound schedule and cold-weather breath, headless. node --test tools/ponysoundtest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { newPonyVoice, stepPonyVoice, stepPonyBreath, breathCold } from '../src/ponysound.js';
import { PONY_VOICE as V } from '../src/config.js';

const seeded = (s = 7) => () => (s = s * 16807 % 2147483647) / 2147483647;
const run = (state, secs, { dist = 8, cold = 0, rnd = seeded(), v = newPonyVoice(rnd) } = {}) => {
  const n = {}; stepPonyVoice(v, 0.05, state, dist, cold, rnd); // enters the state
  for (let t = 0; t < secs; t += 0.05) { const e = stepPonyVoice(v, 0.05, state, dist, cold, rnd); if (e) n[e] = (n[e] ?? 0) + 1; }
  return n;
};

test('#2188 breath shows only below the threshold: none when warm, full in frost, snow keeps a minimum', () => {
  assert.equal(breathCold(V.breath.warm), 0);
  assert.equal(breathCold(20, 'rain'), 0);
  assert.equal(breathCold(V.breath.cold - 3), 1);
  const mid = breathCold(4); assert(mid > 0 && mid < 1, `${mid}`);
  assert(breathCold(5, 'snow') >= V.breath.snowMin);
});

test('#2188 exhales: none while warm, about every few seconds in the cold, a snort is an immediate bigger one', () => {
  const warm = {}; let n = 0; for (let t = 0; t < 60; t += 0.05) n += stepPonyBreath(warm, 0.05, 'idle', 0) > 0 ? 1 : 0;
  assert.equal(n, 0);
  const b = {}; let c = 0; for (let t = 0; t < 60; t += 0.05) c += stepPonyBreath(b, 0.05, 'idle', 1) > 0 ? 1 : 0;
  assert(c >= 15 && c <= 24, `${c} exhales a minute at rest`);
  const walk = {}; let w = 0; for (let t = 0; t < 60; t += 0.05) w += stepPonyBreath(walk, 0.05, 'walk', 1) > 0 ? 1 : 0;
  assert(w > c, 'faster while walking');
  assert(stepPonyBreath({ t: 5 }, 0.05, 'idle', 1, true) > 1, 'a snort puff is bigger than an ordinary exhale');
  assert.equal(stepPonyBreath({ t: 5 }, 0.05, 'idle', 0, true), 0, 'but not when it is warm');
});

test('#2188 walking makes hoof beats at the stride rate, grazing tears grass, standing shuffles and snorts now and then', () => {
  const walk = run('walk', 30); assert(walk.step >= 45 && walk.step <= 62, `${walk.step} steps in 30 s`); assert.deepEqual(Object.keys(walk), ['step']);
  const graze = run('graze', 60); assert(graze.tear >= 25 && graze.tear <= 55, `${graze.tear}`);
  const idle = run('idle', 600); assert(idle.snort >= 5 && idle.shuffle >= 15, JSON.stringify(idle));
});

test('#2188 a cold day makes snorts more frequent; nothing is scheduled far away or while petted', () => {
  let warm = 0, cold = 0; for (let k = 1; k <= 8; k++) { warm += run('idle', 600, { rnd: seeded(k) }).snort ?? 0; cold += run('idle', 600, { rnd: seeded(k), cold: 1 }).snort ?? 0; }
  assert(cold > warm, `${cold} vs ${warm}`);
  assert.deepEqual(run('idle', 300, { dist: V.range + 1 }), {});
  assert.deepEqual(run('pet', 60), {});
});

test('#2188 a pony that looks up at a visitor nickers once, then not again within the cooldown', () => {
  const rnd = seeded(), v = newPonyVoice(rnd);
  stepPonyVoice(v, 0.05, 'graze', 6, 0, rnd);
  assert.equal(stepPonyVoice(v, 0.05, 'watch', 6, 0, rnd), 'nicker');
  stepPonyVoice(v, 0.05, 'graze', 6, 0, rnd);
  assert.notEqual(stepPonyVoice(v, 0.05, 'watch', 6, 0, rnd), 'nicker', 'cooldown');
  const far = newPonyVoice(rnd); stepPonyVoice(far, 0.05, 'graze', 30, 0, rnd);
  assert.notEqual(stepPonyVoice(far, 0.05, 'watch', 30, 0, rnd), 'nicker', 'too far to greet');
});

test('#2188 a far whinny becomes a soft nicker when the visitor is at the fence', () => {
  const rnd = () => 0, v = newPonyVoice(rnd); stepPonyVoice(v, 0.05, 'idle', 2, 0, rnd);
  const seen = new Set(); for (let t = 0; t < 400; t += 0.1) { const e = stepPonyVoice(v, 0.1, 'idle', 2, 0, rnd); if (e) seen.add(e); }
  assert(!seen.has('whinny') && seen.has('nicker'), [...seen].join());
});
