// Rugs on the floor (#55, #310): furniture.js registers each rug it builds, so things that stand on the floor
// (the cat's floor spots, things put down on the floor) can stand on top of a rug instead of sinking into it.

const rugs = [];

/** furniture.js: a rug `item` (FURNITURE entry) and the group built for it. */
export function registerRug(item, object) { rugs.push({ item, object }); }

const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };

/** How far above the floor of `level` the top of a (shown) rug is at x, z; 0 off every rug. */
export function rugLift(level, x, z) {
  let h = 0;
  for (const { item, object } of rugs) {
    if (item.level !== level || !shown(object)) continue;
    const dx = x - item.x, dz = z - item.z;
    let on;
    if (item.shape === 'round') on = dx * dx + dz * dz < (item.d / 2) ** 2;
    else { // a rectangle turned by rot
      const a = ((item.rot ?? 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      on = Math.abs(c * dx - s * dz) < item.w / 2 && Math.abs(s * dx + c * dz) < item.d / 2;
    }
    if (on) h = Math.max(h, item.h + 0.002);
  }
  return h;
}
