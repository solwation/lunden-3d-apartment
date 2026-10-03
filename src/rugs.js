// Rugs on the floor (#55, #310, #317): furniture.js registers each rug it builds, so things that stand on the floor
// (the cat's floor spots, things put down on the floor) can stand on top of a rug instead of sinking into it.
import { FURNITURE } from './config.js';

const rugs = [];
const RUG_ITEMS = FURNITURE.filter((it) => it.type === 'rug');

/** furniture.js: a rug `item` (FURNITURE entry) and the group built for it. */
export function registerRug(item, object) { rugs.push({ item, object }); }

const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };

/** Is x, z on this rug item? */
function onRug(item, x, z, m = 0) {
  const dx = x - item.x, dz = z - item.z;
  if (item.shape === 'round') return Math.hypot(dx, dz) < item.d / 2 + m;
  const a = ((item.rot ?? 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); // a rectangle turned by rot
  return Math.abs(c * dx - s * dz) < item.w / 2 + m && Math.abs(s * dx + c * dz) < item.d / 2 + m;
}

const top = (items, level, x, z, m) => items.reduce((h, it) => (it.level === level && onRug(it, x, z, m) ? Math.max(h, it.h + 0.002) : h), 0);

/** How far above the floor of `level` the top of a (shown) rug is at x, z; 0 off every rug. */
export function rugLift(level, x, z) {
  return top(rugs.filter((r) => shown(r.object)).map((r) => r.item), level, x, z);
}

/** The same from the config alone (furniture.js, while building: a piece standing on a rug is lifted onto it, #317). */
// (2 cm of slack: a rug laid up to a wall carries the headboard standing against it)
export function rugUnder(level, x, z) { return top(RUG_ITEMS, level, x, z, 0.02); }
