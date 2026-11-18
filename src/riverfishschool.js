import { RIVER_FISH as C, RIVER_FISH_SCHOOL as SC } from './config.js';
import { fishAt, riseAt, riverPoint, riverProject, swimIntervals, waterAt, bedAt } from './riverfishswim.js';

// #2130: loose schools, still moments in cover and quick surface takes for the fish in Höje å, as a LOCAL drawing layer over the shared fish.
// No three.js (node test: tools/riverfishschooltest.mjs). Like the shared swim functions (src/riverfishswim.js) everything here is a pure
// function of (seed, the present fish's ids and lives, the room's clock, the river's cover), so every client that sees the same fish draws the
// same schools, holds and takes; nothing is sent, and the room (cloudflare/riverfish.js), the rod (`RiverFish.near`), the catch check and the
// feeding layer (src/riverfishfeed.js) keep the shared places. riverfish.js draws each fish at `presentAt` instead of its shared place.
//   school : fish of a schooling kind (RIVER_FISH_SCHOOL.kinds) whose home stretches lie close together form one school; the lowest id leads.
//            A member whose own shared place comes within `join` m of its leader's takes a slot beside / behind the leader, following the
//            leader's path `lag` s per rank later, so the school turns together; out of reach again it swims its own path.
//   hold   : now and then a fish alone or a whole school stands still in the lee of a stone or a lily patch nearby, heads against the current.
//   take   : now and then one fish of a school (or a fish alone) darts up and takes something at the surface: rings spread from that spot.
// Hold and take are episodes in seeded time slots (like the shared rises), rare and the same on every client.

const TAU = Math.PI * 2;
const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const lerp = (a, b, k) => a + (b - a) * k;
const hash = (...v) => { let h = 2166136261; for (const x of v) { h ^= x >>> 0; h = Math.imul(h, 16777619); h ^= h >>> 13; } return h >>> 0; };
const unit01 = (h) => (h & 0xffff) / 65536, high01 = (h) => (h >>> 16) / 65536;
const wrap = (a) => { a %= TAU; return a > Math.PI ? a - TAU : a < -Math.PI ? a + TAU : a; };
const stretchOf = (s) => { for (let i = 0; i < swimIntervals.length; i++) if (s >= swimIntervals[i][0] - 1e-6 && s <= swimIntervals[i][1] + 1e-6) return i; return -1; };
const SALT = { hold: 0x2130, take: 0x2131 };

/** The schools among the present fish `specs` (riverfishswim.js fishSpec objects): Map id -> { lead, rank, size, members }. Fish of no
 * schooling kind, or with nobody near, are a school of one (rank 0, their own lead). */
export function schoolsOf(specs, cfg = SC) {
  const list = [...specs].sort((a, b) => a.id - b.id), up = new Map(list.map((f) => [f.id, f.id]));
  const root = (i) => { while (up.get(i) !== i) i = up.get(i); return i; };
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j], k = cfg.kinds[a.spec.name];
    if (!k || k !== cfg.kinds[b.spec.name] || Math.abs(a.home - b.home) > cfg.homeGap || stretchOf(a.home) !== stretchOf(b.home)) continue;
    const ra = root(a.id), rb = root(b.id); if (ra !== rb) up.set(Math.max(ra, rb), Math.min(ra, rb));
  }
  const groups = new Map();
  for (const f of list) { const r = root(f.id); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(f.id); }
  const out = new Map();
  for (const ids of groups.values()) for (let c = 0; c < ids.length; c += cfg.maxSize) {
    const members = ids.slice(c, c + cfg.maxSize);
    members.forEach((id, rank) => out.set(id, { lead: members[0], rank, size: members.length, members }));
  }
  return out;
}

/** Where a fish can stand still: cover = [{ x, z, r, kind: 'stone' | 'lily' }] in the world -> the shared river frame [{ s, d, r, kind }]. */
export function coverFrame(cover) {
  const q = {};
  return cover.map((c) => { riverProject(c.x, c.z, q); return { s: q.s, d: q.d, r: c.r, kind: c.kind }; }).sort((a, b) => a.s - b.s);
}

/** A seeded episode slot of `kind` ('hold' / 'take') of the school led by `f` (a fishSpec): { k, start, … } for slot `k`, or null. */
function slotOf(f, kind, seed, cfg) {
  const E = cfg[kind], h = hash(seed, f.id + 17, f.born + 5, SALT[kind]);
  return { len: E.every[0] + (E.every[1] - E.every[0]) * unit01(h), off: high01(h) * E.every[1] };
}
function episodeIn(f, kind, k, seed, cfg) {
  const E = cfg[kind], sl = slotOf(f, kind, seed, cfg), h = hash(seed, f.id + 29, f.born + 11, k + 0x8000, SALT[kind]);
  if (unit01(h) >= E.chance) return null;
  return { k, start: (k + 0.1 + 0.4 * high01(h)) * sl.len - sl.off, h: hash(h, 7) };
}
function episodes(f, kind, t, seed, cfg) {
  const sl = slotOf(f, kind, seed, cfg), k = Math.floor((t + sl.off) / sl.len);
  return [episodeIn(f, kind, k - 1, seed, cfg), episodeIn(f, kind, k, seed, cfg)];
}

const memo = new Map(), A = {}, Bq = {};
/** The hold of slot `k` for the school led by `f`: its anchor in the river frame and its timing (cached; a pure function of its inputs). */
function holdPlan(f, ep, seed, cover, cfg) {
  const key = `${seed}:${f.id}:${f.born}:${ep.k}:${cover.length}`;
  let p = memo.get(key);
  if (p) return p;
  const H = cfg.hold, dur = H.dur[0] + (H.dur[1] - H.dur[0]) * unit01(ep.h), st = swimIntervals[stretchOf(f.home)] ?? [0, 1e9];
  fishAt(f, ep.start, A, seed);
  let best = null, bd = H.reach;
  for (const c of cover) {
    if (c.s < A.s - H.reach) continue; if (c.s > A.s + H.reach) break;
    const d = Math.hypot(c.s - A.s, c.d - A.lat);
    if (d < bd && c.s > st[0] + 1 && c.s < st[1] - 1) { bd = d; best = c; }
  }
  const len = f.spec.len, s = best ? Math.max(st[0] + len, Math.min(st[1] - len, best.s + best.r + H.clear + len / 2)) : A.s; // (in the lee: downstream of it)
  const room = Math.max(0, riverPoint(s, Bq).hw - C.edge - len / 2), d = Math.max(-room, Math.min(room, best ? best.d : A.lat));
  const depth = H.depth[best?.kind ?? 'open'];
  const back = (sx, dx) => Math.max(H.ease, Math.hypot(sx - s, dx - d) / H.back);
  const ein = back(A.s, A.lat);
  let t1 = ep.start + ein; // (it ends early once its own shared place is `far` m away: the drawn fish never strays far from where the room has it)
  for (const end = t1 + dur; t1 < end; t1 = Math.min(end, t1 + 0.5)) { fishAt(f, Math.min(end, t1 + 0.5), A, seed); if (Math.hypot(A.s - s, A.lat - d) > H.far) break; }
  fishAt(f, t1, A, seed);
  p = { s, d, depth, cover: best?.kind ?? 'open', t0: ep.start, ein, t1, eout: back(A.s, A.lat) };
  if (memo.size > 256) memo.clear();
  memo.set(key, p);
  return p;
}
/** 0..1: how far into a hold the school led by `f` is at `t`, and the hold ({ s, d, depth, cover, … }) or null. */
export function holdAt(f, t, seed = C.seed, cover = [], cfg = SC, o = {}) {
  o.h = 0; o.plan = null;
  for (const ep of episodes(f, 'hold', t, seed, cfg)) {
    if (!ep || t < ep.start) continue;
    const p = holdPlan(f, ep, seed, cover, cfg);
    const h = t < p.t0 + p.ein ? sm((t - p.t0) / p.ein) : t < p.t1 ? 1 : 1 - sm((t - p.t1) / p.eout);
    if (h > o.h) { o.h = h; o.plan = p; }
  }
  return o;
}
/** The take (a dart to the surface) of the school led by `f` around `t`: { te (s), rank (which member) } or null. */
export function takeAt(f, t, size, seed = C.seed, cfg = SC) {
  const T = cfg.take, tail = Math.max(T.down, T.rings[T.rings.length - 1] + T.life);
  for (const ep of episodes(f, 'take', t, seed, cfg)) if (ep && t >= ep.start - T.up && t <= ep.start + tail) return { te: ep.start, rank: ep.h % size };
  return null;
}
/** 0..1: how far up a taking fish is `dt` s after (negative: before) its take. */
const takeRise = (dt, T) => (dt <= 0 ? sm((dt + T.up) / T.up) : 1 - sm(dt / T.down));

/** The context of one frame: the present fish (fishSpec objects), the schools among them, the cover (coverFrame) and the seed. */
export function schoolContext(specs, seed = C.seed, cover = [], cfg = SC) {
  return { specs: new Map(specs.map((f) => [f.id, f])), groups: schoolsOf(specs, cfg), cover, seed, cfg };
}

const LU = {}, OW = {}, LS = {}, HO = {}, RP = {};
/** The leader `f` at `t` in the river frame, a hold blended in: { s, d, deep, h }. */
function unitAt(f, t, ctx, o) {
  fishAt(f, t, LU, ctx.seed); holdAt(f, t, ctx.seed, ctx.cover, ctx.cfg, HO);
  const p = HO.plan, h = HO.h;
  o.s = p ? lerp(LU.s, p.s, h) : LU.s; o.d = p ? lerp(LU.lat, p.d, h) : LU.lat; o.deep = p ? lerp(LU.deep, p.depth, h) : LU.deep; o.h = h;
  return o;
}
/** Fish `id` drawn at `t`: { x, y, z, s, d, water, bed, rise, take, hold (0..1), w (0..1: in its school's slot) } (no heading). */
export function placeAt(id, t, ctx, o = {}) {
  const f = ctx.specs.get(id), g = ctx.groups.get(id), cfg = ctx.cfg, lead = ctx.specs.get(g.lead);
  if (g.rank === 0) { unitAt(f, t, ctx, o); o.w = 1; } else {
    const L = unitAt(lead, t - cfg.lag * g.rank, ctx, {}), ph = hash(ctx.seed, id + 3, f.born) / 4294967296 * TAU;
    const side = g.rank % 2 ? 1 : -1, wob = cfg.wobble[0], ww = cfg.wobble[1];
    const ts = L.s + cfg.behind * g.rank * L.h + 0.6 * wob * Math.cos(ww * t + ph), td = L.d + side * cfg.spread * Math.ceil(g.rank / 2) + wob * Math.sin(ww * 1.3 * t + ph);
    fishAt(f, t, OW, ctx.seed); fishAt(lead, t, LS, ctx.seed);
    const w = 1 - sm((Math.hypot(OW.x - LS.x, OW.z - LS.z) - cfg.tight) / (cfg.join - cfg.tight));
    o.s = lerp(OW.s, ts, w); o.d = lerp(OW.lat, td, w); o.deep = Math.max(0, Math.min(1, lerp(OW.deep, L.deep + 0.06 * side * g.rank / g.size, w))); o.h = L.h * w; o.w = w;
  }
  const st = swimIntervals[stretchOf(f.home)];
  if (st) o.s = Math.max(st[0], Math.min(st[1], o.s));
  riverPoint(o.s, RP);
  const room = Math.max(0, RP.hw - C.edge - f.spec.len / 2); o.d = Math.max(-room, Math.min(room, o.d));
  o.x = RP.x + RP.nx * o.d; o.z = RP.z + RP.nz * o.d; o.up = Math.atan2(-RP.nz, RP.nx); // (the heading against the current: the path runs downstream)
  const tk = takeAt(lead, t, g.size, ctx.seed, cfg), T = cfg.take;
  o.take = tk && tk.rank === g.rank ? takeRise(t - tk.te, T) : 0;
  o.rise = Math.max(riseAt(f, t, ctx.seed), o.take);
  const water = waterAt(o.s), bed = bedAt(o.s), lo = bed + C.depth[0], hi = water - C.depth[1], y = lo + (hi - lo) * o.deep;
  o.y = y + (water - f.spec.h * (0.5 - C.rise.show) - y) * o.rise; o.water = water; o.bed = bed; o.hold = o.h;
  return o;
}
const PA = {}, PB = {};
/** Fish `id` drawn at `t` (placeAt) with its heading `yaw` (three.js Y rotation of +z) and `speed` m/s: the way the drawn fish moves, turned
 * against the current while it holds. */
export function presentAt(id, t, ctx, o = {}) {
  placeAt(id, t, ctx, o); placeAt(id, t - 0.3, ctx, PA); placeAt(id, t + 0.3, ctx, PB);
  const vx = PB.x - PA.x, vz = PB.z - PA.z, move = Math.atan2(vx, vz);
  o.speed = Math.hypot(vx, vz) / 0.6;
  o.yaw = o.hold > 0 ? move + wrap(o.up - move) * o.hold : move;
  return o;
}
/** The rings of the takes now: [{ x, y, z, age, id, born, life, r: [start, end], glow, take: true, te (s: the take) }] (at most `rings` per take). */
export function takeRings(t, ctx, out = []) {
  const T = ctx.cfg.take, P = {};
  for (const [id, g] of ctx.groups) {
    if (g.rank !== 0) continue;
    const tk = takeAt(ctx.specs.get(id), t, g.size, ctx.seed, ctx.cfg);
    if (!tk || t < tk.te) continue;
    const who = g.members[tk.rank], f = ctx.specs.get(who);
    placeAt(who, tk.te, ctx, P);
    for (const lag of T.rings) { const age = t - tk.te - lag; if (age >= 0 && age < T.life) out.push({ x: P.x, y: P.water, z: P.z, age, id: who, born: f.born, life: T.life, r: T.r, glow: T.glow, take: true, te: tk.te }); }
  }
  return out;
}
/** A shared rise's ring (riverfishswim.js ringsAt) moved to where its fish was drawn when it rose. */
export function moveRing(r, t, ctx) {
  const f = ctx.specs.get(r.id); if (!f) return r;
  const te = t - r.age; placeAt(r.id, te, ctx, PA); fishAt(f, te, OW, ctx.seed);
  r.x += PA.x - OW.x; r.z += PA.z - OW.z; r.y = PA.water;
  return r;
}
