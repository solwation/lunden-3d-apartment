// #2163: real sleep for a figure lying in bed, derived locally from pose 2 plus the time in it (no network field). Pure helpers, headless-testable
// (tools/avatarsleeptest.mjs); numbers AVATAR_SLEEP. `stepSleep` runs the state; Ghost.animate feeds it and applies `eyes` (Avatar.sleepEyes),
// `depth` (updateBreath's `sleep` cue: slower breathing) and `roll` (applySleepRoll).
import { AVATAR_SLEEP as S } from './config.js';

const between = (r, [a, b]) => a + (b - a) * r;
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

/** A fresh sleeper, awake. `rnd` is Math.random or a seeded stand-in (the thresholds differ per figure, so a crowd does not fall asleep in step). */
export const newSleep = (rnd = Math.random) => ({ t: 0, after: between(rnd(), S.eyes.after), eyes: 0, depth: 0, roll: 0, rollFrom: 0, rollTo: 0, rollT: 1, wait: between(rnd(), S.turn.first) });

/** Advances by `dt` s. `lying`: pose 2 has been reached (the get-down sequence is part of the time, which is fine at ~10 s thresholds).
 * eyes 0 open … 1 shut, depth 0 … 1 asleep (breathing), roll rad (|roll| <= AVATAR_SLEEP.turn.roll). Leaving the pose: lids open within `open` s, roll back at once. */
export function stepSleep(s, dt, lying, rnd = Math.random) {
  dt = Math.min(Math.max(Number(dt) || 0, 0), 0.25);
  if (lying) {
    s.t += dt;
    const asleep = s.t >= s.after;
    s.eyes = Math.min(1, s.eyes + (asleep ? dt / S.eyes.close : -dt / S.eyes.open));
    s.eyes = Math.max(0, s.eyes);
    s.depth = Math.max(0, Math.min(1, s.depth + (asleep ? dt / S.ramp : -dt / S.eyes.open)));
    if (s.eyes >= 1) {
      if (s.rollT < 1) { s.rollT = Math.min(1, s.rollT + dt / S.turn.move); s.roll = s.rollFrom + (s.rollTo - s.rollFrom) * smooth(s.rollT); }
      else if ((s.wait -= dt) <= 0) {
        // on the side, or back again (a sleeper on a side sometimes goes over to the other)
        const side = s.rollTo === 0 ? (rnd() < 0.5 ? -1 : 1) * S.turn.roll : rnd() < 0.5 ? 0 : -s.rollTo;
        s.rollFrom = s.roll; s.rollTo = side; s.rollT = 0; s.wait = between(rnd(), S.turn.wait);
      }
    }
  } else {
    s.t = 0; s.eyes = Math.max(0, s.eyes - dt / S.eyes.open); s.depth = Math.max(0, s.depth - dt / S.eyes.open);
    s.roll = Math.abs(s.roll) < 1e-3 ? 0 : s.roll * Math.exp(-dt * 8); s.rollFrom = s.rollTo = s.roll; s.rollT = 1;
    if (s.eyes === 0) { s.after = between(rnd(), S.eyes.after); s.wait = between(rnd(), S.turn.first); s.rollTo = 0; }
  }
  return s;
}

/** Rolls the posed figure about its long axis (the lying body runs along the object's z) around the hips: object.rotation.z plus the position
 * that keeps the hip point fixed. Cosmetic only (colliders and head boxes keep the plain body). `hipY` m in model units (REST.avatarLieHip). */
export function applySleepRoll(obj, roll, hipY) {
  obj.rotation.z = roll;
  if (!roll) return;
  const y = hipY * (obj.scale.y || 1);
  obj.position.x += -y * Math.sin(roll); obj.position.y += y * (1 - Math.cos(roll));
}
