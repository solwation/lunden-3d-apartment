import { RIVER_FISH as C, SITE } from './config.js';

// #1752: the fish in Höje å as pure functions of (seed, id, born, time), with no three.js so the Worker room (cloudflare/riverfish.js) and a
// node test can use them. Every client that knows the room's clock draws the same fish in the same places and the same rings at the same
// moments, so nothing but the clock, the seed and the caught fish travels (src/riverfishsync.js).
// A fish patrols a stretch of the river's centre line (SITE.river.path): along = home + range x (two slow sine waves), sideways a share of the
// channel's free half width (the bed is flat out to width/2, riverbridge.js riverGround), its depth between the bed and the surface. The
// stretches avoid the river's two ends and the road bridge's piers (the formula of riverbridge.js pierBoxes, re-derived here from SITE.bridges
// because riverbridge.js needs three.js; tools/riverfishtest.cjs checks the fish against the real pierBoxes). Now and then (one chance per
// slot of RIVER_FISH.rise.every s) a fish rises: its back breaks the surface and a ring spreads from that spot.

const R = SITE.river, B = SITE.bridges;
const P = R.path, seg = [];
{ let acc = 0; for (let i = 1; i < P.length; i++) { const [ax, az] = P[i - 1], [bx, bz] = P[i], l = Math.hypot(bx - ax, bz - az); seg.push({ ax, az, dx: (bx - ax) / l, dz: (bz - az) / l, l, s0: acc, i }); acc += l; } }
export const riverLength = seg.reduce((s, q) => s + q.l, 0);
// the vertex normals (mean of the two segments'), so a sideways offset moves smoothly round a bend instead of jumping at the vertex
const vn = P.map((_, i) => {
  const a = seg[Math.max(0, i - 1)], b = seg[Math.min(seg.length - 1, i)], x = -(a.dz + b.dz), z = a.dx + b.dx, l = Math.hypot(x, z) || 1;
  return [x / l, z / l];
});
const widthAt = (q, k) => (R.widths ? R.widths[q.i - 1] + (R.widths[q.i] - R.widths[q.i - 1]) * k : R.width);

/** The river's centre line at `s` m from its first point: { x, z, nx, nz (the blended normal), hw (half the open channel), s }. */
export function riverPoint(s, o = {}) {
  let q = seg[seg.length - 1];
  for (const g of seg) if (s <= g.s0 + g.l) { q = g; break; }
  const k = Math.max(0, Math.min(1, (s - q.s0) / q.l)), [n0x, n0z] = vn[q.i - 1], [n1x, n1z] = vn[q.i], nx = n0x + (n1x - n0x) * k, nz = n0z + (n1z - n0z) * k, nl = Math.hypot(nx, nz) || 1;
  o.x = q.ax + q.dx * q.l * k; o.z = q.az + q.dz * q.l * k; o.nx = nx / nl; o.nz = nz / nl; o.hw = widthAt(q, k) / 2; o.s = s;
  return o;
}
/** (x, z) in the river frame: { s along, d from the centre line (signed by the segment's normal) }. */
export function riverProject(x, z, o = {}) {
  let bd = Infinity;
  for (const q of seg) {
    const k = Math.max(0, Math.min(q.l, (x - q.ax) * q.dx + (z - q.az) * q.dz)), px = q.ax + q.dx * k, pz = q.az + q.dz * k, d = Math.hypot(x - px, z - pz);
    if (d < bd) { bd = d; o.s = q.s0 + k; o.d = (x - px) * -q.dz + (z - pz) * q.dx; o.abs = d; }
  }
  return o;
}
// #1350: water and bed follow the river's fall from the road-bridge centre (riverbridge.js waterYAt / riverGround, same anchor)
const road = (() => { const [[ax, az], [bx, bz]] = B.road.ends, full = Math.hypot(bx - ax, bz - az); return { x: (ax + bx) / 2, z: (az + bz) / 2, dx: (bx - ax) / full, dz: (bz - az) / full, len: B.road.length ?? full }; })();
const anchor = riverProject(road.x, road.z).s, perM = R.fall?.perM ?? 0;
export const waterAt = (s) => B.waterY - (s - anchor) * perM;
export const bedAt = (s) => B.bedY - (s - anchor) * perM;

/** The road bridge's piers [{ x, z, r }] as riverbridge.js pierBoxes places them; `r` reaches round the footing (SITE.bridges.road.foot, square). */
export const piers = [-road.len / 3, 0, road.len / 3].flatMap((a) => [-1, 1].map((side) => {
  const lx = side * B.road.width * 0.29;
  return { x: road.x + lx * road.dz + a * road.dx, z: road.z - lx * road.dx + a * road.dz, r: B.road.foot * Math.SQRT1_2 };
}));
const maxLen = Math.max(...C.species.map((s) => s.len));
/** Stretches of the centre line [s0, s1] a fish may patrol: inside the ends, outside every pier that stands in the channel. */
export const swimIntervals = (() => {
  const cut = [];
  for (const p of piers) {
    const q = riverProject(p.x, p.z), hw = riverPoint(q.s).hw, reach = p.r + C.pierClear + maxLen;
    if (q.abs < hw + reach) cut.push([q.s - reach - hw, q.s + reach + hw]);
  }
  cut.sort((a, b) => a[0] - b[0]);
  const out = []; let at = C.ends;
  for (const [a, b] of cut) { if (a > at) out.push([at, a]); at = Math.max(at, b); }
  if (riverLength - C.ends > at) out.push([at, riverLength - C.ends]);
  return out;
})();

/** A seeded generator (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash = (...v) => { let h = 2166136261; for (const x of v) { h ^= x >>> 0; h = Math.imul(h, 16777619); h ^= h >>> 13; } return h >>> 0; };
const between = ([a, b], r) => a + (b - a) * r();
const TAU = Math.PI * 2;

const cache = new Map();
/** The fixed traits of fish `id` in its `born`-th life: species, home stretch, waves, rise slots. */
export function fishSpec(id, born = 0, seed = C.seed) {
  const key = `${seed}:${id}:${born}`;
  let f = cache.get(key);
  if (f) return f;
  const r = rng(hash(seed, id + 1, born + 1)), total = C.species.reduce((s, q) => s + q.weight, 0);
  let pick = r() * total, sp = 0;
  while (sp < C.species.length - 1 && (pick -= C.species[sp].weight) > 0) sp++;
  let range = between(C.range, r);
  const room = swimIntervals.map(([a, b]) => Math.max(0, b - a - 2 * range)), sum = room.reduce((s, v) => s + v, 0);
  let home;
  if (sum > 0) { let x = r() * sum, j = 0; while (j < room.length - 1 && x > room[j]) x -= room[j++]; home = swimIntervals[j][0] + range + x; } else { // (no stretch that long: the longest one, a shorter range)
    const [a, b] = swimIntervals.reduce((m, v) => (v[1] - v[0] > m[1] - m[0] ? v : m)); range = (b - a) / 2; home = (a + b) / 2; r();
  }
  const p1 = between(C.periods, r), p2 = p1 / (1.6 + 0.6 * r());
  f = { id, born, species: sp, spec: C.species[sp], range, home,
    w: [TAU / p1, TAU / p2, TAU / between([25, 60], r), TAU / between([9, 20], r), TAU / between([14, 40], r)], ph: [0, 0, 0, 0, 0].map(() => r() * TAU),
    slot: between(C.rise.every, r), off: r() * 100, wag: r() * TAU };
  if (cache.size > 512) cache.clear();
  cache.set(key, f);
  return f;
}

const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
/** The rise event of slot `k` of fish `f`: its time te (s), or null when it stays down that slot. */
function riseIn(f, k, seed) {
  const h = hash(seed, f.id + 101, f.born + 7, k + 0x4000);
  if ((h & 0xffff) / 65536 >= C.rise.chance) return null;
  return (k + 0.25 + 0.5 * ((h >>> 16) / 65536)) * f.slot - f.off;
}
/** 0..1: how far up fish `f` is at time `t` (1 = its back breaks the surface). */
export function riseAt(f, t, seed = C.seed) {
  const k = Math.floor((t + f.off) / f.slot), te = riseIn(f, k, seed);
  if (te === null) return 0;
  return t <= te ? sm((t - (te - C.rise.up)) / C.rise.up) : 1 - sm((t - te) / C.rise.down);
}
const base = (f, t, o) => {
  const [w1, w2, w3, w4, w5] = f.w, [q1, q2, q3, q4, q5] = f.ph;
  const s = f.home + f.range * (0.8 * Math.sin(w1 * t + q1) + 0.2 * Math.sin(w2 * t + q2));
  riverPoint(s, o);
  const free = Math.max(0, o.hw - C.edge - f.spec.len / 2), lat = (0.8 * Math.sin(w3 * t + q3) + 0.2 * Math.sin(w4 * t + q4)) * C.side * free;
  o.x += o.nx * lat; o.z += o.nz * lat; o.lat = lat; o.free = free;
  o.deep = 0.5 + 0.5 * Math.sin(w5 * t + q5);
  return o;
};
const A = {}, Bq = {};
/** Fish `f` at time `t` (s since RIVER_FISH.epoch): { x, y (body centre), z, yaw (heading, three.js Y rotation of +z), s, lat, rise, water, bed }. */
export function fishAt(f, t, o = {}, seed = C.seed) {
  base(f, t, o);
  base(f, t - 0.3, A); base(f, t + 0.3, Bq);
  const vx = Bq.x - A.x, vz = Bq.z - A.z;
  o.yaw = Math.atan2(vx, vz); o.speed = Math.hypot(vx, vz) / 0.6;
  const water = waterAt(o.s), bed = bedAt(o.s), lo = bed + C.depth[0], hi = water - C.depth[1];
  o.rise = riseAt(f, t, seed);
  const y = lo + (hi - lo) * o.deep;
  o.y = y + (water - f.spec.h * (0.5 - C.rise.show) - y) * o.rise;
  o.water = water; o.bed = bed;
  return o;
}
const RG = {};
/** The rings fish `f` has on the water at time `t`: [{ x, z, y (the surface), age (s), id, born }] (at most two events x two rings). */
export function ringsAt(f, t, out = [], seed = C.seed) {
  const k = Math.floor((t + f.off) / f.slot);
  for (const kk of [k - 1, k]) {
    const te = riseIn(f, kk, seed);
    if (te === null || t < te || t - te > C.ring.life + C.ring.second) continue;
    base(f, te, RG);
    for (const lag of [0, C.ring.second]) { const age = t - te - lag; if (age >= 0 && age < C.ring.life) out.push({ x: RG.x, z: RG.z, y: waterAt(RG.s), age, id: f.id, born: f.born }); }
  }
  return out;
}
/** #1753: the length in cm of fish `id` in its life `born` when caught, within [lo, hi] (FISHING.species), smaller ones commoner; the same for everybody. */
export const catchCm = (id, born, seed = C.seed, [lo, hi] = [15, 40]) => Math.round(lo + (hi - lo) * Math.pow(rng(hash(seed, id + 211, born + 3))(), 1.6));
/** Seconds since RIVER_FISH.epoch for a wall-clock time in ms. */
export const fishTime = (ms) => ms / 1000 - C.epoch;
