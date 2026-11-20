// #2181: how much a wall, slab, facade or closed door between the listener and a sound source dulls it. Pure helpers (no Web Audio):
// the estimate comes from the existing cells (playroom, stairwell core, garage, visited flat, home room), the home's wall segments
// and the live door state, once per effect (and a few times a second for loops). No scene rays. audio.js adds ONE low-pass
// biquad and a gain only to a voice this reports as obscured.
import { OCCLUSION as O, LEVELS, UNIT_TOP } from './config.js';

const storey = (y) => (y > LEVELS[1].floor - 0.5 ? 1 : 0); // home storey of a height (same split as stepsurface.js)
/** Which acoustic cell a point is in: { kind: 'play'|'core'|'garage'|'unit'|'home'|'out', key, level }. */
export function cellOf(world, { x, y, z }) {
  if (world.playroom?.contains(x, z)) return { kind: 'play', key: 'play', level: 0 };
  const band = Math.floor(y / O.floorGap);
  if (world.core?.contains(x, z, y)) return { kind: 'core', key: 'core', level: band };
  if (world.garage?.inside(x, z) && y < 0.5) return { kind: 'garage', key: 'garage', level: 0 };
  const unit = world.unitAt?.(x, z, y);
  if (unit) { const lv = unit.levelAt(y); return { kind: 'unit', key: `u${unit.id}:${lv}:${unit.roomAt(lv, x, z) ?? ''}`, level: lv, unit: unit.id }; }
  if (x > 0 && z > 0 && x < world.size.x && z < world.size.z && y < UNIT_TOP - 0.3) {
    const level = storey(y);
    return { kind: 'home', key: `h${level}:${world.roomAt?.(level, x, z) ?? ''}`, level };
  }
  return { kind: 'out', key: 'out', level: 0 };
}

function crosses(ax, az, bx, bz, [cx, cz, dx, dz]) { // does segment a-b cross segment c-d?
  const d = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / d, u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / d;
  return t > 0 && t < 1 && u > 0 && u < 1;
}

/** Closed/open doors the line a-b passes (plan view) near height `y`: { closed, open }. Doors are those of `world.doors`. */
export function doorsOnLine(world, a, b, y) {
  let closed = 0, open = 0;
  for (const d of world.doors ?? []) {
    if (storey(d.object?.position?.y ?? 0) !== storey(y)) continue; // another storey's door
    if (!crosses(a.x, a.z, b.x, b.z, d.segment())) continue;
    if ((d.t ?? 0) < O.doorClosedT) closed++; else open++;
  }
  return { closed, open };
}

/**
 * Estimate for a source heard at `src` by a listener at `lis`. Returns null when the sound is clear (nothing in between: no filter is
 * built), else { gain (0..1), hz (low-pass), parts: [names of what is in between] }. `world` = the World (playroom, core, garage,
 * unitAt, roomAt, levels[].wallSegments, doors, size).
 */
export function occlusionFor(world, lis, src) {
  const a = cellOf(world, lis), b = cellOf(world, src);
  if (a.key === b.key) return null;
  const parts = [];
  const indoor = (c) => c.kind !== 'out';
  const sameBuilding = (a.kind === 'home' || a.kind === 'core') && (b.kind === 'home' || b.kind === 'core');
  const y = indoor(a) ? lis.y : src.y;
  if (sameBuilding && Math.abs(lis.y - src.y) > O.floorGap) parts.push('floor');
  if (a.kind === 'home' && b.kind === 'home' && a.level === b.level) { // same storey: walls decide, then doors (doorways have no wall segment)
    const segs = world.levels?.[a.level]?.wallSegments ?? [];
    if (segs.some((s) => crosses(lis.x, lis.z, src.x, src.z, s))) parts.push('wall');
    else { const d = doorsOnLine(world, lis, src, y); if (d.closed) parts.push('door'); else if (d.open) parts.push('openDoor'); }
  } else if (!(a.kind === 'home' && b.kind === 'home')) { // between cells: a door on the line decides, else the wall/facade
    const d = doorsOnLine(world, lis, src, y);
    if (d.closed) parts.push('door'); else if (d.open) parts.push('openDoor');
    else if (!parts.includes('floor')) parts.push(indoor(a) && indoor(b) ? 'wall' : 'facade');
  }
  if (!parts.length) return null;
  let db = 0, hz = Infinity;
  for (const p of parts) { db += O[p].db; hz = Math.min(hz, O[p].hz); }
  db = Math.min(db, O.maxDb);
  return { gain: Math.pow(10, -db / 20), hz: Math.max(O.minHz, hz), parts };
}
