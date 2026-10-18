// #1305: the real ground levels (Copernicus GLO-30 bare-earth estimate, data/elevation.json via the generated
// elevationgrid.js) outside the built block. `gridGround(x, z)` is the smooth (Catmull-Rom, C1) height in metres relative to
// the L1007 courtyard (y 0), clamped to the grid's edge; surroundings.js blends it into today's analytic terrain. C1, not
// bilinear: the terrain mesh samples it on a 4-5 m lattice, so a smooth surface keeps the mesh within a few cm of `terrainY`.
import { ELEVATION_GRID as G } from './elevationgrid.js';
const cr = (a, b, c, d, t) => b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
const at = (i, j) => G.g[Math.min(G.rows - 1, Math.max(0, j))][Math.min(G.cols - 1, Math.max(0, i))];
export function gridGround(x, z) {
  const fx = Math.min(G.cols - 1, Math.max(0, (x - G.x0) / G.step)), fz = Math.min(G.rows - 1, Math.max(0, (z - G.z0) / G.step));
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, col = (jj) => cr(at(i - 1, jj), at(i, jj), at(i + 1, jj), at(i + 2, jj), u);
  return cr(col(j - 1), col(j), col(j + 1), col(j + 2), v) / 10;
}
