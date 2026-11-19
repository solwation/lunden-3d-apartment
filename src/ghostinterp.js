// Playback of other players' snapshots on a jittery network (#2139). Pure: no three.js, no clock of its own. Snapshots are
// { t, p } with `t` the playback time (ms, the receiver's clock) and `p` anything with x, y, z (THREE.Vector3 or a plain object).
//
// - An adaptive jitter buffer: the arrival intervals of a moving player give a running mean and mean deviation (`noteArrival`);
//   the playback delay follows mean + jitterK × deviation, never below GHOSTS.delay (the old fixed delay, so a steady link plays
//   exactly as before) and never above `maxDelay`, slewed so the playhead only slows / hurries a little (`playStep`).
// - A cubic Hermite curve between snapshots with each snapshot's velocity from its neighbours (the centred difference,
//   limited per axis so the curve never overshoots a snapshot: a stop or a landing stays put, feet never dip into a floor).
// - When the next snapshot is late, a short extrapolation whose speed dies away linearly over `extrapMs`, after which the figure
//   waits there and, with still nothing new `settleAfter` ms past the last, eases back onto the last known point over `settleMs`
//   (a player who really stopped ends exactly where the room says).
// - When a snapshot arrives that changes the curve under the playhead, the drawn point does not jump: the difference is kept as
//   an offset that fades with `blendMs`.
// - A teleport (respawn, the children's room) on an implausible speed, not only on a long distance (`teleported`).
// The tunables are GHOST_PLAYBACK in config.js.

const SAME = 1e-4; // m: two snapshots this close are the same place (a hold / a player standing still)

/** A fresh playback state for one remote player; `nominal` = the sender's interval (ms, 1000 / GHOSTS.hz). */
export function newPlayback(nominal) {
  return { nominal, mean: nominal, jit: 0, arrival: null, delay: null, lastT: null, lastAt: null,
    raw: { x: 0, y: 0, z: 0 }, err: { x: 0, y: 0, z: 0 }, version: 0, seen: 0 };
}

/** Forget the curve (a teleport): the next frame draws the new place as it is, no blend from the old one. */
export function resetPlayback(pb) {
  pb.lastAt = null; pb.err.x = pb.err.y = pb.err.z = 0; pb.version++; pb.seen = pb.version;
}

export const samePlace = (a, b) => Math.abs(a.x - b.x) < SAME && Math.abs(a.y - b.y) < SAME && Math.abs(a.z - b.z) < SAME;

/** The longest gap (ms) after which a moving player counts as having paused (a hold point is inserted). A still player (or the
 * first state): 1.5 sender intervals, as before #2139; a moving one: the measured interval plus `holdK` deviations, capped. */
export function holdGap(pb, moving, cfg) {
  const base = pb.nominal * 1.5;
  return moving ? Math.min(cfg.holdMax, Math.max(base, pb.mean + cfg.holdK * pb.jit)) : base;
}

/** A state arrived at receiver time `t` (ms); `moving`: the last segment moved (only then is a gap lateness, not standing still). */
export function noteArrival(pb, t, moving, cfg) {
  if (pb.arrival !== null && moving) {
    const gap = t - pb.arrival;
    if (gap >= 0 && gap <= cfg.holdMax) {
      pb.mean += (gap - pb.mean) * cfg.gain;
      pb.jit += (Math.abs(gap - pb.mean) - pb.jit) * cfg.gain;
    }
  }
  pb.arrival = t;
}

/** The delay (ms) the buffer aims for: today's fixed `base` on a steady link, more with measured jitter, at most cfg.maxDelay. */
export function targetDelay(pb, base, cfg) {
  return Math.min(cfg.maxDelay, Math.max(base, pb.mean + cfg.jitterK * pb.jit));
}

/** Is the move from `from` to `to` (gap ms since the last arrival) a teleport? Further than `jump` m always; otherwise a
 * horizontal move of at least `teleportMin` m faster than `teleportSpeed` m/s over the time it would be drawn in (at least one
 * sender interval; a pause longer than `hold` is drawn over one interval after the hold point). Falls are left alone. */
export function teleported(from, to, gap, hold, nominal, jump, cfg) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  if (Math.hypot(dx, dy, dz) > jump) return true;
  const dh = Math.hypot(dx, dz);
  if (dh < cfg.teleportMin) return false;
  const dt = gap > hold ? nominal : Math.max(gap, nominal);
  return dh / (dt / 1000) > cfg.teleportSpeed;
}

/** The playback time for a new snapshot that arrived at `t`: never closer than `minSpacing` intervals to the one before, so a
 * burst after a stall plays out over time (and the curve never divides by zero) instead of all at once. */
export function snapTime(last, t, nominal, cfg) {
  return last ? Math.max(t, last.t + cfg.minSpacing * nominal) : t;
}

/** A state with feet `p` arrived at receiver time `t` (ms): the jitter measurement, a teleport (clears `snaps`), a pause (pushes
 * `hold(last, time)`, a copy of the last state where it stood, one interval before the new one). Returns the new snapshot's
 * playback time; the caller pushes { t: that, p, … } and trims the list. `jump`: GHOSTS.jump. */
export function receive(pb, snaps, p, t, jump, cfg, hold) {
  const nominal = pb.nominal, prev = snaps.at(-1), before = snaps.at(-2);
  const moving = !!(prev && before && !samePlace(before.p, prev.p)), gap = prev && pb.arrival !== null ? t - pb.arrival : 0, longest = holdGap(pb, moving, cfg);
  if (prev && teleported(prev.p, p, gap, longest, nominal, jump, cfg)) { snaps.length = 0; resetPlayback(pb); }
  noteArrival(pb, t, moving, cfg);
  // a long gap is a pause (the player stood still and walked off again: a hold point), unless it is shorter than holdMax and the
  // new state is at least about one interval on at the old pace (it was held up or states were lost on the way; it kept going)
  const last = snaps.at(-1), pace = moving ? Math.hypot(prev.p.x - before.p.x, prev.p.z - before.p.z) / Math.max(1, prev.t - before.t) : 0;
  const on = last ? Math.hypot(p.x - last.p.x, p.z - last.p.z) : 0;
  const paused = !!last && gap > longest && !(gap <= cfg.holdMax && pace > 0 && on >= cfg.keepPace * pace * pb.mean);
  // a moving player's states were sent at a steady cadence: their playback time is the expected one (the last + the mean interval)
  // pulled only `timeGain` of the way towards the jittery arrival, so the curve's speed does not follow the network's jitter
  // (how many intervals on: from the distance at the old pace, so a late state is not mistaken for one after lost ones)
  const step = pace * pb.mean, n = step > 1e-3 ? Math.round(on / step) : Math.round(gap / pb.mean);
  const steady = last && moving && !paused ? last.t + pb.mean * Math.min(4, Math.max(1, n)) : null;
  const ts = snapTime(last, steady === null ? t : Math.min(t, steady + (t - steady) * cfg.timeGain), nominal, cfg);
  if (paused) snaps.push(hold(last, Math.max(last.t + 1, ts - nominal)));
  pb.version++; // (the curve changes: the next frame blends instead of jumping)
  return ts;
}

// The velocity (m/s) of one axis at snapshot i: the neighbours' centred difference, 0 where the path turns or stops on that
// axis, at most 3× the smaller adjacent slope (Fritsch–Carlson: a monotone segment stays monotone, no overshoot).
function axisSlope(s, i, k) {
  const a = s[i - 1], b = s[i], c = s[i + 1];
  const d0 = a ? (b.p[k] - a.p[k]) / Math.max(1, b.t - a.t) * 1000 : null, d1 = c ? (c.p[k] - b.p[k]) / Math.max(1, c.t - b.t) * 1000 : null;
  if (d0 === null && d1 === null) return 0;
  if (d0 === null) return d1;
  if (d1 === null) return d0;
  if (d0 * d1 <= 0) return 0;
  const m = (c.p[k] - a.p[k]) / Math.max(1, c.t - a.t) * 1000, lim = 3 * Math.min(Math.abs(d0), Math.abs(d1));
  return Math.sign(m) * Math.min(Math.abs(m), lim);
}

/** Snapshot i's velocity (m/s) into `out` {x, y, z}. */
export function snapVelocity(s, i, out) {
  out.x = axisSlope(s, i, 'x'); out.y = axisSlope(s, i, 'y'); out.z = axisSlope(s, i, 'z');
  return out;
}

const va = { x: 0, y: 0, z: 0 }, vb = { x: 0, y: 0, z: 0 };

/** The curve at playback time `at` (ms). Writes out.p / out.v ({x, y, z}: m and m/s) and returns out with `a`, `b` (the snapshots
 * either side; the same one before the first / after the last), `k` (0 … 1 between them, 1 when a === b) and `mode`:
 * 'start' (before the first), 'interp', 'extrap' (past the last, within extrapMs: still moving) or 'settle' / 'hold'. */
export function sampleSnaps(s, at, cfg, out) {
  const p = out.p, v = out.v;
  let i = -1;
  for (let j = s.length - 1; j >= 0; j--) if (s[j].t <= at) { i = j; break; }
  if (i < 0) { const f = s[0]; p.x = f.p.x; p.y = f.p.y; p.z = f.p.z; v.x = v.y = v.z = 0; out.a = out.b = f; out.k = 1; out.mode = 'start'; return out; }
  const a = s[i];
  if (i < s.length - 1) {
    const b = s[i + 1], span = Math.max(1, b.t - a.t), h = span / 1000, u = Math.min(1, Math.max(0, (at - a.t) / span));
    snapVelocity(s, i, va); snapVelocity(s, i + 1, vb);
    const u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2; // the cubic Hermite basis
    const d00 = 6 * u2 - 6 * u, d10 = 3 * u2 - 4 * u + 1, d01 = -6 * u2 + 6 * u, d11 = 3 * u2 - 2 * u; // its derivative (per u)
    for (const k of ['x', 'y', 'z']) {
      p[k] = h00 * a.p[k] + h10 * h * va[k] + h01 * b.p[k] + h11 * h * vb[k];
      v[k] = (d00 * a.p[k] + d01 * b.p[k]) / h + d10 * va[k] + d11 * vb[k];
    }
    out.a = a; out.b = b; out.k = u; out.mode = 'interp';
    return out;
  }
  // past the last snapshot: its arrival velocity, dying away linearly over extrapMs (lead = v × extrapMs / 2), then waiting there
  // and from settleAfter easing back onto it
  snapVelocity(s, i, va);
  const tau = at - a.t, T = cfg.extrapMs, S = cfg.settleMs;
  let lead, f;
  if (tau <= T) { lead = (tau - tau * tau / (2 * T)) / 1000; f = 1 - tau / T; out.mode = f > 0 ? 'extrap' : 'settle'; }
  else { const back = Math.max(0, Math.min(1, 1 - (tau - cfg.settleAfter) / S)); lead = T / 2000 * back * back * (3 - 2 * back); f = 0; out.mode = back > 0 ? 'settle' : 'hold'; }
  for (const k of ['x', 'y', 'z']) { p[k] = a.p[k] + va[k] * lead; v[k] = va[k] * f; }
  out.a = out.b = a; out.k = 1;
  return out;
}

const prior = { p: { x: 0, y: 0, z: 0 }, v: { x: 0, y: 0, z: 0 } };

/** One drawn frame at receiver time `t` (ms): slews the delay towards its target, samples the curve at t − delay and adds the
 * fading offset that keeps the drawn point continuous when a new snapshot changed the curve (pb.version ≠ pb.seen). `base`:
 * GHOSTS.delay. Returns `out` as sampleSnaps, with out.p the drawn point (curve + offset), out.v the curve's velocity and
 * out.at / out.delay the playhead. */
export function playStep(pb, s, t, base, cfg, out) {
  const dt = pb.lastT === null ? 0 : Math.max(0, Math.min(1000, t - pb.lastT));
  pb.lastT = t;
  const target = targetDelay(pb, base, cfg);
  if (pb.delay === null) pb.delay = target;
  else pb.delay += Math.max(-cfg.slewDown * dt, Math.min(cfg.slewUp * dt, target - pb.delay));
  const at = t - pb.delay, e = pb.err;
  if (pb.version !== pb.seen) {
    if (pb.lastAt !== null) { // the drawn point stays where it was: the curve's jump at the last playhead goes into the offset
      sampleSnaps(s, pb.lastAt, cfg, prior);
      e.x += pb.raw.x - prior.p.x; e.y += pb.raw.y - prior.p.y; e.z += pb.raw.z - prior.p.z;
      if (Math.hypot(e.x, e.y, e.z) > cfg.blendMax) e.x = e.y = e.z = 0;
    }
    pb.seen = pb.version;
  }
  sampleSnaps(s, at, cfg, out);
  pb.raw.x = out.p.x; pb.raw.y = out.p.y; pb.raw.z = out.p.z; pb.lastAt = at;
  const fade = Math.exp(-dt / cfg.blendMs);
  e.x *= fade; e.y *= fade; e.z *= fade;
  if (Math.abs(e.x) + Math.abs(e.y) + Math.abs(e.z) < 1e-5) e.x = e.y = e.z = 0;
  out.p.x += e.x; out.p.y += e.y; out.p.z += e.z;
  out.at = at; out.delay = pb.delay;
  return out;
}
