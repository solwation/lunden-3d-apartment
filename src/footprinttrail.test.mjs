// #1773: footprints in the snow without three.js: placement and stride, alternating feet, fading (gone after FOOTPRINTS.life),
// the bounded store, the cats' snow-day outings and the room's history.   node --test src/footprinttrail.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOOTPRINTS as F, OUTDOOR_CATS } from './config.js';
import { Stepper, PrintStore, SHOE, PAW, catOut, netTrails } from './footprinttrail.js';

const walk = (st, from, to, speed, dt = 1 / 60, t0 = 0) => { // a straight walk sampled every dt s
  const out = [], d = Math.hypot(to[0] - from[0], to[1] - from[1]), n = Math.ceil(d / speed / dt);
  for (let k = 0; k <= n; k++) { const f = k / n; st.feed(from[0] + (to[0] - from[0]) * f, 0, from[1] + (to[1] - from[1]) * f, t0 + k * dt, out); }
  return out;
};

test('shoe prints: one every step m along the way walked, alternately right and left of the line, facing the way, dated', () => {
  const p = walk(new Stepper(SHOE), [0, 0], [0, -10], 1.4); // north 10 m
  assert.equal(p.length, Math.floor(10 / F.shoe.step));
  for (let i = 1; i < p.length; i++) {
    assert.ok(Math.abs((p[i - 1].z - p[i].z) - F.shoe.step) < 1e-6, 'stride');
    assert.equal(p[i].foot, -p[i - 1].foot, 'alternating');
    assert.ok(p[i].t > p[i - 1].t);
  }
  assert.ok(p.every((q) => Math.abs(Math.abs(q.x) - F.shoe.side) < 1e-6 && Math.sign(q.x) === q.foot), 'right foot east of a walk north');
  assert.ok(p.every((q) => Math.abs(q.yaw) < 1e-9 && q.kind === SHOE), 'toes north (yaw 0)');
  assert.ok(Math.abs(p[0].t - F.shoe.step / 1.4) < 0.02, 'dated by when the walker was there');
  const east = walk(new Stepper(SHOE), [0, 0], [5, 0], 1.4); // toes east: (-sin yaw, -cos yaw) = (1, 0)
  assert.ok(east.every((q) => Math.abs(-Math.sin(q.yaw) - 1) < 1e-9 && Math.abs(Math.cos(q.yaw)) < 1e-9));
});

test('the stride does not depend on how often the walker is sampled; a jump starts a new line; standing still makes nothing', () => {
  const a = walk(new Stepper(SHOE), [0, 0], [7, 7], 1.4, 1 / 60), b = walk(new Stepper(SHOE), [0, 0], [7, 7], 1.4, 0.7);
  assert.equal(a.length, b.length);
  a.forEach((q, i) => assert.ok(Math.hypot(q.x - b[i].x, q.z - b[i].z) < 1e-6));
  const st = new Stepper(SHOE), out = [];
  st.feed(0, 0, 0, 0, out); st.feed(F.shoe.jump + 1, 0, 0, 1, out); st.feed(F.shoe.jump + 1, 0, 0, 5, out);
  assert.equal(out.length, 0, 'a teleport and standing still: no prints');
  const paws = walk(new Stepper(PAW), [0, 0], [3, 0], 0.42);
  assert.equal(paws.length, Math.floor(3 / F.paw.step));
  assert.ok(paws.every((q) => q.kind === PAW && Math.abs(Math.abs(q.z) - F.paw.side) < 1e-6), 'paws close to the line');
});

test('fading: full when made, half way at life/2, gone at life (30 minutes); compacted away; the store is bounded', () => {
  assert.equal(F.life, 30 * 60);
  const S = new PrintStore(100);
  const i = S.add({ x: 0, y: 0, z: 0, yaw: 0, foot: 1, kind: SHOE, t: 1000 });
  assert.equal(S.fade(i, 1000), 1);
  assert.ok(Math.abs(S.fade(i, 1000 + F.life / 2) - 0.5) < 1e-9);
  assert.equal(S.fade(i, 1000 + F.life), 0);
  assert.equal(S.live(1000 + F.life - 1), 1); assert.equal(S.live(1000 + F.life), 0);
  for (let k = 0; k < 250; k++) S.add({ x: k, y: 0, z: 0, yaw: 0, foot: 1, kind: SHOE, t: 2000 + k });
  assert.equal(S.count, 100, 'at most max');
  assert.equal(Math.min(...S.t), 2150, 'the oldest made way');
  S.compact(2000 + 160 + F.life);
  assert.equal(S.count, 89, 'gone ones compacted away'); assert.equal(Math.min(...S.t.slice(0, S.count)), 2161);
  assert.equal(S.nearest(240, 3, 2000 + 160 + F.life), 3);
  S.replace([{ x: 0, y: 0, z: 0, yaw: 0, foot: 1, kind: PAW, t: 5 }]); assert.equal(S.count, 1);
  assert.equal(F.max, 2000);
});

test('snow-day outings: some windows, short, a pure function of the clock; personalities change how often', () => {
  const o = F.catOuting, spec = OUTDOOR_CATS.cats[0];
  let outS = 0; const N = 200 * o.slot;
  for (let t = 0; t < N; t += 10) if (catOut(spec, 0, t)) { outS += 10; assert.ok(t % o.slot < o.out, 'only early in a window'); }
  const share = outS / N;
  assert.ok(share > 0.05 && share < 0.3, `out a little of the time: ${share}`);
  assert.equal(catOut(spec, 0, 12345), catOut(spec, 0, 12345));
  const lazy = { traits: { play: 0, curious: 0, lazy: 1 } }, keen = { traits: { play: 1, curious: 1, lazy: 0 } };
  let l = 0, k = 0; for (let s = 0; s < 400; s++) { l += catOut(lazy, 1, s * o.slot); k += catOut(keen, 1, s * o.slot); }
  assert.ok(k > l, `the playful, curious cat goes out more than the lazy one (${k} > ${l})`);
});

test('the room history becomes paths on our clock, ordered, bad rows and old points dropped', () => {
  const tr = netTrails({ k: [[2, 1, 0, 1, 30], [1, 0, 0, 0, 100], [1, 1.2, 0, 0, 90], [2, 2, 0, 1, 20], ['x', 0, 0, 0, 0], [3, 0, 0, 0, F.life + 5], [4, 0, 0]] }, 5000);
  assert.deepEqual(tr.map((p) => p.key).sort(), [1, 2]);
  const one = tr.find((p) => p.key === 1);
  assert.deepEqual(one.pts.map((q) => q.t), [4900, 4910]);
  const prints = []; const st = new Stepper(SHOE); for (const q of tr.find((p) => p.key === 2).pts) st.feed(q.x, q.y, q.z, q.t, prints);
  assert.equal(prints.length, 1, 'prints between the sparse points');
  assert.deepEqual(netTrails(null, 0), []);
});
