// #2202: pure local mallard day/night and sound/pose recipes; no world, audio graph, random or network state.
import { DUCKS, DUCK_LIFE as L } from './config.js';
export { L as DUCK_LIFE };
const smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
export function duckNight(hour = 12) {
  if (!Number.isFinite(hour)) return 0;
  hour = ((hour % 24) + 24) % 24;
  return hour >= 12 ? smooth((hour - L.dusk[0]) / (L.dusk[1] - L.dusk[0])) : 1 - smooth((hour - L.dawn[0]) / (L.dawn[1] - L.dawn[0]));
}
export const duckLureNear = (b, food, habitat) => !!(food && (food.y === undefined || Math.abs(food.y - b.y) < DUCKS.maxFeedHeight) && habitat.contains(food.x, food.z) && Math.hypot(food.x - b.x, food.z - b.z) < DUCKS.lureReach);
/** Full phrase occupies one VoiceCap slot; the female's descending quacks fade, the drake has a low rasp. */
export function duckCall(female = true) {
  const c = female ? L.sound.female : L.sound.male;
  return { female, gain: female ? L.sound.femaleGain : L.sound.maleGain, dur: (c.notes - 1) * c.gap + c.dur + .05,
    notes: Array.from({ length: c.notes }, (_, i) => ({ t: i * c.gap, dur: c.dur, from: c.from * (1 - .04 * i), to: c.to * (1 - .04 * i), gain: Math.max(.2, 1 - c.decay * i), hz: c.hz })) };
}
/** Additive offsets after the production mixer's idle clip; food/flight/kisses cancel the target before this is used. */
export function duckSleepPose(out, weight, time = 0, side = 1) {
  out.neckY += L.neckYaw * weight * side; out.neckX += L.neckPitch * weight; out.headX += L.headPitch * weight;
  out.neckSide = L.neckShift[0] * weight * side; out.neckDown = L.neckShift[1] * weight; out.neckBack = L.neckShift[2] * weight;
  out.ty += (-L.crouch + L.breath * Math.sin(time * 1.8)) * weight;
  return out;
}
