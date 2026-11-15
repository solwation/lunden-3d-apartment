// #1952: the pure drift rules: things stay in the open channel (round the bends and the bridge piers too), move downstream at the
// configured speed, wrap inside the window with no visible pop, and are a pure function of time.   node --test src/riverdrift.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { SITE, SWIM, RIVER_DRIFT } from './config.js';
import { driftPath, driftObstacles, DriftField, driftHash, driftDepth } from './riverdrift.js';

const R = SITE.river, B = SITE.bridges, D = RIVER_DRIFT;
const raw = R.path.concat(R.downstream?.path ?? []), points = [R.upstream.boundary, ...raw], widths = [R.widths[0], ...raw.map((_, i) => R.widths[Math.min(i, R.widths.length - 1)])];
// The channel as riverbridge.js `riverAt` has it: the nearest raw segment, its width interpolated along it.
const channel = (x, z) => {
  let best = { d: Infinity };
  for (let i = 1; i < points.length; i++) {
    const [a, b] = points[i - 1], dx = points[i][0] - a, dz = points[i][1] - b, l2 = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((x - a) * dx + (z - b) * dz) / l2)),
      d = Math.hypot(x - a - t * dx, z - b - t * dz);
    if (d < best.d) best = { d, w: widths[i - 1] + (widths[i] - widths[i - 1]) * t, dx: dx / Math.sqrt(l2), dz: dz / Math.sqrt(l2) };
  }
  return best;
};
// The road bridge's piers as riverbridge.js `pierBoxes` places them (the drawn pier is `pier` wide; `half` adds the walking margin).
const piers = (() => {
  const s = B.road, [a, b] = s.ends, full = Math.hypot(b[0] - a[0], b[1] - a[1]), len = s.length ?? full, x = (a[0] + b[0]) / 2, z = (a[1] + b[1]) / 2, dx = (b[0] - a[0]) / full, dz = (b[1] - a[1]) / full, out = [];
  for (const k of [-len / 3, 0, len / 3]) for (const side of [-1, 1]) { const lx = side * s.width * 0.29; out.push({ x: x + lx * dz + k * dx, z: z - lx * dx + k * dz, half: s.pier / 2 + (B.underpass?.pier ?? B.pierMargin ?? 0.2), drawn: s.pier / 2, dx, dz }); }
  return out;
})();
const path = driftPath(points, widths, D.path), obstacles = driftObstacles(path, piers, D.pier.clear);
const field = (c, seed = 1) => new DriftField({ path, speed: D.speed, obstacles, bend: D.pier.bend, seed, ...c });
const surface = field(D.surface), under = field(D.under, 2);

test('the smoothed line follows the river from the east edge to the west edge', () => {
  assert.ok(path.length > 780 && path.length < 860, `length ${path.length}`);
  const a = path.at(0, {}), b = path.at(path.length, {});
  assert.ok(Math.hypot(a.x - points[0][0], a.z - points[0][1]) < 0.01 && Math.hypot(b.x - points.at(-1)[0], b.z - points.at(-1)[1]) < 1.01);
  let worst = 0, turn = 0;
  for (let s = 0; s <= path.length; s += 0.5) {
    const p = path.at(s, {}), c = channel(p.x, p.z); worst = Math.max(worst, c.d / (c.w / 2));
    assert.ok(Math.abs(Math.hypot(p.tx, p.tz) - 1) < 1e-9);
    const q = path.at(s + 0.5, {}); turn = Math.max(turn, Math.acos(Math.min(1, p.tx * q.tx + p.tz * q.tz)));
    // downstream is the raw path's own direction (swim.js currentDir); on a bend the rounded line points between the two segments
    assert.ok(p.tx * c.dx + p.tz * c.dz > 0.55, `tangent downstream at ${s}`);
  }
  assert.ok(worst < 0.5, `the rounded line stays within half the channel's half width of the centre line (${worst})`);
  assert.ok(turn < 0.25, `no sharp corner left (${turn} rad per 0.5 m)`);
  const n = path.nearest(path.at(400, {}).x, path.at(400, {}).z, {}); assert.ok(Math.abs(n.s - 400) < 0.01 && n.d < 0.01 && Math.abs(n.u) < 0.01);
});

test('two road-bridge piers stand in the channel and are found', () => {
  assert.equal(obstacles.length, 2);
  for (const p of obstacles) assert.ok(Math.abs(p.u) < 1.5 && p.r > 0.8 && p.r < 1.3, JSON.stringify(p));
});

for (const [name, F] of [['surface', surface], ['under water', under]]) {
  test(`${name}: everything drawn is in the open channel and clear of the piers, along the whole river`, () => {
    const o = {}; let seen = 0, edge = 0, pier = Infinity;
    for (let sc = 0; sc <= path.length; sc += F.range / 2) for (const t of [0, 13.7, 251.3]) for (let i = 0; i < F.count; i++) {
      F.particle(i, t, sc, o);
      assert.ok(o.s >= sc - F.range - 1e-9 && o.s < sc + F.range + 1e-9, 'inside the window');
      assert.ok(o.alpha >= 0 && o.alpha <= 1);
      if (!(o.alpha > 0)) continue; seen++;
      const c = channel(o.x, o.z); edge = Math.max(edge, c.d - c.w / 2);
      assert.ok(c.d <= c.w / 2 - 0.05, `in the channel at s ${o.s.toFixed(1)} (x ${o.x.toFixed(1)}, z ${o.z.toFixed(1)}): ${c.d.toFixed(2)} of ${(c.w / 2).toFixed(2)}`);
      for (const p of piers) { // the drawn pier's box in the bridge's frame, with 0.1 m to spare
        const a = Math.abs((o.x - p.x) * p.dx + (o.z - p.z) * p.dz), b = Math.abs(-(o.x - p.x) * p.dz + (o.z - p.z) * p.dx), d = Math.max(a, b) - p.drawn; pier = Math.min(pier, d);
        assert.ok(d > 0.1, `clear of the pier at ${p.x.toFixed(1)}, ${p.z.toFixed(1)}: ${d.toFixed(2)}`);
      }
    }
    assert.ok(seen > F.count * 50); console.log(`  ${name}: ${seen} samples, nearest the channel's edge ${(-edge).toFixed(2)} m inside, nearest a pier ${pier.toFixed(2)} m`);
  });

  test(`${name}: things move downstream at the current's speed and do not pop`, () => {
    assert.equal(D.speed, SWIM.current);
    const a = {}, b = {}, dt = 0.25; let n = 0, sum = 0, lo = Infinity, hi = 0, jump = 0, popped = 0;
    for (const sc of [120, 262, 300, 430, 700]) for (let t = 0; t < 60; t += dt) for (let i = 0; i < F.count; i += 3) {
      F.particle(i, t, sc, a); F.particle(i, t + dt, sc, b);
      if (a.id !== b.id) { popped = Math.max(popped, a.alpha, b.alpha); continue; } // wrapped: only ever at the faded window end
      assert.equal(b.r1, a.r1); jump = Math.max(jump, Math.abs(b.alpha - a.alpha));
      if (a.alpha < 0.5) continue;
      const v = ((b.x - a.x) * a.tx + (b.z - a.z) * a.tz) / dt; n++; sum += v; lo = Math.min(lo, v); hi = Math.max(hi, v);
      assert.ok(Math.abs(b.s - a.s - D.speed * dt) < 1e-9);
    }
    const mean = sum / n; console.log(`  ${name}: mean ${mean.toFixed(4)} m/s downstream (${lo.toFixed(3)} … ${hi.toFixed(3)}) over ${n} steps`);
    assert.ok(Math.abs(mean - D.speed) < 0.01 && lo > D.speed * 0.5 && hi < D.speed * 1.5, `${mean} ${lo} ${hi}`);
    assert.ok(popped < 0.02, `a wrap is invisible (alpha ${popped})`); assert.ok(jump < 0.08, `alpha changes slowly (${jump})`);
  });

  test(`${name}: a pure function of time; a parcel is the same thing from every window`, () => {
    const a = F.particle(7, 42.5, 300, {}), b = field(F === surface ? D.surface : D.under, F.seed).particle(7, 42.5, 300, {});
    assert.deepEqual(a, b);
    // the same parcel of water seen from a window 10 m further on: same place, lane and looks
    let same = 0; for (let i = 0; i < F.count; i++) { const p = F.particle(i, 42.5, 300, {}), q = F.particle(i, 42.5, 300 + F.range / 4, {}); if (p.id !== q.id) continue; same++; assert.ok(Math.abs(p.x - q.x) < 1e-9 && Math.abs(p.z - q.z) < 1e-9 && p.r1 === q.r1 && p.r2 === q.r2); }
    assert.ok(same > F.count * 0.6);
  });
}

test('a still diver drifts along with the things under water; swimming upstream they come towards the diver', () => {
  const o = {}, at = (t, sc) => under.particle(5, t, sc, o).s;
  // a diver carried by the current: the window's centre moves with the water, so the thing keeps its distance
  assert.ok(Math.abs((at(10, 300 + D.speed * 10) - (300 + D.speed * 10)) - (at(0, 300) - 300)) < 1e-9);
  // a diver making 0.55 m/s upstream: the thing closes in at speed + 0.55
  const rel = (t) => at(t, 300 - 0.55 * t) - (300 - 0.55 * t); assert.ok(Math.abs((rel(2) - rel(0)) / 2 - (D.speed + 0.55)) < 1e-9);
});

test('helpers', () => {
  const seen = new Set(); for (let i = 0; i < 500; i++) { const h = driftHash(i, 3, 1); assert.ok(h >= 0 && h < 1); seen.add(Math.floor(h * 10)); } assert.equal(seen.size, 10);
  assert.equal(driftHash(4, 5, 6), driftHash(4, 5, 6));
  assert.ok(Math.abs(driftDepth(0, 3, 0.6, 1.2) - 1.8) < 1e-12 && Math.abs(driftDepth(3, 3, 0.6, 1.2) - 0.6) < 1e-12 && driftDepth(9, 3, 0.6, 1.2) === 0.6);
  assert.ok(D.surface.count <= 400 && D.under.count <= 300, 'counts stay small');
});
