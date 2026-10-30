// #1672: node --test tools/squirrelbraintest.mjs  (the squirrels' state machine, the nut field and the winter rule; no browser)
import test from 'node:test';
import assert from 'node:assert/strict';
import { SQUIRRELS as C, SEASON, SITE } from '../src/config.js';
import { SquirrelBrain, NutField, linkTrees, winterMonth, pickNutSpot, riverFrame, treeRoute, climbPoint } from '../src/squirrelbrain.js';
import { encodeAnimal, STATES } from '../src/squirrelsync.js';

const rng = (seed) => () => ((seed = seed * 16807 % 2147483647) / 2147483647);
const trees = () => linkTrees([[0, 0], [8, 3], [15, -2], [6, 14], [-9, 9], [22, 8]].map(([x, z]) => ({ x, z, y: 0, cy: 6, r: 3.5 })));
const ground = () => 0;
const world = (seed = 7) => {
  const rnd = rng(seed), ts = trees(), nuts = new NutField(ts, ground, () => true, rnd);
  const player = { x: 500, z: 500, lure: false, hx: 500, hz: 500 }, taken = [], scares = [];
  return { rnd, ts, nuts, player, taken, scares, env: { trees: ts, ground, walkable: () => true, nuts, player, scares, rnd, onTake: (b) => { taken.push(b); player.lure = false; return true; } } }; // (the nut leaves the hand: the lure ends)
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
  for (const s of w.nuts.slots) if (s.alive) { assert.ok(w.ts.some((t) => Math.hypot(t.x - s.x, t.z - s.z) <= C.spread + C.heapRadius[1] * 3 + 1e-6), 'by a squirrel tree (or in a heap beside a nut that is)'); seen.push(s.kind); }
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
  let ate = false; run(w, [b], 8, 0.1, () => { if (b.state === 'eat' || b.state === 'stash' || b.state === 'bury') ate = true; }); // (#1716: or buried it for later)
  assert.ok(ate && !s.alive, 'it ate (or buried) the nut');
});

test('#1698: a ground squirrel flees from a visitor moving fast nearby, but not from a still one (standing or crouching)', () => {
  const sp = C.animals[2], w = world(), b = new SquirrelBrain(sp, w.env, 0);
  Object.assign(b, { x: 3, z: 3, y: 0 }); b.startForage();
  const v = { x: 3 + sp.shy - 1, z: 3, v: 0, rose: false }; w.scares.push(v);
  run(w, [b], 20, 0.1); assert.ok(!['flee', 'up'].includes(b.state) && b.calmT <= 0, `a still visitor does not frighten: ${b.state}`);
  Object.assign(v, { x: b.x + sp.shy - 1, z: b.z }); v.v = C.scareSpeed + 0.5; run(w, [b], 1, 0.1); // (#1716: next to where it now runs about) assert.ok(['flee', 'up'].includes(b.state), `frightened: ${b.state}`);
  v.v = 0; run(w, [b], 12, 0.1); assert.ok(['up', 'perch'].includes(b.state), 'up a tree');
});

test('#1698: a fast visitor beyond the reach range does not frighten; rising near it does', () => {
  const sp = C.animals[1], w = world(), b = new SquirrelBrain(sp, w.env, 0);
  Object.assign(b, { x: 3, z: 3, y: 0 }); b.startForage();
  const v = { x: 3 + sp.shy * C.scareReach + 3, z: 3, v: 5, rose: false }; w.scares.push(v);
  run(w, [b], 1, 0.1); assert.ok(!['flee', 'up'].includes(b.state), 'too far away to care');
  v.x = 3 + sp.shy; v.v = 0; v.rose = true; run(w, [b], 0.3, 0.1); assert.ok(['flee', 'up'].includes(b.state), `rising scares: ${b.state}`);
});

test('#1698: a frightened squirrel stays up for a while per personality, then comes down again', () => {
  const stay = C.animals.map((sp, i) => {
    const w = world(3 + i), b = new SquirrelBrain(sp, w.env, 0); Object.assign(b, { x: 3, z: 3, y: 0 }); b.startForage();
    w.scares.push({ x: 4, z: 3, v: 4, rose: false }); run(w, [b], 0.2, 0.1); assert.ok(b.calmT > 0);
    w.scares.length = 0; let t = 0, down = false; run(w, [b], 400, 0.1, () => { t += 0.1; if (!down && b.state === 'down') down = true; if (!down) stay_ = t; }); assert.ok(down, 'came down again');
    return stay_;
  });
  var stay_; // (set by the loop above)
  assert.ok(stay.every((t) => t >= C.scareTime[0] * 0.5), `stayed up at least a while: ${stay}`);
});

test('#1698: a lure is ignored while the squirrel is still frightened', () => {
  const w = world(), b = new SquirrelBrain(C.animals[0], w.env, 0);
  b.calmT = 20; Object.assign(w.player, { x: 4, z: 2, hx: 4.4, hz: 2, lure: true });
  const trail = new Set(); run(w, [b], 15, 0.05, () => trail.add(b.state)); assert.ok(!trail.has('approach'), [...trail].join());
});

test('#1698: another player running past frightens a squirrel that is creeping up to a still, crouching feeder', () => {
  const w = world(), b = new SquirrelBrain(C.animals[0], w.env, 0);
  Object.assign(w.player, { x: 4, z: 2, hx: 4.4, hz: 2, lure: true });
  const other = { x: 40, z: 40, v: 0, rose: false }; w.scares.push(other);
  let near = false; run(w, [b], 60, 0.05, () => { if (b.state === 'approach' && !near) { near = true; Object.assign(other, { x: b.x, z: b.z + 3, v: 5 }); } });
  assert.ok(near && w.taken.length === 0, 'no nut taken');
  assert.ok(['flee', 'up', 'perch'].includes(b.state) && b.calmT >= 0, `fled: ${b.state}`);
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

test('#1686: 18 nuts, bigger than before, new ones appear near the visitors and in heaps', () => {
  assert.ok(C.maxNuts >= 15 && C.maxNuts <= 20, 'fifteen to twenty at once');
  assert.ok(C.nutSize >= 2, 'noticeably larger than the first 4.5 cm');
  const w = world(5); w.nuts.anchors = () => [{ x: 22, z: 8 }]; w.nuts.setActive(true);
  run(w, [], 40, 0.5);
  assert.ok(w.nuts.count >= 12, `most of them are out after 40 s: ${w.nuts.count}`);
  const out = w.nuts.slots.filter((s) => s.alive), near = out.filter((s) => Math.hypot(s.x - 22, s.z - 8) < C.nutNearPlayer);
  assert.ok(near.length / out.length > 0.8, `biased towards the visitor: ${near.length}/${out.length}`);
  let heaps = 0; for (const s of out) if (out.some((q) => q !== s && Math.hypot(q.x - s.x, q.z - s.z) < C.heapRadius[1] + 1e-6)) heaps++;
  assert.ok(heaps >= 3, `some lie in heaps: ${heaps}`);
});

test('#1686: a nut another player holds (held + by) is not found by a squirrel and does not expire', () => {
  const w = world(9); w.nuts.setActive(true); run(w, [], 20, 0.5);
  const s = w.nuts.slots.find((q) => q.alive); Object.assign(s, { held: true, by: 'p2' }); const born = s.born;
  assert.notEqual(w.nuts.near(s.x, s.z, 0.01), s);
  run(w, [], 2000, 1); assert.ok(s.alive && s.born === born, 'a held nut stays');
  w.nuts.remove(s); assert.equal(s.by, null);
});

// #1697: the nut glint follows the daylight (dark at night and dusk, full by day)
test('nut glint strength by daylight', async () => {
  const { markStrength } = await import('../src/squirrels.js');
  assert.equal(markStrength(0), C.markNight);
  assert.ok(markStrength(0.2) <= C.markNight + 1e-9);
  assert.equal(markStrength(1), 1);
  assert.ok(markStrength(0.6) > 0.3 && markStrength(0.6) < 0.7);
  assert.ok(markStrength(0.5) < markStrength(0.7));
});

// #1716: the whole Höje å valley. A synthetic tree line along the real river centre line (SITE.river.path): a tree every 7-13 m on alternating
// banks 8-28 m out, with a few longer gaps, so the graph is like the game's (crown hops where trees stand close, ground runs, joined gaps).
const valley = (seed = 21) => {
  const rnd = rng(seed), fr = riverFrame(SITE.river.path), list = [];
  for (let s = 2, k = 0; s < fr.total - 2; s += 7 + rnd() * 6 + (k % 9 === 8 ? 30 : 0), k++) {
    const c = fr.at(s), n = fr.at(Math.min(fr.total, s + 1)), dx = n.x - c.x, dz = n.z - c.z, l = Math.hypot(dx, dz) || 1, side = k % 2 ? 1 : -1, off = 8 + rnd() * 20;
    list.push({ x: c.x - dz / l * off * side, z: c.z + dx / l * off * side, y: 0, cy: 7, r: 3.5 });
  }
  const walkable = (x, z) => fr(x, z).d > 6; // (the water: 12 m wide here)
  const crossings = [fr(-30, 128).s, fr(-128, 206).s].map((s) => { const c = fr.at(s), n = fr.at(s + 1), dx = n.x - c.x, dz = n.z - c.z, l = Math.hypot(dx, dz); return [[c.x - dz / l * 9, c.z + dx / l * 9], [c.x + dz / l * 9, c.z - dx / l * 9]]; }); // (two bridges, 18 m)
  const ts = linkTrees(list, { path: SITE.river.path, walkable, crossings }), nuts = new NutField(ts, ground, walkable, rnd);
  const clock = { t: 0, h: 12 }, player = { x: 1e5, z: 1e5, lure: false, hx: 1e5, hz: 1e5 };
  return { rnd, fr, ts, nuts, clock, player, env: { trees: ts, ground, walkable, nuts, player, scares: [], rnd, onTake: () => false, now: () => clock.t, hour: () => clock.h } };
};
const startNear = (ts, [x, z]) => ts.reduce((best, t, i) => (Math.hypot(t.x - x, t.z - z) < Math.hypot(ts[best].x - x, ts[best].z - z) ? i : best), 0);

test('#1716: the valley graph: every tree reachable, routes follow the trees, no ground run through the river', () => {
  const v = valley(), { ts } = v;
  assert.ok(ts.length >= 35 && ts.sMax - ts.sMin > v.fr.total * 0.9, `trees along the whole river: ${ts.length}, ${ts.sMin.toFixed(0)}…${ts.sMax.toFixed(0)} of ${v.fr.total.toFixed(0)} m`);
  assert.equal(new Set(ts.map((t) => t.comp)).size, 1, 'one graph: the banks are joined over the bridges');
  const a = ts.byS[0], b = ts.byS[ts.length - 1], r = treeRoute(ts, a, b);
  assert.equal(r[r.length - 1], b); assert.ok(r.length > 10, `many steps end to end: ${r.length}`);
  let prev = a; for (const j of r) { assert.ok(ts[prev].links.includes(j), 'every step is an edge of the graph'); prev = j; }
  for (const t of ts) for (const j of t.links) if (!t.near.includes(j) && !t.via?.[j] && t.side !== ts[j].side) {
    const u = ts[j]; for (let k = 0.1; k < 1; k += 0.1) assert.ok(v.env.walkable(t.x + (u.x - t.x) * k, t.z + (u.z - t.z) * k), 'a ground run across the banks stays on land');
  }
  const o = climbPoint(ts[0], 0.5, 0, ground), q = climbPoint(ts[0], 0.5, 0.4, ground);
  assert.ok(Math.abs(o.a - (0.5 - C.roam.spiral * Math.PI * 2)) < 1e-9 && Math.abs(q.a - 0.5) > 0.5, 'it spirals round the trunk while it climbs');
});

test('#1716: over a few simulated hours a squirrel roams along most of the river, not just round its start trees', () => {
  const v = valley(), { ts } = v, start = startNear(ts, C.starts[1]), b = new SquirrelBrain(C.animals[1], v.env, start), seen = new Set(), ss = [];
  v.nuts.setActive(true);
  for (let i = 0; i < 4 * 3600 * 10; i++) { v.clock.t += 0.1; v.nuts.update(0.1); b.update(0.1); if (b.state === 'perch') { seen.add(b.tree); ss.push(ts[b.tree].s); } assert.ok(Number.isFinite(b.x + b.z + b.y)); }
  const lo = Math.min(...ss), hi = Math.max(...ss), span = ts.sMax - ts.sMin;
  assert.ok(hi - lo > span * 0.5, `covered ${(hi - lo).toFixed(0)} of ${span.toFixed(0)} m of the river (start s ${ts[start].s.toFixed(0)})`);
  assert.ok(seen.size > 25, `perched in ${seen.size} different trees`);
  const startArea = [...seen].filter((i) => Math.abs(ts[i].s - ts[start].s) < C.roam.range).length;
  assert.ok(startArea < seen.size / 2, `most of them away from the start: ${startArea}/${seen.size}`);
});

test('#1716: the coarse off-screen brain roams the same way (tree to tree only) and catches up after a long gap', () => {
  const v = valley(4), { ts } = v, start = startNear(ts, C.starts[0]), b = new SquirrelBrain(C.animals[0], v.env, start), ss = [];
  for (let i = 0; i < 4 * 3600; i++) { v.clock.t += 1; b.coarse(1); assert.ok(['perch', 'nest'].includes(b.state)); ss.push(ts[b.tree].s); }
  assert.ok(Math.max(...ss) - Math.min(...ss) > (ts.sMax - ts.sMin) * 0.5, 'covered most of the river');
  for (let i = 0; i < 30; i++) { v.clock.t += 60; b.coarse(60); } // (60 s steps: no catch-up yet, it walks there)
  assert.ok(Math.abs(ts[b.tree].s - b.homeS()) <= C.roam.range * 1.5, 'in or near its home range');
  v.clock.t += 3 * 3600; b.coarse(3 * 3600);
  assert.ok(Math.abs(ts[b.tree].s - b.homeS()) <= C.roam.range, 'a long gap: straight into its home range');
  b.update(0.1); assert.ok(Number.isFinite(b.x) && b.state === 'perch', 'the full brain carries on from there');
});

test('#1716: the day: busiest in the morning and afternoon, asleep in the drey at night, awake again in the morning', () => {
  const v = valley(5), { ts } = v, b = new SquirrelBrain(C.animals[0], v.env, startNear(ts, C.starts[0]));
  v.clock.h = 8; const morning = b.activity(); v.clock.h = 12.3; const noon = b.activity(); v.clock.h = 16.5; const afternoon = b.activity();
  assert.ok(morning > noon && afternoon > noon && noon > 0, `${morning} ${noon} ${afternoon}`);
  v.clock.h = 22; let nest = false; for (let i = 0; i < 6000 && !nest; i++) { v.clock.t += 0.1; b.update(0.1); nest = b.state === 'nest'; }
  assert.ok(nest && b.tree === b.nest, 'gone to its drey');
  const at = [b.x, b.z]; for (let i = 0; i < 3000; i++) { v.clock.t += 0.1; b.update(0.1); } assert.ok(b.state === 'nest' && b.x === at[0], 'it sleeps');
  v.player.lure = true; Object.assign(v.player, { x: b.x + 2, z: b.z, hx: b.x + 2, hz: b.z }); for (let i = 0; i < 100; i++) b.update(0.1); assert.equal(b.state, 'nest', 'no feeding at night'); v.player.lure = false;
  v.clock.h = 6.5; b.update(0.1); assert.equal(b.state, 'perch', 'up in the morning');
});

test('#1716: a found nut is sometimes buried and dug up again later', () => {
  const w = world(13); w.nuts.setActive(true); for (const o of w.nuts.slots) o.wait = 1e9;
  let clock = 0; w.env.now = () => clock;
  const b = new SquirrelBrain(C.animals[0], w.env, 0); let buried = 0;
  for (let n = 0; n < 30 && !b.caches.length; n++) { // nuts in front of it until one is buried rather than eaten
    const s = w.nuts.slots[0]; Object.assign(s, { alive: true, held: false, x: b.tr.x + 1.5, z: b.tr.z + 2, y: 0, age: 0, life: 1e9 });
    Object.assign(b, { x: b.tr.x, z: b.tr.z, y: 0, calmT: 0, hasNut: false }); b.startForage(); b.sense = 0;
    run(w, [b], 20, 0.1, () => { clock += 0.1; if (b.state === 'bury') buried++; });
  }
  assert.ok(buried && b.caches.length === 1, 'buried one');
  const c = b.caches[0]; clock += c.ripe + 1;
  b.route = []; b.target = c; b.tree = c.tree; let dug = false, ate = false;
  b.enterPerch(c.tree, 0); b.t = b.dur; b.p = { ...b.p, ground: 0 }; // (it goes down for the cache, not to forage)
  run(w, [b], 60, 0.1, () => { clock += 0.1; if (b.state === 'dig') dug = true; if (dug && b.state === 'eat' && b.hasNut) ate = true; });
  assert.ok(dug && ate && b.caches.length === 0, `dug it up and ate it: ${b.log.slice(-8).join(' ')}`);
});

test('#1716: two squirrels on the ground: one now and then chases the other up a tree', () => {
  const w = world(17), a = new SquirrelBrain(C.animals[0], w.env, 0), o = new SquirrelBrain(C.animals[1], w.env, 1); w.env.others = [a, o];
  let chased = false;
  for (let n = 0; n < 200 && !chased; n++) {
    for (const [q, x] of [[a, 2], [o, 5]]) { Object.assign(q, { x, z: 2, y: 0, calmT: 0 }); q.startForage(); }
    run(w, [a, o], 3, 0.1, () => { if (a.state === 'chase' || o.state === 'chase') chased = true; });
  }
  assert.ok(chased, 'a chase happened');
  run(w, [a, o], 20, 0.1); assert.ok(!['chase'].includes(a.state) && !['chase'].includes(o.state), 'and it ends');
});

test('#1716: the shared pose keeps the old wire states, so older clients and the room understand it', () => {
  const w = world(), b = new SquirrelBrain(C.animals[0], w.env, 0), wire = { travel: 'toTree', stash: 'toTree', seek: 'toTree', bury: 'eat', dig: 'eat', chase: 'flee', nest: 'perch' };
  assert.equal(STATES.length, 12);
  for (const [st, old] of Object.entries(wire)) { b.state = st; assert.equal(STATES[encodeAnimal(b)[7]], old, st); }
  b.state = 'approach'; assert.equal(STATES[encodeAnimal(b)[7]], 'approach');
  b.x = 300; b.z = 300; b.state = 'perch'; b.route = [3]; b.resync(); assert.ok(b.route.length === 0 && b.state === 'perch' && Math.hypot(b.x - b.tr.x, b.z - b.tr.z) < 5, 'after following: settled on the nearest tree');
});
