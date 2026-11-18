// #2129: node --test tools/birdflocktest.mjs — small-bird flocks and landing gulls (src/birdflock.js) on synthetic and real data:
// landing spots only on valid surfaces, flock rules (cohesion/separation/round turns), flush when someone comes near, determinism,
// gull landing cycles and early take-off; the sparrow geometry's attribute layout matches the shared gull shader.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BIRD_LIFE as C, COURTYARD, BIRDS } from '../src/config.js';
import { Roofs } from '../src/roofs.js';
import { collectPerches, gullSpots, SmallFlock, GullRoost, seeded } from '../src/birdflock.js';

// A small world: a sloped roof (a hip with its ridge along x), a flat one with a canopy over part of it, two crowns, a rail and the
// courtyard's real gravel rectangles with its real paths and sandboxes as no-go.
const hip = { id: 'hip', x0: 0, x1: 20, z0: 0, z1: 10, poly: [[0, 0], [20, 0], [20, 10], [0, 10]], y: (x, z) => 12 + 3 * (1 - Math.abs(z - 5) / 5) };
const flat = { id: 'flat', x0: -30, x1: -18, z0: 0, z1: 8, y: 9 };
const canopy = { id: 'canopy', x0: -30, x1: -26, z0: 0, z1: 8, y: 11 }; // over the flat roof's west end: no perch under it
const roofs = new Roofs([hip, flat, canopy], []);
const roofApi = { surfaces: roofs.surfaces, topAt: (x, z) => roofs.topAt(x, z), above: (x, z, y) => roofs.above(x, z, y), on: Roofs.on, height: Roofs.height };
const crowns = [{ x: -10, z: 25, r: 4, y: 7 }, { x: 10, z: 30, r: 3, y: 6 }, { x: 200, z: 0, r: 4, y: 7 }, { x: 1, z: -1, r: 3, y: 9 }]; // (the last against the hip roof)
const rails = [[-20, 3, 20, -14, 3, 20]];
const inRect = (r, x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
const groundOk = (x, z) => !COURTYARD.paths.some((r) => inRect(r, x, z)) && !COURTYARD.sandboxes.some((r) => inRect(r, x, z)) && !COURTYARD.pergolas.some((r) => inRect(r, x, z));
const patches = COURTYARD.gravel.map((g) => ({ kind: 'gravel', ...g }));
const home = { x: -15, z: 18, r: 45 };
const house = { x0: -45, x1: -38, z0: 18, z1: 30 }, clear = (x, z) => !inRect({ x0: house.x0 - 0.6, x1: house.x1 + 0.6, z0: house.z0 - 0.6, z1: house.z1 + 0.6 }, x, z); // a house without a walkable roof
const world = () => collectPerches({ home, crowns: [...crowns, { x: -38, z: 24, r: 3, y: 6 }], roofs: roofApi, rails, patches: [...patches, { kind: 'grass', x0: -44, x1: -36, z0: 20, z1: 28 }], groundY: () => 0.02, groundOk, clear, C, rnd: seeded(5) });

test('perches lie only on the surfaces they come from', () => {
  const groups = world(), kinds = new Set(groups.map((g) => g.kind));
  for (const k of ['tree', 'roof', 'rail', 'ground']) assert.ok(kinds.has(k), `a ${k} group`);
  for (const g of groups) for (const s of g.spots) {
    assert.ok(Number.isFinite(s.x + s.y + s.z + s.yaw));
    assert.ok(Math.hypot(s.x - home.x, s.z - home.z) <= home.r + 2, 'inside the home area');
    if (g.kind === 'roof') {
      assert.ok(Roofs.on(g.surface, s.x, s.z), 'on its roof');
      assert.ok(Math.abs(s.y - Roofs.height(g.surface, s.x, s.z)) < 1e-9, 'at the roof height');
      assert.ok(roofs.topAt(s.x, s.z) <= s.y + 0.01, 'the top surface there');
      assert.ok(!(s.x < -26 && s.z < 8 && s.y < 10), 'nothing under the canopy');
    } else if (g.kind === 'tree') {
      const c = g.crown, d = Math.hypot(s.x - c.x, s.z - c.z, (s.y - c.y));
      assert.ok(d < c.r && d > c.r * 0.7, 'just inside the crown shell');
      assert.ok(roofs.topAt(s.x, s.z) <= s.y - 0.5, 'not inside a house or under its roof');
    } else if (g.kind === 'rail') {
      const [ax, ay, az, bx, by, bz] = g.line, t = ((s.x - ax) * (bx - ax) + (s.z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2);
      assert.ok(t >= 0 && t <= 1 && Math.hypot(ax + (bx - ax) * t - s.x, az + (bz - az) * t - s.z) < 1e-9 && Math.abs(s.y - (ay + (by - ay) * t)) < 1e-9, 'on the rail line');
    } else {
      assert.ok([...patches, { x0: -44, x1: -36, z0: 20, z1: 28 }].some((p) => inRect(p, s.x, s.z)) && groundOk(s.x, s.z) && s.y === 0.02, 'on gravel/grass, off paths/sandboxes');
    }
  }
  for (const g of groups) for (const s of g.spots) assert.ok(clear(s.x, s.z), 'never in or against a house');
  for (const g of groups) for (let i = 0; i < g.spots.length; i++) for (let j = i + 1; j < g.spots.length; j++)
    assert.ok(Math.hypot(g.spots[i].x - g.spots[j].x, g.spots[i].z - g.spots[j].z) >= C.gap - 1e-9, 'spots apart');
  assert.ok(!groups.some((g) => g.kind === 'tree' && g.x === 200), 'a crown outside the home area is no perch');
});

test('gull spots: roof tops (ridge first) and bank points inside the area', () => {
  const spots = gullSpots({ center: { x: 0, z: 0 }, roofs: roofApi, bank: [{ x: 5, y: -5, z: 40 }, { x: 500, y: -5, z: 0 }], C: { ...C, gull: { ...C.gull, area: 100 } } });
  assert.ok(spots.some((s) => s.kind === 'bank') && spots.some((s) => s.kind === 'roof'));
  assert.ok(!spots.some((s) => s.x === 500), 'no bank point outside the area');
  for (const s of spots.filter((q) => q.kind === 'roof')) assert.ok(roofs.topAt(s.x, s.z) <= s.y + 0.01 && roofs.surfaces.some((r) => Roofs.on(r, s.x, s.z) && Math.abs(Roofs.height(r, s.x, s.z) - s.y) < 1e-9));
  const onHip = spots.filter((s) => s.kind === 'roof' && s.x > 0);
  assert.ok(onHip.length && onHip.every((s) => s.y > 14), 'high on the hip roof: near its ridge');
});

const run = (flock, secs, threat = () => [], dt = 1 / 30) => { const tr = []; for (let t = 0; t < secs; t += dt) { flock.step(dt, threat(t)); tr.push(flock.birds.map((b) => ({ x: b.x, y: b.y, z: b.z, mode: b.mode, yaw: b.yaw, bank: b.bank }))); } return tr; };

test('a flock lands, stays together without collisions, turns in curves and keeps every sitting bird on its spot', () => {
  const groups = world(), f = new SmallFlock({ groups, n: 9, seed: 3, C, topAt: (x, z) => roofs.topAt(x, z) });
  const tr = run(f, 400);
  assert.ok(f.departures >= 4, `moved between perches (${f.departures})`);
  let flying = 0, maxSpread = 0, minSep = Infinity, maxTurn = 0;
  for (let k = 1; k < tr.length; k++) {
    const fl = tr[k].filter((b) => b.mode === 0);
    if (fl.length > 3) {
      flying++;
      const cx = fl.reduce((a, b) => a + b.x, 0) / fl.length, cz = fl.reduce((a, b) => a + b.z, 0) / fl.length;
      maxSpread = Math.max(maxSpread, ...fl.map((b) => Math.hypot(b.x - cx, b.z - cz)));
      for (let i = 0; i < fl.length; i++) for (let j = i + 1; j < fl.length; j++) minSep = Math.min(minSep, Math.hypot(fl[i].x - fl[j].x, fl[i].y - fl[j].y, fl[i].z - fl[j].z));
    }
    tr[k].forEach((b, i) => { if (b.mode === 0 && tr[k - 1][i].mode === 0) maxTurn = Math.max(maxTurn, Math.abs(Math.atan2(Math.sin(b.yaw - tr[k - 1][i].yaw), Math.cos(b.yaw - tr[k - 1][i].yaw)))); });
  }
  assert.ok(flying > 30, 'some flight');
  assert.ok(maxSpread < 25, `the flock stays together (${maxSpread.toFixed(1)} m)`);
  assert.ok(minSep > 0.05, `no two birds in one place (${minSep.toFixed(2)} m)`);
  assert.ok(maxTurn < 0.6, `round turns: at most ${maxTurn.toFixed(2)} rad a frame`);
  // when settled: on the group's spots (ground: hops stay valid)
  for (let t = 0; t < 120 && f.state !== 'sit'; t++) f.step(1 / 30);
  assert.equal(f.state, 'sit');
  for (const b of f.birds) {
    if (f.group.kind === 'ground') assert.ok(f.group.ok(b.x, b.z));
    else assert.ok(f.group.spots.some((s) => Math.hypot(s.x - b.x, s.z - b.z) < 1e-6 && Math.abs(s.y - b.y) < 1e-6));
  }
});

test('on the ground they hop and peck, only within the patch', () => {
  const groups = world().filter((g) => g.kind === 'ground'), f = new SmallFlock({ groups, n: 6, seed: 9, C: { ...C, dwell: { ...C.dwell, ground: [1e6, 1e6] } } });
  let hops = 0, pecks = 0; const start = f.birds.map((b) => [b.x, b.z]);
  for (let k = 0; k < 30 * 60; k++) {
    f.step(1 / 30);
    for (const b of f.birds) { if (b.hop && b.hop.t === 0) hops++; if (b.peck > 0 && Math.abs(b.peck - C.peckTime + 1 / 30) < 1e-9) pecks++; assert.ok(f.group.ok(b.x, b.z), 'every hop lands on the patch'); assert.ok(b.pitch <= C.peckPitch + 1e-9); }
  }
  assert.ok(hops > 60 && pecks > 60, `hops ${hops}, pecks ${pecks}`);
  assert.ok(f.birds.some((b, i) => Math.hypot(b.x - start[i][0], b.z - start[i][1]) > 0.2), 'they move about');
  assert.equal(f.groundBirds().length, 6, 'the cats hook lists them');
});

test('someone walking up flushes the flock to a group far away; unseen walkers further off do not', () => {
  const groups = world().filter((g) => g.kind === 'ground' || g.kind === 'tree');
  const f = new SmallFlock({ groups, n: 8, seed: 4, C: { ...C, dwell: { tree: [1e6, 1e6], roof: [1e6, 1e6], rail: [1e6, 1e6], ground: [1e6, 1e6] } } });
  let g = groups.find((q) => q.kind === 'ground'); f.assign(g); for (const b of f.birds) { Object.assign(b, { x: b.spot.x, y: b.spot.y, z: b.spot.z }); f.sitDown(b); } f.settle();
  const at = { x: g.x + C.flush.ground + 3, y: 1.6, z: g.z };
  run(f, 5, () => [at]);
  assert.equal(f.flushes, 0, 'a person further than the flush distance leaves them be');
  const near = { x: g.x + C.flush.ground - 2.5, y: 1.6, z: g.z };
  run(f, 0.2, () => [near]);
  assert.equal(f.flushes, 1);
  assert.notEqual(f.group, g);
  assert.ok(Math.hypot(f.group.x - near.x, f.group.z - near.z) >= C.flee, 'fled at least `flee` m');
  assert.equal(f.group.kind, 'tree', 'up into a tree');
  run(f, 1, () => [near]);
  assert.ok(f.birds.every((b) => b.mode !== 2 || b.from === null) && f.birds.filter((b) => b.mode === 0).length >= 6, 'all off within the reaction spread');
  assert.ok(f.birds.every((b) => b.y > near.y - 1.6), 'up, not along the ground');
  run(f, 40, () => [near]);
  assert.equal(f.state, 'sit'); assert.equal(f.flushes, 1, 'they stay in the tree away from the walker');
});

test('deterministic: the same seed and inputs give the same flight', () => {
  const a = run(new SmallFlock({ groups: world(), n: 7, seed: 11, C }), 120, (t) => (t > 30 && t < 40 ? [{ x: -10, y: 1.6, z: 24 }] : []));
  const b = run(new SmallFlock({ groups: world(), n: 7, seed: 11, C }), 120, (t) => (t > 30 && t < 40 ? [{ x: -10, y: 1.6, z: 24 }] : []));
  assert.deepEqual(a.at(-1), b.at(-1));
  const c = run(new SmallFlock({ groups: world(), n: 7, seed: 12, C }), 120);
  assert.notDeepEqual(a.at(-1), c.at(-1));
});

test('gulls: land on their spot, stand folded, take off back to the circle; a walker flushes a standing gull', () => {
  const spots = [{ x: 10, y: 15, z: 5, kind: 'roof' }, { x: 5, y: -5, z: 40, kind: 'bank' }, { x: -20, y: 9, z: 4, kind: 'roof' }];
  const circle = (i, t, o) => { const a = i + t * 0.1; o.x = Math.cos(a) * 60; o.y = 50; o.z = Math.sin(a) * 60; return o; };
  const roost = new GullRoost({ count: 4, spots, circle, seed: 1, C }), o = {}, c0 = {};
  let stood = 0, maxStep = 0;
  for (let i = 0; i < 4; i++) {
    let prev = null;
    for (let t = 0; t < 1500; t += 0.25) {
      roost.pose(i, t, o); const p = o.on ? { x: o.x, y: o.y, z: o.z } : circle(i, t, c0);
      if (prev) maxStep = Math.max(maxStep, Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z));
      prev = { ...p };
      if (o.standing) { stood++; assert.ok(spots.some((s) => s.x === o.x && s.z === o.z && Math.abs(o.y - s.y - C.gull.standY) < 1e-9)); assert.equal(o.fold, 1); assert.equal(o.flap, 0); }
    }
  }
  assert.ok(stood > 100, 'every gull stands now and then');
  assert.ok(maxStep < 0.25 * 30, `continuous path (${maxStep.toFixed(2)} m per 0.25 s)`);
  // find a standing moment and walk up
  let t = 0; for (; t < 2000 && !roost.pose(0, t, o).standing; t += 0.5);
  const s = { x: o.x, y: o.y, z: o.z };
  assert.equal(roost.flush(t, [{ x: s.x + C.gull.flush + 4, y: s.y, z: s.z }]), 0);
  assert.equal(roost.flush(t, [{ x: s.x + 3, y: s.y, z: s.z }]), 1);
  roost.pose(0, t + 1, o); assert.ok(o.on && !o.standing && o.flap === 1 && o.y > s.y, 'it rises');
  roost.pose(0, t + C.gull.takeoff + 1, o); assert.ok(!o.on, 'back on the circle after the take-off');
  roost.pose(0, t + C.gull.takeoff + 30, o); assert.ok(!o.standing, 'and does not return to that spot this round');
});

test('config: phones fly fewer small birds; the gull flock is unchanged', () => {
  const desk = C.flocks.reduce((a, f) => a + f.n, 0), phone = C.flocks.reduce((a, f) => a + (f.lowMemory ? f.lowMemoryN : 0), 0);
  assert.ok(phone < desk && phone > 0);
  assert.equal(BIRDS.count, 10); assert.equal(BIRDS.lowMemoryCount, 5);
});
