import { SQUIRRELS as C, SEASON } from './config.js';

// The squirrels' brains and the nut field (#1672), with no three.js so a node test can drive them. A squirrel is a small state
// machine: perch (sits in a crown) -> leap (hops to a neighbouring crown) | down (climbs the trunk) -> forage/search (runs about on the
// ground, looks around, smells a nut -> fetch -> eat) -> toTree -> up -> perch. A frightened one (flee) runs to the nearest trunk.
// A crouching, still visitor with a nut in the hand lures one: it comes down, creeps up (approach), rises (take) and takes the nut,
// then flees up a tree with it in its mouth. The personality (SQUIRRELS.animals) only tilts the numbers. See SQUIRRELS in config.js.

export const winterMonth = (month) => SEASON.snowMonths.includes(month);
const R = C.roam;
const between = ([a, b], r) => a + (b - a) * r();
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** #1716: the river frame of `path` ([[x, z], …], SITE.river.path): f(x, z) -> { s: m along the river from its first point, d: m from the centre
 * line, side: -1 / 1 bank }; f.total = the river's length, f.at(s) = the centre-line point there. */
export function riverFrame(path) {
  const seg = []; let acc = 0;
  for (let i = 1; i < path.length; i++) { const [ax, az] = path[i - 1], [bx, bz] = path[i], l = Math.hypot(bx - ax, bz - az); seg.push({ ax, az, dx: bx - ax, dz: bz - az, l, s0: acc }); acc += l; }
  const f = (x, z, o = {}) => {
    let bd = Infinity; o.s = 0; o.d = Infinity; o.side = 1;
    for (const q of seg) {
      const k = Math.max(0, Math.min(1, ((x - q.ax) * q.dx + (z - q.az) * q.dz) / (q.l * q.l || 1))), d = Math.hypot(x - q.ax - q.dx * k, z - q.az - q.dz * k);
      if (d < bd) { bd = d; o.s = q.s0 + q.l * k; o.d = d; o.side = q.dx * (z - q.az) - q.dz * (x - q.ax) < 0 ? -1 : 1; }
    }
    return o;
  };
  f.total = acc;
  f.at = (s) => { for (const q of seg) if (s <= q.s0 + q.l || q === seg[seg.length - 1]) { const k = Math.max(0, Math.min(1, (s - q.s0) / (q.l || 1))); return { x: q.ax + q.dx * k, z: q.az + q.dz * k }; } return { x: 0, z: 0 }; };
  return f;
}

/** A ground run from trunk a to trunk b that stays on land (`walkable`, sampled every 2 m). */
const clearRun = (a, b, walkable) => { const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(d / 2); for (let i = 1; i < n; i++) { const k = i / n; if (!walkable(a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k)) return false; } return true; };

/** The squirrels' trees: each { x, z, y (ground at the trunk), cy (crown centre), r (crown radius) } gets `near` (trees within leapRange: a hop
 * from crown to crown) and, #1716, `links` (the tree graph: the crown hops plus ground runs up to `roam.link` m that stay on land, the runs over
 * each of the `crossings` ([[end, end]], bridge ends on land: `via` holds the two ends for that run, from this tree's side) and the nearest pairs
 * that join the graph's separate pieces, up to `roam.join` m), `s` (m along the river, with `path`), `side` and `comp` (its piece of the graph).
 * The array gets `sMin` / `sMax` (the valley's extent) and `byS` (indices sorted by s). `walkable(x, z)`: land a squirrel may run on (none: everywhere). */
export function linkTrees(trees, { path = null, walkable = null, crossings = [] } = {}) {
  const fr = path ? riverFrame(path) : null, q = {};
  trees.forEach((t, i) => { if (fr) { fr(t.x, t.z, q); t.s = q.s; t.side = q.side; } else { t.s = 0; t.side = 1; } t.near = []; t.links = []; t.via = null; });
  const can = (a, b) => !walkable || a.side === b.side || clearRun(a, b, walkable), parent = trees.map((_, i) => i);
  const root = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; }, link = (i, j) => { trees[i].links.push(j); trees[j].links.push(i); parent[root(i)] = root(j); };
  const far = [];
  for (let i = 0; i < trees.length; i++) for (let j = i + 1; j < trees.length; j++) {
    const a = trees[i], b = trees[j], d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d <= C.leapRange) { a.near.push(j); b.near.push(i); link(i, j); } else if (d <= R.join) far.push([d, i, j]);
  }
  for (const [e1, e2] of fr && walkable ? crossings : []) { // over each bridge: the best pair of trees either side of it
    const p1 = { x: e1[0], z: e1[1] }, p2 = { x: e2[0], z: e2[1] }, deck = Math.hypot(p2.x - p1.x, p2.z - p1.z), s1 = fr(p1.x, p1.z).side, s2 = fr(p2.x, p2.z).side;
    const side = (p, sd) => trees.map((t, i) => [Math.hypot(t.x - p.x, t.z - p.z), i]).filter(([d, i]) => d <= R.link && trees[i].side === sd && clearRun(trees[i], p, walkable)).sort((u, v) => u[0] - v[0]);
    const A = side(p1, s1), B = side(p2, s2);
    if (!A.length || !B.length || s1 === s2) continue;
    const i = A[0][1], j = B[0][1], len = A[0][0] + deck + B[0][0];
    (trees[i].via ??= {})[j] = [[p1.x, p1.z], [p2.x, p2.z], len]; (trees[j].via ??= {})[i] = [[p2.x, p2.z], [p1.x, p1.z], len];
    link(i, j);
  }
  far.sort((u, v) => u[0] - v[0]);
  for (const [d, i, j] of far) { // ordinary ground runs, then (Kruskal) the shortest runs that join two pieces
    if (d > R.link && root(i) === root(j)) continue;
    if (can(trees[i], trees[j])) link(i, j);
  }
  trees.forEach((t, i) => { t.comp = root(i); }); // (the piece of the graph it belongs to: without a crossing, each bank is its own)
  trees.byS = trees.map((_, i) => i).sort((i, j) => trees[i].s - trees[j].s);
  trees.sMin = trees.length ? trees[trees.byS[0]].s : 0; trees.sMax = trees.length ? trees[trees.byS[trees.length - 1]].s : 0;
  return trees;
}

/** #1716: how far it is from tree i to tree j along their edge (over the bridge for a crossing). */
export const edgeLength = (trees, i, j) => trees[i].via?.[j]?.[2] ?? Math.hypot(trees[j].x - trees[i].x, trees[j].z - trees[i].z);
/** #1716: the shortest way through the tree graph from tree `a` to tree `b` (Dijkstra on `links`): the trees after `a`, ending with `b`; [] when
 * a === b or the graph does not connect them. Crown hops count a little less than ground runs. */
export function treeRoute(trees, a, b) {
  if (a === b || !trees[a] || !trees[b] || trees[a].comp !== trees[b].comp) return [];
  const n = trees.length, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
  dist[a] = 0;
  for (;;) {
    let u = -1, best = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
    if (u < 0 || u === b) break;
    done[u] = 1; const t = trees[u];
    for (const v of t.links) { const d = edgeLength(trees, u, v) * (t.near.includes(v) ? 0.8 : 1); if (best + d < dist[v]) { dist[v] = best + d; prev[v] = u; } }
  }
  if (prev[b] < 0) return [];
  const out = []; for (let v = b; v !== a; v = prev[v]) out.unshift(v);
  return out;
}

/** Where a squirrel sits in a crown at angle `ang` (on the leaf surface, so a visitor can see it), and where it stands at the trunk's foot. */
export const perchPoint = (t, ang, o = {}) => { o.x = t.x + Math.cos(ang) * t.r * 0.9; o.z = t.z + Math.sin(ang) * t.r * 0.9; o.y = t.cy - t.r * 0.12; return o; };
export const footPoint = (t, ang, ground, o = {}) => { o.x = t.x + Math.cos(ang) * 0.3; o.z = t.z + Math.sin(ang) * 0.3; o.y = ground(o.x, o.z); return o; };
/** Up the trunk to the crown's height (#1716: spiralling `roam.spiral` turns round it), then out along a limb to the perch (k 0 … 1).
 * `o.a`: the angle round the trunk where it is. */
export function climbPoint(t, ang, k, ground, o = {}) {
  const up = Math.min(1, k / 0.78), out = Math.max(0, (k - 0.78) / 0.22), a = ang - (1 - up) * R.spiral * Math.PI * 2;
  const f = footPoint(t, ang, ground, {}), p = perchPoint(t, ang, {});
  if (out > 0) { o.x = f.x + (p.x - f.x) * out; o.z = f.z + (p.z - f.z) * out; } else { o.x = t.x + Math.cos(a) * 0.3; o.z = t.z + Math.sin(a) * 0.3; }
  o.y = f.y + (p.y - f.y) * up; o.a = out > 0 ? ang : a; return o;
}

/** Nut spots round the squirrels' trees: one random place 1.5 … `spread` m from a random trunk, where `ok(x, z)` agrees. Null after `tries` misses.
 * #1686: `anchors` (the visitors' places): most of the time the trunk is one within `nutNearPlayer` m of a random visitor, so nuts turn up where somebody looks. */
export function pickNutSpot(trees, rnd, ok, tries = 12, anchors = null) {
  if (!trees.length) return null;
  let pool = trees;
  if (anchors?.length && rnd() < C.nutBias) {
    const a = anchors[Math.floor(rnd() * anchors.length)], near = trees.filter((t) => Math.hypot(t.x - a.x, t.z - a.z) <= C.nutNearPlayer);
    if (near.length) pool = near;
  }
  for (let i = 0; i < tries; i++) {
    const t = pool[Math.floor(rnd() * pool.length)], a = rnd() * Math.PI * 2, d = 1.5 + rnd() * (C.spread - 1.5), x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d;
    if (ok(x, z)) return { x, z };
  }
  return null;
}

/** The nuts lying out: `n` slots, each { alive, x, y, z, kind (0 acorn / 1 hazelnut), age, life, wait, held }. Pure bookkeeping; squirrels.js draws them. */
export class NutField {
  constructor(trees, ground, ok, rnd, n = C.maxNuts) {
    Object.assign(this, { trees, ground, ok, rnd, active: false, spawned: 0, anchors: () => [] }); // anchors(): [{ x, z }] the visitors (#1686)
    this.slots = Array.from({ length: n }, (_, i) => ({ alive: false, x: 0, y: 0, z: 0, kind: 0, age: 0, life: 0, wait: 1 + i * 0.5, held: false, born: 0, by: null }));
  }
  get count() { return this.slots.reduce((n, s) => n + (s.alive ? 1 : 0), 0); }
  /** Winter (or underground): everything gone, nothing counts down. Back in spring: the first ones come after a short while. */
  setActive(on) {
    if (on === this.active) return;
    this.active = on;
    this.slots.forEach((s, i) => { s.alive = false; s.held = false; s.by = null; s.wait = 1 + i * 0.5; });
  }
  update(dt) {
    if (!this.active) return;
    for (const s of this.slots) {
      if (s.alive) { if (!s.held && (s.age += dt) > s.life) this.remove(s); continue; }
      if ((s.wait -= dt) > 0) continue;
      const at = this.spot();
      if (!at) { s.wait = 5; continue; }
      Object.assign(s, { alive: true, x: at.x, z: at.z, y: this.ground(at.x, at.z), kind: this.rnd() < 0.55 ? 0 : 1, age: 0, life: between(C.life, this.rnd), held: false });
      s.born++; this.spawned++;
    }
  }
  /** #1686: a place for a new nut: a heap beside one already lying out (`heap`), else under a tree (near the visitors first). */
  spot() {
    if (this.rnd() < C.heap) {
      const out = this.slots.filter((q) => q.alive && !q.held);
      if (out.length) {
        const q = out[Math.floor(this.rnd() * out.length)];
        for (let i = 0; i < 4; i++) { const a = this.rnd() * Math.PI * 2, d = between(C.heapRadius, this.rnd), x = q.x + Math.cos(a) * d, z = q.z + Math.sin(a) * d; if (this.ok(x, z)) return { x, z }; }
      }
    }
    return pickNutSpot(this.trees, this.rnd, this.ok, 12, this.anchors());
  }
  /** Gone (eaten, fed, expired); a new one appears after `respawn` s. */
  remove(s) { s.alive = false; s.held = false; s.by = null; s.wait = between(C.respawn, this.rnd); }
  /** The nearest nut lying on the ground within `r` m of (x, z), or null. */
  near(x, z, r) {
    let best = null, bd = r;
    for (const s of this.slots) { if (!s.alive || s.held) continue; const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } }
    return best;
  }
}

const GROUND = new Set(['forage', 'search', 'fetch', 'eat', 'approach', 'take', 'travel', 'stash', 'bury', 'seek', 'dig', 'chase']);
const LOWER = new Set(['forage', 'search']); // (a squirrel that may be chased by another one, #1716)

export class SquirrelBrain {
  /** env: { trees, ground, walkable(x, z), nuts: NutField, player: { x, z, lure, hx, hz }, onTake(brain) -> bool, rnd, and (#1716, optional)
   * now() -> s (the wall clock that drifts the home range; default: this brain's own clock), hour() -> 0 … 24 (default noon), others: [brains] };
   * start: tree index (the home range drifts round it). */
  constructor(spec, env, start) {
    Object.assign(this, { spec, env, p: spec, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, rise: 0, run: 0, state: 'perch', t: 0, dur: 1, hasNut: false, react: 0, slot: null,
      tree: start, ang: 0, goal: { x: 0, z: 0 }, from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 0 }, tree2: 0, ang2: 0, approachAfter: false, calmT: 0, left: 0, sense: 0, log: [],
      // #1716: roaming, caches, chases, the day
      clock: 0, s0: env.trees[start]?.s ?? 0, route: [], target: null, travelAfter: false, nest: -1, visits: new Map(), caches: [], prey: null, chaseT: 1,
      dash: true, gaitT: 0, look: 0, lookT: 0, flick: 0, wps: [], foot: { x: 0, y: 0, z: 0 }, legFrom: { x: 0, y: 0, z: 0 }, deck: false });
    this.enterPerch(start, env.rnd() * Math.PI * 2);
    this.t = env.rnd() * 3;
  }
  get tr() { return this.env.trees[this.tree]; }
  set(state, dur = 1) { this.state = state; this.t = 0; this.dur = dur; this.run = 0; this.log.push(state); if (this.log.length > 40) this.log.shift(); }
  playerDist() { const pl = this.env.player; return Math.hypot(pl.x - this.x, pl.z - this.z); }
  place(o) { this.x = o.x; this.y = o.y; this.z = o.z; }

  // --- #1716: the day, the home range and the tree graph ---
  now() { return this.env.now ? this.env.now() : this.clock; }
  night() { const h = this.env.hour ? this.env.hour() : 12; return h < C.day.wake || h >= C.day.sleep; }
  /** How lively (0 at night, `day.midday` … 1 by day, busiest round the morning and afternoon peaks). */
  activity() {
    if (this.night()) return 0;
    const h = this.env.hour ? this.env.hour() : 12, D = C.day;
    return D.midday + (1 - D.midday) * Math.max(...D.peaks.map((c) => Math.exp(-(((h - c) / D.width) ** 2))));
  }
  /** The home range's centre (m along the river): a slow wall-clock wander over the valley round the start tree, the same on every client. */
  homeS() {
    const tr = this.env.trees, lo = tr.sMin ?? 0, hi = tr.sMax ?? 0, t = this.now(), ph = this.p.phase ?? 0;
    let u = 0; R.periods.forEach((P, k) => { u += R.weights[k] * Math.sin((2 * Math.PI * t) / P + ph * (k + 1)); });
    return Math.max(lo, Math.min(hi, this.s0 + u * (hi - lo) * R.span));
  }
  inRange(i, hs, k = 1) { return Math.abs(this.env.trees[i].s - hs) <= R.range * k; }
  /** The trees within the range round `hs` (from the s-sorted index; all of them without one). */
  rangeTrees(hs) {
    const tr = this.env.trees, by = tr.byS; if (!by) return tr.map((_, i) => i);
    let lo = 0, hi = by.length; while (lo < hi) { const m = (lo + hi) >> 1; if (tr[by[m]].s < hs - R.range) lo = m + 1; else hi = m; }
    const out = []; for (let i = lo; i < by.length && tr[by[i]].s <= hs + R.range; i++) out.push(by[i]);
    return out;
  }
  /** The tree nearest the home range's centre that it can reach through the graph (`any`: wherever), where it sleeps and where a lost squirrel goes back to. */
  homeTree(hs, any = false) {
    const tr = this.env.trees, comp = this.tr?.comp; let best = this.tree, bd = Infinity;
    tr.forEach((t, i) => { const d = Math.abs(t.s - hs) + (any || t.comp === comp ? 0 : 1e6); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  nearestTree(x = this.x, z = this.z) { let best = this.tree, bd = Infinity; this.env.trees.forEach((t, i) => { const d = Math.hypot(t.x - x, t.z - z); if (d < bd) { bd = d; best = i; } }); return best; }
  favourites() { return [...this.visits].sort((a, b) => b[1] - a[1]).slice(0, R.fav).map((v) => v[0]); }
  /** Somewhere to go on a longer move: a ripe cache, a favourite tree (both in or near the range) or any other tree in the range. */
  journeyTarget(hs) {
    const rnd = this.env.rnd, now = this.now();
    const ripe = this.caches.filter((c) => now - c.at > c.ripe && this.inRange(c.tree, hs, 1.5));
    if (ripe.length && rnd() < 0.7) { this.target = ripe[Math.floor(rnd() * ripe.length)]; return this.target.tree; }
    if (rnd() < R.favBack) { const f = this.favourites().filter((i) => i !== this.tree && this.inRange(i, hs, 1.5)); if (f.length) return f[Math.floor(rnd() * f.length)]; }
    const pool = this.rangeTrees(hs).filter((i) => this.env.trees[i].comp === this.tr.comp); return pool.length ? pool[Math.floor(rnd() * pool.length)] : this.tree;
  }
  go(to) { this.route = treeRoute(this.env.trees, this.tree, to); }
  /** What to do when a perch is over: { k: 'nest' | 'leap' | 'run' | 'down' | 'dig' | 'stay', j (tree) }. Shared by the full brain and the coarse one. */
  plan() {
    const e = this.env, rnd = e.rnd, trees = e.trees, p = this.p;
    this.hasNut = false;
    if (this.night()) {
      if (this.nest < 0) this.nest = this.homeTree(this.homeS());
      if (this.tree === this.nest) { this.route = []; return { k: 'nest' }; }
      if (this.route[this.route.length - 1] !== this.nest) { this.target = null; this.go(this.nest); if (!this.route.length) { this.nest = this.tree; return { k: 'nest' }; } }
    } else {
      this.nest = -1;
      if (!this.route.length) {
        const hs = this.homeS();
        if (!this.inRange(this.tree, hs)) { this.target = null; this.go(this.homeTree(hs)); } // the range moved on: follow it (as far as the graph goes)
        else if (rnd() < R.journey * this.activity() * (0.4 + p.ground)) { /* the bold ones roam more */ this.target = null; this.go(this.journeyTarget(hs)); }
      }
    }
    if (this.route.length) { const j = this.route[0]; return { k: this.tr.near.includes(j) ? 'leap' : 'run', j }; }
    if (this.target?.tree === this.tree) return { k: 'dig' };
    if (rnd() < p.ground * (0.4 + 0.6 * this.activity())) return { k: 'down' };
    const hs = this.homeS(), near = this.tr.near.filter((j) => this.inRange(j, hs));
    if (near.length) return { k: 'leap', j: near[Math.floor(rnd() * near.length)] };
    return { k: 'stay' };
  }
  leapAngle(j) { const t = this.env.trees[j]; return Math.atan2(this.z - t.z, this.x - t.x) + (this.env.rnd() - 0.5) * 1.2; }

  enterPerch(tree, ang) {
    this.tree = tree; this.ang = ang; this.pitch = 0; this.rise = 0;
    this.place(perchPoint(this.tr, ang));
    this.yaw = ang + Math.PI / 2;
    this.visits.set(tree, (this.visits.get(tree) ?? 0) + 1);
    if (this.visits.size > 80) { let lo = null; for (const v of this.visits) if (!lo || v[1] < lo[1]) lo = v; this.visits.delete(lo[0]); }
    const rest = this.route.length && !this.hasNut ? between(R.rest, this.env.rnd) : between(C.perch, this.env.rnd) * this.p.perch * (1.6 - 0.6 * Math.max(0.45, this.activity()));
    this.set('perch', Math.max(this.calmT, this.hasNut ? C.carry : rest));
    this.react = 0;
  }
  /** #1716: asleep in the drey (inside the crown, out of sight) until the morning. */
  enterNest() { const t = this.tr; this.route = []; this.target = null; this.place({ x: t.x, y: t.cy - t.r * 0.15, z: t.z }); this.pitch = 0; this.rise = 0; this.set('nest', 1e9); }
  /** Do what `plan()` says (the full brain: with the leaps, climbs and runs). */
  act(a) {
    switch (a.k) {
      case 'nest': this.enterNest(); break;
      case 'leap': if (this.route[0] === a.j) this.route.shift(); this.startLeap(a.j, this.leapAngle(a.j)); break;
      case 'run': this.travelAfter = true; this.startDown(false); break;
      case 'down': case 'dig': this.startDown(false); break;
      default: this.enterPerch(this.tree, this.env.rnd() * Math.PI * 2);
    }
  }
  startLeap(tree, ang) {
    const t = this.env.trees[tree];
    Object.assign(this.from, { x: this.x, y: this.y, z: this.z }); perchPoint(t, ang, this.to);
    this.tree2 = tree; this.ang2 = ang;
    const d = Math.hypot(this.to.x - this.x, this.to.z - this.z);
    this.set('leap', Math.max(0.5, d / (C.leap * this.p.speed)));
    this.yaw = Math.atan2(this.to.x - this.x, this.to.z - this.z); this.run = 1;
  }
  startDown(approach) {
    this.approachAfter = approach; this.yaw = this.ang;
    this.set('down', Math.max(1, (this.tr.cy - this.tr.y) / (C.climb * this.p.speed)));
  }
  startUp() { this.yaw = this.ang + Math.PI; this.set('up', Math.max(1, (this.tr.cy - this.tr.y) / (C.climb * this.p.speed))); }
  startForage() { this.left = between(C.forage, this.env.rnd) * (0.5 + 0.5 * Math.max(0.45, this.activity())); this.pickGoal(); }
  pickGoal() {
    const e = this.env, t = this.tr;
    for (let i = 0; i < 8; i++) {
      const a = e.rnd() * Math.PI * 2, d = 2 + e.rnd() * C.spread * 1.4, x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d;
      if (e.walkable(x, z)) { this.goal.x = x; this.goal.z = z; this.set('forage', 30); return; }
    }
    this.startToTree(false);
  }
  /** #1716: along the route on the ground, to the foot of its next tree. */
  startTravel() {
    const j = this.route[0], t = this.env.trees[j], via = this.tr.via?.[j];
    this.wps = via ? [{ x: via[0][0], z: via[0][1] }, { x: via[1][0], z: via[1][1], deck: true }] : []; // over a bridge: to its end, along the deck, then on
    const from = via ? this.wps[1] : this, a = Math.atan2(from.z - t.z, from.x - t.x);
    this.tree2 = j; this.ang2 = a; this.foot = footPoint(t, a, this.env.ground, {}); this.legY = this.y; this.nextLeg(); this.set('travel', 240);
  }
  /** The next leg of a run: the next bridge end, or the tree's foot. */
  nextLeg() { const w = this.wps.length ? this.wps[0] : this.foot; this.goal.x = w.x; this.goal.z = w.z; this.legFrom = { x: this.x, z: this.z, y: this.y }; this.deck = !!w.deck; }
  /** #1716: a nut in the mouth to a spot a few metres off, to bury it. */
  startStash() {
    const e = this.env;
    for (let i = 0; i < 8; i++) {
      const a = e.rnd() * Math.PI * 2, d = between(C.cache.stash, e.rnd), x = this.x + Math.cos(a) * d, z = this.z + Math.sin(a) * d;
      if (e.walkable(x, z)) { this.goal.x = x; this.goal.z = z; this.set('stash', 30); return; }
    }
    this.set('bury', C.cache.bury);
  }
  startSeek() { this.goal.x = this.target.x; this.goal.z = this.target.z; this.set('seek', 60); }
  /** #1716: chase another squirrel on the ground for a few seconds; it flees up a tree. */
  startChase(o) {
    this.prey = o; this.set('chase', between(C.chase.time, this.env.rnd));
    o.route = []; o.target = null; o.rise = 0; o.slot = null; o.calmT = C.chase.calm * o.p.calm; o.startToTree(true);
  }
  /** Run to a trunk: the nearest (or, relaxed, sometimes another one within groundHop) and up. */
  startToTree(flee) {
    const e = this.env, trees = e.trees;
    let best = -1, bd = Infinity;
    trees.forEach((t, i) => {
      const d = Math.hypot(t.x - this.x, t.z - this.z);
      if (d > C.groundHop) return;
      const score = d + (!flee && i === this.tree ? 0 : !flee ? e.rnd() * 8 : 0);
      if (score < bd) { bd = score; best = i; }
    });
    if (best < 0) best = this.tree;
    const t = trees[best], a = Math.atan2(this.z - t.z, this.x - t.x);
    this.tree2 = best; this.ang2 = a; footPoint(t, a, e.ground, this.goal);
    this.set(flee ? 'flee' : 'toTree', 30);
  }
  /** #1698: a visitor (env.scares: every one near, with `v` m/s and `rose`) moving fast, rising or right on top of it. */
  scared() {
    const sc = this.env.scares; if (!sc) return false;
    const reach = this.p.shy * C.scareReach;
    for (const c of sc) {
      const d = Math.hypot(c.x - this.x, c.z - this.z);
      if ((d < C.touch && !c.lure) || (d < reach && (c.v > C.scareSpeed || c.rose))) return true;
    }
    return false;
  }
  /** Up the nearest tree, and stay there a while (`calm`: the personality). */
  frighten() { this.rise = 0; this.slot = null; this.prey = null; this.route = []; this.target = null; this.calmT = between(C.scareTime, this.env.rnd) * this.p.calm; this.startToTree(true); }
  startApproach() { this.route = []; this.target = null; this.prey = null; this.set('approach', 60); this.react = 0; }

  /** Ground movement towards `goal`; true on arrival. */
  moveTo(dt, speed, stop = 0) {
    const dx = this.goal.x - this.x, dz = this.goal.z - this.z, d = Math.hypot(dx, dz);
    if (d <= stop + 1e-6) { this.run = 0; return true; }
    const step = Math.min(d - stop, speed * dt);
    this.x += dx / d * step; this.z += dz / d * step; this.y = this.env.ground(this.x, this.z);
    const want = Math.atan2(dx, dz); this.yaw += wrap(want - this.yaw) * Math.min(1, dt * 12);
    this.run = Math.min(1, speed / C.run); this.pitch = 0;
    return step >= d - stop - 1e-6;
  }
  /** #1716: jerky ground movement: short rushes (a little faster) and wary stops, half sitting up with quick head turns and a tail flick. */
  dashTo(dt, speed, stop = 0) {
    const rnd = this.env.rnd;
    if ((this.gaitT -= dt) <= 0) { this.dash = !this.dash; this.gaitT = between(this.dash ? R.dash : R.pause, rnd); if (!this.dash) this.flick = 1; }
    if (this.dash) { this.rise = 0; return this.moveTo(dt, speed * 1.15, stop); }
    this.run = 0; this.rise = Math.min(0.35, this.rise + dt * 3);
    if ((this.lookT -= dt) <= 0) { this.lookT = 0.15 + rnd() * 0.3; this.look = (rnd() - 0.5) * 1.8; }
    const want = Math.atan2(this.goal.x - this.x, this.goal.z - this.z) + this.look; this.yaw += wrap(want - this.yaw) * Math.min(1, dt * 22);
    return Math.hypot(this.goal.x - this.x, this.goal.z - this.z) <= stop + 1e-6;
  }

  update(dt) {
    const e = this.env, pl = e.player, p = this.p, rnd = e.rnd;
    this.t += dt; this.clock += dt; if (this.calmT > 0) this.calmT -= dt; if (this.flick > 0) this.flick = Math.max(0, this.flick - dt * 2.5);
    if (GROUND.has(this.state) && this.scared()) { this.frighten(); return; }
    switch (this.state) {
      case 'perch': {
        if (pl.lure && !this.hasNut && this.calmT <= 0 && this.playerDist() < p.lure && !this.night()) { if ((this.react += dt) > p.delay) { this.startDown(true); break; } } else this.react = 0;
        if (this.t < this.dur) break;
        if (this.t > 2 && rnd() < dt * 0.6) this.flick = 1; // a wary twitch of the tail now and then
        this.act(this.plan());
        break;
      }
      case 'nest': if (!this.night()) { this.nest = -1; this.enterPerch(this.tree, rnd() * Math.PI * 2); } break;
      case 'leap': {
        const k = Math.min(1, this.t / this.dur), h = 0.5 + 0.15 * Math.hypot(this.to.x - this.from.x, this.to.z - this.from.z);
        this.x = this.from.x + (this.to.x - this.from.x) * k; this.z = this.from.z + (this.to.z - this.from.z) * k;
        this.y = this.from.y + (this.to.y - this.from.y) * k + 4 * h * k * (1 - k); this.pitch = (0.5 - k) * 0.9;
        if (k >= 1) this.enterPerch(this.tree2, this.ang2);
        break;
      }
      case 'down': case 'up': {
        const k = Math.min(1, this.t / this.dur), kk = this.state === 'down' ? 1 - k : k, o = climbPoint(this.tr, this.ang, kk, e.ground);
        this.place(o); this.run = 1;
        const trunk = (kk < 0.78); this.pitch = trunk ? (this.state === 'down' ? -Math.PI / 2 : Math.PI / 2) : 0;
        this.yaw = trunk ? (this.state === 'down' ? o.a : o.a + Math.PI) : this.ang + Math.PI / 2;
        if (k < 1) break;
        this.pitch = 0;
        if (this.state === 'up') this.enterPerch(this.tree, this.ang);
        else if (this.approachAfter && pl.lure) this.startApproach();
        else if (this.travelAfter && this.route.length) { this.travelAfter = false; this.startTravel(); }
        else if (this.target?.tree === this.tree) this.startSeek();
        else this.startForage();
        this.travelAfter = false;
        break;
      }
      case 'forage': case 'search': case 'fetch': case 'eat': case 'travel': case 'stash': case 'bury': case 'seek': case 'dig': case 'chase': this.onGround(dt); break;
      case 'toTree': case 'flee': {
        if (this.moveTo(dt, (this.state === 'flee' ? C.flee : C.run) * p.speed)) {
          this.tree = this.tree2; this.ang = this.ang2; this.startUp();
        }
        break;
      }
      case 'approach': {
        const d = Math.hypot(pl.hx - this.x, pl.hz - this.z);
        if (!pl.lure || d > p.lure * 1.4) { if (this.playerDist() < 3) this.startToTree(true); else this.startForage(); break; }
        this.goal.x = pl.hx; this.goal.z = pl.hz;
        const creep = 0.55 + 0.45 * Math.abs(Math.sin(this.t * 2.2)); // stop-and-go: wary
        if (this.moveTo(dt, C.run * 0.7 * p.speed * creep, C.reach)) this.set('take', C.take);
        break;
      }
      case 'take': {
        if (!pl.lure) { this.rise = 0; this.startToTree(true); break; }
        this.goal.x = pl.hx; this.goal.z = pl.hz; this.yaw = Math.atan2(pl.hx - this.x, pl.hz - this.z);
        this.rise = Math.min(1, this.t / (C.take * 0.6));
        if (this.t >= this.dur) {
          this.rise = 0;
          if (e.onTake(this)) { this.hasNut = true; this.startToTree(true); } else this.startToTree(true);
        }
        break;
      }
    }
  }

  /** forage / search / fetch / eat and (#1716) travel / stash / bury / seek / dig / chase: on the ground, no lure. */
  onGround(dt) {
    const e = this.env, pl = e.player, p = this.p, C_ = C, rnd = e.rnd;
    if (pl.lure && this.calmT <= 0 && this.playerDist() < p.lure && !this.hasNut) { this.rise = 0; this.startApproach(); return; }
    if (LOWER.has(this.state) && e.others && (this.chaseT -= dt) <= 0) { // #1716: now and then it chases another squirrel near it off
      this.chaseT = 1;
      if (rnd() < C_.chase.chance * this.activity()) {
        const o = e.others.find((q) => q !== this && LOWER.has(q.state) && q.calmT <= 0 && Math.hypot(q.x - this.x, q.z - this.z) < C_.chase.range);
        if (o) { this.startChase(o); return; }
      }
    }
    switch (this.state) {
      case 'forage': case 'fetch': {
        if (this.state === 'fetch' && !(this.slot?.alive && !this.slot.held)) { this.slot = null; this.pickGoal(); return; }
        if (this.state === 'forage' && ((this.sense -= dt) <= 0)) {
          this.sense = 0.5; const s = e.nuts.near(this.x, this.z, C_.sense);
          if (s) { this.slot = s; this.goal.x = s.x; this.goal.z = s.z; this.set('fetch', 30); return; }
        }
        this.left -= dt;
        const there = this.state === 'fetch' ? this.moveTo(dt, C_.run * p.speed, 0.08) : this.dashTo(dt, C_.run * p.speed);
        if (there) {
          if (this.state === 'fetch') {
            if (this.caches.length < C_.cache.max && rnd() < C_.cache.chance) { e.nuts.remove(this.slot); this.slot = null; this.hasNut = true; this.rise = 0; this.startStash(); } // #1716: bury it for later
            else { this.set('eat', C_.eat * (0.8 + rnd() * 0.4)); this.rise = 1; this.run = 0; }
          } else { this.rise = 0; this.set('search', between(C_.search, rnd)); }
        }
        return;
      }
      case 'search': this.rise = Math.min(1, this.t * 4); this.yaw += Math.sin(this.t * 2.3) * dt * 1.4;
        if (this.t >= this.dur) { this.rise = 0; if (this.left <= 0) this.startToTree(false); else this.pickGoal(); }
        return;
      case 'eat': this.rise = 1;
        if (this.t >= this.dur) {
          if (this.slot?.alive && !this.slot.held) e.nuts.remove(this.slot);
          this.slot = null; this.rise = 0; this.hasNut = false; this.pickGoal();
        }
        return;
      case 'travel': {
        if (!this.route.length) { this.startToTree(false); return; }
        const there = this.dashTo(dt, C_.run * p.speed * 1.1);
        if (this.deck) { // on a bridge deck: level between its two ends (the ground below is the valley)
          const f = this.legFrom, L = Math.hypot(this.goal.x - f.x, this.goal.z - f.z) || 1, k = Math.min(1, Math.hypot(this.x - f.x, this.z - f.z) / L);
          this.y = f.y + (e.ground(this.goal.x, this.goal.z) - f.y) * k;
        }
        if (there && this.wps.length) { this.wps.shift(); this.nextLeg(); return; }
        if (there) {
          const j = this.route.shift(); this.tree = j; this.ang = this.ang2; this.rise = 0;
          if (this.route.length && !this.tr.near.includes(this.route[0])) this.startTravel(); // the next tree is a run away too
          else if (!this.route.length && this.target?.tree === j) this.startSeek();
          else this.startUp();
        }
        return;
      }
      case 'stash': if (this.dashTo(dt, C_.run * p.speed)) { this.rise = 0; this.set('bury', C_.cache.bury); } return;
      case 'seek': if (!this.target) { this.pickGoal(); return; } if (this.dashTo(dt, C_.run * p.speed, 0.05)) { this.rise = 0; this.set('dig', C_.cache.dig); } return;
      case 'bury': case 'dig': {
        this.run = 0; this.rise = 0; this.pitch = -0.45 + 0.12 * Math.sin(this.t * 18); // nose down, scrabbling
        if (this.t < this.dur) return;
        this.pitch = 0;
        if (this.state === 'bury') { this.hasNut = false; this.caches.push({ x: this.x, z: this.z, tree: this.nearestTree(), at: this.now(), ripe: between(C_.cache.ripe, rnd) }); this.pickGoal(); }
        else { this.caches = this.caches.filter((c) => c !== this.target); this.target = null; this.hasNut = true; this.set('eat', C_.eat * (0.8 + rnd() * 0.4)); this.rise = 1; }
        return;
      }
      case 'chase': {
        const o = this.prey;
        if (!o || this.t >= this.dur || !['flee', 'toTree'].includes(o.state)) { this.prey = null; this.startToTree(false); return; }
        this.goal.x = o.x; this.goal.z = o.z; this.moveTo(dt, C_.flee * C_.chase.speed * p.speed, 0.3);
      }
    }
  }

  /** #1716: the cheap brain for a squirrel nobody is near (beyond farDist): no animation, it only steps from tree to tree through the graph (the
   * travel time delays the next step), follows its home range, sleeps at night. A long gap (`roam.catchUp` s) puts it straight in its range. */
  coarse(dt) {
    const e = this.env, trees = e.trees, p = this.p;
    this.clock += dt; this.t += dt; if (this.calmT > 0) this.calmT = Math.max(0, this.calmT - dt);
    if (this.state !== 'perch' && this.state !== 'nest') { // whatever it was doing on the ground or between the crowns: back in a tree
      this.rise = 0; this.slot = null; this.prey = null; this.hasNut = false; this.approachAfter = this.travelAfter = false;
      const j = this.state === 'leap' ? this.tree2 : this.nearestTree(); this.enterPerch(j, e.rnd() * Math.PI * 2);
    }
    if (dt > R.catchUp) {
      this.route = []; this.target = null;
      const j = this.homeTree(this.homeS(), true); this.enterPerch(j, e.rnd() * Math.PI * 2);
      if (this.night()) { this.nest = j; this.enterNest(); }
      return;
    }
    if (this.state === 'nest') { if (!this.night()) { this.nest = -1; this.enterPerch(this.tree, e.rnd() * Math.PI * 2); } return; }
    for (let n = 0; n < 6 && this.t >= this.dur; n++) {
      const over = this.t - this.dur, a = this.plan(), from = this.tr;
      if (a.k === 'nest') { this.enterNest(); return; }
      let cost = 0;
      if (a.k === 'leap' || a.k === 'run') {
        if (this.route[0] === a.j) this.route.shift();
        const t = trees[a.j], d = edgeLength(trees, this.tree, a.j);
        cost = a.k === 'leap' ? d / (C.leap * p.speed) : d / (C.run * p.speed * 0.8) + ((from.cy - from.y) + (t.cy - t.y)) / (C.climb * p.speed);
        this.enterPerch(a.j, Math.atan2(from.z - t.z, from.x - t.x));
      } else {
        if (a.k === 'dig') { this.caches = this.caches.filter((c) => c !== this.target); this.target = null; }
        if (a.k === 'down' || a.k === 'dig') cost = between(C.forage, e.rnd) * 0.8; // the time it would spend on the ground
        this.enterPerch(this.tree, e.rnd() * Math.PI * 2);
      }
      this.t = over - cost;
    }
  }
  /** #1716: after following another player's snapshots its pose may be anywhere: settle on the nearest tree (route and plans dropped). */
  resync() {
    this.route = []; this.target = null; this.prey = null; this.slot = null; this.travelAfter = false;
    const j = this.nearestTree();
    if (GROUND.has(this.state) || this.state === 'toTree' || this.state === 'flee') { this.tree = j; this.startToTree(false); }
    else this.enterPerch(j, Math.atan2(this.z - this.env.trees[j].z, this.x - this.env.trees[j].x));
  }
}
