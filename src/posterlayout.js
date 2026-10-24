import { PLAYROOM as R } from './config.js';

// #1574: where the posters, neon runs, neon signs, pub pendants and wall lamps go (pure: no three.js, so tools/ can check it). Every number comes from
// PLAYROOM.posters (*guess*); local metres from the room's centre.

export const P = R.posters; const C = R.clubhouse, F = C.front, t = C.wall, S = C.side;
/** Wall planes (local metres): the axis the wall runs along, its plane and the side the poster faces (+1 / -1 along the other axis), and the room it lights. */
export const POSTER_WALLS = {
  hallN: { axis: 'x', plane: F + t / 2, n: 1, zone: 'hall' }, hallS: { axis: 'x', plane: R.d / 2, n: -1, zone: 'hall' }, hallE: { axis: 'z', plane: R.w / 2, n: -1, zone: 'hall' },
  biljN: { axis: 'x', plane: -R.d / 2, n: 1, zone: 'biljard' }, biljS: { axis: 'x', plane: F - t / 2, n: -1, zone: 'biljard' },
  biljE: { axis: 'z', plane: S - t / 2, n: -1, zone: 'biljard' }, biljW: { axis: 'z', plane: -S + t / 2, n: 1, zone: 'biljard' },
  spelN: { axis: 'x', plane: -R.d / 2, n: 1, zone: 'spel' }, spelS: { axis: 'x', plane: F - t / 2, n: -1, zone: 'spel' },
  spelW: { axis: 'z', plane: S + t / 2, n: 1, zone: 'spel' }, spelE: { axis: 'z', plane: R.w / 2, n: -1, zone: 'spel' },
};

/** A rectangle's bounding box in local metres: a thing `w` wide (along the wall) and `h` high centred at (`along`, `y`) on `wall`, `depth` out from its plane. */
function onWall(wall, along, y, w, h, depth = P.offset) {
  const W = POSTER_WALLS[wall], hw = w / 2, a0 = along - hw, a1 = along + hw, p0 = Math.min(W.plane, W.plane + W.n * depth), p1 = Math.max(W.plane, W.plane + W.n * depth);
  return W.axis === 'x' ? { x0: a0, x1: a1, y0: y - h / 2, y1: y + h / 2, z0: p0, z1: p1 } : { x0: p0, x1: p1, y0: y - h / 2, y1: y + h / 2, z0: a0, z1: a1 };
}

/** Everything the poster mesh holds, as boxes: `posters` {design, wall, rect}, neon `runs`, wall `signs`, `pendants` and `sconces` (rect + colour). */
export function posterLayout() {
  const [w, h] = P.size, posters = [], panels = [], runs = [], signs = [], pendants = [], sconces = [];
  for (const [wall, def] of Object.entries(P.walls)) def.along.forEach((a, i) => posters.push({ wall, design: def.designs[i % def.designs.length], rect: onWall(wall, a, def.y, w, h) }));
  // SPEL's ceiling runs: along the north wall, the east wall, the west partition and the south partition
  const N = P.neon.run, x0 = S + t / 2 + .02, x1 = R.w / 2 - .02, z0 = -R.d / 2 + .02, z1 = F - t / 2 - .02, y0 = N.y, y1 = N.y + N.h;
  runs.push({ color: N.colors.north, rect: { x0, x1, y0, y1, z0, z1: z0 + N.d } }, { color: N.colors.south, rect: { x0, x1, y0, y1, z0: z1 - N.d, z1 } },
    { color: N.colors.east, rect: { x0: x1 - N.d, x1, y0, y1, z0, z1 } }, { color: N.colors.west, rect: { x0, x1: x0 + N.d, y0, y1, z0, z1 } });
  for (const [name, s] of Object.entries(P.neon.signs)) signs.push({ name, wall: s.wall, rect: onWall(s.wall, s.x, s.y, s.w, s.h) });
  const D = P.pendants;
  for (const z of D.z) pendants.push({ x: D.x, z, rect: { x0: D.x - D.rBottom, x1: D.x + D.rBottom, y0: D.bottom, y1: R.ceiling, z0: z - D.rBottom, z1: z + D.rBottom } });
  const L = P.sconces;
  for (const [wall, list] of [['biljE', L.east], ['biljW', L.west], ['biljN', L.north]]) for (const a of list) sconces.push({ wall, rect: onWall(wall, a, L.y, L.w, L.h, L.d) });
  // BILJARD's and SPEL's ceiling light panels (the room row, north half); BIO's is playroomcinema.js's, the hall's stay in the sign mesh
  for (const [x, zone] of [[0, 'biljard'], [2 * S, 'spel']]) panels.push({ zone, rect: { x0: x - .6, x1: x + .6, y0: R.ceiling - .03, y1: R.ceiling, z0: (-R.d / 2 + F) / 2 - .6, z1: (-R.d / 2 + F) / 2 + .6 } });
  return { posters, panels, runs, signs, pendants, sconces };
}

