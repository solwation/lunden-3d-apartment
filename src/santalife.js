// #2171 pure helpers for Santa's living body: breathing, head turns, the leaned-back sleep and the laughing belly.
// No THREE and no state, so every curve is unit-testable. All numbers come from SANTA.life (visual guesses).
import { SANTA } from './santaconfig.js';

const L = SANTA.life;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Outward belly displacement in metres (also scales the chest). A slow inhale with a quicker, shorter exhale. */
export function breathing(t, asleep, laughShake = 0) {
  const b = asleep ? L.breath.asleep : L.breath.awake, p = Math.PI * 2 * b.hz * t;
  const wave = 0.5 + 0.5 * (Math.sin(p) + 0.22 * Math.sin(2 * p - 0.6)) / 1.22; // 0..1
  return b.rest + b.amp * wave + laughShake * L.laugh.bellyAmp;
}

/** Yaw (rad) a head must turn to face `local` {x, z} in the figure's frame (+z forward), clamped to a natural range. */
export function headYawToward(local, max = L.head.maxYaw) {
  if (!local || !Number.isFinite(local.x) || !Number.isFinite(local.z)) return 0;
  if (Math.hypot(local.x, local.z) < 1e-4) return 0;
  return clamp(Math.atan2(local.x, local.z), -max, max);
}

/** Gentle pitch (rad) toward a point `dy` above/below the head at horizontal distance `dist`. */
export function headPitchToward(dy, dist, max = L.head.maxPitch) {
  return clamp(-Math.atan2(dy, Math.max(dist, 0.05)), -max, max);
}

/** Frame-rate independent approach of `current` to `target`. */
export function approach(current, target, dt, rate) {
  return current + (target - current) * (1 - Math.exp(-Math.max(0, dt) * rate));
}

/**
 * Sleeping pose at time t: the torso leans back into the sofa corner, the head sags slowly forward and snaps up in a nod.
 * Returns radians: lean (torso, back), roll (torso, toward the corner), headPitch (+ = chin down), headRoll, headYaw.
 */
export function sleepPose(t) {
  const S = L.sleep, c = ((t % S.nodEvery) + S.nodEvery) % S.nodEvery, sagTime = S.nodEvery - S.nodSnap;
  let sag;
  if (c < sagTime) sag = (c / sagTime) ** 2;
  else { const u = (c - sagTime) / S.nodSnap; sag = (1 - smooth(0, 1, u)) - 0.12 * Math.sin(Math.PI * u); } // snap up, small overshoot
  return {
    lean: S.lean + 0.015 * Math.sin(t * 0.31),
    roll: S.roll,
    headPitch: S.headDown + S.sagDrop * sag + 0.03 * Math.sin(t * 0.47),
    headRoll: S.headRoll + 0.05 * Math.sin(t * 0.23),
    headYaw: S.headYaw,
    sag
  };
}

/** Laugh shake -1..1 at `elapsed` seconds into a laugh of `seconds`; 0 outside it. Fast belly bounce under a short envelope. */
export function laughShake(elapsed, seconds = L.laugh.seconds) {
  if (!(elapsed >= 0) || elapsed > seconds) return 0;
  const u = elapsed / seconds;
  return Math.sin(Math.PI * 2 * L.laugh.hz * elapsed) * Math.sin(Math.PI * u);
}

/** Smooth 0..1 weights baked into the GLB: x = head (turns with the neck), y = belly (breathes/shakes). */
export function regionWeights(x, y, z) {
  const R = L.region;
  const head = smooth(R.neckLow, R.neckHigh, y);
  const belly = smooth(R.bellyLow, R.bellyLow + R.bellyRamp, y) * (1 - smooth(R.bellyHigh - R.bellyRamp, R.bellyHigh, y)) * smooth(R.bellyZ0, R.bellyZ1, z);
  return [head, belly];
}
