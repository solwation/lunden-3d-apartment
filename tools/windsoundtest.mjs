// #2177: node --test tools/windsoundtest.mjs  (the outdoor wind sound's pure helper: wind strength, gust, season, trees, indoors →
// gain / filter Hz / Q / whistle mix; monotone in the wind, summer rustle vs winter whistle, indoor attenuation, the open window).
import test from 'node:test';
import assert from 'node:assert/strict';
const { WIND_SOUND: S } = await import('../src/config.js');
const W = await import('../src/windsound.js');

const base = { gust: 0.5, leaves: 1, near: 0, indoors: false };
const speeds = [0, 1, 2, 4, 7, 10, 14, 20];
const mono = (key, args = {}) => { let prev = -Infinity; for (const speed of speeds) { const v = W.windSoundParams({ ...base, ...args, speed })[key]; assert.ok(v >= prev - 1e-12, `${key} falls at ${speed} m/s`); prev = v; } };

test('body gain, low-pass frequency and Q rise monotonically with the wind; calm is nearly silent', () => {
  for (const k of ['gain', 'lpHz', 'lpQ']) mono(k);
  const calm = W.windSoundParams({ ...base, speed: 0 }), storm = W.windSoundParams({ ...base, speed: 20 });
  assert.ok(calm.gain < 0.03 && storm.gain > 0.15 && storm.lpHz > 3 * calm.lpHz, JSON.stringify([calm, storm]));
  assert.ok(storm.lpQ > 5 && W.windSoundParams({ ...base, speed: 3 }).lpQ < 2, 'it howls (high Q) only in strong wind');
});

test('gusts: a stronger sweep is louder; the sweep is deeper in strong wind and stays 0…1', () => {
  const lo = W.windSoundParams({ ...base, speed: 6, gust: 0 }).gain, hi = W.windSoundParams({ ...base, speed: 6, gust: 1 }).gain;
  assert.ok(hi > lo * 1.4);
  const range = (p) => { let a = 1, b = 0; for (let t = 0; t < 600; t += 0.5) { const g = W.gustAt(t, p); assert.ok(g >= 0 && g <= 1); a = Math.min(a, g); b = Math.max(b, g); } return b - a; };
  assert.ok(range(0.7) > range(0.05) * 1.5 && range(0.7) > 0.3);
});

test('season and trees: summer leaves rustle high and broad near trees, bare branches whistle narrow and lower; no trees, no rustle', () => {
  const sp = 7, summer = W.windSoundParams({ ...base, speed: sp, leaves: 1, near: 1 }), winter = W.windSoundParams({ ...base, speed: sp, leaves: 0, near: 1 });
  assert.ok(summer.bandGain > 0.01 && winter.bandGain > 0.01);
  assert.ok(summer.bandHz > winter.bandHz && winter.bandQ > 2 * summer.bandQ, JSON.stringify([summer, winter]));
  assert.equal(W.windSoundParams({ ...base, speed: sp, leaves: 1, near: 0 }).bandGain, 0);
  assert.ok(W.windSoundParams({ ...base, speed: sp, leaves: 0, near: 0 }).bandGain > 0, 'bare branches whistle a little at a distance too');
  mono('bandGain', { leaves: 1, near: 1 }); mono('bandGain', { leaves: 0, near: 0.5 });
  assert.ok(W.windSoundParams({ ...base, speed: 0, leaves: 1, near: 1 }).bandGain === 0 || W.windSoundParams({ ...base, speed: 0, leaves: 1, near: 1 }).bandGain < 1e-3, 'no rustle in a dead calm');
});

test('indoors: much quieter, dulled below the ceiling, rustle/whistle nearly gone; monotone still', () => {
  for (const speed of [2, 7, 14]) for (const leaves of [0, 1]) {
    const o = W.windSoundParams({ ...base, speed, leaves, near: 1 }), i = W.windSoundParams({ ...base, speed, leaves, near: 1, indoors: true });
    assert.ok(i.gain <= o.gain * S.indoor.gain + 1e-12 && i.lpHz <= S.indoor.hz && i.bandGain <= o.bandGain * S.indoor.band + 1e-12);
  }
  mono('gain', { indoors: true });
});

test('treeNearness: 1 at a tree, 0 at or beyond the range, nearest wins', () => {
  const feet = [{ x: 100, z: 100 }, { x: 3, z: 4 }];
  assert.equal(W.treeNearness(feet, 3, 4), 1);
  assert.ok(Math.abs(W.treeNearness(feet, 0, 0) - (1 - 5 / S.near)) < 1e-9);
  assert.equal(W.treeNearness(feet, -50, -50), 0);
  assert.equal(W.treeNearness([], 0, 0), 0);
});

test('open window: level and brightness rise with the wind; the old fixed sound (0.16 / 520 Hz) is a light breeze', () => {
  let g = -1, f = -1;
  for (let p = 0; p <= 1.0001; p += 0.1) { const w = W.windowWindParams(p); assert.ok(w.gain > g && w.lpHz > f); g = w.gain; f = w.lpHz; }
  const b = W.windowWindParams(0.35);
  assert.ok(Math.abs(b.gain - 0.16) < 0.01 && Math.abs(b.lpHz - 520) < 15);
  assert.deepEqual(W.windowWindParams(-1), W.windowWindParams(0)); // clamped
});

test('every output is finite for odd input', () => {
  for (const speed of [0, 0.0001, 100]) for (const gust of [0, 1]) for (const indoors of [false, true]) {
    const p = W.windSoundParams({ speed, gust, leaves: 0.5, near: 0.5, indoors });
    for (const v of Object.values(p)) assert.ok(Number.isFinite(v) && v >= 0);
  }
});
