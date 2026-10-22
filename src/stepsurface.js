import { SITE, COURTYARD, LEVELS, UNIT_TOP, GARAGE, TILED_ROOMS, FOOTSTEPS as F } from './config.js';
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
/** An acoustic approximation from existing room, paving and path data; no scene rays or new geometry. */
export function stepSurface(world, { x, y, z }) {
  if (world.playroom?.contains(x, z)) return 'wood';
  if (world.core?.contains(x, z, y) || (world.garage?.inside(x, z) && y < GARAGE.floor + F.garageHeadroom)) return 'hard';
  const unit = world.unitAt?.(x, z, y);
  if (unit) {
    const room = unit.roomAt(unit.levelAt(y), x, z) ?? '';
    return /hall|badrum|wc|dusch|tvätt/i.test(room) ? 'hard' : 'wood';
  }
  if (x > 0 && z > 0 && x < world.size.x && z < world.size.z && y < UNIT_TOP - F.indoorTopMargin) {
    const level = y > LEVELS[1].floor - F.floorBand ? 1 : 0;
    return TILED_ROOMS.some(r => r.level === level && inRect(r, x, z)) ? 'hard' : 'wood';
  }
  const deck = parkDeckAt(x, z);
  if (deck !== null && Math.abs(y - deck) < F.floorBand) return 'wood';
  const roof = world.roofs?.under(x, z, y, F.floorBand);
  if (roof && Math.abs(y - roof.y) < F.floorBand) return 'hard';
  // Existing horizontal occluders include the actual patio paving footprint.
  if (world.openings?.opaque?.some(r => r.y0 === r.y1 && Math.abs(y - r.y0) < F.floorBand && inRect(r, x, z))) return 'hard';
  if (onRoad(x, z) || onWalk(x, z) || paving.some(r => inRect(r, x, z))) return 'hard';
  if (COURTYARD.gravel.some(r => inRect(r, x, z))) return 'gravel';
  for (const { p, bounds } of paths) if (inRect(bounds, x, z) && contains(p, x, z)) return p.surface === 'gravel' ? 'gravel' : 'hard';
  return 'grass';
}
