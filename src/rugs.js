// Rugs on the floor (#55, #310, #317): furniture.js registers each rug it builds, so things that stand on the floor
// (the cat's floor spots, things put down on the floor) can stand on top of a rug instead of sinking into it.
import * as THREE from 'three';
import { FURNITURE, LEVELS } from './config.js';

const rugs = [];
const RUG_ITEMS = FURNITURE.filter((it) => it.type === 'rug');

/** furniture.js: a rug `item` (FURNITURE entry) and the group built for it. */
export function registerRug(item, object) {
  object.userData.rugTop = item.h + 0.002; // the existing mesh's top, including its floor/AO gap
  rugs.push({ item, object, matrix: new THREE.Matrix4().makeScale(0, 0, 0), inverse: new THREE.Matrix4() });
}

const shown = (o) => { for (; o; o = o.parent) if (!o.visible && !o.userData.rugPreviewSupport) return false; return true; };

/** Is x, z on this rug item? */
function onRug(item, x, z, m = 0) {
  const dx = x - item.x, dz = z - item.z;
  if (item.shape === 'round') return Math.hypot(dx, dz) < item.d / 2 + m;
  const a = ((item.rot ?? 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); // a rectangle turned by rot
  return Math.abs(c * dx - s * dz) < item.w / 2 + m && Math.abs(s * dx + c * dz) < item.d / 2 + m;
}

const top = (items, level, x, z, m) => items.reduce((h, it) => (it.level === level && onRug(it, x, z, m) ? Math.max(h, it.h + 0.002) : h), 0);

const point = new THREE.Vector3();
function liveTop(r, level, points, margin) {
  if (r.item.level !== level || !shown(r.object)) return 0;
  r.object.updateWorldMatrix(true, false);
  if (!r.matrix.equals(r.object.matrixWorld)) { r.matrix.copy(r.object.matrixWorld); r.inverse.copy(r.matrix).invert(); }
  for (const [x, z] of points) {
    point.set(x, LEVELS[level].floor, z).applyMatrix4(r.inverse);
    if (r.item.shape === 'round') { if (Math.hypot(point.x, point.z) >= r.item.d / 2 + margin) return 0; }
    else if (Math.abs(point.x) >= r.item.w / 2 + margin || Math.abs(point.z) >= r.item.d / 2 + margin) return 0;
  }
  return point.set(0, r.object.userData.rugTop, 0).applyMatrix4(r.matrix).y - LEVELS[level].floor;
}

/** Actual shown transforms, including a moved/rotated rug; one convex rug must support the whole base. */
export function rugSupport(level, points, margin = 0.02) {
  if (!points.length) return 0;
  return rugs.reduce((height, rug) => Math.max(height, liveTop(rug, level, points, margin)), 0);
}

/** How far above the floor the rug top is at x,z (cat and loose floor placement). */
export function rugLift(level, x, z) { return rugSupport(level, [[x, z]], 0); }

/** The same from the config alone (furniture.js, while building: a piece standing on a rug is lifted onto it, #317). */
// (2 cm of slack: a rug laid up to a wall carries the headboard standing against it)
export function rugUnder(level, x, z) { return top(RUG_ITEMS, level, x, z, 0.02); }
