// #2126: pure, seeded mallard body language on top of DuckBrain: swim strokes with a slight head bob, dabbling
// (head under, tail up) and preening/shaking while resting, a short wing-beating take-off when the player rushes
// at a duck, and the strength/shape of a faint V wake. No THREE, no network state: every bird derives its own
// sequence from its seed, so nothing new is synced. Food lures, eating, kisses and rewards keep precedence.
import { DUCK_MOTION as M } from './config.js';
export { M as DUCK_MOTION };

const smooth = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
/** In/out envelope over a behaviour of `dur` s. */
export const envelope = (t, dur, ease) => Math.min(smooth(t / ease), smooth((dur - t) / ease));

export class DuckActivity {
  constructor(seed = 1) {
    this.seed = Math.abs(Math.floor(seed)) % 2147483646 + 1;
    Object.assign(this, { kind: null, t: 0, dur: 0, side: 1, cool: 0, wake: 0, time: 0 });
    this.next = M.every[0] * this.random() + M.every[1] * this.random();
  }
  random() { this.seed = this.seed * 48271 % 2147483647; return this.seed / 2147483647; }
  /** Resting behaviours keep the brain in place (DuckBrain `hold`); a take-off does not. */
  get holding() { return this.kind === 'dabble' || this.kind === 'preen' || this.kind === 'shake'; }
  get airborne() { return this.kind === 'takeoff'; }
  start(kind) { const d = M.dur[kind]; Object.assign(this, { kind, t: 0, dur: d[0] + this.random() * d[1], side: this.random() < .5 ? -1 : 1 }); }
  stop() { this.kind = null; this.t = 0; }
  /** Advance one bird; `disturbed`: the caller saw the player rush at it; `asleep`: its brain is paused by distance. Returns the current kind (or null). */
  update(dt, b, { disturbed = false, asleep = false } = {}) {
    dt = Math.min(Math.max(dt, 0), .1); this.time += dt; this.cool = Math.max(0, this.cool - dt);
    const busy = !!(b.kissing || b.eating > 0 || b.lured || b.roosting);
    if (this.kind) { this.t += dt; if (this.t >= this.dur || b.kissing || (busy && this.kind !== 'takeoff') || (this.kind === 'dabble' && !b.swimming)) this.stop(); }
    if (!this.kind && !busy) {
      if (disturbed && this.cool <= 0) { this.start('takeoff'); this.cool = M.takeoff.cooldown; }
      else if ((this.next -= dt) <= 0) {
        this.next = M.every[0] + this.random() * M.every[1];
        const kinds = Object.keys(M.weights).filter(k => k !== 'dabble' || b.swimming), total = kinds.reduce((s, k) => s + M.weights[k], 0);
        let r = this.random() * total; this.start(kinds.find(k => (r -= M.weights[k]) < 0) ?? kinds[kinds.length - 1]);
      }
    }
    b.hold = this.holding;
    // The wake follows actual swimming motion only: still, ashore, kissing-paused or airborne birds leave none.
    const target = b.swimming && b.moving && !asleep && !this.airborne ? 1 : 0;
    this.wake += (target - this.wake) * Math.min(1, dt * M.wake.ease);
    if (!target && this.wake < 2e-3) this.wake = 0;
    return this.kind;
  }
}

export const blankPose = () => ({ pitch: 0, roll: 0, lift: 0, surge: 0, ty: 0, tz: 0, neckX: 0, neckY: 0, neckSide: 0, neckDown: 0, neckBack: 0, headX: 0, tailY: 0, wing: 0, flap: false });

/** Model-frame pose offsets for one bird (radians / metres). Kissing birds keep the exact neutral bill contact. */
export function duckPose(b, a, out = blankPose()) {
  Object.assign(out, blankPose());
  if (b.kissing) return out;
  if (b.swimming && b.moving && !a?.airborne) {
    const S = M.stroke, s = Math.sin(b.phase), h = Math.sin(b.phase + .9);
    Object.assign(out, { surge: S.surge * s, neckX: S.neck * h, headX: S.head * h, roll: S.roll * Math.sin(b.phase * .5) });
  }
  if (!a?.kind) return out;
  const t = a.t, dur = a.dur;
  if (a.kind === 'dabble') {
    const D = M.dabble, e = envelope(t, dur, D.ease), dip = .85 + .15 * Math.cos(2 * Math.PI * D.dips * t / dur);
    out.pitch = D.pitch * e * dip; out.neckX = D.neck * e; out.tailY = D.wag * e * Math.sin(t * 8);
    // Tip round a point near the waterline so the breast stays afloat while the tail rises.
    const [py, pz] = D.pivot, c = Math.cos(out.pitch), sn = Math.sin(out.pitch);
    out.ty = py - (py * c - pz * sn); out.tz = pz - (py * sn + pz * c);
  } else if (a.kind === 'preen') {
    const P = M.preen, e = envelope(t, dur, P.ease);
    out.neckY = P.neckYaw * e * a.side; out.neckX = P.neckPitch * e; out.headX = P.headPitch * e + P.nibble * e * Math.sin(t * P.nibbleRate);
  } else if (a.kind === 'shake') {
    const H = M.shake, u = t / dur, k = 1 - u, w = 2 * Math.PI * H.rate * t, arc = Math.sin(Math.PI * Math.min(1, u));
    out.roll = H.roll * k * Math.sin(w); out.neckY = H.head * k * Math.sin(w + 1); out.lift = H.lift * arc; out.wing = H.wings * arc;
  } else if (a.kind === 'takeoff') {
    const T = M.takeoff, u = t / dur, up = smooth(u / .3), down = smooth((1 - u) / .3);
    out.lift = T.lift * Math.min(up, down); out.wing = T.wings * Math.min(up, down); out.pitch = T.pitch * Math.sin(Math.PI * Math.min(1, u / T.rise)) * (u < T.rise ? 1 : 0); out.flap = u < .85;
  }
  return out;
}

/**
 * V-wake ribbon vertices for one bird in world space, written to `pos` (xyz) / `alpha` from `offset` vertices on.
 * Two arms trail the breast at the Kelvin half-angle; each arm is `segments` quads whose alpha fades with distance,
 * carries slow travelling ripples and drops to zero where `water(x, z)` says the arm has reached the bank.
 */
export function wakeVertices(b, strength, y, water, pos, alpha, offset = 0) {
  const W = M.wake, n = W.segments, sy = Math.sin(b.yaw), cy = Math.cos(b.yaw), tan = Math.tan(W.angle);
  let v = offset;
  for (const side of [-1, 1]) {
    for (let i = 0; i <= n; i++) {
      const u = i / n, back = W.apex - u * (W.length + W.apex), lateral = side * u * W.length * tan, half = (W.width[0] + (W.width[1] - W.width[0]) * u) / 2;
      const cx = b.x + sy * back + cy * lateral, cz = b.z + cy * back - sy * lateral;
      const wet = water(cx, cz), ripple = .65 + .35 * Math.sin(b.phase - u * W.ripple);
      const a = wet ? strength * W.alpha * Math.pow(1 - u, 1.3) * Math.min(1, u * 6 + .2) * ripple : 0;
      for (const edge of [-1, 1]) {
        // Ribbon edges are perpendicular to the arm (arm direction = back + lateral spread).
        const ex = edge * half * (cy + sy * side * tan), ez = edge * half * (-sy + cy * side * tan), len = Math.hypot(1, tan);
        pos[v * 3] = cx + ex / len; pos[v * 3 + 1] = y; pos[v * 3 + 2] = cz + ez / len; alpha[v] = a; v++;
      }
    }
  }
  return v;
}
export const wakeVertexCount = () => 2 * (M.wake.segments + 1) * 2;
