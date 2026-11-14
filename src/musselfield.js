// #1945: where the blue mussels lie on the bed of Höje å and when a taken one is back. Pure rules (no three.js, no DOM):
// `node --test tools/musselfieldtest.mjs`. src/mussels.js draws them and ties them to the game.
// #1950: `strike` / `mayStrike` / `shellTick` are the rules for cracking a picked (closed) mussel against the bed.
// The placement is deterministic (a seeded generator walking the river's centre line), so every player has the same bed without any sync.

/** A small seeded generator (mulberry32): the same numbers for the same seed everywhere. */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Distance from (x, z) to the segment [ax, az, bx, bz]. */
export function segDistance(x, z, [ax, az, bx, bz]) {
  const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz, t = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l)) : 0;
  return Math.hypot(x - ax - t * dx, z - az - t * dz);
}

/**
 * The mussels' spots: clumps every `cfg.spacing` m along `path` ([[x, z], ...], the river's centre line), each at a random place across the
 * channel with `cfg.clump` mussels within `cfg.radius`. A spot is kept only where it lies
 *  - `cfg.edge` m inside the channel (`frame(x, z)` = riverAt: { distance, width, nx, nz }),
 *  - in open water (`open(x, z)`, farwalk.swimWater) inside `bounds` ({ x0, x1, z0, z1 }, less `cfg.boundsClear`),
 *  - clear of every pier footing (`piers`: [{ x, z, dx, dz, half }], square, turned along (dx, dz)) and wall segment (`walls(x, z)`).
 * `bedY(x, z)` gives the height it lies at. Every candidate draws the same count of random numbers whether it is kept or not, so a rule
 * that drops one spot never moves the others. Returns [{ i, x, y, z, yaw, tilt, size, clump }].
 */
export function musselSpots({ path, frame, open, bedY, bounds, piers = [], walls = () => [], cfg, seed = cfg.seed }) {
  const rnd = seeded(seed), out = [], [lo, hi] = cfg.clump, [s0, s1] = cfg.size;
  const ok = (x, z) => {
    if (x < bounds.x0 + cfg.boundsClear || x > bounds.x1 - cfg.boundsClear || z < bounds.z0 + cfg.boundsClear || z > bounds.z1 - cfg.boundsClear) return false;
    const q = frame(x, z);
    if (!(q.distance <= q.width / 2 - cfg.edge) || !open(x, z)) return false;
    for (const p of piers) { const ex = x - p.x, ez = z - p.z; if (Math.max(Math.abs(ex * p.dx + ez * p.dz), Math.abs(-ex * p.dz + ez * p.dx)) < p.half) return false; }
    for (const s of walls(x, z)) if (segDistance(x, z, s) < cfg.wallClear) return false;
    return true;
  };
  let carry = cfg.spacing / 2, clump = 0;
  for (let k = 1; k < path.length; k++) {
    const [ax, az] = path[k - 1], [bx, bz] = path[k], len = Math.hypot(bx - ax, bz - az);
    if (!(len > 0)) continue;
    for (; carry <= len; carry += cfg.spacing, clump++) {
      const t = carry / len, sx = ax + (bx - ax) * t, sz = az + (bz - az) * t, q = frame(sx, sz);
      const across = (rnd() * 2 - 1) * Math.max(0, q.width / 2 - cfg.edge - cfg.radius), n = lo + Math.floor(rnd() * (hi - lo + 1));
      const cx = sx + q.nx * across, cz = sz + q.nz * across;
      for (let m = 0; m < hi; m++) { // (always `hi` draws per clump: see above)
        const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * cfg.radius, yaw = rnd() * Math.PI * 2, tilt = (rnd() - 0.5) * 0.5, size = s0 + rnd() * (s1 - s0);
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (m >= n || !ok(x, z)) continue;
        out.push({ i: out.length, x, y: bedY(x, z), z, yaw, tilt, size, clump });
      }
    }
    carry -= len;
  }
  return out;
}

/** Which mussels are out of the bed (taken) and when each is back: `cfg.regrow` s after it was taken, once `mayGrow(spot)` allows it. */
export class MusselField {
  constructor(spots, cfg, rnd = Math.random) { Object.assign(this, { spots, cfg, rnd, out: [] }); for (const s of spots) { s.gone = false; s.t = 0; } }
  /** Take `spot` out of the bed; false when it is not there. */
  take(spot) {
    if (!spot || spot.gone) return false;
    const [a, b] = this.cfg.regrow;
    spot.gone = true; spot.t = a + this.rnd() * (b - a); this.out.push(spot);
    return true;
  }
  /** Back on its spot at once (put back, or grown again). */
  restore(spot) {
    if (!spot?.gone) return false;
    spot.gone = false; spot.t = 0; this.out.splice(this.out.indexOf(spot), 1);
    return true;
  }
  /** Count the taken ones down; returns the spots that came back this step. */
  update(dt, mayGrow = () => true) {
    let back = null;
    for (let k = this.out.length - 1; k >= 0; k--) {
      const s = this.out[k];
      s.t -= dt;
      if (s.t <= 0 && mayGrow(s)) { s.gone = false; s.t = 0; this.out.splice(k, 1); (back ??= []).push(s); }
    }
    return back;
  }
}

/** A point on the bed for a diver to put something down: the first place the look ray (origin `o`, direction `d`, unit) goes under
 * `bedY(x, z)` within `reach` m, else the bed under the ray's end; null when that is out of reach or not open water. */
export function bedSpot(o, d, reach, bedY, open, step = 0.08) {
  let x = o.x, z = o.z, hit = false;
  for (let s = step; s <= reach; s += step) {
    x = o.x + d.x * s; z = o.z + d.z * s;
    if (o.y + d.y * s <= bedY(x, z)) { hit = true; break; }
  }
  if (!hit) { const h = Math.min(reach * 0.6, 1); x = o.x + d.x * h; z = o.z + d.z * h; }
  if (!open(x, z)) return null;
  const y = bedY(x, z), distance = Math.hypot(x - o.x, y - o.y, z - o.z);
  return distance <= reach ? { x, y, z, distance } : null;
}

// --- #1950: a picked mussel is closed; a diver knocks it against the bed until the shell cracks ---------------------------------------
// The shell's state lives on the mussel itself (`cracked`, `hits`, `wait`), so it follows it when it is put down and taken again; a mussel
// taken off the bed always starts with `closeShell` (the bed's mussels, also the regrown ones, are closed).

/** A closed shell: no knocks yet. Returns `m`. */
export function closeShell(m) { m.cracked = false; m.hits = 0; m.wait = 0; return m; }
/** Can a knock land now? Only a closed shell, only a diver (under the surface), only with the bed `bedDistance` m from the eye within
 * `cfg.reach`, and not before the last knock's `cfg.gap` s are over. Never in the air, at the surface or against the ground on land. */
export function mayStrike(m, { diving, bedDistance }, cfg) {
  return !m.cracked && !!diving && typeof bedDistance === 'number' && bedDistance <= cfg.reach && !(m.wait > 0);
}
/** One knock against the bed: 'knock', 'crack' (the `cfg.hits`th one: the shell is `cracked` from now on) or null when none can land. */
export function strike(m, where, cfg) {
  if (!mayStrike(m, where, cfg)) return null;
  m.hits = (m.hits || 0) + 1; m.wait = cfg.gap;
  if (m.hits < cfg.hits) return 'knock';
  m.cracked = true;
  return 'crack';
}
/** Time passes between knocks. */
export function shellTick(m, dt) { if (m.wait > 0) m.wait = Math.max(0, m.wait - dt); }
