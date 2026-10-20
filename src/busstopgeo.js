import { SITE } from './config.js';

// #1301: the bus stop's kerb frame, platform test and shelter collision as pure geometry (no three.js), shared by busstop.js, farwalk.js,
// riverpark.js and the node test. Everything is placed in the kerb's frame: `s` m along the kerb from its first point (SITE.busStop.kerb),
// `t` m in from it (onto the platform, away from the road).
export const B = SITE.busStop;
const o = B.kerb[0], last = B.kerb[B.kerb.length - 1];
export const length = Math.hypot(last[0] - o[0], last[1] - o[1]);
export const dir = [(last[0] - o[0]) / length, (last[1] - o[1]) / length];
export const across = [dir[1], -dir[0]]; // onto the platform (away from the road)
/** plan point of kerb-frame (s, t) */
export const busStopPoint = (s, t) => [o[0] + dir[0] * s + across[0] * t, o[1] + dir[1] * s + across[1] * t];
/** kerb-frame (s, t) of a plan point */
export const toLocal = (x, z) => [(x - o[0]) * dir[0] + (z - o[1]) * dir[1], (x - o[0]) * across[0] + (z - o[1]) * across[1]];
/** Is (x, z) on the platform (widened by `margin`)? Trees and shrubs keep off it. */
export function onBusStop(x, z, margin = 0) {
  const [s, t] = toLocal(x, z);
  return s > -margin && s < length + margin && t > -margin && t < B.width + margin;
}
/** The shelter's collision: its glass back and ends (the front is open) as [x0, z0, x1, z1] segments. */
export function busStopSegments() {
  const [cs, ct] = toLocal(...B.shelter.at), h = B.shelter.len / 2, e = B.shelter.depth / 2, P = busStopPoint;
  return [[...P(cs - h, ct + e), ...P(cs + h, ct + e)], [...P(cs - h, ct - e), ...P(cs - h, ct + e)], [...P(cs + h, ct - e), ...P(cs + h, ct + e)]];
}

/** #1417: fill only the road side of the unchanged kerb, to the nearest actual
 * carriageway edge. Input polygons are the emitted pathStrip footprints. The
 * envelope switches only at edge endpoints/intersections; no assumed road width.
 * The inferred boarding apron (including its broad eastern wedge) is a visual
 * assumption between mapped features, not a surveyed asphalt outline. */
export function busStopApron(roadPolygons) {
  const edges = roadPolygons.flatMap(poly => poly.map((a, i) => {
    const [s0, t0] = toLocal(...a), [s1, t1] = toLocal(...poly[(i + 1) % poly.length]);
    if (Math.abs(s1 - s0) < 1e-9) return null;
    const m = (t1 - t0) / (s1 - s0);
    return { lo: Math.min(s0, s1), hi: Math.max(s0, s1), m, b: t0 - m * s0 };
  }).filter(Boolean));
  const stations = [0, length];
  const add = s => { if (s > 0 && s < length) stations.push(s); };
  for (const e of edges) { add(e.lo); add(e.hi); }
  for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
    const a = edges[i], b = edges[j];
    if (Math.abs(a.m - b.m) < 1e-9) continue;
    const s = (b.b - a.b) / (a.m - b.m);
    if (s > Math.max(a.lo, b.lo) && s < Math.min(a.hi, b.hi)) add(s);
  }
  const sorted = stations.sort((a, b) => a - b).filter((s, i, a) => !i || s - a[i - 1] > 1e-7), out = [];
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1], b = sorted[i], mid = (a + b) / 2;
    const edge = edges.filter(e => e.lo <= mid && e.hi >= mid && e.m * mid + e.b < 0)
      .sort((a, b) => (b.m * mid + b.b) - (a.m * mid + a.b))[0];
    if (!edge) throw new Error('Bus stop apron has no connecting carriageway');
    // Other roads' internal edges may add stations without changing the envelope.
    // Coalesce those intervals exactly; retain every actual boundary edge switch.
    if (out.at(-1)?.edge === edge) out.at(-1).b = b;
    else out.push({ a, b, edge });
  }
  return out.map(({ a, b, edge }) => [[a, 0], [b, 0], [b, edge.m * b + edge.b], [a, edge.m * a + edge.b]]
    .map(([s, t]) => busStopPoint(s, Math.min(0, t))));
}
