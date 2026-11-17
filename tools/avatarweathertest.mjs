// #2018: the wet / snow state machine, headless. node --test tools/avatarweathertest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { newWet, stepWet, falling } from '../src/avatarweather.js';
import { AVATAR_WET as W } from '../src/config.js';

const run = (s, secs, env, dt = 1) => { for (let t = 0; t < secs; t += dt) stepWet(s, dt, env); return s; };

test('#2018 outdoors in rain the clothes soak gradually to full and stay in 0..1', () => {
  const s = newWet();
  run(s, 20, { rain: 1, outdoors: true });
  assert(s.wet > 0.15 && s.wet < 0.35, `${s.wet}`);
  run(s, 600, { rain: 1, outdoors: true });
  assert.equal(s.wet, 1); assert.equal(s.snow, 0);
});

test('#2018 stronger rain soaks faster; indoors rain does nothing', () => {
  const a = run(newWet(), 30, { rain: 0.3, outdoors: true }), b = run(newWet(), 30, { rain: 1, outdoors: true }), c = run(newWet(), 300, { rain: 1, outdoors: false });
  assert(b.wet > a.wet * 2); assert.equal(c.wet, 0);
});

test('#2018 snowfall gathers a layer outdoors, not indoors, and it holds in frost but thaws above zero', () => {
  const s = run(newWet(), 60, { snow: 1, outdoors: true, temp: -3 });
  assert(s.snow > 0.4 && s.snow < 0.8, `${s.snow}`);
  const held = s.snow; run(s, 600, { outdoors: true, temp: -3 });
  assert.equal(s.snow, held, 'frost keeps it');
  run(s, 600, { outdoors: true, temp: 3 }); assert(s.snow < held);
  assert.equal(run(newWet(), 300, { snow: 1, outdoors: false }).snow, 0);
});

test('#2018 coming inside: snow melts (wetting a little) and wet clothes dry on a timescale of minutes', () => {
  const s = run(newWet(), 200, { snow: 1, outdoors: true, temp: -2 });
  assert.equal(s.snow, 1);
  run(s, 30, { outdoors: false }); assert(s.snow < 1 && s.wet > 0, `${s.snow} ${s.wet}`);
  run(s, 400, { outdoors: false }); assert.equal(s.snow, 0); assert.equal(s.wet, 0, 'dry again');
  const w = run(newWet(), 200, { rain: 1, outdoors: true }); assert.equal(w.wet, 1);
  run(w, 150, { outdoors: false }); assert(w.wet > 0.3 && w.wet < 0.7, `${w.wet}`);
  run(w, 200, { outdoors: false }); assert.equal(w.wet, 0);
});

test('#2018 outdoors without rain drying is slower than indoors', () => {
  const o = run(newWet(), 600, { rain: 1, outdoors: true }); const i = { ...o };
  run(o, 300, { outdoors: true }); run(i, 300, { outdoors: false });
  assert(o.wet > i.wet);
});

test('#2018 a long gap catches up at most maxGap, negative or NaN steps do nothing, falling() maps the kinds', () => {
  const s = stepWet(newWet(), 1e9, { rain: 1, outdoors: true }); assert(s.wet > 0 && s.wet <= 1);
  const t = newWet(); stepWet(t, -5, { rain: 1, outdoors: true }); stepWet(t, NaN, { rain: 1, outdoors: true }); assert.deepEqual(t, { wet: 0, snow: 0 });
  assert.deepEqual(falling(0.8, 'snow'), { rain: 0, snow: 0.8 });
  assert.deepEqual(falling(0.8, 'rain'), { rain: 0.8, snow: 0 });
  assert.equal(falling(0.8, 'hail').rain, 0.8 * W.hail);
  assert.deepEqual(falling(0.8, null), { rain: 0, snow: 0 });
});
