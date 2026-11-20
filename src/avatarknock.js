// #2167: what onlookers see of a hit and of a knockout, as pure functions (no three.js). The room tells the others only the target's lives (`l`)
// and, on a knockout, the lives are back at the maximum together with a teleport to the start. So: a drop is a hit (the flinch of #2036, away from
// the nearest armed player); a rise together with a teleport is a knockout, which the onlookers see as a collapse on the spot before the teleport shows.
// Ghost.animate draws the collapse displaced to where the figure stood while its network place (head boxes, pick body) already is the new one.
// Tunables: AVATAR_KNOCK in config.js.
import { AVATAR_KNOCK as K } from './config.js';

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** Seconds the whole collapse lasts. */
export const KNOCK_TOTAL = K.total;

/** 'hit' when the lives dropped, 'ko' when they rose together with a teleport (the room resets a knocked-out player to the maximum and sends them to the
 * start), else null (first state, equal, a heal without a teleport, a teleport without a life change such as the children's room). */
export function lifeEvent(prev, now, teleported) {
  if (!Number.isSafeInteger(prev) || !Number.isSafeInteger(now)) return null;
  if (now < prev) return 'hit';
  return now > prev && teleported ? 'ko' : null;
}

/** The nearest of `shooters` ([{ x, z }]) to the world point `at` ({ x, z }) within K.range m, else null. `except` is skipped (the target itself). */
export function nearestShooter(at, shooters, except = null) {
  let best = null, bd = K.range;
  for (const s of shooters) {
    if (s === except) continue;
    const d = Math.hypot(s.x - at.x, s.z - at.z);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

/**
 * The collapse `age` s after it began, falling along `dir` (figure frame [x its left, z forward], unit: the way the shot travelled, so away from the shooter).
 * Returns null before / after it; else fills `out`: crouch 0 … 1 (the squat), lean (rad, added to the torso's, negative = forward), head (pitch, down is negative),
 * tilt (rad, the whole body toppled about its feet), axis [x, z] (the horizontal tilt axis in the figure frame, unit) and lift (m the toppled body is raised).
 */
export function knockPose(age, dir, out = { crouch: 0, lean: 0, head: 0, tilt: 0, axis: [0, 0], lift: 0 }) {
  if (!Number.isFinite(age) || age < 0 || age >= K.total) return null;
  const sink = smooth(age / K.sink), t = Math.min(1, Math.max(0, (age - K.sink) / K.fall)), tilt = K.topple * t * t * (3 - 2 * t) * (0.4 + 0.6 * t); // (slow start, then it goes over)
  const dx = Number.isFinite(dir?.[0]) ? dir[0] : 0, dz = Number.isFinite(dir?.[1]) ? dir[1] : -1, n = Math.hypot(dx, dz) || 1;
  out.crouch = sink; out.lean = -K.lean * sink; out.head = -K.head * sink;
  out.tilt = tilt; out.axis[0] = dz / n; out.axis[1] = -dx / n; out.lift = K.lift * Math.sin(Math.min(tilt, Math.PI / 2));
  return out;
}
