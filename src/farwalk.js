// #1236: walking beyond the home block (OUTDOOR): collision for the mapped background buildings, the two river bridges' and
// the timber footbridge's rails, and the river itself as an obstacle. Everything is derived from the data the backdrops are
// built from (SITE.west/east/north/south polygons, SITE.bridges, SITE.river), so what is drawn is what blocks. Segments are
// [x0, z0, x1, z1]; `farWalls(x, z)` returns the ones in the buckets round a point (a stable array per bucket, no per-frame work).
import { SITE, WALK, PLAYER, OUTDOOR, PADDOCK } from './config.js';
import { riverAt, waterYAt, deckAt, bridgeRecords, pierBoxes } from './riverbridge.js';
import { parkDeckAt } from './riverpark.js';
import { groundY, groundBelowDeckY, treeFeet } from './surroundings.js';
import { fenceSegments, stile, stileWalls } from './paddockgeo.js';
import { parkedCarSegments } from './parkinglayout.js';
import { busStopSegments } from './busstopgeo.js';

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

/** #1271: feet below this are UNDER a road / GC deck (the river footpath's cut), not on it. */
export const underDeck = (y) => y !== undefined && y < SITE.bridges.deckY - 0.5;

let all = null, railsOnly = null, piersOnly = null;
/** Every far collision segment inside the walkable bounds (built once, on first use). The road/GC decks' rails (`railsOnly`) hold only on
 * the deck, the road bridge's piers (`piersOnly`) only under it (#1271); `farSegments()` is everything else. */
export function farSegments() {
  if (all) return all;
  const out = [], rails = [], piers = [], W = WALK, P = SITE.riverPark;
  for (const group of [SITE.west, SITE.east, SITE.north, SITE.south]) for (const b of group.buildings) {
    out.push(...[b.polygon, ...(b.holes ?? [])].flatMap(ringSegs)); // a courtyard hole (Realgym) stays open ground inside its ring
  }
  for (const b of [...SITE.west.buildings, ...SITE.east.buildings, ...SITE.north.buildings]) { // the Klockhuset's drawn centre (pilasters, pediment, clock tower) stands in front of its footprint
    const c = b.campus?.centre; if (!c) continue;
    const z0 = c.normal > 0 ? c.face - c.depth : c.face, z1 = z0 + c.depth;
    out.push([c.x[0], z0, c.x[1], z0], [c.x[1], z0, c.x[1], z1], [c.x[1], z1, c.x[0], z1], [c.x[0], z1, c.x[0], z0]);
  }
  for (const b of SITE.blocks) if (b.style) out.push([b.x0, b.z0, b.x1, b.z0], [b.x1, b.z0, b.x1, b.z1], [b.x1, b.z1, b.x0, b.z1], [b.x0, b.z1, b.x0, b.z0]);
  // #1542: the school's free-standing brick wall along the far pavement and the greenhouse behind it (surroundings.js
  // draws both outside OUTDOOR, so only their roof walk knew them): solid from the ground too
  const SW = SITE.school?.wall, SG = SITE.school?.greenhouse;
  for (const r of [SW && { x0: SW.x0, x1: SW.x1, z0: SW.z - SW.t / 2, z1: SW.z + SW.t / 2 }, SG].filter(Boolean)) {
    out.push([r.x0, r.z0, r.x1, r.z0], [r.x1, r.z0, r.x1, r.z1], [r.x1, r.z1, r.x0, r.z1], [r.x0, r.z1, r.x0, r.z0]);
  }
  for (const r of bridgeRecords) rails.push(...railSegs(r.x, r.z, r.dx, r.dz, r.len, r.width / 2 - 0.03)); // the bridges' side rails (the deck ends stay open)
  for (const p of pierBoxes()) { // the road bridge's piers: a square each, turned with the bridge
    const c = (u, v) => [p.x + (u * p.dz + v * p.dx) * p.half, p.z + (-u * p.dx + v * p.dz) * p.half], q = [c(-1, -1), c(1, -1), c(1, 1), c(-1, 1)];
    for (let i = 0; i < 4; i++) piers.push([...q[i], ...q[(i + 1) % 4]]);
  }
  if (P.woodBridge) {
    const [[ax, az], [bx, bz]] = P.woodBridge.ends, len = Math.hypot(bx - ax, bz - az);
    out.push(...railSegs((ax + bx) / 2, (az + bz) / 2, (bx - ax) / len, (bz - az) / len, len, P.woodBridge.width / 2 - 0.03));
  }
  out.push(...fenceSegments(), ...stileWalls()); // #1280: the pony paddock's fence, closed gate included (nothing is walkable through it); #1295: the stile's opening has side walls
  out.push(...busStopSegments()); // #1301: the bus shelter's glass back and ends
  out.push(...parkedCarSegments()); // the east campus car parks' parked cars (#1278, eastlot.js draws the same footprints)
  for (const t of treeFeet) { // trunks outside the home block (the park woods, the campus avenues): a small diamond each (*guess* radii)
    if (t.x > OUTDOOR.x0 && t.x < OUTDOOR.x1 && t.z > OUTDOOR.z0 && t.z < OUTDOOR.z1) continue;
    const r = W.trunk[t.kind] ?? W.trunk.tree;
    out.push([t.x - r, t.z, t.x, t.z - r], [t.x, t.z - r, t.x + r, t.z], [t.x + r, t.z, t.x, t.z + r], [t.x, t.z + r, t.x - r, t.z]);
  }
  const inside = (s) => overlaps(s, W.x0, W.x1, W.z0, W.z1);
  railsOnly = rails.filter(inside); piersOnly = piers.filter(inside);
  all = out.filter(inside);
  return all;
}

const buckets = new Map();
/** The far segments in the 3x3 buckets round (x, z): the same array each time for the same bucket. `y` (feet): under a deck the piers
 * count instead of the deck's rails (#1271); without it (or on the deck) the rails. */
export function farWalls(x, z, y) {
  const c = WALK.cell, cx = Math.floor(x / c), cz = Math.floor(z / c), under = underDeck(y), key = (cx * 100003 + cz) * 2 + (under ? 1 : 0);
  let list = buckets.get(key);
  if (!list) {
    farSegments();
    list = [...farSegments(), ...(under ? piersOnly : railsOnly)].filter((s) => overlaps(s, (cx - 1) * c, (cx + 2) * c, (cz - 1) * c, (cz + 2) * c));
    buckets.set(key, list);
  }
  return list;
}

let stileY0 = null;
/** #1295: the ground level the stile's steps are counted from: the lowest terrain along its run (so the first riser is never above `rise`). */
export function stileBase() {
  if (!stile) return 0;
  const r = PADDOCK.stile.reach;
  return stileY0 ??= Math.min(groundY(stile.x, stile.z), groundY(stile.x + stile.nx * r, stile.z + stile.nz * r), groundY(stile.x - stile.nx * r, stile.z - stile.nz * r));
}
/** #1295: the walkable height of the stile's steps at (x, z) (risers of PADDOCK.stile.rise up to a platform over the fence line), else null. */
export function stileSurface(x, z) {
  if (!stile) return null;
  const dx = x - stile.x, dz = z - stile.z;
  if (dx > 1.3 || dx < -1.3 || dz > 1.3 || dz < -1.3) return null;
  const S = PADDOCK.stile, u = dx * stile.tx + dz * stile.tz, a = Math.abs(dx * stile.nx + dz * stile.nz);
  if (Math.abs(u) > stile.half - 0.02) return null;
  const k = a <= S.platform ? 3 : a <= S.platform + S.tread ? 2 : a <= S.platform + 2 * S.tread ? 1 : 0;
  return k ? stileBase() + k * S.rise : null;
}

const onDeck = (x, z, y) => (deckAt(x, z) !== null && !underDeck(y)) || parkDeckAt(x, z) !== null; // (feet `y` under a road/GC deck: not on it, #1271)
/** The surface under feet `y` at (x, z): the deck on it, the cut's ground under it (#1271), else `groundY`. */
export const surfaceY = (x, z, y) => (deckAt(x, z) !== null && underDeck(y) ? groundBelowDeckY(x, z) : groundY(x, z));

/** #1281: ground's gradient at (x, z) for feet `y`: `{ gx, gz, s }` (rise per metre towards +x / +z, and its length), sampled 0.3 m round. */
export function slopeAt(x, z, y) {
  const h = 0.3, g = underDeck(y) ? groundBelowDeckY : groundY, gx = (g(x + h, z) - g(x - h, z)) / (2 * h), gz = (g(x, z + h) - g(x, z - h)) / (2 * h);
  return { gx, gz, s: Math.hypot(gx, gz) };
}

/** #1281: the downhill direction `{ dx, dz, s }` a walker on ground steeper than `WALK.maxSlope` slides along at (x, z), else null. Once sliding (`was`)
 * the ground must ease below `maxSlope * slideOut` to stop (hysteresis: no flicker on the threshold). Not on a deck. */
export function slideAt(x, z, y, was = false) {
  if (z < 60 || onDeck(x, z, y)) return null;
  const q = slopeAt(x, z, y);
  return q.s > WALK.maxSlope * (was ? WALK.slideOut : 1) ? { dx: -q.gx / q.s, dz: -q.gz / q.s, s: q.s } : null;
}

/** Ground too steep to climb at (x, z): a gradient over `maxSlope` (`WALK.maxSlope`; the walker slides back, `Player.slideStep`). Not on a deck. */
export function tooSteep(x, z, maxSlope = WALK.maxSlope, y) {
  if (z < 60 || onDeck(x, z, y)) return false;
  return slopeAt(x, z, y).s > maxSlope;
}

/** #1281: is (x, z) under the river's surface for feet `y`: the terrain there (the bed's slope, `riverGround`) lies `WALK.waterDepth` m
 * under the water line. The under-bridge footpath's floor (0.7 m over the local water) and the decks are dry; so is anything off the river's banks. */
export function inWater(x, z, y) {
  if (z < 60 || onDeck(x, z, y)) return false;
  const r = riverAt(x, z);
  return r.distance < r.width / 2 + r.bank && surfaceY(x, z, y) < waterYAt(x, z, r) - WALK.waterDepth;
}

/** #1281: the nearest bank point to put someone back on who fell into the river at (x, z): searched on rings round the splash, the first
 * ring with a dry (`WALK.bankDry` m over the water line), walkable (gradient under `WALK.maxSlope * WALK.slideOut`) spot clear of every wall
 * (`farWalls`: buildings, fences, rails, trunks, cars) and off the decks. Returns `{ x, z }` or null (nothing within `WALK.bankMax`). */
export function splashBank(x, z, y) {
  const calm = WALK.maxSlope * WALK.slideOut, R = PLAYER.radius + 0.15;
  const ok = (px, pz) => {
    if (px < WALK.x0 + 1 || px > WALK.x1 - 1 || pz < WALK.z0 + 1 || pz > WALK.z1 - 1) return false;
    if (onDeck(px, pz, y) || inWater(px, pz, y) || surfaceY(px, pz, y) < waterYAt(px, pz) + WALK.bankDry) return false;
    if (slopeAt(px, pz, y).s > calm) return false;
    for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inWater(px + ox * WALK.bankClear, pz + oz * WALK.bankClear, y)) return false; // (a dry margin: not on the very edge)
    for (const sg of farWalls(px, pz, y)) { // a clear body: further than R from every segment
      const dx = sg[2] - sg[0], dz = sg[3] - sg[1], l2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((px - sg[0]) * dx + (pz - sg[1]) * dz) / l2));
      if (Math.hypot(px - sg[0] - dx * t, pz - sg[1] - dz * t) < R) return false;
    }
    return true;
  };
  for (let d = WALK.bankStep; d <= WALK.bankMax; d += WALK.bankStep) {
    const n = Math.max(12, Math.ceil(d * 3)); // (a denser ring the further out)
    let best = null;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (ok(px, pz) && (!best || surfaceY(px, pz, y) < best.y)) best = { x: px, z: pz, y: surfaceY(px, pz, y) }; // (the lowest = the nearest to the water on this ring)
    }
    if (best) return { x: best.x, z: best.z };
  }
  return null;
}

const inPoly = (p, x, z) => { let yes = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > z) !== (p[j][1] > z) && x < (p[j][0] - p[i][0]) * (z - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) yes = !yes; return yes; };
let bodies = null;
/** Someone standing inside a far building's outline or in its closed courtyard (a jetpack landing): the open point just outside, or null. */
export function buildingRescue(x, z) {
  bodies ??= [
    ...[SITE.west, SITE.east, SITE.north, SITE.south].flatMap((g) => g.buildings).map((b) => ({ p: b.polygon, xs: [Math.min(...b.polygon.map((q) => q[0])), Math.max(...b.polygon.map((q) => q[0]))], zs: [Math.min(...b.polygon.map((q) => q[1])), Math.max(...b.polygon.map((q) => q[1]))] })),
    ...SITE.blocks.filter((b) => b.style).map((b) => ({ p: [[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1], [b.x0, b.z0]], xs: [b.x0, b.x1], zs: [b.z0, b.z1] })),
  ];
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
