// #1946: the lure / scare layer over the river fish (src/riverfishfeed.js), with the real shared fish as input. node --test src/riverfishfeed.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { RIVER_FISH as C } from './config.js';
import { fishSpec, fishAt, riverProject, riverPoint } from './riverfishswim.js';
import { FishFeed } from './riverfishfeed.js';

const F = C.feed, DT = 1 / 60, T0 = 5000;
// the shared fish at time t (what riverfish.js hands the layer), and a swimmer mid-channel near fish 0
const shared = (t) => Array.from({ length: C.count }, (_, id) => { const f = fishSpec(id, 0), o = fishAt(f, t, {}); return { id, born: 0, x: o.x, y: o.y, z: o.z, yaw: o.yaw, len: f.spec.len, water: o.water }; });
const before = JSON.stringify(shared(T0));
function scene(dist = 4) {
  const f0 = shared(T0)[3], q = riverProject(f0.x, f0.z), c = riverPoint(q.s + dist), tx = c.nz, tz = -c.nx; // (the path's direction: downstream)
  const w = { swim: true, moving: false, x: c.x, y: f0.water - 1.3, z: c.z, hand: null, busy: () => false };
  const hand = () => ({ x: w.x + tx * 0.44, y: w.y - 0.1, z: w.z + tz * 0.44 });
  return { w, hand, tx, tz, feed: new FishFeed(), t: T0 };
}
const run = (S, s, each) => { let took = null; for (let i = 0; i < Math.round(s / DT); i++) { S.t += DT; each?.(); took = S.feed.update(DT, S.w, shared(S.t)) ?? took; if (took && S.stop) break; } return took; };
const drawn = (S, id) => { const f = shared(S.t)[id], e = S.feed.off.get(id); return { x: f.x + (e?.x ?? 0), y: f.y + (e?.y ?? 0), z: f.z + (e?.z ?? 0) }; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

test('still with a cracked mussel: after the wait the nearest fish comes to the hand and takes it, then returns to its path', () => {
  const S = scene(); S.w.hand = S.hand(); S.stop = true;
  run(S, F.wait - 0.2);
  assert.equal(S.feed.lure, null, 'nothing before the wait is over');
  run(S, 0.4);
  const id = S.feed.lure; assert.notEqual(id, null, 'a fish is lured');
  const took = run(S, 30);
  assert.deepEqual(took, { id, born: 0 });
  const len = shared(S.t)[id].len, d = dist(drawn(S, id), S.w.hand);
  assert.ok(d <= len / 2 + F.take + F.grab + 0.02, `its nose is at the hand (${d.toFixed(2)} m)`);
  assert.ok(drawn(S, id).y < shared(S.t)[id].y - 0.3, 'it came down below its own band to the diver\'s hand');
  assert.equal(S.feed.lure, null);
  S.w.hand = null; S.stop = false; // (the mussel is eaten)
  run(S, F.eat + F.back + 0.5);
  assert.equal(S.feed.off.size, 0, 'back on the shared path: no offset left');
});

test('the approach never passes through the swimmer\'s head', () => {
  for (const d of [-5, -1.5, 1.5, 5]) {
    const S = scene(d); S.w.hand = S.hand(); let min = Infinity, took = null;
    for (let i = 0; i < 40 / DT && !took; i++) { S.t += DT; took = S.feed.update(DT, S.w, shared(S.t)); const id = S.feed.lure; if (id !== null) min = Math.min(min, dist(drawn(S, id), S.w)); }
    assert.ok(took, `fed from ${d} m`);
    assert.ok(min > 0.25, `kept ${min.toFixed(2)} m from the eye (from ${d} m)`);
  }
});

test('no mussel, a closed mussel (no hand given) or a hooked fish: nobody comes', () => {
  const S = scene(); run(S, 10);
  assert.equal(S.feed.off.size, 0, 'a still swimmer without bait is ignored');
  const B = scene(); B.w.hand = B.hand(); B.w.busy = () => true; run(B, 10);
  assert.equal(B.feed.lure, null, 'a fish on the hook is not lured');
  const D = scene(); D.w.hand = D.hand(); D.w.swim = false; run(D, 10);
  assert.equal(D.feed.off.size, 0, 'not in the water: no lure');
});

test('a stroke during the approach: the fish flee from the swimmer; still again, a new approach succeeds', () => {
  const S = scene(); S.w.hand = S.hand(); run(S, F.wait + 1.2);
  const id = S.feed.lure; assert.notEqual(id, null);
  const d0 = dist(drawn(S, id), S.w);
  S.w.moving = true; run(S, 1.2);
  assert.equal(S.feed.lure, null); assert.equal(S.feed.off.get(id).mode, 'flee');
  assert.ok(dist(drawn(S, id), S.w) > d0 + 2, 'it swam away from the swimmer');
  const p = drawn(S, id), q = riverProject(p.x, p.z);
  assert.ok(q.abs <= riverPoint(q.s).hw - F.edge + 0.05, 'and stayed in the channel');
  for (const f of shared(S.t)) if (S.feed.off.has(f.id)) assert.equal(S.feed.off.get(f.id).mode, 'flee');
  S.w.moving = false; S.stop = true;
  assert.equal(run(S, F.wait - 0.3), null, 'still again: the wait starts over');
  assert.ok(run(S, 40), 'the next attempt feeds a fish');
});

test('a moving swimmer without bait scares the fish near, not the far ones', () => {
  const S = scene(1); S.w.moving = true; run(S, 0.5);
  const near = shared(S.t).filter((f) => dist(f, S.w) < F.scare - 1.5), far = shared(S.t).filter((f) => dist(f, S.w) > F.scare + F.flee + 2);
  assert.ok(near.length > 0);
  for (const f of near) assert.equal(S.feed.off.get(f.id)?.mode, 'flee');
  for (const f of far) assert.equal(S.feed.off.has(f.id), false);
  S.w.moving = false; S.w.swim = false; run(S, F.calm + F.back + 4);
  assert.equal(S.feed.off.size, 0, 'they come back once the swimmer is gone');
});

test('a diver carried by the current (0.35 m/s, no stroke) is still fed: the fish tracks the drifting hand', () => {
  for (const dir of [1, -1]) { // (a fish from upstream and from downstream)
    const S = scene(4 * dir); S.stop = true; S.w.hand = S.hand();
    const took = run(S, 40, () => { S.w.x += S.tx * 0.35 * DT; S.w.z += S.tz * 0.35 * DT; S.w.hand = S.hand(); });
    assert.ok(took, `fed while drifting (${dir})`);
  }
});

// regression (found on the integrated revision): the take must not depend on the frame the drifting hand is tested in, the fish's own
// shared swimming must not eat its approach / flee speed, and a far fish must not stall at a bend; any place, any facing, 30 fps
test('anywhere along the river, facing anywhere, drifting: fed within 45 s; a stroke gains the fish 1 m in 0.9 s; fed again after stopping', () => {
  const dt = 1 / 30; let worst = 0;
  for (let k = 0; k < 60; k++) {
    const c = riverPoint(25 + (k * 53.3) % 600), tx = c.nz, tz = -c.nx, lat = ((k * 0.37) % 1 - 0.5) * 2, yaw = (k * 1.7) % 6.28, feed = new FishFeed();
    const w = { swim: true, moving: false, x: c.x + c.nx * lat, y: -7.5, z: c.z + c.nz * lat, hand: null, busy: () => false };
    let t = 1000 + k * 37.7, fs, id = null;
    const hand = () => ({ x: w.x + Math.sin(yaw) * 0.44, y: w.y - 0.1, z: w.z + Math.cos(yaw) * 0.44 });
    const at = (i) => { const f = fs[i], e = feed.off.get(i); return { x: f.x + (e?.x ?? 0), y: f.y + (e?.y ?? 0), z: f.z + (e?.z ?? 0) }; };
    const frame = (chase) => { t += dt; w.x += tx * 0.35 * dt; w.z += tz * 0.35 * dt;
      if (chase) { const p = at(id), l = Math.hypot(p.x - w.x, p.z - w.z) || 1; w.x += (p.x - w.x) / l * 0.9 * dt; w.z += (p.z - w.z) / l * 0.9 * dt; }
      w.hand = hand(); fs = shared(t); return feed.update(dt, w, fs); };
    let near = false, fed = false;
    for (let i = 0; i < 45 / dt && !near && !fed; i++) { fed = !!frame(); id = feed.lure ?? id; near = feed.lure !== null && dist(at(id), w.hand) < 1.3; }
    assert.ok(near || fed, `a fish reaches the hand (${k})`);
    if (fed) continue;
    const d0 = dist(at(id), w); w.moving = true; for (let i = 0; i < 0.9 / dt; i++) frame(true);
    assert.ok(dist(at(id), w) > d0 + 1, `the scared fish gets away (${k}: ${d0.toFixed(2)} -> ${dist(at(id), w).toFixed(2)})`);
    w.moving = false; let s = 0; for (; s < 45 && !frame(); s += dt);
    assert.ok(s < 45, `fed after stopping (${k})`); worst = Math.max(worst, s);
  }
  assert.ok(worst < 45);
});

test('the shared fish are untouched by the layer', () => assert.equal(JSON.stringify(shared(T0)), before));
