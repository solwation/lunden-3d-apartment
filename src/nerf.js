import { TOYS, LEVELS } from './config.js';

/** The same analytic segment for a visible foam dart and its combat prediction (#714). Returns travel distance. */
export function stepNerf(position, velocity, dt, remaining = Infinity, floor = -Infinity) {
  const gravity = TOYS.nerf.dart.gravity;
  let time = dt, landed = false;
  if (position.y + velocity.y * time - gravity * time * time / 2 <= floor) {
    landed = true;
    time = Math.max(0, Math.min(time, (velocity.y + Math.sqrt(velocity.y ** 2 + 2 * gravity * Math.max(0, position.y - floor))) / gravity));
  }
  const length = (t) => Math.hypot(velocity.x * t, velocity.y * t - gravity * t * t / 2, velocity.z * t);
  if (length(time) > remaining) {
    landed = false;
    let low = 0, high = time;
    for (let i = 0; i < 24; i++) { const middle = (low + high) / 2; if (length(middle) > remaining) high = middle; else low = middle; }
    time = low;
  }
  const distance = length(time);
  position.x += velocity.x * time;
  position.y = landed ? floor : Math.max(floor, position.y + velocity.y * time - gravity * time * time / 2);
  position.z += velocity.z * time;
  velocity.y -= gravity * time;
  return distance;
}
export const nerfFloor = (from) => from.y > LEVELS[1].floor + 0.3 ? LEVELS[1].floor : LEVELS[0].floor;
