import { SITE, COURTYARD, LEVELS, UNIT_TOP, GARAGE, TILED_ROOMS, FOOTSTEPS as F, storeyFloor } from './config.js';
import { onRoad, onWalk } from './roads.js';
import { parkDeckAt } from './riverpark.js';
import { insidePoly } from './parkinglayout.js';

const inRect = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
// Static bounds keep detailed paths out of the hot path. Called once per audible stride, never per frame.
const paving = [...SITE.paving, ...SITE.basementPaving, ...COURTYARD.paths];
const paths = [SITE.west, SITE.east, SITE.north, SITE.south, SITE.riverPark].flatMap(area =>
  [...(area?.paths ?? []), ...(area?.access ?? [])].map(p => {
    const points = p.polygon ?? p.path ?? [], width = Number(p.w) || 0;
    return { p, bounds: { x0: Math.min(...points.map(v => v[0])) - width, x1: Math.max(...points.map(v => v[0])) + width,
      z0: Math.min(...points.map(v => v[1])) - width, z1: Math.max(...points.map(v => v[1])) + width } };
  }));
function contains(p, x, z) {
  if (p.polygon) return insidePoly(x, z, p.polygon);
  for (let i = 1; i < (p.path?.length ?? 0); i++) {
    const a = p.path[i - 1], b = p.path[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    if (Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz) <= p.w / 2) return true;
  }
  return false;
}
/** #2193: the underfoot class for a step: { surface (the #1519 profile), where: 'ground' (open ground, paving, roads) | 'exposed' (decks,
 * roofs, patio) | 'core' (stairwell, garage) | 'indoor', road, stairs (on a stairwell tread, not a landing) }. Same data as before; no rays. */
export function stepInfo(world, { x, y, z }) {
  const r = (surface, where, extra) => ({ surface, where, road: false, stairs: false, ...extra });
  if (world.playroom?.contains(x, z)) return r('wood', 'indoor');
  if (world.core?.contains(x, z, y) || (world.garage?.inside(x, z) && y < GARAGE.floor + F.garageHeadroom)) {
    const inCore = world.core?.contains(x, z, y), levels = [GARAGE.floor, storeyFloor(1), storeyFloor(2), storeyFloor(3), ...(world.core?.parts ?? []).flatMap(c => c.Y ?? [])];
    return r('hard', 'core', { stairs: !!inCore && !levels.some(f => Math.abs(y - f) < F.floorTol) });
  }
  const unit = world.unitAt?.(x, z, y);
  if (unit) {
    const room = unit.roomAt(unit.levelAt(y), x, z) ?? '';
    return r(/hall|badrum|wc|dusch|tvätt/i.test(room) ? 'hard' : 'wood', 'indoor');
  }
  if (x > 0 && z > 0 && x < world.size.x && z < world.size.z && y < UNIT_TOP - F.indoorTopMargin) {
    const level = y > LEVELS[1].floor - F.floorBand ? 1 : 0;
    return r(TILED_ROOMS.some(t => t.level === level && inRect(t, x, z)) ? 'hard' : 'wood', 'indoor');
  }
  const deck = parkDeckAt(x, z);
  if (deck !== null && Math.abs(y - deck) < F.floorBand) return r('wood', 'exposed');
  const roof = world.roofs?.under(x, z, y, F.floorBand);
  if (roof && Math.abs(y - roof.y) < F.floorBand) return r('hard', 'exposed');
  // Existing horizontal occluders include the actual patio paving footprint.
  if (world.openings?.opaque?.some(o => o.y0 === o.y1 && Math.abs(y - o.y0) < F.floorBand && inRect(o, x, z))) return r('hard', 'exposed');
  if (onRoad(x, z)) return r('hard', 'ground', { road: true });
  if (onWalk(x, z) || paving.some(q => inRect(q, x, z))) return r('hard', 'ground');
  if (COURTYARD.gravel.some(q => inRect(q, x, z))) return r('gravel', 'ground');
  for (const { p, bounds } of paths) if (inRect(bounds, x, z) && contains(p, x, z)) return r(p.surface === 'gravel' ? 'gravel' : 'hard', 'ground');
  return r('grass', 'ground');
}
/** An acoustic approximation from existing room, paving and path data; no scene rays or new geometry. */
export const stepSurface = (world, pos) => stepInfo(world, pos).surface;

/** #2153: the listener's indoor room class for the reverb: 'concrete' (stairwell, garage/basement), 'bright' (bathroom, laundry, tiled
 * halls), 'soft' (other rooms, playroom), or null outdoors. Same data and conditions as `stepSurface`'s indoor branches. */
export function indoorRoomClass(world, { x, y, z }) {
  if (world.playroom?.contains(x, z)) return 'soft';
  if (world.core?.contains(x, z, y) || (world.garage?.inside(x, z) && y < GARAGE.floor + F.garageHeadroom)) return 'concrete';
  const unit = world.unitAt?.(x, z, y);
  if (unit) return /hall|badrum|wc|dusch|tvätt/i.test(unit.roomAt(unit.levelAt(y), x, z) ?? '') ? 'bright' : 'soft';
  if (x > 0 && z > 0 && x < world.size.x && z < world.size.z && y < UNIT_TOP - F.indoorTopMargin) {
    const level = y > LEVELS[1].floor - F.floorBand ? 1 : 0;
    return TILED_ROOMS.some(r => r.level === level && inRect(r, x, z)) ? 'bright' : 'soft';
  }
  return null;
}
