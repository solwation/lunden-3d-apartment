// #2129: bird life without three.js (headless, tools/birdflocktest.mjs). Three pieces:
//  - `collectPerches`: landing places taken only from surfaces the world already has — tree crowns (surroundings.js aoTrees),
//    roof edges (the walkable world.roofs surfaces, src/roofs.js), rail lines (pergola beams, the park bridge's handrails) and
//    ground patches (courtyard gravel/lawn rectangles, the park glade) validated by a caller predicate. Grouped: a flock lands
//    on one group (a crown, a stretch of eave, a stretch of rail, a patch of ground) at a time.
//  - `SmallFlock`: a sparrow-like flock. Flying birds steer with simple flock rules (cohesion, alignment, separation, a
//    turn-rate-limited acceleration towards their own spot) in bounding flight (flap bursts, short folded glides); they glide in,
//    flare and sit; on the ground they hop and peck, up high they turn now and then. A threat (the eye, an outdoor cat) inside the
//    perch kind's flush distance sends the whole flock up and away to a group far from it. Seeded and dt-driven: the same inputs
//    give the same flight (no network state; every visitor's flock is local).
//  - `GullRoost`: when a low circling gull lands. A pure function of time per gull (seeded period, spot and stand time) plus a
//    flush time when someone walks up to a standing gull. Circle positions come from the caller (the GPU flock's own formula).
// All tunables: config.js BIRD_LIFE (*guess*).

/** mulberry32: a small seeded generator (the gulls' and the ducks' pattern). */
export function seeded(seed) {
  let s = seed | 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** A stateless 0…1 hash of an integer (no allocation per frame). */
export function hash01(n) { let t = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); t ^= t >>> 13; t = Math.imul(t, 0xc2b2ae35); t ^= t >>> 16; return (t >>> 0) / 4294967296; }
const lerp = ([a, b], k) => a + (b - a) * k;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const angleTo = (dx, dz) => Math.atan2(dx, dz); // yaw: 0 = +z (the model's bill), the shader's convention
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Spots along a segment, `gap` m apart, at most `max`, centred. */
function along(ax, ay, az, bx, by, bz, gap, max) {
  const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.min(max, Math.floor(len / gap))), out = [], yaw = angleTo(bx - ax, bz - az) + Math.PI / 2;
  for (let i = 0; i < n; i++) { const t = n === 1 ? 0.5 : 0.5 + (i - (n - 1) / 2) * gap / Math.max(len, 1e-6); out.push({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t, z: az + (bz - az) * t, yaw }); }
  return out;
}

/** Is (x, z) inside the ring [[x, z], …]? */
export function inRing(p, x, z) {
  let yes = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > z) !== (p[j][1] > z) && x < (p[j][0] - p[i][0]) * (z - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) yes = !yes;
  return yes;
}

/**
 * The perch groups round `home` ({ x, z, r }). Sources (each optional):
 *  `crowns` [{ x, z, r, y }] (aoTrees), `roofs` { surfaces, topAt(x, z), on(s, x, z), height(s, x, z) } (a Roofs and its statics),
 *  `rails` [[ax, ay, az, bx, by, bz]] (the rail's top line), `patches` [{ kind: 'gravel'|'grass', x0, x1, z0, z1 } or { poly }],
 *  `groundY(x, z)`, `groundOk(x, z)` (no path, sandbox, water …), `clear(x, z)` (outside every house footprint). `rnd` seeds the ground spots.
 * Returns [{ kind, x, z, y, spots: [{ x, y, z, yaw }], patch? }] — every spot on its surface (tests: tools/birdflocktest.mjs).
 */
export function collectPerches({ home, crowns = [], roofs = null, rails = [], patches = [], groundY = () => 0, groundOk = () => true, clear = () => true, C, rnd = seeded(1) }) {
  const inHome = (x, z) => Math.hypot(x - home.x, z - home.z) <= home.r, byDist = (a, b) => Math.hypot(a.x - home.x, a.z - home.z) - Math.hypot(b.x - home.x, b.z - home.z);
  const groups = { tree: [], roof: [], rail: [], ground: [] }, G = C.perGroup;
  for (const c of crowns) {
    if (!inHome(c.x, c.z) || !(c.r > C.minCrown)) continue;
    const spots = [], a0 = rnd() * Math.PI * 2;
    for (let i = 0; i < G * 2 && spots.length < G; i++) {
      const a = a0 + i * Math.PI / G + (rnd() - 0.5) * 0.2, d = c.r * C.crownOut, x = c.x + Math.sin(a) * d, z = c.z + Math.cos(a) * d, y = c.y + c.r * C.crownUp;
      if (!clear(x, z) || (roofs && roofs.topAt(x, z) > y - 0.5)) continue; // a crown against a house: not inside its walls, not under its eaves
      if (spots.some((q) => Math.hypot(q.x - x, q.z - z) < C.gap)) continue;
      spots.push({ x, y, z, yaw: a });
    }
    if (spots.length >= Math.min(G, 4)) groups.tree.push({ kind: 'tree', x: c.x, z: c.z, y: c.y, crown: c, spots });
  }
  if (roofs) for (const s of roofs.surfaces) {
    const ring = s.poly ?? (s.r == null ? [[s.x0, s.z0], [s.x1, s.z0], [s.x1, s.z1], [s.x0, s.z1]] : null);
    if (!ring || !(s.x1 >= home.x - home.r && s.x0 <= home.x + home.r && s.z1 >= home.z - home.r && s.z0 <= home.z + home.r)) continue;
    const n = ring.length - (ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? 1 : 0);
    let cx = 0, cz = 0; for (let i = 0; i < n; i++) { cx += ring[i][0] / n; cz += ring[i][1] / n; }
    for (let i = 0; i < n; i++) {
      const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % n], len = Math.hypot(bx - ax, bz - az);
      if (len < 1.5) continue;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (!inHome(mx, mz)) continue;
      let nx = -(bz - az) / len, nz = (bx - ax) / len; // the inward normal: towards the polygon
      if (!roofs.on(s, mx + nx * C.edgeIn, mz + nz * C.edgeIn)) { nx = -nx; nz = -nz; }
      const span = Math.min(len - 0.6, G * C.gap * 1.6), ux = (bx - ax) / len, uz = (bz - az) / len;
      const x0 = mx - ux * span / 2 + nx * C.edgeIn, z0 = mz - uz * span / 2 + nz * C.edgeIn, x1 = mx + ux * span / 2 + nx * C.edgeIn, z1 = mz + uz * span / 2 + nz * C.edgeIn;
      const spots = along(x0, 0, z0, x1, 0, z1, C.gap * 1.4, G).filter((p) => {
        if (!roofs.on(s, p.x, p.z)) return false;
        p.y = roofs.height(s, p.x, p.z); p.yaw = angleTo(-nx, -nz); // looking out over the edge
        return Number.isFinite(p.y) && roofs.topAt(p.x, p.z) <= p.y + 0.01 && (!roofs.above || roofs.above(p.x, p.z, p.y + 0.05) > p.y + 1.5);
      });
      if (spots.length >= 3) groups.roof.push({ kind: 'roof', x: mx, z: mz, y: spots[0].y, surface: s, spots });
    }
  }
  for (const [ax, ay, az, bx, by, bz] of rails) {
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    if (!inHome(mx, mz) || Math.hypot(bx - ax, bz - az) < 1 || !clear(ax, az) || !clear(bx, bz)) continue;
    groups.rail.push({ kind: 'rail', x: mx, z: mz, y: (ay + by) / 2, line: [ax, ay, az, bx, by, bz], spots: along(ax, ay, az, bx, by, bz, C.gap * 1.2, G) });
  }
  for (const p of patches) {
    const box = p.poly ? { x0: Math.min(...p.poly.map((q) => q[0])), x1: Math.max(...p.poly.map((q) => q[0])), z0: Math.min(...p.poly.map((q) => q[1])), z1: Math.max(...p.poly.map((q) => q[1])) } : p;
    const inside = (x, z) => x > box.x0 && x < box.x1 && z > box.z0 && z < box.z1 && (!p.poly || inRing(p.poly, x, z));
    const ok = (x, z) => inside(x, z) && inHome(x, z) && groundOk(x, z) && clear(x, z);
    // a cluster round a valid seed point (a flock feeds together), each spot valid
    let seedPt = null;
    for (let k = 0; k < 40 && !seedPt; k++) { const x = lerp([box.x0, box.x1], 0.15 + 0.7 * rnd()), z = lerp([box.z0, box.z1], 0.15 + 0.7 * rnd()); if (ok(x, z)) seedPt = [x, z]; }
    if (!seedPt) continue;
    const spots = [];
    for (let k = 0; k < G * 12 && spots.length < G; k++) {
      const a = rnd() * Math.PI * 2, d = 0.2 + rnd() * 1.6, x = seedPt[0] + Math.sin(a) * d, z = seedPt[1] + Math.cos(a) * d;
      if (!ok(x, z) || spots.some((q) => Math.hypot(q.x - x, q.z - z) < C.gap)) continue;
      spots.push({ x, y: groundY(x, z), z, yaw: rnd() * Math.PI * 2 });
    }
    if (spots.length >= 3) groups.ground.push({ kind: 'ground', x: seedPt[0], z: seedPt[1], y: spots[0].y, surface: p.kind ?? 'grass', ok, yAt: groundY, spots });
  }
  const out = [];
  for (const kind of ['tree', 'roof', 'rail', 'ground']) out.push(...groups[kind].sort(byDist).slice(0, C.maxGroups[kind]));
  return out;
}

/** A gull's landing spots: the highest points of roofs (ridges, flat-roof edges) and the river's banks. Each { x, y, z, kind }. */
export function gullSpots({ center, roofs = null, bank = [], C, rnd = seeded(2) }) {
  const G = C.gull, out = [], inArea = (x, z) => Math.hypot(x - center.x, z - center.z) <= G.area;
  if (roofs) for (const s of roofs.surfaces) {
    if (s.r != null || !inArea((s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2) || (s.x1 - s.x0) * (s.z1 - s.z0) < 40) continue;
    const cand = [];
    for (let k = 0; k < 30; k++) {
      const x = lerp([s.x0, s.x1], 0.1 + 0.8 * rnd()), z = lerp([s.z0, s.z1], 0.1 + 0.8 * rnd());
      if (!roofs.on(s, x, z)) continue;
      const y = roofs.height(s, x, z);
      if (Number.isFinite(y) && y >= G.minRoofY && roofs.topAt(x, z) <= y + 0.01 && (!roofs.above || roofs.above(x, z, y + 0.05) > y + 2)) cand.push({ x, y, z, kind: 'roof' });
    }
    cand.sort((a, b) => b.y - a.y); // a ridge or the highest part of a flat roof
    let taken = 0;
    for (const c of cand) {
      if (taken >= G.perRoof) break;
      if (out.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < 6)) continue;
      out.push(c); taken++;
    }
  }
  for (const b of bank) if (inArea(b.x, b.z)) out.push({ x: b.x, y: b.y, z: b.z, kind: 'bank' });
  // an even mix of both kinds, at most G.spots
  const roofsOnly = out.filter((o) => o.kind === 'roof'), banks = out.filter((o) => o.kind === 'bank'), mix = [];
  for (let i = 0; mix.length < G.spots && (i < roofsOnly.length || i < banks.length); i++) { if (i < roofsOnly.length) mix.push(roofsOnly[i]); if (i < banks.length && mix.length < G.spots) mix.push(banks[i]); }
  return mix;
}

const FLY = 0, LAND = 1, SIT = 2;

/** One flock of small birds over `groups` (collectPerches). `n` birds, `seed`. Per frame: step(dt, threats [{ x, y, z }]). */
export class SmallFlock {
  constructor({ groups, n, seed, C, topAt = null }) {
    groups = groups.filter((g) => g.spots.length >= n || g.kind === 'ground'); // a spot each (a ground patch takes extra birds beside its spots)
    Object.assign(this, { groups, C, topAt, rnd: seeded(seed), time: 0, group: null, settled: false, dwell: 0, calm: 0, flushes: 0, departures: 0 });
    this.birds = [];
    const start = groups.length ? groups[Math.floor(this.rnd() * groups.length)] : null;
    for (let i = 0; i < n; i++) {
      const b = { i, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, mode: SIT, spot: null, delay: 0, flap: 0, fold: 1, bank: 0, pitch: 0,
        burst: 0, glideT: 0, flapping: true, hop: null, hopT: 0, peckT: 0, peck: 0, turnT: 0, speed: lerp(C.speed, this.rnd()), cruise: 0, from: null };
      this.birds.push(b);
    }
    if (start) { this.assign(start); for (const b of this.birds) { Object.assign(b, { x: b.spot.x, y: b.spot.y, z: b.spot.z, yaw: b.spot.yaw ?? 0 }); this.sitDown(b); } this.settle(); }
  }

  get state() { return this.settled ? 'sit' : 'fly'; }

  /** Give every bird its own spot in `g`. */
  assign(g) {
    this.group = g; this.settled = false;
    const order = g.spots.map((_, k) => k);
    for (let k = order.length - 1; k > 0; k--) { const j = Math.floor(this.rnd() * (k + 1)); [order[k], order[j]] = [order[j], order[k]]; }
    this.birds.forEach((b, i) => {
      const s = g.spots[order[i % order.length]];
      // more birds than spots: a small seeded offset along the same surface (a ground patch checks it)
      const lap = Math.floor(i / order.length), dx = lap ? (this.rnd() - 0.5) * 0.3 : 0, dz = lap ? (this.rnd() - 0.5) * 0.3 : 0;
      b.spot = g.kind === 'ground' && lap && g.ok(s.x + dx, s.z + dz) ? { x: s.x + dx, y: s.y, z: s.z + dz, yaw: s.yaw } : s;
    });
  }

  settle() { this.settled = true; for (const b of this.birds) b.scared = false; const D = this.C.dwell[this.group.kind]; this.dwell = lerp(D, this.rnd()); }

  sitDown(b) {
    const C = this.C; b.mode = SIT; b.vx = b.vy = b.vz = 0; b.fold = 1; b.flap = 0; b.bank = 0; b.pitch = 0;
    b.hopT = lerp(C.hopEvery, this.rnd()); b.peckT = lerp(C.peckEvery, this.rnd()); b.turnT = lerp(C.turnEvery, this.rnd()); b.hop = null;
  }

  /** The flock leaves for another group (`away` = a threat's position: flee from it). */
  depart(away = null) {
    const C = this.C, here = this.group;
    let options = this.groups.filter((g) => g !== here);
    if (away) {
      const far = options.filter((g) => Math.hypot(g.x - away.x, g.z - away.z) >= C.flee);
      options = (far.length ? far : options).slice().sort((a, b) => (b.kind === 'tree' || b.kind === 'roof') - (a.kind === 'tree' || a.kind === 'roof'));
      const safe = options.filter((g) => g.kind === 'tree' || g.kind === 'roof');
      if (safe.length) options = safe; // a fright: up into a tree or onto a roof
    }
    if (!options.length) options = this.groups;
    const g = options[Math.floor(this.rnd() * options.length)];
    this.assign(g);
    for (const b of this.birds) {
      b.delay = away ? this.rnd() * C.react : this.rnd() * 1.5; b.from = { x: b.x, y: b.y, z: b.z };
      if (b.mode === LAND) b.mode = FLY; // half-way down to the old spot: off again
      const top = this.topAt ? Math.max(this.topAt((b.x + b.spot.x) / 2, (b.z + b.spot.z) / 2), this.topAt(b.x * 0.75 + b.spot.x * 0.25, b.z * 0.75 + b.spot.z * 0.25), this.topAt(b.x * 0.25 + b.spot.x * 0.75, b.z * 0.25 + b.spot.z * 0.75)) : -Infinity;
      b.cruise = Math.max(b.y, b.spot.y, Number.isFinite(top) ? top : -Infinity) + C.lift + this.rnd();
      b.scared = !!away;
    }
    if (away) this.flushes++; else this.departures++;
  }

  /** Any sitting (or landing) bird within its perch kind's flush distance of a threat → that threat, else null. */
  danger(threats) {
    const C = this.C, kind = this.group?.kind ?? 'tree', d0 = C.flush[kind];
    for (const t of threats) for (const b of this.birds) {
      const p = b.mode === FLY ? b.spot : b; if (!p) continue;
      const d = d0 * (t.k ?? 1); // (#2182: a stalking cat is low and slow: `k` < 1 shortens its flush distance)
      if (Math.abs(t.y - p.y) < C.flushUp + (kind === 'tree' ? 3 : 0) && (t.x - p.x) ** 2 + (t.z - p.z) ** 2 < d * d) return t;
    }
    return null;
  }

  step(dt, threats = []) {
    if (!this.group || !(dt > 0)) return;
    const C = this.C; dt = Math.min(dt, 0.1); this.time += dt;
    if (this.calm > 0) this.calm -= dt; // just flushed: the new course stands for a moment
    const t = this.calm > 0 ? null : this.danger(threats); // (a flying bird's own spot counts: no landing next to someone)
    if (t) { this.depart(t); this.calm = 1.5; }
    else if (this.settled && (this.dwell -= dt) <= 0) this.depart();
    let cx = 0, cy = 0, cz = 0, vx = 0, vy = 0, vz = 0, nf = 0;
    for (const b of this.birds) if (b.mode === FLY && b.delay <= 0) { cx += b.x; cy += b.y; cz += b.z; vx += b.vx; vy += b.vy; vz += b.vz; nf++; }
    if (nf) { cx /= nf; cy /= nf; cz /= nf; vx /= nf; vy /= nf; vz /= nf; }
    let sitting = 0;
    for (const b of this.birds) {
      if (b.mode === SIT && b.from) { // leaving
        if ((b.delay -= dt) > 0) { this.sit(b, dt); continue; }
        b.mode = FLY; b.from = null; b.hop = null; b.fold = 0; b.pitch = 0; b.burst = lerp(C.burst, this.rnd()); b.flapping = true;
        const ax = b.spot.x - b.x, az = b.spot.z - b.z, l = Math.hypot(ax, az) || 1;
        const up = b.scared ? 2.6 : 1.6; b.vx = ax / l * 2.5; b.vz = az / l * 2.5; b.vy = up; // a jump into the air
      }
      if (b.mode === FLY) this.fly(b, dt, nf, cx, cy, cz, vx, vy, vz);
      else if (b.mode === LAND) this.land(b, dt);
      else { this.sit(b, dt); sitting++; }
    }
    if (!this.settled && sitting === this.birds.length) this.settle();
  }

  fly(b, dt, nf, cx, cy, cz, mvx, mvy, mvz) {
    const C = this.C, s = b.spot, dx = s.x - b.x, dz = s.z - b.z, dh = Math.hypot(dx, dz);
    // the wanted velocity: towards the spot at cruise height, then down to it; flock rules on top
    const run = Math.max(C.landDist * 2.5, (b.cruise - s.y) * 1.6); // a glide slope down to the spot, not a drop straight onto it
    const toY = s.y + 0.6 + (b.cruise - s.y - 0.6) * clamp((dh - C.landDist * 0.5) / run, 0, 1);
    const slow = clamp(dh / (C.landDist * 2), 0.35, 1); // easing off near the spot keeps the turn tight enough to reach it
    let wx = dx / (dh || 1) * b.speed * slow, wz = dz / (dh || 1) * b.speed * slow, wy = clamp((toY - b.y) * 1.2, -3, 3.5);
    if (nf > 1) {
      wx += (cx - b.x) * C.cohesion + (mvx - b.vx) * C.align; wy += (cy - b.y) * C.cohesion * 0.5; wz += (cz - b.z) * C.cohesion + (mvz - b.vz) * C.align;
      for (const o of this.birds) {
        if (o === b || o.mode !== FLY) continue;
        const ox = b.x - o.x, oy = b.y - o.y, oz = b.z - o.z, d2 = ox * ox + oy * oy + oz * oz;
        if (d2 < C.sep * C.sep && d2 > 1e-6) { const k = C.separate * (C.sep - Math.sqrt(d2)) / Math.sqrt(d2); wx += ox * k; wy += oy * k; wz += oz * k; }
      }
    }
    // steer: limited acceleration gives the round turns
    let ax = wx - b.vx, ay = wy - b.vy, az = wz - b.vz; const al = Math.hypot(ax, ay, az), lim = C.accel * dt;
    if (al > lim) { ax *= lim / al; ay *= lim / al; az *= lim / al; }
    const before = Math.atan2(b.vx, b.vz);
    b.vx += ax; b.vy += ay; b.vz += az;
    const sp = Math.hypot(b.vx, b.vz), max = b.speed * 1.35; if (sp > max) { b.vx *= max / sp; b.vz *= max / sp; }
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    if (sp > 1) b.yaw = Math.atan2(b.vx, b.vz); // (hovering: keep the heading)
    b.bank = clamp(b.bank + (clamp(-wrap(b.yaw - before) / dt * 0.25, -C.maxBank, C.maxBank) - b.bank) * Math.min(1, dt * 6), -C.maxBank, C.maxBank);
    b.pitch = clamp(-b.vy * 0.08, -0.4, 0.4);
    // bounding flight: a burst of wingbeats, then a short glide with the wings in
    if (b.flapping) { b.flap = 1; b.fold = 0; if ((b.burst -= dt) <= 0) { b.flapping = false; b.glideT = lerp(C.glide, this.rnd()); } }
    else { b.flap = 0; b.fold = 0.85; if ((b.glideT -= dt) <= 0 || b.vy < -2.5) { b.flapping = true; b.burst = lerp(C.burst, this.rnd()); } }
    if (Math.hypot(dh, b.y - s.y) < C.landDist) { b.mode = LAND; b.flapping = true; }
  }

  land(b, dt) {
    const C = this.C, s = b.spot, dx = s.x - b.x, dy = s.y - b.y, dz = s.z - b.z, d = Math.hypot(dx, dy, dz);
    const sp = Math.min(Math.max(d * C.flare, 0.6), Math.hypot(b.vx, b.vy, b.vz) + 0.5), k = d > 1e-6 ? Math.min(1, sp * dt / d) : 1;
    b.vx = dx * k / dt; b.vy = dy * k / dt; b.vz = dz * k / dt;
    b.x += dx * k; b.y += dy * k; b.z += dz * k;
    if (Math.hypot(dx, dz) > 0.05) b.yaw = Math.atan2(dx, dz);
    b.flap = 1; b.fold = 0; b.bank *= 0.8; b.pitch = -0.45 * Math.min(1, 1.5 / Math.max(d, 0.3)); // the flare: body up, wings beating
    if (d < 0.03) { b.x = s.x; b.y = s.y; b.z = s.z; this.sitDown(b); }
  }

  sit(b, dt) {
    const C = this.C, g = this.group;
    b.flap = 0; b.fold = 1; b.bank = 0;
    if (b.hop) { // a hop in flight: a short arc
      const h = b.hop; h.t += dt; const u = Math.min(1, h.t / C.hopTime);
      b.x = h.x0 + (h.x1 - h.x0) * u; b.z = h.z0 + (h.z1 - h.z0) * u; b.y = h.y0 + (h.y1 - h.y0) * u + Math.sin(u * Math.PI) * C.hopHeight;
      b.pitch = -0.15 * Math.sin(u * Math.PI);
      if (u >= 1) b.hop = null;
      return;
    }
    if (g.kind === 'ground') {
      if ((b.hopT -= dt) <= 0) {
        b.hopT = lerp(C.hopEvery, this.rnd());
        const a = b.yaw + (this.rnd() - 0.5) * 2.2, l = lerp(C.hop, this.rnd()), x = b.x + Math.sin(a) * l, z = b.z + Math.cos(a) * l;
        if (g.ok(x, z) && Math.hypot(x - g.x, z - g.z) < 3) { b.yaw = a; b.hop = { t: 0, x0: b.x, y0: b.y, z0: b.z, x1: x, z1: z, y1: g.yAt(x, z) }; return; }
        b.yaw += (this.rnd() - 0.5) * 2; // no room that way: turn instead
      }
      if (b.peck > 0) { b.peck -= dt; b.pitch = C.peckPitch * Math.sin(Math.PI * (1 - b.peck / C.peckTime)); }
      else { b.pitch = 0; if ((b.peckT -= dt) <= 0) { b.peck = C.peckTime; b.peckT = lerp(C.peckEvery, this.rnd()); } }
    } else {
      b.pitch = 0;
      if ((b.turnT -= dt) <= 0) { b.turnT = lerp(C.turnEvery, this.rnd()); b.yaw += (this.rnd() - 0.5) * 1.6; }
    }
  }

  /** Birds sitting on the ground ({ x, y, z } each, into `out`): a hook for anything that would stalk them (cats, #2125). */
  groundBirds(out = []) {
    out.length = 0;
    if (this.group?.kind === 'ground') for (const b of this.birds) if (b.mode === SIT && !b.from) out.push(b);
    return out;
  }

  /** #2182: birds sitting in a tree or on a roof/rail ({ x, y, z } each, into `out`): what a cat below chatters at. */
  perchedBirds(out = []) {
    out.length = 0;
    if (this.group && this.group.kind !== 'ground') for (const b of this.birds) if (b.mode === SIT && !b.from) out.push(b);
    return out;
  }
}

/**
 * When the low gulls land. `count` gulls (index 0…count-1 = the circling ones that may land), `spots` (gullSpots),
 * `circle(i, t, out)`: the gull's circling position at time t (the shader's formula), `seed`. `pose(i, t, out)` fills
 * out = { on (explicit pose), x, y, z, yaw, flap, fold, bank, standing } and returns it. `flush(t, threats)` sends a standing gull up.
 */
export class GullRoost {
  constructor({ count, spots, circle, seed, C }) {
    const G = C.gull, rnd = seeded(seed);
    Object.assign(this, { G, C, spots, circle, count });
    this.gulls = [];
    for (let i = 0; i < count; i++) this.gulls.push({ period: lerp(G.period, rnd()), offset: rnd() * G.period[1], stand: G.stand, salt: Math.floor(rnd() * 1e6), flushK: -1, flushAt: 0, from: null });
    this.a = { x: 0, y: 0, z: 0 }; this.b = { x: 0, y: 0, z: 0 };
  }

  /** The landing cycle at time t: { k, spot, t0 (descent starts), land (touchdown), up (take-off starts), end } or null. */
  cycle(i, t) {
    const g = this.gulls[i], G = this.G;
    if (!this.spots.length || t < g.offset) return null;
    const k = Math.floor((t - g.offset) / g.period), t0 = g.offset + k * g.period;
    const spot = this.spots[(i + k * this.count) % this.spots.length]; // the gulls of one round on different spots
    this.circle(i, t0, this.a);
    const glide = Math.hypot(spot.x - this.a.x, spot.y - this.a.y, spot.z - this.a.z) / G.glide;
    const land = t0 + clamp(glide, 6, 30), up = land + lerp(G.stand, hash01(g.salt + k * 104729)), end = up + G.takeoff;
    if (t >= end) return null;
    const c = this.cyc ??= {}; c.k = k; c.spot = spot; c.t0 = t0; c.land = land; c.up = up; c.end = end; return c; // (reused: no allocation per frame)
  }

  pose(i, t, out) {
    const g = this.gulls[i], G = this.G;
    out.on = false; out.standing = false;
    // a flushed take-off runs from where it was standing back to the circle
    if (g.from && t < g.flushAt + G.takeoff) return this.rise(i, t, g.from, g.flushAt, g.flushAt + G.takeoff, g.yaw, out);
    if (g.from) g.from = null;
    const c = this.cycle(i, t);
    if (!c || c.k === g.flushK) return out;
    const sy = c.spot.y + G.standY;
    if (t < c.land) { // the glide down: from the circle point at t0, eased; flaps only at the end (flare)
      this.circle(i, c.t0, this.a);
      const u = (t - c.t0) / (c.land - c.t0), e = smooth(u), ey = 1 - (1 - u) * (1 - u);
      out.x = this.a.x + (c.spot.x - this.a.x) * e; out.z = this.a.z + (c.spot.z - this.a.z) * e; out.y = this.a.y + (sy - this.a.y) * ey;
      out.yaw = angleTo(c.spot.x - this.a.x, c.spot.z - this.a.z); out.flap = u > 0.85 ? 1 : 0; out.fold = 0; out.bank = 0.25 * Math.sin(u * Math.PI * 2) * (1 - u);
      out.pitch = u > 0.85 ? -0.35 : 0.05; out.on = true; return out;
    }
    if (t < c.up) { // standing: wings folded; now and then it turns its head side to side (the whole bird, small)
      out.x = c.spot.x; out.y = sy; out.z = c.spot.z; this.circle(i, c.t0, this.a);
      out.yaw = angleTo(c.spot.x - this.a.x, c.spot.z - this.a.z) + 0.35 * Math.sin((t - c.land) * 0.4 + i); out.flap = 0; out.fold = 1; out.bank = 0; out.pitch = 0;
      out.on = true; out.standing = true; return out;
    }
    return this.rise(i, t, { x: c.spot.x, y: sy, z: c.spot.z }, c.up, c.end, null, out);
  }

  rise(i, t, from, t0, t1, yaw, out) {
    const u = (t - t0) / (t1 - t0);
    this.circle(i, t, this.b); // the circle keeps turning: blend into where the gull is now on it
    const e = smooth(u), ey = u * u;
    out.x = from.x + (this.b.x - from.x) * e; out.z = from.z + (this.b.z - from.z) * e; out.y = from.y + (this.b.y - from.y) * ey + Math.min(u * 6, 1) * 1.5 * (1 - u);
    out.yaw = yaw ?? angleTo(this.b.x - from.x, this.b.z - from.z); out.flap = 1; out.fold = 0; out.bank = 0; out.pitch = -0.2 * (1 - u); out.on = true; return out;
  }

  /** A standing gull with a threat within `flush` m takes off now. Returns how many went up. */
  flush(t, threats, scratch = {}) {
    let n = 0;
    for (let i = 0; i < this.count; i++) {
      const g = this.gulls[i]; if (g.from) continue;
      const c = this.cycle(i, t); if (!c || c.k === g.flushK || t < c.land - 1.5 || t >= c.up) continue;
      const p = this.pose(i, t, scratch);
      if (!threats.some((h) => Math.hypot(h.x - p.x, h.z - p.z) < this.G.flush && Math.abs(h.y - p.y) < 6)) continue;
      g.flushK = c.k; g.flushAt = t; g.from = { x: p.x, y: p.y, z: p.z };
      const h = threats.reduce((a, b) => (Math.hypot(b.x - p.x, b.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? b : a));
      g.yaw = angleTo(p.x - h.x, p.z - h.z); n++; // away from it
      this.lastFlush = { x: p.x, y: p.y, z: p.z };
    }
    this.flushed = (this.flushed ?? 0) + n; // #2178: the running count and place of the last flush (the flock's alarm call)
    return n;
  }
}
