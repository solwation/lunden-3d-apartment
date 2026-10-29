// #1672: node --test tools/squirrelbraintest.mjs  (the squirrels' state machine, the nut field and the winter rule; no browser)
import test from 'node:test';
import assert from 'node:assert/strict';
import { SQUIRRELS as C, SEASON } from '../src/config.js';
import { SquirrelBrain, NutField, linkTrees, winterMonth, pickNutSpot } from '../src/squirrelbrain.js';

const rng = (seed) => () => ((seed = seed * 16807 % 2147483647) / 2147483647);
const trees = () => linkTrees([[0, 0], [8, 3], [15, -2], [6, 14], [-9, 9], [22, 8]].map(([x, z]) => ({ x, z, y: 0, cy: 6, r: 3.5 })));
const ground = () => 0;
const world = (seed = 7) => {
  const rnd = rng(seed), ts = trees(), nuts = new NutField(ts, ground, () => true, rnd);
  const player = { x: 500, z: 500, lure: false, hx: 500, hz: 500 }, taken = [];
  return { rnd, ts, nuts, player, taken, env: { trees: ts, ground, walkable: () => true, nuts, player, rnd, onTake: (b) => { taken.push(b); player.lure = false; return true; } } }; // (the nut leaves the hand: the lure ends)
};
const run = (w, brains, seconds, dt = 0.1, each = null) => { for (let t = 0; t < seconds; t += dt) { w.nuts.update(dt); for (const b of brains) b.update(dt); each?.(t); } };

test('the three animals differ as the issue asks: big, white tail tip, slim and darker', () => {
  const [big, tip, slim] = C.animals;
  assert.equal(C.animals.length, 3);
  assert.ok(big.scale > tip.scale && big.scale > slim.scale, 'the big one is bigger');
  assert.ok(tip.tip && !big.tip && !slim.tip, 'only one has a white tail tip');
  assert.ok(slim.width < big.width && slim.color < big.color, 'the slim one is narrower and darker');
  assert.ok(new Set(C.animals.map((a) => a.shy)).size === 3 && new Set(C.animals.map((a) => a.ground)).size === 3, 'personalities differ');
});

test('a squirrel left alone cycles crown, hop, trunk, ground and back, and stays finite', () => {
  const w = world(), b = new SquirrelBrain(C.animals[1], w.env, 0), seen = new Set(), trs = new Set();
  run(w, [b], 900, 0.1, () => { seen.add(b.state); trs.add(b.tree); assert.ok([b.x, b.y, b.z, b.yaw, b.pitch].every(Number.isFinite)); });
  for (const s of ['perch', 'leap', 'down', 'forage', 'search', 'toTree', 'up']) assert.ok(seen.has(s), `visited ${s}`);
  assert.ok(trs.size >= 3, 'moved between several trees');
});

test('personality: the bold big one goes to the ground more than the shy slim one', () => {
  const downs = C.animals.map((spec, i) => {
    const w = world(11 + i), b = new SquirrelBrain(spec, w.env, 0); let n = 0, prev = '';
    run(w, [b], 3600, 0.1, () => { if (b.state === 'down' && prev !== 'down') n++; prev = b.state; });
    return n;
  });
  assert.ok(downs[0] > downs[1] && downs[1] > downs[2], `ground trips big > white tip > slim: ${downs}`);
});

test('nuts: at most maxNuts at once, new ones after a while, all on valid ground, expiring and respawning', () => {
  const w = world(), seen = [];
  w.nuts.setActive(true);
  let max = 0; run(w, [], 3000, 0.5, () => { max = Math.max(max, w.nuts.count); });
  assert.equal(max, C.maxNuts);
  assert.ok(w.nuts.spawned > C.maxNuts, 'new nuts appeared after the first ones expired');
  for (const s of w.nuts.slots) if (s.alive) { assert.ok(w.ts.some((t) => Math.hypot(t.x - s.x, t.z - s.z) <= C.spread + 1e-6), 'by a squirrel tree'); seen.push(s.kind); }
  const before = w.nuts.spawned, s0 = w.nuts.slots[0]; if (!s0.alive) s0.alive = true;
  w.nuts.remove(s0); assert.ok(!s0.alive);
  run(w, [], C.respawn[1] + 5, 0.5); assert.ok(w.nuts.spawned > before, 'a replacement came within the respawn window');
  assert.equal(pickNutSpot(w.ts, w.rnd, () => false), null, 'no spot where nothing is allowed');
});

test('winter: no nuts at all and nothing counts down; spring brings them back', () => {
  const w = world();
  w.nuts.setActive(true); run(w, [], 60, 0.5); assert.ok(w.nuts.count > 0);
  assert.ok(winterMonth(12) && winterMonth(1) && winterMonth(2) && !winterMonth(7) && SEASON.snowMonths.every((m) => winterMonth(m)));
  w.nuts.setActive(false); assert.equal(w.nuts.count, 0);
  const spawned = w.nuts.spawned; run(w, [], 600, 0.5); assert.equal(w.nuts.count, 0); assert.equal(w.nuts.spawned, spawned);
  w.nuts.setActive(true); run(w, [], 30, 0.5); assert.ok(w.nuts.count > 0);
});

test('a foraging squirrel finds a nut on the ground and eats it', () => {
  const w = world(); w.nuts.setActive(true);
  const b = new SquirrelBrain(C.animals[0], w.env, 0), s = w.nuts.slots[0];
  Object.assign(s, { alive: true, x: 1.5, z: 2, y: 0, age: 0, life: 1e9 }); for (const o of w.nuts.slots) if (o !== s) o.wait = 1e9;
  Object.assign(b, { x: 0, z: 0, y: 0 }); b.startForage();
  let ate = false; run(w, [b], 8, 0.1, () => { if (b.state === 'eat') ate = true; });
  assert.ok(ate && !s.alive, 'it ate the nut');
});

test('a ground squirrel flees from a standing visitor but not from a still crouching one with a nut', () => {
  const w = world(), b = new SquirrelBrain(C.animals[2], w.env, 0);
  Object.assign(b, { x: 3, z: 3, y: 0 }); b.startForage();
  w.player.x = 3 + C.animals[2].shy - 1; w.player.z = 3; w.player.hx = w.player.x; w.player.hz = w.player.z;
  run(w, [b], 1, 0.1); assert.ok(['flee', 'up'].includes(b.state), `frightened: ${b.state}`);
  run(w, [b], 12, 0.1); assert.ok(['up', 'perch'].includes(b.state), 'up a tree');
});

test('feeding: the lure brings it down, it takes the nut, and flees up a tree with it in its mouth', () => {
  const w = world(), b = new SquirrelBrain(C.animals[0], w.env, 0), trail = new Set(), carried = new Set();
  Object.assign(w.player, { x: 4, z: 2, hx: 4.4, hz: 2, lure: true });
  run(w, [b], 80, 0.05, () => { trail.add(b.state); if (b.hasNut) carried.add(b.state); });
  for (const s of ['down', 'approach', 'take']) assert.ok(trail.has(s), `went through ${s}`);
  assert.equal(w.taken.length, 1, 'took exactly one nut');
  assert.ok(carried.has('flee') && carried.has('up') && carried.has('perch'), `ran up a tree with the nut and sat there with it: ${[...carried]}`);
});

test('standing up or moving cancels the approach', () => {
  const w = world(), b = new SquirrelBrain(C.animals[0], w.env, 0);
  Object.assign(w.player, { x: 4, z: 2, hx: 4.4, hz: 2, lure: true });
  let reached = false; run(w, [b], 80, 0.05, () => { if (b.state === 'approach') { reached = true; w.player.lure = false; } });
  assert.ok(reached && w.taken.length === 0, 'no nut taken after the visitor stood up');
  assert.ok(b.state !== 'approach' && b.state !== 'take');
});
