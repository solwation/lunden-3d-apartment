import { BICYCLE, SWIM } from './config.js';
import { addCount } from './statcount.js';

// #2230: cumulative anonymous movement only. Producers supply collision-approved own travel,
// never world-position pairs (which could include a teleport, current or bank rescue).
export const MOVEMENT_COUNTERS = ['cycleMetres', 'swimMetres', 'diveSeconds'];

export function creditMovement(stats, kind, metres, dt, under = false) {
  if (!Number.isFinite(dt) || dt <= 0 || dt > BICYCLE.maxDt || !Number.isFinite(metres) || metres < 0) return false;
  const speed = kind === 'cycle' ? BICYCLE.motion.maxSpeed : kind === 'swim' ? SWIM.speed + SWIM.kick.speed : 0;
  if (!speed) return false;
  let changed = false;
  const distance = Math.min(metres, speed * dt);
  if (distance > 0) changed = addCount(stats, kind === 'cycle' ? 'cycleMetres' : 'swimMetres', distance);
  if (kind === 'swim' && under === true) changed = addCount(stats, 'diveSeconds', dt) || changed;
  return changed;
}
