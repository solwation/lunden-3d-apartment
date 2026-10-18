// Sounds from other players (#1302): the pure helpers (no Web Audio) — distance fade and a cap on concurrent voices — so
// they can be tested on Node and so a crowd of players can never flood the audio graph. audio.js `playAt` uses both.

/** Gain 0…1 at `d` metres: a squared linear fade, 1 at the source, 0 at `range` and beyond (also for NaN). */
export function distanceGain(d, range) {
  if (!(d >= 0) || !(d < range)) return 0;
  const k = 1 - d / range;
  return k * k;
}

/** At most `max` voices at once. `take(now, dur)` (seconds) claims a slot until now + dur; false when all are busy. No allocation per call. */
export class VoiceCap {
  constructor(max) { this.ends = new Float64Array(max); }
  take(now, dur) {
    const e = this.ends;
    for (let i = 0; i < e.length; i++) if (e[i] <= now) { e[i] = now + dur; return true; }
    return false;
  }
  busy(now) { let n = 0; for (let i = 0; i < this.ends.length; i++) if (this.ends[i] > now) n++; return n; }
}

/** Metres per footstep for a ground speed (m/s): the run stride from `runSpeed` up, else the walk stride. */
export const strideFor = (speed, S) => (speed >= S.stride.runSpeed ? S.stride.run : S.stride.walk);

/** Is a ghost's state one that makes footsteps? On the ground and walking: not crouched, seated, riding, thrusting or jumping. */
export function makesSteps({ speed, vy = 0, crouch = 0, pose = 0, riding = false, jp = 0 }, S) {
  return speed >= S.stride.minSpeed && speed <= S.stride.maxSpeed && Math.abs(vy) <= S.stride.maxClimb && crouch < 0.5 && !pose && !riding && jp !== 2;
}
