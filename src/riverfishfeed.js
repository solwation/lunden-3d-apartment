import { RIVER_FISH } from './config.js';
import { riverProject, riverPoint, riverLength } from './riverfishswim.js';

// #1946: feeding the river fish from the hand and scaring them, as a LOCAL layer of offsets on top of the shared fish. No three.js (node test:
// src/riverfishfeed.test.mjs). The shared positions (riverfishswim.js `fishAt`, the room's clock) are inputs only: this module answers, per
// fish, how far from its shared place it is drawn right now (`off` id -> { x, y, z, yaw, rise, mode }); nothing here is synced or sent, and
// the rod (`RiverFish.near`), the rings and the other players keep the shared places.
//   lure : a swimmer who makes no stroke (the current may carry them) with bait in the hand (a cracked blue mussel) for `wait` s: the nearest
//          free fish within `radius` m leaves its path, swims to the hand (round the head, never through it) and takes the bait (`take`).
//   flee : a stroke scares every fish within `scare` m of the swimmer, and the lured one wherever it is: it darts `flee` m away along the
//          channel, waits `calm` s and then drifts back.
//   back : the offset eases to nothing over `back` s; then the fish is exactly the shared one again (its entry is deleted).

const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const TAU = Math.PI * 2;
const turnTo = (a, b, max) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; return a + Math.max(-max, Math.min(max, d)); };
const Q = {}, R = {};

export class FishFeed {
  constructor(C = RIVER_FISH.feed) { Object.assign(this, { C, off: new Map(), still: 0, lure: null, seen: new Set() }); }

  /** Nothing is offset any more (the fish are not drawn / the river is far away). */
  reset() { this.off.clear(); this.still = 0; this.lure = null; }
  get active() { return this.off.size > 0; }

  entry(f) {
    let e = this.off.get(f.id);
    if (!e) this.off.set(f.id, e = { id: f.id, born: f.born, x: 0, y: 0, z: 0, yaw: f.yaw ?? 0, rise: 0, mode: 'back', t: 0, x0: 0, y0: 0, z0: 0, tx: 0, tz: 0, side: f.id % 2 ? 1 : -1 });
    return e;
  }
  goBack(e) { if (e.mode === 'back') return; e.mode = 'back'; e.t = 0; e.x0 = e.x; e.y0 = e.y; e.z0 = e.z; if (this.lure === e.id) this.lure = null; }

  /** A point in the open channel `d` m further from the swimmer than the fish at (x, z), mostly along the river. */
  fleeTo(e, x, z, w) {
    const C = this.C, f = riverProject(x, z, Q), fs = f.s, fd = f.d, p = riverProject(w.x, w.z, R);
    let ds = fs - p.s, dd = fd - p.d; const l = Math.hypot(ds, dd);
    if (l < 1e-3) { ds = e.side; dd = 0; } else { ds /= l; dd /= l; }
    if (Math.abs(ds) < 0.6) { ds = (ds < 0 || (ds === 0 && e.side < 0) ? -1 : 1) * 0.6; dd = Math.sign(dd) * 0.8; } // (never only sideways: the bank is close)
    const s = Math.max(1, Math.min(riverLength - 1, fs + ds * C.flee)), c = riverPoint(s, Q), room = Math.max(0, c.hw - C.edge);
    const d = Math.max(-room, Math.min(room, fd + dd * C.flee));
    e.tx = c.x + c.nx * d; e.tz = c.z + c.nz * d;
  }

  /**
   * One frame. `w`: { swim (in the water, not climbing out), moving (an own stroke), x, y, z (the swimmer's eye), hand: { x, y, z } | null
   * (the bait in the hand; null without a cracked mussel), busy(id) (on the hook / being reeled in) }. `fish`: the shared fish near the
   * river now, [{ id, born, x, y, z, yaw, len }]. Returns the fish that took the bait this frame ({ id, born }) or null.
   */
  update(dt, w, fish) {
    const C = this.C, bait = !!(w.swim && w.hand && !w.moving), seen = this.seen; let took = null;
    this.still = bait ? this.still + dt : 0;
    seen.clear();
    for (const f of fish) {
      seen.add(f.id);
      let e = this.off.get(f.id);
      if (e && e.born !== f.born) { this.off.delete(f.id); if (this.lure === f.id) this.lure = null; e = null; } // (caught meanwhile: a new fish)
      const px = f.x + (e?.x ?? 0), py = f.y + (e?.y ?? 0), pz = f.z + (e?.z ?? 0);
      // a stroke scares the fish near the swimmer, and the one on its way to the hand
      if (w.swim && w.moving && (this.lure === f.id || e?.mode === 'eat' || Math.hypot(px - w.x, py - w.y, pz - w.z) <= C.scare) && !(e?.mode === 'flee' && e.t < C.reaim)) {
        e ??= this.entry(f);
        if (this.lure === f.id) this.lure = null;
        e.mode = 'flee'; e.t = 0; e.calm = 0; this.fleeTo(e, px, pz, w);
      }
    }
    for (const id of this.off.keys()) if (!seen.has(id)) { this.off.delete(id); if (this.lure === id) this.lure = null; } // (out of sight / gone)
    // a new lure: the nearest free fish, once the swimmer has been still with the bait for a while
    if (bait && this.lure === null && this.still >= C.wait) {
      let best = null, bd = C.radius;
      for (const f of fish) {
        const e = this.off.get(f.id);
        if ((e && e.mode !== 'back') || w.busy?.(f.id)) continue;
        const d = Math.hypot(f.x + (e?.x ?? 0) - w.hand.x, f.z + (e?.z ?? 0) - w.hand.z);
        if (d < bd) { bd = d; best = f; }
      }
      if (best) { const e = this.entry(best); e.mode = 'lure'; e.t = 0; e.far = true; this.lure = best.id; }
    }
    for (const f of fish) {
      const e = this.off.get(f.id); if (!e) continue;
      const x0 = f.x + e.x, y0 = f.y + e.y, z0 = f.z + e.z; let x = x0, y = y0, z = z0, face = null;
      e.t += dt; e.rise = 0;
      if (e.mode === 'lure' || e.mode === 'eat') {
        const h = w.hand, stop = (f.len ?? 0.3) / 2 + C.take;
        if (!bait && e.mode === 'lure') this.goBack(e); // (the bait is gone or the swimmer left the water; a stroke was handled above)
        else if (e.mode === 'lure' && (w.busy?.(f.id) || e.t > C.giveUp)) { this.goBack(e); this.still = 0; }
        else if (e.mode === 'eat' && (e.t > C.eat || !w.swim)) this.goBack(e);
        else if (e.mode === 'eat') { // stays at the hand (which may drift) while it eats
          const a = e.ax ?? 0, b = e.az ?? 1; x = e.hx + (w.x - e.ex) - a * stop; z = e.hz + (w.z - e.ez) - b * stop; y = e.hy + (w.y - e.ey); face = Math.atan2(a, b); e.rise = 1;
        } else {
          const dx = h.x - x, dy = h.y - y, dz = h.z - z, dh = Math.hypot(dx, dz), d = Math.hypot(dx, dy, dz);
          if (d <= stop + 1e-3) { // at the hand: the bait is taken
            took = { id: f.id, born: f.born };
            Object.assign(e, { mode: 'eat', t: 0, ax: dh > 1e-4 ? dx / dh : 0, az: dh > 1e-4 ? dz / dh : 1, hx: h.x, hy: h.y, hz: h.z, ex: w.x, ey: w.y, ez: w.z });
            this.lure = null; this.still = 0; e.rise = 1; face = Math.atan2(e.ax, e.az);
          } else {
            const v = d > C.sight ? C.dash : d > C.near ? C.speed : C.slow; let step = Math.min(v * dt, d - stop), ux, uy = dy / d, uz;
            const a = riverProject(x, z, Q), as = a.s, ad = a.d, b = riverProject(h.x, h.z, R);
            if (e.far && Math.abs(b.s - as) > C.sight) { // far off: along the channel (never across a bank on a bend)
              const s = as + Math.sign(b.s - as) * step, c = riverPoint(s, Q), room = Math.max(0, c.hw - C.edge), want = Math.max(-room, Math.min(room, b.d));
              const dd = ad + Math.max(-step * 0.5, Math.min(step * 0.5, want - ad)), nx = c.x + c.nx * dd, nz = c.z + c.nz * dd;
              x = nx; z = nz; y += Math.max(-step * 0.5, Math.min(step * 0.5, dy)); step = 0;
            } else {
              e.far = false;
              // towards the hand from in front of the swimmer: a fish behind or beside the head goes round it first
              let fx = h.x - w.x, fz = h.z - w.z; const fl = Math.hypot(fx, fz);
              if (fl > 0.05) { fx /= fl; fz /= fl; } else { fx = -dx / (dh || 1); fz = -dz / (dh || 1); }
              const front = dh < 1e-4 || (-dx * fx - dz * fz) / dh > 0.3, ex = x - w.x, ez = z - w.z, el = Math.hypot(ex, ez);
              let tx = dx, ty = dy, tz = dz;
              if (!front) { // behind the eye: to a point beside the head first; beside it: to a point out in front of the hand
                const ahead = ex * fx + ez * fz, across = -ex * fz + ez * fx, sd = Math.abs(across) > 0.05 ? Math.sign(across) : e.side;
                if (ahead < 0.15) { tx = w.x + fx * 0.3 - fz * sd * C.clear * 1.3 - x; tz = w.z + fz * 0.3 + fx * sd * C.clear * 1.3 - z; } else { tx = h.x + fx * C.lead - x; tz = h.z + fz * C.lead - z; }
                step = Math.min(C.speed * dt, Math.hypot(tx, ty, tz)); // (no slowing down on the way round: the swimmer may drift away)
              }
              const tl = Math.hypot(tx, ty, tz) || 1; ux = tx / tl; uy = ty / tl; uz = tz / tl;
              if (!front && el < C.clear) { // never closer to the eye than `clear` on the way round
                const k = 2 * (1 - el / C.clear), ox = el > 1e-4 ? ex / el : -fx, oz = el > 1e-4 ? ez / el : -fz;
                ux += ox * k; uz += oz * k;
                const n = Math.hypot(ux, uy, uz) || 1; ux /= n; uy /= n; uz /= n;
              }
              x += ux * step; y += uy * step; z += uz * step;
              if (dh < C.near) face = Math.atan2(dx, dz);
            }
            e.rise = sm(1 - (d - stop) / C.near);
          }
        }
      }
      if (e.mode === 'flee') {
        const dx = e.tx - x, dz = e.tz - z, d = Math.hypot(dx, dz), step = Math.min(C.fleeSpeed * dt, d);
        if (d > 1e-3) { x += dx / d * step; z += dz / d * step; }
        y += Math.max(-C.slow * dt, Math.min(C.slow * dt, f.y - y)); // back to its own depth as it goes
        if (d - step < 0.05 && (e.calm = (e.calm ?? 0) + dt) >= C.calm) this.goBack(e);
        e.x = x - f.x; e.y = y - f.y; e.z = z - f.z;
      } else if (e.mode === 'back') {
        if (e.t >= C.back) { this.off.delete(f.id); continue; }
        const k = 1 - sm(e.t / C.back); e.x = e.x0 * k; e.y = e.y0 * k; e.z = e.z0 * k;
        x = f.x + e.x; y = f.y + e.y; z = f.z + e.z;
      } else { e.x = x - f.x; e.y = y - f.y; e.z = z - f.z; }
      // the heading follows the way the drawn fish moves (or the hand, close to it)
      const mx = x - x0 + (f.x - (e.fx ?? f.x)), mz = z - z0 + (f.z - (e.fz ?? f.z));
      e.fx = f.x; e.fz = f.z;
      if (face === null && dt > 0 && Math.hypot(mx, mz) / dt > 0.05) face = Math.atan2(mx, mz);
      if (face === null && e.mode === 'back') face = f.yaw ?? e.yaw;
      if (face !== null) e.yaw = turnTo(e.yaw, face, C.turn * dt);
    }
    return took;
  }
}
