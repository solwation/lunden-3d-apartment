import { BALLOON as B } from './config.js';

// #1646: the hot-air balloon's schedule, position and basket collision as pure geometry (no three.js); balloon.js draws it.
// Everything is a function of the shared wall clock `tSec` (s), so all clients agree.

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** 0 … 1: how far the balloon has grown at `tSec` (0 = not scheduled). */
export function balloonScale(tSec, cfg = B) {
  const c = ((tSec % cfg.period) + cfg.period) % cfg.period;
  return Math.min(smooth(0, cfg.fadeIn, c), 1 - smooth(cfg.window - cfg.fadeIn, cfg.window, c));
}

/** The basket's floor centre {x, y, z} at `tSec`: a circle round `cfg.center` (the angle follows the clock, so it is continuous across windows). */
export function balloonPos(tSec, out = { x: 0, y: 0, z: 0 }, cfg = B) {
  const a = (tSec * cfg.speed) / cfg.radius;
  out.x = cfg.center.x + Math.cos(a) * cfg.radius; out.z = cfg.center.z + Math.sin(a) * cfg.radius; out.y = cfg.floor;
  return out;
}

/** The floor height at (x, z) when the basket (floor centre `b`) is under it, else null. */
export function basketFloor(b, x, z, cfg = B) {
  return Math.hypot(x - b.x, z - b.z) < cfg.basketR ? b.y : null;
}

/** Is a body at `feet` (y) in the height band the basket wall / its carrying covers: from just under the floor up to `rim`? */
const inRim = (b, feet, cfg) => feet > b.y - 0.3 && feet < b.y + cfg.rim - 0.02;

/** The rim wall: moves `pos` ({x, y, z}, body radius `r`) so it stays on the side of the wall `prev` was on, unless its feet clear the rim.
 * Returns true when it moved the body. */
export function basketCollide(b, pos, prev, r, cfg = B) {
  if (!inRim(b, pos.y, cfg)) return false;
  const dx = pos.x - b.x, dz = pos.z - b.z, d = Math.hypot(dx, dz) || 1e-6;
  const wasIn = Math.hypot(prev.x - b.x, prev.z - b.z) < cfg.basketR;
  const lim = wasIn ? cfg.basketR - r : cfg.basketR + r;
  if (wasIn ? d <= lim : d >= lim) return false;
  pos.x = b.x + (dx / d) * lim; pos.z = b.z + (dz / d) * lim;
  return true;
}

/** Is a body at (x, y, z) in the basket's carried zone (inside the wall, feet from the floor up to 2 m over it)? */
export function basketCarries(b, x, y, z, cfg = B) {
  return Math.hypot(x - b.x, z - b.z) < cfg.basketR && y > b.y - 0.1 && y < b.y + 2;
}
