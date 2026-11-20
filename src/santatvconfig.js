// Published Toy Tinkers excerpt (JoBlo Animated Videos); official YouTube embed, no copied media.
export const SANTA_TV = { video: 'I0SW0f0ww84' };
/** #2258: all clients show the same frame; drift above this many seconds triggers a seek, below it nothing (no stutter). */
export const SANTA_TV_SYNC = { maxDrift: 1, every: 1000, settle: 3000 };
/** Position (s) of the looping clip at wall-clock `nowMs` (UTC epoch, identical on every client); null while the duration is unknown. */
export function santaTvPosition(nowMs, duration) {
  if (!(duration > 0) || !Number.isFinite(nowMs)) return null;
  return (((nowMs / 1000) % duration) + duration) % duration;
}
/** Signed shortest distance (s) from the current position to the target on the loop; positive = player is behind. */
export function santaTvDrift(target, current, duration) {
  let d = target - current;
  if (duration > 0) { d = ((d % duration) + duration) % duration; if (d > duration / 2) d -= duration; }
  return d;
}
