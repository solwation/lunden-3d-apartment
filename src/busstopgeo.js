import { SITE } from './config.js';

// #1301: the bus stop's kerb frame, platform test and shelter collision as pure geometry (no three.js), shared by busstop.js, farwalk.js,
// riverpark.js and the node test. Everything is placed in the kerb's frame: `s` m along the kerb from its first point (SITE.busStop.kerb),
// `t` m in from it (onto the platform, away from the road).
export const B = SITE.busStop;
const o = B.kerb[0], last = B.kerb[B.kerb.length - 1];
export const length = Math.hypot(last[0] - o[0], last[1] - o[1]);
export const dir = [(last[0] - o[0]) / length, (last[1] - o[1]) / length];
export const across = [dir[1], -dir[0]]; // onto the platform (away from the road)
/** plan point of kerb-frame (s, t) */
export const busStopPoint = (s, t) => [o[0] + dir[0] * s + across[0] * t, o[1] + dir[1] * s + across[1] * t];
/** kerb-frame (s, t) of a plan point */
export const toLocal = (x, z) => [(x - o[0]) * dir[0] + (z - o[1]) * dir[1], (x - o[0]) * across[0] + (z - o[1]) * across[1]];
/** Is (x, z) on the platform (widened by `margin`)? Trees and shrubs keep off it. */
export function onBusStop(x, z, margin = 0) {
  const [s, t] = toLocal(x, z);
  return s > -margin && s < length + margin && t > -margin && t < B.width + margin;
}
/** The shelter's collision: its glass back and ends (the front is open) as [x0, z0, x1, z1] segments. */
export function busStopSegments() {
  const [cs, ct] = toLocal(...B.shelter.at), h = B.shelter.len / 2, e = B.shelter.depth / 2, P = busStopPoint;
  return [[...P(cs - h, ct + e), ...P(cs + h, ct + e)], [...P(cs - h, ct - e), ...P(cs - h, ct + e)], [...P(cs + h, ct - e), ...P(cs + h, ct + e)]];
}
