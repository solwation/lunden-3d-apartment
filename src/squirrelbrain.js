import { SQUIRRELS as C, SEASON } from './config.js';

// The squirrels' brains and the nut field (#1672), with no three.js so a node test can drive them. A squirrel is a small state
// machine: perch (sits in a crown) -> leap (hops to a neighbouring crown) | down (climbs the trunk) -> forage/search (runs about on the
// ground, looks around, smells a nut -> fetch -> eat) -> toTree -> up -> perch. A frightened one (flee) runs to the nearest trunk.
// A crouching, still visitor with a nut in the hand lures one: it comes down, creeps up (approach), rises (take) and takes the nut,
// then flees up a tree with it in its mouth. The personality (SQUIRRELS.animals) only tilts the numbers. See SQUIRRELS in config.js.

export const winterMonth = (month) => SEASON.snowMonths.includes(month);
const between = ([a, b], r) => a + (b - a) * r();
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** A tree for the squirrels: { x, z, y (ground at the trunk), cy (crown centre), r (crown radius), near: [indices of trees within leapRange] }. */
export function linkTrees(trees) {
  trees.forEach((t, i) => { t.near = []; trees.forEach((u, j) => { if (i !== j && Math.hypot(t.x - u.x, t.z - u.z) <= C.leapRange) t.near.push(j); }); });
  return trees;
}
/** Where a squirrel sits in a crown at angle `ang` (on the leaf surface, so a visitor can see it), and where it stands at the trunk's foot. */
export const perchPoint = (t, ang, o = {}) => { o.x = t.x + Math.cos(ang) * t.r * 0.9; o.z = t.z + Math.sin(ang) * t.r * 0.9; o.y = t.cy - t.r * 0.12; return o; };
export const footPoint = (t, ang, ground, o = {}) => { o.x = t.x + Math.cos(ang) * 0.3; o.z = t.z + Math.sin(ang) * 0.3; o.y = ground(o.x, o.z); return o; };
/** Up the trunk to the crown's height, then out along a limb to the perch (k 0 … 1). */
export function climbPoint(t, ang, k, ground, o = {}) {
  const f = footPoint(t, ang, ground, {}), p = perchPoint(t, ang, {}), up = Math.min(1, k / 0.78), out = Math.max(0, (k - 0.78) / 0.22);
  o.x = f.x + (p.x - f.x) * out; o.z = f.z + (p.z - f.z) * out; o.y = f.y + (p.y - f.y) * up; return o;
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

const GROUND = new Set(['forage', 'search', 'fetch', 'eat', 'approach', 'take']);

export class SquirrelBrain {
  /** env: { trees, ground, walkable(x, z), nuts: NutField, player: { x, z, lure, hx, hz }, onTake(brain) -> bool, rnd }; start: tree index. */
  constructor(spec, env, start) {
    Object.assign(this, { spec, env, p: spec, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, rise: 0, run: 0, state: 'perch', t: 0, dur: 1, hasNut: false, react: 0, slot: null,
      tree: start, ang: 0, goal: { x: 0, z: 0 }, from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 0 }, tree2: 0, ang2: 0, approachAfter: false, calmT: 0, left: 0, sense: 0, log: [] });
    this.enterPerch(start, env.rnd() * Math.PI * 2);
    this.t = env.rnd() * 3;
  }
  get tr() { return this.env.trees[this.tree]; }
  set(state, dur = 1) { this.state = state; this.t = 0; this.dur = dur; this.run = 0; this.log.push(state); if (this.log.length > 40) this.log.shift(); }
  playerDist() { const pl = this.env.player; return Math.hypot(pl.x - this.x, pl.z - this.z); }
  place(o) { this.x = o.x; this.y = o.y; this.z = o.z; }

  enterPerch(tree, ang) {
    this.tree = tree; this.ang = ang; this.pitch = 0; this.rise = 0;
    this.place(perchPoint(this.tr, ang));
    this.yaw = ang + Math.PI / 2;
    this.set('perch', Math.max(this.calmT, this.hasNut ? C.carry : between(C.perch, this.env.rnd) * this.p.perch));
    this.react = 0;
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
  startForage() { this.left = between(C.forage, this.env.rnd); this.pickGoal(); }
  pickGoal() {
    const e = this.env, t = this.tr;
    for (let i = 0; i < 8; i++) {
      const a = e.rnd() * Math.PI * 2, d = 2 + e.rnd() * C.spread * 1.4, x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d;
      if (e.walkable(x, z)) { this.goal.x = x; this.goal.z = z; this.set('forage', 30); return; }
    }
    this.startToTree(false);
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
  frighten() { this.rise = 0; this.slot = null; this.calmT = between(C.scareTime, this.env.rnd) * this.p.calm; this.startToTree(true); }
  startApproach() { this.set('approach', 60); this.react = 0; }

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

  update(dt) {
    const e = this.env, pl = e.player, p = this.p, rnd = e.rnd;
    this.t += dt; if (this.calmT > 0) this.calmT -= dt;
    if (GROUND.has(this.state) && this.scared()) { this.frighten(); return; }
    switch (this.state) {
      case 'perch': {
        if (pl.lure && !this.hasNut && this.calmT <= 0 && this.playerDist() < p.lure) { if ((this.react += dt) > p.delay) { this.startDown(true); break; } } else this.react = 0;
        if (this.t < this.dur) break;
        this.hasNut = false;
        const near = this.tr.near;
        if (rnd() < p.ground) this.startDown(false);
        else if (near.length) { const j = near[Math.floor(rnd() * near.length)], t = e.trees[j]; this.startLeap(j, Math.atan2(this.z - t.z, this.x - t.x) + (rnd() - 0.5) * 1.2); }
        else this.enterPerch(this.tree, rnd() * Math.PI * 2);
        break;
      }
      case 'leap': {
        const k = Math.min(1, this.t / this.dur), h = 0.5 + 0.15 * Math.hypot(this.to.x - this.from.x, this.to.z - this.from.z);
        this.x = this.from.x + (this.to.x - this.from.x) * k; this.z = this.from.z + (this.to.z - this.from.z) * k;
        this.y = this.from.y + (this.to.y - this.from.y) * k + 4 * h * k * (1 - k); this.pitch = (0.5 - k) * 0.9;
        if (k >= 1) this.enterPerch(this.tree2, this.ang2);
        break;
      }
      case 'down': case 'up': {
        const k = Math.min(1, this.t / this.dur), kk = this.state === 'down' ? 1 - k : k;
        this.place(climbPoint(this.tr, this.ang, kk, e.ground)); this.run = 1;
        const trunk = (kk < 0.78); this.pitch = trunk ? (this.state === 'down' ? -Math.PI / 2 : Math.PI / 2) : 0;
        this.yaw = trunk ? (this.state === 'down' ? this.ang : this.ang + Math.PI) : this.ang + Math.PI / 2;
        if (k < 1) break;
        this.pitch = 0;
        if (this.state === 'up') this.enterPerch(this.tree, this.ang);
        else if (this.approachAfter && pl.lure) this.startApproach();
        else this.startForage();
        break;
      }
      case 'forage': case 'search': case 'fetch': case 'eat': this.onGround(dt); break;
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

  /** forage / search / fetch / eat: on the ground, no lure. */
  onGround(dt) {
    const e = this.env, pl = e.player, p = this.p, C_ = C;
    if (pl.lure && this.calmT <= 0 && this.playerDist() < p.lure && !this.hasNut) { this.rise = 0; this.startApproach(); return; }
    switch (this.state) {
      case 'forage': case 'fetch': {
        if (this.state === 'fetch' && !(this.slot?.alive && !this.slot.held)) { this.slot = null; this.pickGoal(); return; }
        if (this.state === 'forage' && ((this.sense -= dt) <= 0)) {
          this.sense = 0.5; const s = e.nuts.near(this.x, this.z, C_.sense);
          if (s) { this.slot = s; this.goal.x = s.x; this.goal.z = s.z; this.set('fetch', 30); return; }
        }
        this.left -= dt;
        if (this.moveTo(dt, C_.run * p.speed, this.state === 'fetch' ? 0.08 : 0)) {
          if (this.state === 'fetch') { this.set('eat', C_.eat * (0.8 + e.rnd() * 0.4)); this.rise = 1; this.run = 0; } else { this.set('search', between(C_.search, e.rnd)); }
        }
        return;
      }
      case 'search': this.rise = Math.min(1, this.t * 4); this.yaw += Math.sin(this.t * 2.3) * dt * 1.4;
        if (this.t >= this.dur) { this.rise = 0; if (this.left <= 0) this.startToTree(false); else this.pickGoal(); }
        return;
      case 'eat': this.rise = 1;
        if (this.t >= this.dur) {
          if (this.slot?.alive && !this.slot.held) e.nuts.remove(this.slot);
          this.slot = null; this.rise = 0; this.pickGoal();
        }
    }
  }
}
