// #1773: footprints in the snow, the parts without three.js (node-testable: src/footprinttrail.test.mjs). A Stepper turns a walker's
// path (sampled positions with times) into prints every `step` m, alternately right and left of the line, each facing the way walked
// and dated by when the walker was there (interpolated between samples). A PrintStore holds at most `max` prints in a ring (the
// oldest made way first), knows each one's fade (1 fresh … 0 gone `life` s later) and compacts away the gone ones. `catOut` says
// whether an outdoor cat is out on a snow day (a pure function of the clock); `netTrails` reads the room's sparse trail history
// (cloudflare/trails.js) into walker paths. FOOTPRINTS in config.js documents the numbers.
import { FOOTPRINTS as F } from './config.js';

export const SHOE = 0, PAW = 1;

/** A small integer hash → [0, 1) (the same mix as outdoorcatroute.js). */
function hash01(a, b = 0, c = 0) {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35) ^ Math.imul((c | 0) + 0x27d4eb2f, 0x165667b1);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** One walker's prints. `kind` SHOE / PAW picks F.shoe / F.paw (step, side, jump). */
export class Stepper {
  constructor(kind = SHOE, spec = kind === PAW ? F.paw : F.shoe) {
    this.kind = kind; this.step = spec.step; this.side = spec.side; this.jump = spec.jump;
    this.last = null; this.acc = 0; this.foot = 1; // 1 right, -1 left
  }

  /** Forget where it was (a teleport, a ride, indoors): the next sample starts a new line. */
  break() { this.last = null; this.acc = 0; }

  /** The walker is at (x, y, z) feet at time t (s). Returns the prints made since the last sample: [{ x, y, z, yaw, foot, t, kind }]. */
  feed(x, y, z, t, out = []) {
    const L = this.last;
    if (!L) { this.last = { x, y, z, t }; return out; }
    const dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, dz);
    if (d > this.jump) { this.last = { x, y, z, t }; this.acc = 0; return out; }
    if (d < 1e-4) { L.t = t; L.y = y; return out; }
    const hx = dx / d, hz = dz / d, yaw = Math.atan2(-hx, -hz); // (yaw: a print's toe faces -z rotated by yaw = the way walked)
    let s = this.step - this.acc; // m along this segment to the next print
    while (s <= d) {
      const k = s / d, side = this.side * this.foot; // right of the heading (x east, z south): (-hz, hx)
      out.push({ x: L.x + dx * k - hz * side, y: L.y + (y - L.y) * k, z: L.z + dz * k + hx * side, yaw, foot: this.foot, t: L.t + (t - L.t) * k, kind: this.kind });
      this.foot = -this.foot;
      s += this.step;
    }
    this.acc = d - (s - this.step);
    this.last = { x, y, z, t };
    return out;
  }
}

/** At most `max` prints in a ring: x, y, z, yaw, foot (±1), kind, t (s, the caller's clock). */
export class PrintStore {
  constructor(max = F.max, life = F.life) {
    this.max = max; this.life = life;
    this.x = new Float32Array(max); this.y = new Float32Array(max); this.z = new Float32Array(max); this.yaw = new Float32Array(max);
    this.foot = new Int8Array(max); this.kind = new Uint8Array(max); this.t = new Float64Array(max);
    this.count = 0; this.next = 0; this.version = 0; // count: slots in use (0 … max); next: the slot the next print takes
  }

  add(p) {
    const i = this.next;
    this.x[i] = p.x; this.y[i] = p.y; this.z[i] = p.z; this.yaw[i] = p.yaw; this.foot[i] = p.foot; this.kind[i] = p.kind; this.t[i] = p.t;
    this.next = (i + 1) % this.max;
    if (this.count < this.max) this.count++;
    this.version++;
    return i;
  }

  /** 1 when just made, 0 when `life` s old (and after). */
  fade(i, now) { return Math.min(1, Math.max(0, 1 - (now - this.t[i]) / this.life)); }

  /** Prints not yet gone at `now`. */
  live(now) { let n = 0; for (let i = 0; i < this.count; i++) if (now - this.t[i] < this.life) n++; return n; }

  /** Keep only the prints not gone at `now` (and, with `keep(i)` false, drop others too), oldest first; frees the ring. */
  compact(now, keep = () => true) {
    const idx = [];
    for (let i = 0; i < this.count; i++) if (now - this.t[i] < this.life && keep(i)) idx.push(i);
    idx.sort((a, b) => this.t[a] - this.t[b]);
    const take = idx.slice(Math.max(0, idx.length - this.max)), old = { x: this.x.slice(), y: this.y.slice(), z: this.z.slice(), yaw: this.yaw.slice(), foot: this.foot.slice(), kind: this.kind.slice(), t: this.t.slice() };
    take.forEach((j, i) => { for (const k of Object.keys(old)) this[k][i] = old[k][j]; });
    this.count = take.length; this.next = this.count % this.max; this.version++;
  }

  /** Every print, oldest first, sorted by t, keeping the newest `max` (a rebuild after a late join). */
  replace(list) {
    const L = list.slice().sort((a, b) => a.t - b.t).slice(-this.max);
    this.count = 0; this.next = 0;
    for (const p of L) this.add(p);
    this.version++;
  }

  /** The nearest live print's horizontal distance from (x, z) (Infinity without any). */
  nearest(x, z, now) {
    let best = Infinity;
    for (let i = 0; i < this.count; i++) if (now - this.t[i] < this.life) { const d = Math.hypot(this.x[i] - x, this.z[i] - z); if (d < best) best = d; }
    return best;
  }
}

/** Is outdoor cat `id` (its OUTDOOR_CATS `spec`) out at time T (s since the epoch, its phase added) on a snow day? Some windows of
 * `slot` s it goes out for the first `out` s; which ones is a hash, its chance scaled by the personality's traits when present (#1772:
 * playful and curious cats go out more, lazy ones less). */
export function catOut(spec, id, T, o = F.catOuting) {
  const slot = Math.floor(T / o.slot), into = T - slot * o.slot;
  if (into >= o.out) return false;
  const tr = spec?.traits;
  const chance = spec?.snowChance ?? (tr ? Math.min(0.9, Math.max(0.1, o.chance * (0.6 + 0.4 * (tr.play ?? 0.5) + 0.4 * (tr.curious ?? 0.5) - 0.5 * (tr.lazy ?? 0.5) + 0.25))) : o.chance);
  return hash01(id, slot, 1773) < chance;
}

/** The room's history { ms: room now, k: [[key, x, y, z, age s], …] } as paths [{ key, pts: [{ x, y, z, t }] }] on our clock `now` (s). */
export function netTrails(h, now) {
  const by = new Map();
  for (const r of Array.isArray(h?.k) ? h.k : []) {
    if (!Array.isArray(r) || r.length !== 5 || !r.every(Number.isFinite)) continue;
    const [key, x, y, z, age] = r;
    if (age < 0 || age > F.life) continue;
    if (!by.has(key)) by.set(key, []);
    by.get(key).push({ x, y, z, t: now - age });
  }
  return [...by].map(([key, pts]) => ({ key, pts: pts.sort((a, b) => a.t - b.t) }));
}
