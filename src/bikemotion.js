// #1856: bike-only longitudinal momentum. The actual Player wheel support supplies pitch/crest motion.
import { BICYCLE as C } from './config.js';
const toward = (v, target, amount) => v < target ? Math.min(target, v + amount) : Math.max(target, v - amount);
// `P` (#2229): the vehicle's profile ({ speed, reverse, motion }); the e-scooters (scootermotion.js) pass their own, the bicycle BICYCLE.
export function bicycleSpeed(speed, input, pitch, airborne, dt, P = C) {
  const M = P.motion, h = Math.max(0, Math.min(C.maxDt, Number.isFinite(dt) ? dt : 0));
  let v = Number.isFinite(speed) ? speed : 0;
  const pedal = Math.max(-1, Math.min(1, Number.isFinite(input) ? input : 0));
  if (!h) return v;
  if (airborne) return Math.max(-P.reverse, Math.min(M.maxSpeed, v * Math.exp(-M.airDrag * h)));
  const slope = -M.gravity * Math.sin(Number.isFinite(pitch) ? pitch : 0);
  if (pedal < 0 && v > 0) return Math.max(0, v + (slope - M.brake * -pedal) * h);
  const target = pedal >= 0 ? P.speed * pedal : P.reverse * pedal;
  if ((pedal > 0 && v < target) || (pedal < 0 && v > target)) v = toward(v, target, M.pedal * h);
  const drag = (pedal ? M.rolling : M.coast) + M.drag * v * v;
  v = toward(v, 0, drag * h);
  // A stopped rider remains stopped until pedalling. S/back brakes before reversing.
  if (Math.abs(v) > M.still || pedal) v += slope * h;
  return Math.max(pedal < 0 ? -P.reverse : 0, Math.min(M.maxSpeed, v));
}
/** Ground can unload the tyres only when its downward acceleration exceeds gravity.
 * nextVy is from actual successive support heights, never a Space-triggered or cosmetic boost. */
export function bicycleTakeoff(speed, previousVy, nextVy, dt, gap, M = C.motion) {
  return speed >= M.launchSpeed && previousVy >= M.minLift && gap > M.contactGap && previousVy - nextVy > M.gravity * dt ? Math.min(M.maxLift, previousVy) : 0;
}
