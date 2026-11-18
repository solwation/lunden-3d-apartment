// #2126: mallard body language and V wake — behaviour distribution, precedence of food/kiss/eating, wake only while swimming.
// node tools/duckmotiontest.mjs
import assert from 'node:assert/strict';
import { DuckBrain, DUCKS } from '../src/duckbrain.js';
import { DuckActivity, duckPose, wakeVertices, wakeVertexCount, DUCK_MOTION as M } from '../src/duckmotion.js';

// Same stub as tools/ducktest.mjs: water south of z=-1, shore rising north of it.
const habitat = { surface: (x, z) => ({ y: Math.max(0, -z - 1), water: z > -1 }), goal: (mode, a) => ({ x: (a - .5) * 4, z: mode === 'swim' ? 1 : -3 }), contains: (x, z) => Math.abs(x) < 5 && Math.abs(z) < 5 };
const dt = .05, steps = 72000; // one simulated hour
const run = seed => {
  const b = new DuckBrain({ home: { x: 0, z: 0 }, habitat, seed }), a = new DuckActivity(seed * 31 + 2126), time = { none: 0 }, starts = {};
  let wakeMoving = 0, movingSwim = 0, dabbleAshore = 0, wakeRise = 0;
  for (let i = 0; i < steps; i++) {
    const before = a.wake, prev = a.kind, saw = b.swimming && b.moving;
    a.update(dt, b); b.update(dt);
    if (a.kind && a.kind !== prev) starts[a.kind] = (starts[a.kind] ?? 0) + 1;
    time[a.kind ?? 'none'] = (time[a.kind ?? 'none'] ?? 0) + dt;
    // b.swimming lags the brain's own step by one frame; the activity cancels on the next one, before any visible tip (envelope 0 at t≈0).
    if (a.kind === 'dabble' && !b.swimming && a.t > dt * 1.5) dabbleAshore++;
    // Wake target is decided before the brain moves: check against the state the activity saw.
    if (!saw && a.wake > before + 1e-9) wakeRise++;
    if (b.swimming && b.moving) { movingSwim++; wakeMoving += a.wake; }
  }
  return { b, a, time, starts, wakeMoving: wakeMoving / Math.max(1, movingSwim), dabbleAshore, wakeRise };
};
const r = run(7), total = steps * dt, share = k => (r.time[k] ?? 0) / total;
for (const k of ['dabble', 'preen', 'shake']) assert.ok(r.starts[k] > 5, `${k} happens repeatedly (${r.starts[k]})`);
assert.ok(share('none') > .6 && share('none') < .95, `resting behaviours take a minority of the hour (${share('none').toFixed(2)} free)`);
assert.ok(share('dabble') > share('shake') && share('preen') > share('shake'), 'dabbling and preening outlast short shakes');
assert.equal(r.dabbleAshore, 0, 'dabbling only on water');
assert.equal(r.starts.takeoff, undefined, 'no take-off without a disturbance');
console.log('PASS behaviour distribution', JSON.stringify({ starts: r.starts, share: Object.fromEntries(Object.entries(r.time).map(([k, v]) => [k, +(v / total).toFixed(3)])) }));

// Deterministic per seed, different between birds.
const r2 = run(7), r3 = run(11);
assert.deepEqual(r2.starts, r.starts); assert.notDeepEqual(r3.starts, r.starts);
console.log('PASS seeded, local and repeatable (no shared/network state)');

// Wake: never grows unless the bird actually swims forward; ~full while it does; decays to exactly zero when it stops.
assert.equal(r.wakeRise, 0, 'wake never rises while still or ashore');
assert.ok(r.wakeMoving > .5, `wake present while swimming (${r.wakeMoving.toFixed(2)})`);
{
  const b = { swimming: true, moving: true, phase: 0 }, a = new DuckActivity(3); a.next = 1e9;
  for (let i = 0; i < 60; i++) a.update(dt, b);
  assert.ok(a.wake > .95);
  b.moving = false; for (let i = 0; i < 80; i++) a.update(dt, b);
  assert.equal(a.wake, 0, 'still bird leaves no wake');
  b.moving = true; b.swimming = false; for (let i = 0; i < 40; i++) a.update(dt, b);
  assert.equal(a.wake, 0, 'walking ashore leaves no wake');
  b.swimming = true; a.update(dt, b, { asleep: true }); assert.equal(a.wake, 0, 'distance-paused brain leaves no wake');
  a.update(dt, b, { disturbed: true }); assert.equal(a.kind, 'takeoff');
  for (let i = 0; i < 20; i++) a.update(dt, b); assert.equal(a.wake, 0, 'airborne bird leaves no wake');
}
console.log('PASS wake only while swimming forward');

// Precedence: bread lure, eating and kisses cancel/forbid behaviours; hold never blocks a food approach.
{
  const b = new DuckBrain({ home: { x: 0, z: 0 }, habitat, seed: 5 }), a = new DuckActivity(9);
  a.start('preen'); a.update(dt, b); assert.equal(b.hold, true);
  const x = b.x; b.goal = { x: 3, z: 0 }; b.update(dt); assert.equal(b.x, x, 'held bird stays put');
  b.update(dt, { x: -3, z: 0 }); assert.ok(b.x < x, 'bread lure overrides hold'); assert.equal(b.lured, true);
  a.update(dt, b); assert.equal(a.kind, null); assert.equal(b.hold, false);
  a.next = 0; a.update(dt, b); assert.equal(a.kind, null, 'nothing starts while lured');
  b.lured = false; b.eating = 1; a.update(dt, b, { disturbed: true }); assert.equal(a.kind, null, 'eating bird does not flee');
  b.eating = 0; a.start('dabble'); b.kissing = true; a.update(dt, b); assert.equal(a.kind, null, 'kiss cancels');
  assert.deepEqual(duckPose(b, a), duckPose({ kissing: true }, null), 'kissing pose is neutral (bill contact unchanged)');
  b.kissing = false; a.update(dt, b, { disturbed: true }); assert.equal(a.kind, 'takeoff');
  a.stop(); a.next = 1e9; a.update(dt, b, { disturbed: true }); assert.equal(a.kind, null, 'take-off cooldown');
}
console.log('PASS food/eating/kiss precedence and take-off cooldown');

// Poses: dabbling tips the head under the waterline and the tail up; take-off lifts and lands; strokes bob the head.
{
  const sink = DUCKS.habitat.sink, b = { swimming: true, moving: false, phase: 0 }, a = new DuckActivity(1);
  a.start('dabble'); a.dur = 4; a.t = 2;
  const o = duckPose(b, a), c = Math.cos(o.pitch), s = Math.sin(o.pitch), at = (y, z) => ({ y: y * c - z * s + o.ty, z: y * s + z * c + o.tz });
  const bill = at(.58, .5), tail = at(.35, -.52), pivot = at(...M.dabble.pivot);
  assert.ok(bill.y < sink - .05, `bill under water (${bill.y.toFixed(2)} < ${sink})`); assert.ok(tail.y > .6, 'tail up');
  assert.ok(Math.abs(pivot.y - M.dabble.pivot[0]) < 1e-9 && Math.abs(pivot.z - M.dabble.pivot[1]) < 1e-9, 'tips about the waterline pivot');
  a.start('takeoff'); a.dur = 2; const lifts = [];
  for (let i = 0; i <= 40; i++) { a.t = i * .05; lifts.push(duckPose(b, a).lift); }
  assert.ok(Math.max(...lifts) > M.takeoff.lift * .95 && lifts[0] === 0 && lifts.at(-1) < 1e-3, 'short flight up and back down');
  a.t = .3; assert.equal(duckPose(b, a).flap, true);
  a.stop(); const sw = { swimming: true, moving: true }, neck = [];
  for (let ph = 0; ph < 7; ph += .5) neck.push(duckPose({ ...sw, phase: ph }, a).neckX);
  assert.ok(Math.max(...neck) > M.stroke.neck * .9 && Math.min(...neck) < -M.stroke.neck * .9, 'head bobs with the strokes');
  assert.equal(duckPose({ swimming: false, moving: true, phase: 1 }, a).neckX, 0, 'no swim bob ashore');
}
console.log('PASS dabble/take-off/stroke poses');

// V wake geometry: two arms behind the breast at the Kelvin angle, fading, zero alpha over the bank.
{
  const n = wakeVertexCount(), pos = new Float32Array(n * 3), alpha = new Float32Array(n), b = { x: 2, z: 3, yaw: .7, phase: 1 };
  assert.equal(wakeVertices(b, 1, .5, () => true, pos, alpha), n);
  const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw), arm = M.wake.segments + 1, tip = side => { const v = (side * arm + arm - 1) * 2; return [(pos[v * 3] + pos[v * 3 + 3]) / 2 - b.x, (pos[v * 3 + 2] + pos[v * 3 + 5]) / 2 - b.z]; };
  const [l, rr] = [tip(0), tip(1)], ang = v => Math.atan2(Math.abs(v[0] * fz - v[1] * fx), -(v[0] * fx + v[1] * fz));
  assert.ok(l[0] * fx + l[1] * fz < -2 && rr[0] * fx + rr[1] * fz < -2, 'arms trail behind');
  assert.ok(Math.abs(ang(l) - M.wake.angle) < .02 && Math.abs(ang(rr) - M.wake.angle) < .02, 'Kelvin half-angle');
  assert.ok((l[0] * fz - l[1] * fx) * (rr[0] * fz - rr[1] * fx) < 0, 'arms on both sides');
  for (let i = 0; i < n; i++) assert.equal(pos[i * 3 + 1], .5);
  assert.ok(Math.max(...alpha) <= M.wake.alpha + 1e-6 && alpha[(arm - 1) * 2] < alpha[4], 'faint and fading');
  // Bank 1 m from the bird: farther arm points carry zero alpha, nearer ones keep theirs.
  wakeVertices(b, 1, .5, (x, z) => Math.hypot(x - b.x, z - b.z) < 1, pos, alpha);
  let clipped = 0;
  for (let i = 0; i < n; i += 2) { const far = Math.hypot((pos[i * 3] + pos[i * 3 + 3]) / 2 - b.x, (pos[i * 3 + 2] + pos[i * 3 + 5]) / 2 - b.z) >= 1; if (far) { clipped++; assert.equal(alpha[i] + alpha[i + 1], 0, 'bank clipped'); } }
  assert.ok(clipped > 4 && Math.max(...alpha) > 0);
  wakeVertices(b, 0, .5, () => true, pos, alpha); assert.equal(Math.max(...alpha), 0);
}
console.log('PASS V wake shape, fade and bank clipping');
