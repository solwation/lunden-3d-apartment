// #1236: walking beyond the home block (OUTDOOR): collision for the mapped background buildings, the two river bridges' and
// the timber footbridge's rails, and the river itself as an obstacle. Everything is derived from the data the backdrops are
// built from (SITE.west/east/north/south polygons, SITE.bridges, SITE.river), so what is drawn is what blocks. Segments are
// [x0, z0, x1, z1]; `farWalls(x, z)` returns the ones in the buckets round a point (a stable array per bucket, no per-frame work).
import { SITE, WALK, PLAYER, OUTDOOR } from './config.js';
import { riverAt, deckAt, bridgeRecords } from './riverbridge.js';
import { parkDeckAt } from './riverpark.js';
import { groundY, treeFeet } from './surroundings.js';

const ringSegs = (p) => {
  const out = [], n = p.length, closed = p[0][0] === p[n - 1][0] && p[0][1] === p[n - 1][1], m = closed ? n - 1 : n;
  for (let i = 0; i < m; i++) { const a = p[i], b = p[(i + 1) % m]; out.push([a[0], a[1], b[0], b[1]]); }
  return out;
};
const overlaps = (s, x0, x1, z0, z1) => Math.max(s[0], s[2]) > x0 && Math.min(s[0], s[2]) < x1 && Math.max(s[1], s[3]) > z0 && Math.min(s[1], s[3]) < z1;
const railSegs = (cx, cz, dx, dz, len, half) => [-1, 1].map((k) => {
  const at = (a) => [cx + a * dx - k * half * dz, cz + a * dz + k * half * dx];
  return [...at(-len / 2), ...at(len / 2)];
});

let all = null;
/** Every far collision segment inside the walkable bounds (built once, on first use). */
export function farSegments() {
  if (all) return all;
  const out = [], W = WALK, P = SITE.riverPark;
  for (const group of [SITE.west, SITE.east, SITE.north, SITE.south]) for (const b of group.buildings) {
    out.push(...[b.polygon, ...(b.holes ?? [])].flatMap(ringSegs)); // a courtyard hole (Realgym) stays open ground inside its ring
  }
  for (const b of [...SITE.west.buildings, ...SITE.east.buildings, ...SITE.north.buildings]) { // the Klockhuset's drawn centre (pilasters, pediment, clock tower) stands in front of its footprint
    const c = b.campus?.centre; if (!c) continue;
    const z0 = c.normal > 0 ? c.face - c.depth : c.face, z1 = z0 + c.depth;
    out.push([c.x[0], z0, c.x[1], z0], [c.x[1], z0, c.x[1], z1], [c.x[1], z1, c.x[0], z1], [c.x[0], z1, c.x[0], z0]);
  }
  for (const b of SITE.blocks) if (b.style) out.push([b.x0, b.z0, b.x1, b.z0], [b.x1, b.z0, b.x1, b.z1], [b.x1, b.z1, b.x0, b.z1], [b.x0, b.z1, b.x0, b.z0]);
  for (const r of bridgeRecords) out.push(...railSegs(r.x, r.z, r.dx, r.dz, r.len, r.width / 2 - 0.03)); // the bridges' side rails (the deck ends stay open)
  if (P.woodBridge) {
    const [[ax, az], [bx, bz]] = P.woodBridge.ends, len = Math.hypot(bx - ax, bz - az);
    out.push(...railSegs((ax + bx) / 2, (az + bz) / 2, (bx - ax) / len, (bz - az) / len, len, P.woodBridge.width / 2 - 0.03));
  }
  for (const t of treeFeet) { // trunks outside the home block (the park woods, the campus avenues): a small diamond each (*guess* radii)
    if (t.x > OUTDOOR.x0 && t.x < OUTDOOR.x1 && t.z > OUTDOOR.z0 && t.z < OUTDOOR.z1) continue;
    const r = W.trunk[t.kind] ?? W.trunk.tree;
    out.push([t.x - r, t.z, t.x, t.z - r], [t.x, t.z - r, t.x + r, t.z], [t.x + r, t.z, t.x, t.z + r], [t.x, t.z + r, t.x - r, t.z]);
  }
  all = out.filter((s) => overlaps(s, W.x0, W.x1, W.z0, W.z1));
  return all;
}

const buckets = new Map();
/** The far segments in the 3x3 buckets round (x, z): the same array each time for the same bucket. */
export function farWalls(x, z) {
  const c = WALK.cell, cx = Math.floor(x / c), cz = Math.floor(z / c), key = cx * 100003 + cz;
  let list = buckets.get(key);
  if (!list) {
    list = farSegments().filter((s) => overlaps(s, (cx - 1) * c, (cx + 2) * c, (cz - 1) * c, (cz + 2) * c));
    buckets.set(key, list);
  }
  return list;
}

const onDeck = (x, z) => deckAt(x, z) !== null || parkDeckAt(x, z) !== null;

/** Water that stops the visitor: the river and its shallow edge (`WALK.wade`), except on a bridge deck. */
export function waterBlocked(x, z, wade = WALK.wade) {
  if (z < 60 || onDeck(x, z)) return false;
  const r = riverAt(x, z);
  return r.distance < r.width / 2 + wade;
}

/** Ground too steep to climb at (x, z): a gradient over `WALK.maxSlope`, sampled 0.3 m round. */
export function tooSteep(x, z, maxSlope = WALK.maxSlope) {
  if (z < 60 || onDeck(x, z)) return false;
  const h = 0.3, gx = (groundY(x + h, z) - groundY(x - h, z)) / (2 * h), gz = (groundY(x, z + h) - groundY(x, z - h)) / (2 * h);
  return Math.hypot(gx, gz) > maxSlope;
}

/** Someone who ended up in the water (a fall, a jump, the jetpack): the dry bank point to put them back on, or null. */
export function waterRescue(x, z) {
  if (z < 60 || onDeck(x, z)) return null;
  const r = riverAt(x, z);
  if (r.distance >= r.width / 2) return null;
  const side = (x - r.x) * r.nx + (z - r.z) * r.nz >= 0 ? 1 : -1, d = r.width / 2 + WALK.rescue;
  return { x: r.x + r.nx * side * d, z: r.z + r.nz * side * d, r: PLAYER.radius };
}

const inPoly = (p, x, z) => { let yes = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > z) !== (p[j][1] > z) && x < (p[j][0] - p[i][0]) * (z - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) yes = !yes; return yes; };
let bodies = null;
/** Someone standing inside a far building's outline or in its closed courtyard (a jetpack landing): the open point just outside, or null. */
export function buildingRescue(x, z) {
  bodies ??= [SITE.west, SITE.east, SITE.north, SITE.south].flatMap((g) => g.buildings).map((b) => ({ p: b.polygon, xs: [Math.min(...b.polygon.map((q) => q[0])), Math.max(...b.polygon.map((q) => q[0]))], zs: [Math.min(...b.polygon.map((q) => q[1])), Math.max(...b.polygon.map((q) => q[1]))] }));
  const b = bodies.find((q) => x > q.xs[0] && x < q.xs[1] && z > q.zs[0] && z < q.zs[1] && inPoly(q.p, x, z));
  if (!b) return null;
  let best = null;
  for (let i = 0; i + 1 < b.p.length; i++) { // the nearest point on the outline, then a step further out
    const [ax, az] = b.p[i], [cx, cz] = b.p[i + 1], dx = cx - ax, dz = cz - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), qx = ax + t * dx, qz = az + t * dz, d = Math.hypot(qx - x, qz - z);
    if (!best || d < best.d) best = { d, qx, qz };
  }
  const k = (best.d || 1), out = PLAYER.radius + 0.6; // (x, z) -> nearest wall point -> out by `out`
  const nx = (best.qx - x) / k, nz = (best.qz - z) / k;
  return { x: best.qx + nx * out, z: best.qz + nz * out };
}

/** The visitor is at the outer wall of the walkable area (within `m`): the side, or null. */
export function atEdge(x, z, m = 0.6) {
  return x < WALK.x0 + m || x > WALK.x1 - m || z < WALK.z0 + m || z > WALK.z1 - m;
}
