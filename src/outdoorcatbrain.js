import { OUTDOOR_CATS } from './config.js';
import { hash01, routePlan, catAt, lapPlan } from './outdoorcatroute.js';

// #1772: an outdoor cat's brain (no three.js, so a node test can drive it: tools/outdoorcatbraintest.mjs). Modelled on the squirrels'
// SquirrelBrain (src/squirrelbrain.js): a small state machine whose numbers the personality tilts, here with a utility AI on top.
//
// Two layers:
//  1. The schedule (shared): the cat walks its loop (outdoorcatroute.js) and at every rest stop its brain picks an outing. Needs
//     (energy, play, social, hunger) drift and are spent by what it does; each behaviour's utility weighs them by the cat's traits
//     (OUTDOOR_CATS.cats[].traits) plus a little hashed noise, and the best one that fits the stop's rest wins. The needs are re-run
//     from the start of each block of `brain.block` stops (a hash per block seeds them), and every outing (where it walks, which
//     tree, where the butterfly flies) is a pure function of the stop and the time into it. So the brain is deterministic from the
//     wall clock and the cat's seed: every visitor sees the same cat doing the same thing, with no server and no leader. (The
//     squirrels' leader model, #1686, was not needed: the cats have no shared objects such as nuts, and a leader would add traffic
//     and hand-overs for animals one only sees from a few metres.)
//  2. The visitor (local, like #1767's "notice"): a social cat walks up to the visitor, a shy one keeps away, one that was met follows
//     a little, a stalking one creeps after a squirrel on the ground; afterwards it walks home to its schedule. Different visitors are
//     different people to meet, so this part stays per client.
//     #1782: food is local too: a raw caught fish nearby (outdoorcats.js finds it) makes it hesitate by its personality, walk there and eat.
// Outings and every local move are tested with `env.clear` (no road, no water, no drop) and, for outings, `env.free` (no wall or
// fence, main.js); an outing goes out and back the same checked way.

const C = OUTDOOR_CATS, B = C.brain;
export const BEHAVIOURS = ['rest', 'sleep', 'seek', 'explore', 'stalk', 'butterfly', 'climb'];
export const NEEDS = ['energy', 'play', 'social', 'hunger'];
const TRAITS0 = { social: 0.5, play: 0.5, lazy: 0.5, shy: 0.2, curious: 0.5 };
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const LAG = 0.7, BF = { rx: 1.45, rz: 1.05, disc: 1.8 }; // the chasing cat is LAG s behind the butterfly; its flight stays inside `disc`

/** The needs at the start of block `blk` (a hash per cat and block). */
export function startNeeds(id, blk) {
  return { energy: 0.35 + 0.55 * hash01(id, blk, 101), play: 0.2 + 0.6 * hash01(id, blk, 102), social: 0.2 + 0.6 * hash01(id, blk, 103), hunger: 0.15 + 0.5 * hash01(id, blk, 104) };
}

/** What each behaviour is worth now. `ctx`: { rest (s), butterflies, tree, spots, sunny }. Unavailable ones get -1. */
export function utilities(n, t, ctx, out = {}) {
  const tired = 1 - n.energy, lively = 0.3 + 0.7 * n.energy;
  out.rest = 0.22 + 0.2 * tired;
  out.sleep = tired * (0.3 + 0.95 * t.lazy) + (ctx.sunny ? 0.12 * t.lazy : 0);
  out.seek = n.social * (0.1 + 1.05 * t.social) * (1 - 0.85 * t.shy);
  out.explore = ctx.spots ? (0.15 + 0.4 * n.play) * (0.15 + 0.95 * t.curious) * lively : -1;
  out.stalk = ctx.spots ? (0.55 * n.hunger + 0.25 * n.play) * (0.2 + 0.45 * t.curious + 0.45 * t.play) * lively : -1;
  out.butterfly = ctx.butterflies ? n.play * (0.25 + 1.25 * t.play) * lively : -1;
  out.climb = ctx.tree ? n.play * (0.12 + 0.9 * t.play) * (1 - 0.6 * t.lazy) * (n.energy > 0.3 ? 1 : 0.2) : -1;
  return out;
}

/** The best behaviour that fits the stop (noise(k) -> [0, 1) per behaviour). */
export function choose(n, t, ctx, noise) {
  const u = utilities(n, t, ctx); let best = 'rest', bv = -Infinity;
  for (const k of BEHAVIOURS) {
    if (u[k] < 0 || ctx.rest < B.minRest[k]) continue;
    const v = u[k] + B.noise * noise(k);
    if (v > bv) { bv = v; best = k; }
  }
  return best;
}

/** The needs after a stop spent on `kind`: the drift of a stop (the traits set how fast: a playful cat soon wants to play again, a
 * social one company, a lazy one tires), then that behaviour's effect. */
export function spend(n, kind, t = TRAITS0) {
  const d = B.needs.drift, e = B.needs[kind] ?? {}, o = {};
  const rate = { energy: 0.6 + 0.8 * t.lazy, play: 0.3 + 1.4 * t.play, social: 0.3 + 1.4 * t.social, hunger: 1 };
  for (const k of NEEDS) o[k] = clamp01(n[k] + (d[k] ?? 0) * rate[k] + (e[k] ?? 0));
  return o;
}

/** How high up a cat sits in tree `t` ({ y, cy, r, th: trunk height (optional) }): just under the crown, on the lower limbs (`brain.branch`). */
export function branchHeight(t) {
  const under = t.cy - t.r - t.y - 0.2;
  return Math.max(B.branch[0], Math.min(B.branch[1], t.th ? Math.min(under, 0.75 * t.th) : t.cy - t.r * 0.7 - t.y));
}

export class OutdoorCatBrain {
  /** env: { now() s, hour() 0 … 24, month() 1 … 12, ground(x, z), clear(ax, az, bx, bz) (walkable, no drop), free(x, z) (no wall; optional),
   *  trees: [{ x, z, y, cy, r }] (trunk foot, crown centre height and radius), prey() -> [{ x, z }] (squirrels on the ground; optional) } */
  constructor(spec, id, env) {
    Object.assign(this, { spec, id, env, name: spec.name, traits: { ...TRAITS0, ...spec.traits }, plan: routePlan(spec.route, spec.rest, C.speed, spec.vary),
      st: 'route', x: 0, z: 0, h: 0, yaw: 0, pitch: 0, hop: 0, walking: false, activity: 'look', moved: 0, faceEye: false, lost: false,
      at: null, outing: null, kind: 'rest', bf: null, legInfo: [], memo: { n: NaN, needs: null }, checkT: 0, reactT: 0, stateT: 0, seekCool: 0, prey: null, food: null });
    const s = this.scheduled(); this.x = s.x; this.z = s.z; this.yaw = s.yaw;
  }
  get L() { return this.plan.legs.length; }
  /** The cat's own clock (s into its loop). */
  T(now = this.env.now()) { return now - C.epoch + this.spec.phase; }
  /** Where its loop has it: catAt (outdoorcatroute.js). */
  scheduled(now) { return catAt(this.plan, this.T(now), this.id); }
  /** The global number of the rest stop at the end of leg `leg` of lap `lap`. */
  stopOf(lap, leg) { return lap * this.L + leg; }

  // --- layer 1: the schedule ---

  /** The stop `m`'s leg, lap, rest point, rest length and its wall-clock start. */
  stop(m) {
    const L = this.L, leg = ((m % L) + L) % L, lap = Math.floor(m / L), g = lapPlan(this.plan,lap,this.id).legs[leg];
    return { m, leg, lap, P: { x: g.bx, z: g.bz }, R: g.rest, start: C.epoch - this.spec.phase + lap * this.plan.period + g.t0 + g.walk };
  }
  /** What there is round a stop's point (computed once per leg, when it first matters): reachable trees and outing spots. */
  info(leg,lap=0) {
    const plan=lapPlan(this.plan,lap,this.id),key=(plan===this.plan?0:this.L)+leg;
    let I = this.legInfo[key];
    if (I) return I;
    const g = plan.legs[leg], P = { x: g.bx, z: g.bz }, env = this.env, way = (a, b) => this.clearOut(a.x, a.z, b.x, b.z);
    const trees = (env.trees ?? []).map((t) => [Math.hypot(t.x - P.x, t.z - P.z), t]).filter(([d]) => d > 0.6 && d < B.climbReach).sort((a, b) => a[0] - b[0])
      .map(([d, t]) => { const ux = (P.x - t.x) / d, uz = (P.z - t.z) / d; const o = (t.tr ?? 0.2) + 0.12; return { t, F: { x: t.x + ux * o, z: t.z + uz * o }, ux, uz }; }) // (F: at the trunk's foot, against the bark)
      .filter((q) => way(P, q.F)).slice(0, 3);
    const ring = (r0, r1, salt) => { // up to 4 points r0 … r1 m out that the cat can walk to and back
      const out = [];
      for (let k = 0; k < 12 && out.length < 4; k++) {
        const a = (k / 12 + hash01(this.id, leg, salt)) * Math.PI * 2, r = r0 + (r1 - r0) * hash01(this.id, leg * 13 + k, salt + 1), q = { x: P.x + Math.cos(a) * r, z: P.z + Math.sin(a) * r };
        if (way(P, q)) out.push(q);
      }
      return out;
    };
    const disc = (q) => { // the butterfly's whole flight area: every point of a 0.5 m grid in the disc reachable from its centre
      for (let dx = -BF.disc; dx <= BF.disc + 1e-9; dx += 0.5) for (let dz = -BF.disc; dz <= BF.disc + 1e-9; dz += 0.5) {
        if (Math.hypot(dx, dz) <= BF.disc && !way(q, { x: q.x + dx, z: q.z + dz })) return false;
      }
      return true;
    };
    I = { trees, explore: ring(2.5, B.reach, 31), stalk: ring(3, B.reach, 41), butterfly: ring(2.2, B.reach - BF.disc, 51).filter(disc) };
    return (this.legInfo[key] = I);
  }
  /** A straight outing way: walkable, no drop, and (main.js) no wall. */
  clearOut(ax, az, bx, bz) {
    if (!this.env.clear(ax, az, bx, bz)) return false;
    const f = this.env.free; if (!f) return true;
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5));
    for (let k = 0; k <= n; k++) if (!f(ax + (bx - ax) * k / n, az + (bz - az) * k / n)) return false;
    return true;
  }
  hourAt(t) { const h = this.env.hour?.() ?? 12; return (((h - (this.env.now() - t) / 3600) % 24) + 24) % 24; }
  ctx(m) {
    const s = this.stop(m), I = this.info(s.leg,s.lap), hr = this.hourAt(s.start), mo = this.env.month?.() ?? 7;
    return { rest: s.R, tree: I.trees.length > 0, spots: I.explore.length > 0 && I.stalk.length > 0, sunny: hr >= 10 && hr < 16,
      butterflies: I.butterfly.length > 0 && B.butterflyMonths.includes(mo) && hr >= B.butterflyHours[0] && hr < B.butterflyHours[1] };
  }
  /** The behaviour at stop `m` and the needs it was chosen with (the needs re-run from the start of `m`'s block; the last one is remembered). */
  decide(m) {
    const blk = Math.floor(m / B.block), mm = this.memo;
    let n, j;
    if (mm.n <= m && Math.floor(mm.n / B.block) === blk) { n = mm.needs; j = mm.n; } else { n = startNeeds(this.id, blk); j = blk * B.block; }
    let kind = 'rest';
    for (; j <= m; j++) {
      kind = choose(n, this.traits, this.ctx(j), (k) => hash01(this.id * 31 + BEHAVIOURS.indexOf(k), j, 7));
      if (j === m) { mm.n = m; mm.needs = n; mm.kind = kind; break; }
      n = spend(n, kind, this.traits);
    }
    return { kind, needs: n };
  }
  /** For tests and the debug panel: the behaviour at stop `m`. */
  behaviourAt(m) { return this.decide(m).kind; }

  /** The outing at stop `m`: a list of timed segments (out and back the same checked ways), ending at the stop's point after its rest. */
  outingAt(m) {
    if (this.outing?.m === m) return this.outing;
    const s = this.stop(m), { P, R } = s, I = this.info(s.leg,s.lap), h = (k) => hash01(this.id, m, k), segs = [];
    let kind = this.decide(m).kind, t = 0;
    const add = (type, dur, a, b = a, extra = {}) => { segs.push({ type, t0: t, t1: t + dur, a, b, ...extra }); t += dur; };
    const walk = (a, b, v = B.trot, type = 'walk') => add(type, Math.hypot(b.x - a.x, b.z - a.z) / v, a, b);
    const sit = (act, until, at) => { if (until > t) add('sit', until - t, at, at, { act }); };
    const pick = (arr) => arr[Math.floor(h(3) * arr.length) % arr.length];
    const d = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
    let bf = null;
    if (kind === 'explore') {
      const q = pick(I.explore), w = d(P, q) / B.trot;
      if (2 * w + 6 > R) kind = 'rest';
      else { walk(P, q); add('sniff', R - 2 * w, q); walk(q, P); }
    } else if (kind === 'stalk') {
      const q = [...I.stalk].sort((a, b) => d(P, a) - d(P, b)).find((q) => d(P, q) / B.creep + 1.4 + d(P, q) / B.trot + 2 <= R);
      if (!q) kind = 'rest';
      else { walk(P, q, B.creep, 'creep'); add('pounce', 1.4, q); sit('look', R - d(P, q) / B.trot, q); walk(q, P); }
    } else if (kind === 'butterfly') {
      const q = pick(I.butterfly), w = d(P, q) / B.trot, back = (BF.disc + d(P, q)) / B.trot, chase = R - w - back - 1;
      if (chase < 10) kind = 'rest';
      else {
        bf = { q, ph: h(5) * 6.28, w1: 0.55 + 0.25 * h(6), w2: 0.8 + 0.3 * h(8), sx: h(11) > 0.5 ? 1 : -1, sz: h(12) > 0.5 ? 1 : -1, t0: w, t1: w + chase };
        walk(P, q); add('chase', chase, q, q, { bf });
        const e = this.bfAt(bf, w + chase - LAG); // where the chase ends (inside the disc)
        segs[segs.length - 1].b = { x: e.x, z: e.z };
        walk({ x: e.x, z: e.z }, q); walk(q, P); sit('look', R, P);
      }
    } else if (kind === 'climb') {
      const c = pick(I.trees), tr = c.t, hb = branchHeight(tr), w = d(P, c.F) / B.trot;
      const up = hb / B.climb, down = hb / (B.climb * 1.3), stay = R - 2 * w - up - down - 1.2;
      if (stay < 8) kind = 'rest';
      else {
        const a = Math.atan2(c.uz, c.ux) + (h(9) - 0.5) * 1.6, ob = (tr.tr ?? 0.2) * (1 - 0.5 * Math.min(1, hb / (tr.th ?? 4))) + 0.18, Bp = { x: tr.x + Math.cos(a) * ob, z: tr.z + Math.sin(a) * ob };
        const trunk = { x: tr.x, z: tr.z }, ex = { hb, trunk };
        walk(P, c.F); add('up', up, c.F, c.F, ex); add('out', 0.6, c.F, Bp, ex);
        add('branch', stay, Bp, Bp, { ...ex, act: this.traits.lazy > 0.6 || h(10) > 0.7 ? 'sleep' : 'look' });
        add('in', 0.6, Bp, c.F, ex); add('down', down, c.F, c.F, ex); walk(c.F, P);
      }
    }
    if (!segs.length || kind === 'rest' || kind === 'sleep' || kind === 'seek') {
      segs.length = 0; t = 0;
      sit(kind === 'sleep' ? 'sleep' : kind === 'seek' ? 'look' : h(4) > 0.45 ? 'wash' : 'look', R, P);
    }
    sit('look', R, P);
    return (this.outing = { m, kind, P, R, segs, bf });
  }
  /** The butterfly of `bf` at `e` s into the stop: { x, y (m above the ground), z }. */
  bfAt(bf, e, o = {}) {
    const u = e - bf.t0; // (an ellipse through its centre: |x| ≤ rx, |z| ≤ rz, inside the checked disc)
    o.x = bf.q.x + bf.sx * BF.rx * Math.sin(bf.w1 * u);
    o.z = bf.q.z + bf.sz * BF.rz * Math.sin(bf.w2 * u);
    o.y = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(u * 1.7 + bf.ph)) + 0.05 * Math.sin(u * 13);
    return o;
  }
  /** The pose `e` s into the outing `o`: sets x, z, h, yaw, pitch, walking, activity, hop, bf. */
  poseAt(o, e) {
    const sg = o.segs.find((q) => e < q.t1) ?? o.segs[o.segs.length - 1], k = Math.max(0, Math.min(1, (e - sg.t0) / ((sg.t1 - sg.t0) || 1)));
    const lerp = (a, b) => ({ x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k }), r = { h: 0, pitch: 0, hop: 0, walking: false, activity: 'look', yaw: null };
    let p = lerp(sg.a, sg.b);
    const face = (q) => Math.atan2(q.x - p.x, q.z - p.z);
    switch (sg.type) {
      case 'walk': case 'creep': r.walking = true; r.activity = sg.type; r.yaw = Math.atan2(sg.b.x - sg.a.x, sg.b.z - sg.a.z); break;
      case 'sniff': r.activity = 'sniff'; break;
      case 'pounce': r.activity = 'pounce'; r.hop = 0.1 * Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, (k - 0.35) / 0.4)))); break;
      case 'chase': {
        const u = e - sg.t0, b = this.bfAt(sg.bf, e), c = this.bfAt(sg.bf, Math.max(sg.t0, e - LAG)), c2 = this.bfAt(sg.bf, Math.max(sg.t0, e - LAG - 0.2));
        p = { x: c.x, z: c.z }; r.walking = Math.hypot(c.x - c2.x, c.z - c2.z) > 0.02; r.activity = 'chase'; r.yaw = face(b);
        r.hop = b.y < 0.5 ? 0.12 * Math.max(0, Math.sin(u * 5)) : 0; break;
      }
      case 'up': r.h = sg.hb * k; r.pitch = -1.35; r.walking = true; r.activity = 'climb'; r.yaw = face(sg.trunk); break;
      case 'out': case 'in': r.h = sg.hb; r.walking = true; r.activity = 'walk'; r.yaw = Math.atan2(sg.b.x - sg.a.x, sg.b.z - sg.a.z); break;
      case 'branch': r.h = sg.hb; r.activity = sg.act; r.yaw = Math.atan2(p.x - sg.trunk.x, p.z - sg.trunk.z); break;
      case 'down': r.h = sg.hb * (1 - k); r.pitch = 1.15; r.walking = true; r.activity = 'climb'; r.yaw = Math.atan2(p.x - sg.trunk.x, p.z - sg.trunk.z); break;
      default: r.activity = sg.act ?? 'look';
    }
    r.x = p.x; r.z = p.z;
    const bfe = o.bf && e > o.bf.t0 - 6 && e < o.bf.t1 + 5 ? o.bf : null; // the butterfly is about a little before and after the chase
    r.bf = bfe ? this.bfAt(bfe, Math.max(bfe.t0, Math.min(bfe.t1, e)), {}) : null;
    if (r.bf && e < bfe.t0) r.bf.y += 0.08 * (bfe.t0 - e); // (flutters down to it, and away up after)
    if (r.bf && e > bfe.t1) r.bf.y += 0.6 * (e - bfe.t1);
    return r;
  }
  /** The scheduled pose now: on the loop while walking (or far away), the outing while resting near the visitor. */
  schedulePose(near) {
    const s = this.scheduled(); this.at = s;
    if (s.walking || !near) { this.bf = null; this.kind = s.walking ? 'walk' : this.kind; return { x: s.x, z: s.z, h: 0, pitch: 0, hop: 0, yaw: s.yaw, walking: s.walking, activity: s.walking ? 'walk' : s.activity, bf: null }; }
    const m = this.stopOf(s.lap, s.leg), o = this.outingAt(m), g = lapPlan(this.plan,s.lap,this.id).legs[s.leg];
    this.kind = o.kind;
    const r = this.poseAt(o, g.rest - s.restLeft);
    if (r.yaw == null) r.yaw = s.yaw;
    return r;
  }

  // --- layer 2: the visitor (local) ---

  /** One frame. `vis`: { x, z, d (m, 3D), ok (it may react: shown, not sheltering), still (s the visitor has stood still) };
   * `near`: within reach of being seen (the brain only plans then; far away it stays on its loop). */
  update(dt, vis, near = true) {
    this.lost = false; this.faceEye = false; this.stateT += dt; this.seekCool = Math.max(0, this.seekCool - dt);
    const sp = this.schedulePose(near), t = this.traits, px = this.x, pz = this.z, onGround = this.h < 0.05;
    this.bf = this.st === 'route' ? sp.bf : null;
    if ((this.st === 'route' || this.st === 'home') && vis.ok && onGround && sp.h < 0.05 && !(this.st === 'route' && sp.activity === 'chase') && (this.reactT -= dt) <= 0) { // (all eyes for the butterfly)
      this.reactT = 0.25;
      const seekR = B.seekRange * t.social * (this.kind === 'seek' ? 1 : 0.55);
      if (t.shy > 0.5 && vis.d < B.shyRange && vis.still < B.shyCalm) this.set('flee');
      else if (vis.d < C.notice) this.set('notice');
      else if (seekR > C.notice && vis.d < seekR && !this.seekCool && this.env.clear(this.x, this.z, vis.x, vis.z)) this.set('seek');
      else if (this.kind === 'stalk' && this.env.prey) {
        const q = this.env.prey().find((a) => Math.hypot(a.x - this.x, a.z - this.z) < B.preyRange && this.env.clear(this.x, this.z, a.x, a.z));
        if (q) { this.prey = q; this.set('prey'); }
      }
    }
    let walking = false, activity = 'look', speed = 0, tx = this.x, tz = this.z, stop = 0;
    const toVis = Math.atan2(vis.x - this.x, vis.z - this.z);
    switch (this.st) {
      case 'route':
        Object.assign(this, { x: sp.x, z: sp.z, h: sp.h, hop: sp.hop }); this.pitch = sp.pitch;
        this.yaw = turnTo(this.yaw, sp.yaw, dt * (sp.activity === 'chase' ? 8 : 4)); walking = sp.walking; activity = sp.activity;
        this.moved = Math.hypot(this.x - px, this.z - pz) + (sp.activity === 'climb' ? B.climb * dt : 0);
        if (this.moved > 3) this.moved = 0; // (a jump: it was out of reach)
        this.walking = walking; this.activity = activity; return;
      case 'notice':
        this.faceEye = true;
        if (vis.d > C.notice + 1.5 || !vis.ok) { this.seekCool = 20; this.set('home'); }
        else if (this.stateT > 45) { this.seekCool = 60; this.set('home'); } // (not taken up: after a while it goes back to what it was doing)
        break;
      case 'seek': // a social cat comes up to the visitor
        if (!vis.ok || vis.d > B.seekRange * t.social + 3) { this.seekCool = 20; this.set('home'); break; }
        tx = vis.x; tz = vis.z; stop = B.seekStop; speed = B.seekSpeed;
        if (Math.hypot(vis.x - this.x, vis.z - this.z) <= B.seekStop + 0.15) this.set('notice');
        break;
      case 'follow': // after being met: a few steps after the visitor
        if (this.stateT > B.followTime || !vis.ok || vis.d > C.release + 6) { this.seekCool = 30; this.set('home'); break; }
        tx = vis.x; tz = vis.z; stop = 2; speed = B.seekSpeed;
        break;
      case 'flee': { // a shy cat keeps its distance
        if (vis.d > B.shyRange + 2 || !vis.ok) { this.set('home'); break; }
        if (vis.still >= B.shyCalm) { this.set('notice'); break; }
        const s = this.at, away = Math.atan2(this.x - vis.x, this.z - vis.z);
        for (const da of [0, 0.6, -0.6, 1.2, -1.2]) {
          const a = away + da, qx = this.x + Math.sin(a) * 0.8, qz = this.z + Math.cos(a) * 0.8;
          if (Math.hypot(qx - s.x, qz - s.z) < B.reach + 3 && this.env.clear(this.x, this.z, qx, qz) && (!this.env.free || this.env.free(qx, qz))) { tx = qx; tz = qz; speed = B.fleeSpeed; break; }
        }
        if (!speed) this.faceEye = true; // cornered: it sits and watches
        break;
      }
      case 'prey': { // stalking a squirrel on the ground: creep up to it, crouch and watch
        const q = this.prey && this.env.prey().find((a) => a === this.prey || Math.hypot(a.x - this.prey.x, a.z - this.prey.z) < 1.5);
        if (!q || this.kind !== 'stalk' || this.stateT > 25) { this.set('home'); break; }
        this.prey = q; tx = q.x; tz = q.z; stop = 1.8; speed = B.creep; activity = 'creep';
        break;
      }
      case 'food': { // #1782: a raw fish nearby (outdoorcats.js keeps `food` at the fish): it hesitates by its personality, then walks there
        const f = this.food;
        if (!f || !vis.ok) { this.food = null; this.set('home'); break; }
        const toF = Math.atan2(f.x - this.x, f.z - this.z);
        if (f.t < f.wait) { // (a shy cat only makes up its mind once the visitor stands still, or after a long while)
          if (!(t.shy > 0.5 && vis.d < B.shyRange && vis.still < B.shyCalm) || this.stateT > C.food.maxWait) f.t += dt;
          this.yaw = turnTo(this.yaw, toF, dt * 3); break;
        }
        tx = f.x; tz = f.z; stop = f.stop; speed = C.food.speed;
        if (Math.hypot(f.x - this.x, f.z - this.z) <= f.stop + 0.06) this.set('eat');
        break;
      }
      case 'eat': // head down at the fish (outdoorcats.js counts the bites and ends it)
        if (this.food) this.yaw = turnTo(this.yaw, Math.atan2(this.food.x - this.x, this.food.z - this.z), dt * 3);
        activity = 'eat';
        break;
      case 'home': { // back to the schedule (to the trunk's foot if the schedule has it up a tree)
        tx = sp.x; tz = sp.z; speed = C.returnSpeed;
        const td = Math.hypot(tx - this.x, tz - this.z);
        if (td < 0.25) { if (sp.h < 0.05) { this.set('route'); return this.update(0, vis, near); } speed = 0; }
        else if ((this.checkT -= dt) <= 0) { this.checkT = 0.5; if (td > C.maxReturn || !this.env.clear(this.x, this.z, tx, tz)) this.lost = true; }
        break;
      }
    }
    // walk on the ground towards (tx, tz), stopping `stop` m short; every 0.5 s the way ahead is checked (no road, water, drop)
    this.h = Math.max(0, this.h - dt * 2); this.pitch = 0; this.hop = 0; this.moved = 0;
    const dx = tx - this.x, dz = tz - this.z, dd = Math.hypot(dx, dz) - stop;
    if (speed > 0 && dd > 0.05 && this.st !== 'notice') {
      if (this.st !== 'home' && (this.checkT -= dt) <= 0) {
        this.checkT = 0.5; const L = Math.min(dd, 1.5), l = Math.hypot(dx, dz);
        if (!this.env.clear(this.x, this.z, this.x + dx / l * L, this.z + dz / l * L)) { this.set(this.st === 'flee' ? 'flee' : 'home'); this.faceEye = this.st === 'flee'; speed = 0; }
      }
      if (speed > 0) {
        const go = Math.min(dd, speed * dt), l = Math.hypot(dx, dz);
        this.x += dx / l * go; this.z += dz / l * go; this.moved = go; walking = true;
        this.yaw = turnTo(this.yaw, Math.atan2(dx, dz), dt * 6);
      }
    }
    if (!walking && (this.faceEye || this.st === 'seek' || this.st === 'follow')) { this.faceEye = true; this.yaw = turnTo(this.yaw, toVis, dt * 3); }
    this.walking = walking; this.activity = walking ? (activity === 'creep' ? 'creep' : 'walk') : activity === 'creep' ? 'crouch' : activity === 'eat' ? 'eat' : 'look';
  }
  /** #1782: go for food at (x, z) (a raw fish), stopping `stop` m short; how long it hesitates first follows its personality (`foodWait`). */
  goFor(x, z, stop) { this.food = { x, z, stop, t: 0, wait: this.foodWait() }; this.set('food'); }
  /** #1782: s it hesitates before it walks to food: a social or curious cat comes at once, a lazy one slowly, a shy one slowest (*guess*). */
  foodWait() { const t = this.traits; return C.food.wait * Math.max(0.25, Math.min(4, 1 + 2.5 * t.shy + 0.8 * t.lazy - 0.8 * t.social - 0.5 * t.curious)); }
  set(st) { this.st = st; this.stateT = 0; this.checkT = 0; }
  /** Back on its loop now (it was away). */
  resume() { const s = this.scheduled(); Object.assign(this, { x: s.x, z: s.z, yaw: s.yaw, h: 0, pitch: 0 }); this.set('route'); this.outing = null; this.food = null; }
}

export function turnTo(a, b, max) {
  const d = wrap(b - a);
  return a + Math.sign(d) * Math.min(Math.abs(d), max);
}
