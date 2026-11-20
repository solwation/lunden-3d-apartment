// #2196: node --test tools/corvidtest.mjs — corvids all year: the species/season helper, the ground gaits (a walking crow strides at the
// configured speed inside its patch and pecks, a magpie hops and flicks its tail), snow-independence of the count, the call builder
// and its rate, determinism, and the cat hooks (ground birds / perched birds).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CORVIDS as K, BIRD_SONG as S } from '../src/config.js';
import { CorvidFlock, CORVID_KINDS, corvidCount, corvidCapacity, corvidGait, corvidLife } from '../src/corvids.js';
import { corvidCall, corvidRate } from '../src/birdsong.js';
import { corvidGeometry } from '../src/gullmodel.js';

const patch = (x, z) => ({ kind: 'ground', x, z, y: 0, surface: 'grass', ok: (px, pz) => Math.hypot(px - x, pz - z) < 6, yAt: () => 0, spots: [0, 1, 2, 3, 4, 5].map((i) => ({ x: x + Math.sin(i) * 1.2, y: 0, z: z + Math.cos(i) * 1.2, yaw: i })) });
const roofGroup = { kind: 'roof', x: 30, z: 0, y: 10, spots: [0, 1, 2, 3, 4, 5].map((i) => ({ x: 30 + i * 0.4, y: 10, z: 0, yaw: 0 })) };
const make = (kind, n = 3, seed = 5) => { const f = new CorvidFlock({ kind, groups: [patch(0, 0), roofGroup], n, seed }); if (f.group.kind !== 'ground') { f.assign(f.groups.find((g) => g.kind === 'ground')); for (const b of f.birds) Object.assign(b, { x: b.spot.x, y: 0, z: b.spot.z }), f.sitDown(b); f.settle(); } return f; }; // (the start group is seeded: pin it to the lawn)

test('species and season give counts and gaits', () => {
  assert.deepEqual(CORVID_KINDS.sort(), ['crow', 'jackdaw', 'magpie']);
  for (let m = 1; m <= 12; m++) for (const k of CORVID_KINDS) for (const home of ['gården', 'parken']) {
    const n = corvidCount(k, home, m); assert.ok(Number.isInteger(n) && n >= 1 && n <= corvidCapacity(k, home), `${k} ${home} ${m}`);
  }
  assert.ok(corvidCount('jackdaw', 'gården', 1) > corvidCount('jackdaw', 'gården', 5), 'jackdaws gather in winter and pair off nesting');
  assert.equal(corvidCount('crow', 'gården', 1), corvidCount('crow', 'gården', 7), 'crows stay a pair all year');
  assert.equal(corvidGait('crow'), 'walk'); assert.equal(corvidGait('jackdaw'), 'walk'); assert.equal(corvidGait('magpie'), 'hop');
  assert.equal(corvidCount('magpie', 'gården', 7, true), 0, 'the phone profile drops the magpie');
  assert.ok(corvidCount('jackdaw', 'parken', 1, true) === 0 && corvidCount('jackdaw', 'gården', 1, true) >= 1 && corvidCount('jackdaw', 'gården', 1, true) < corvidCount('jackdaw', 'gården', 1), 'phones: courtyard only, fewer');
  assert.equal(corvidCount('nope', 'gården', 1), 0);
});

test('the count does not depend on snow: there is no snow input, only the month', () => {
  assert.equal(corvidCount.length >= 2, true);
  assert.ok(corvidCount('crow', 'gården', 12) > 0 && corvidCount('magpie', 'parken', 2) > 0, 'winter months have all species');
});

test('a crow strides on the ground at walk speed inside its patch and pecks', () => {
  const f = make('crow'); const g = f.group;
  assert.equal(g.kind, 'ground', 'starts on a ground patch');
  let maxStep = 0, pecks = 0, moved = 0, rocked = false; const prev = f.birds.map((b) => [b.x, b.z]);
  for (let t = 0; t < 120; t += 1 / 30) {
    f.dwell = 1e9; f.step(1 / 30);
    f.birds.forEach((b, i) => {
      const d = Math.hypot(b.x - prev[i][0], b.z - prev[i][1]); maxStep = Math.max(maxStep, d / (1 / 30)); moved += d; prev[i] = [b.x, b.z];
      assert.ok(g.ok(b.x, b.z) || Math.hypot(b.x - g.x, b.z - g.z) < 7, 'stays on the patch');
      assert.ok(Number.isFinite(b.x + b.y + b.z + b.pitch + b.yaw));
      if (b.peck > 0) pecks++; if (Math.abs(b.pitch) > 0.05 && !(b.peck > 0)) rocked = true;
    });
  }
  assert.ok(maxStep <= K.walkSpeed + 1e-6, `walk speed ${maxStep}`);
  assert.ok(moved > 3, `walked ${moved}`); assert.ok(pecks > 0, 'pecks'); assert.ok(rocked, 'body rocks with the steps');
});

test('a magpie hops and flicks its tail', () => {
  const f = make('magpie', 2, 9); let hops = 0, flicks = 0, minPitch = 0;
  for (let t = 0; t < 90; t += 1 / 30) { f.dwell = 1e9; f.step(1 / 30); for (const b of f.birds) { if (b.hop) hops++; if (b.pitch < -0.1 && !b.hop) flicks++; minPitch = Math.min(minPitch, b.pitch); } }
  assert.ok(hops > 0, 'hops'); assert.ok(flicks > 0, 'tail flick'); assert.ok(minPitch >= -K.flick - 1e-9, 'flick bounded');
});

test('they leave a threat for the roof, ground/perched hooks follow, and the same seed flies the same', () => {
  const run = () => { const f = make('jackdaw', 4, 3); f.dwell = 1e9; for (let t = 0; t < 5; t += 1 / 30) f.step(1 / 30); return f; };
  const f = run(), g = run();
  assert.ok(f.groundBirds().length > 0 && f.perchedBirds().length === 0);
  assert.deepEqual(f.birds.map((b) => [b.x, b.y, b.z]), g.birds.map((b) => [b.x, b.y, b.z]), 'deterministic');
  const eye = { x: 0, y: 1.6, z: 0 };
  for (let t = 0; t < 40; t += 1 / 30) f.step(1 / 30, [eye]);
  assert.ok(f.flushes >= 1 && f.group.kind === 'roof', 'flushed onto a roof');
  for (let t = 0; t < 30; t += 1 / 30) { f.dwell = 1e9; f.step(1 / 30, []); }
  assert.ok(f.perchedBirds().length > 0, 'perched birds are listed for the cats');
});

test('calls: three species, shaped like the other bird calls, the rate is daytime all year and thinner in rain', () => {
  let s = 1; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (const sp of CORVID_KINDS) {
    const c = corvidCall(sp, rnd);
    assert.equal(c.species, sp); assert.ok(c.notes.length >= 1 && c.dur > 0.05 && c.dur < 3, `${sp} ${c.dur}`);
    for (const n of c.notes) assert.ok(n.f0 > 300 && n.f1 > 300 && n.d > 0 && n.g > 0 && n.g <= 1);
  }
  assert.ok(corvidCall('magpie', rnd).notes.length >= 5, 'the magpie chatters');
  assert.ok(corvidCall('crow', rnd).notes[0].f0 < corvidCall('jackdaw', rnd).notes[0].f0, 'a crow is lower than a jackdaw');
  assert.equal(corvidRate({ hour: 2, rise: 6, set: 18 }), 0);
  const dry = corvidRate({ hour: 12 }), wet = corvidRate({ hour: 12, rain: 1 });
  assert.ok(dry === S.corvid && wet < dry && wet > 0);
  assert.ok(S.maxVoices === 2, 'the shared voice cap is unchanged');
});

test('corvid geometry matches the shared shader layout, one geometry per species', () => {
  for (const k of CORVID_KINDS) {
    const g = corvidGeometry(k), n = g.attributes.position.count;
    for (const a of ['normal', 'color', 'aWing']) assert.equal(g.attributes[a].count, n, `${k} ${a}`);
    assert.ok(n / 3 < 300, `${k} ${n / 3} triangles`); assert.equal(corvidGeometry(k), g, 'cached');
  }
  const col = (k) => { const c = corvidGeometry(k).attributes.color; let r = 0; for (let i = 0; i < c.count; i++) r += c.getX(i); return r / c.count; };
  assert.ok(col('crow') > col('jackdaw'), 'the hooded crow is paler than the jackdaw');
  assert.equal(Object.keys(corvidLife('crow').flush).length, 4);
});
