// #1236: walking beyond the home block (OUTDOOR): collision for the mapped background buildings, the two river bridges' and
// the timber footbridge's rails, and the river itself as an obstacle. Everything is derived from the data the backdrops are
// built from (SITE.west/east/north/south polygons, SITE.bridges, SITE.river), so what is drawn is what blocks. Segments are
// [x0, z0, x1, z1]; `farWalls(x, z)` returns the ones in the buckets round a point (a stable array per bucket, no per-frame work).
import { SITE, WALK, PLAYER } from './config.js';
import { riverAt, deckAt, bridgeRecords } from './riverbridge.js';
import { parkDeckAt } from './riverpark.js';
import { groundY } from './surroundings.js';

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
  for (const b of SITE.blocks) if (b.style) out.push([b.x0, b.z0, b.x1, b.z0], [b.x1, b.z0, b.x1, b.z1], [b.x1, b.z1, b.x0, b.z1], [b.x0, b.z1, b.x0, b.z0]);
  for (const r of bridgeRecords) out.push(...railSegs(r.x, r.z, r.dx, r.dz, r.len, r.width / 2 - 0.03)); // the bridges' side rails (the deck ends stay open)
  if (P.woodBridge) {
    const [[ax, az], [bx, bz]] = P.woodBridge.ends, len = Math.hypot(bx - ax, bz - az);
    out.push(...railSegs((ax + bx) / 2, (az + bz) / 2, (bx - ax) / len, (bz - az) / len, len, P.woodBridge.width / 2 - 0.03));
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
