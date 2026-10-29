import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SITE, SEASON, EDGE_BACKDROP as E } from './config.js';
import { grassMeanColor } from './grass.js';
import { registerSnow, registerSeasonal } from './seasons.js';
import { lowMemory } from './lowmemory.js';

// #1682: the world's edge, far scenery outside the modelled terrain (data and caveats: EDGE_BACKDROP in config.js).
// Two merged meshes (flat land: band, north slab, fields, paths, road; house boxes) plus tree spots for the south backdrop's batches.
const B = SITE.backgroundGround, S = SITE.south;
const inRect = (x, z, m = 0) => x > B.x0 - m && x < B.x1 + m && z > B.z0 - m && z < B.z1 + m;

/** Deterministic pseudo-random sequence (no Math.random: the scenery is the same every start). */
function rng(seed) { let s = seed; return () => ((s = s * 16807 % 2147483647) / 2147483647); }

const flat = (pts, y, col) => { // upward triangles of a flat polygon [x, z]…, one vertex colour
  const tris = THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), []), pos = [], c = new THREE.Color(col), cols = [];
  for (const t of tris) for (const i of t) { pos.push(pts[i][0], y, pts[i][1]); cols.push(c.r, c.g, c.b); }
  return { pos, cols };
};
const quad = (a, b, c, d, [ya, yb2], yb, ca, cb) => { // a-b is the inner edge (heights ya, yb2; colour ca), c-d the outer edge (height yb; colour cb)
  const P = [[a, ya, ca], [b, yb2, ca], [c, yb, cb], [a, ya, ca], [c, yb, cb], [d, yb, cb]], pos = [], cols = [];
  for (const [p, y, col] of P) { pos.push(p[0], y, p[1]); cols.push(col.r, col.g, col.b); }
  return { pos, cols };
};
const geometry = (parts) => {
  const g = new THREE.BufferGeometry(), pos = parts.flatMap((p) => p.pos), cols = parts.flatMap((p) => p.cols);
  for (let i = 0; i < pos.length; i += 9) { // every triangle faces up (the shared up normal would be flipped on a back face: dark ground)
    if ((pos[i + 5] - pos[i + 2]) * (pos[i + 6] - pos[i]) - (pos[i + 3] - pos[i]) * (pos[i + 8] - pos[i + 2]) < 0) for (const a of [pos, cols]) for (let k = 0; k < 3; k++) { const t = a[i + 3 + k]; a[i + 3 + k] = a[i + 6 + k]; a[i + 6 + k] = t; }
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from({ length: pos.length / 3 }, () => [0, 1, 0]).flat(), 3));
  return g;
};
/** A polyline as a ribbon `width` m wide, dropping every piece that lies inside the terrain rectangle. */
function ribbon(path, width, y, col) {
  const pts = [], c = new THREE.Color(col), pos = [], cols = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const [a, b] = [path[i], path[i + 1]], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 12));
    for (let k = 0; k < n; k++) pts.push([[a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], [a[0] + (b[0] - a[0]) * (k + 1) / n, a[1] + (b[1] - a[1]) * (k + 1) / n]]);
  }
  for (const [p, q] of pts) {
    if (inRect(p[0], p[1], 2) || inRect(q[0], q[1], 2)) continue;
    const dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l * width / 2, nz = dx / l * width / 2, ex = dx / l * 0.5, ez = dz / l * 0.5; // (0.5 m overlap hides the seams between pieces)
    const A = [p[0] - ex - nx, p[1] - ez - nz], Bq = [p[0] - ex + nx, p[1] - ez + nz], C = [q[0] + ex + nx, q[1] + ez + nz], D = [q[0] + ex - nx, q[1] + ez - nz];
    for (const v of [A, Bq, C, A, C, D]) { pos.push(v[0], y, v[1]); cols.push(c.r, c.g, c.b); }
  }
  return { pos, cols };
}

/** The feathered band: terrain-edge tone → `far` colour over `width` m, only along the configured sides. */
export function skirtParts(far, ground = () => -Infinity) {
  const K = E.skirt, inner = new THREE.Color(far.r * K.innerTone[0], far.g * K.innerTone[1], far.b * K.innerTone[2]), w = K.width, y = E.level + E.lift.skirt, out = [];
  const top = (p) => Math.max(y, ground(p[0], p[1]) + 0.03); // the band starts at the terrain's own edge height (the north edge stands ~9 m above the far ground) and ramps down to the far ground
  for (const { side, from, to } of K.sides) {
    const n = Math.max(1, Math.ceil((to - from) / K.step)), at = (t, d) => { // t along the side, d metres outward
      const s = from + (to - from) * t;
      return side === 'west' ? [B.x0 - d, s] : side === 'east' ? [B.x1 + d, s] : side === 'north' ? [s, B.z0 - d] : [s, B.z1 + d];
    };
    for (let i = 0; i < n; i++) { const a = at(i / n, 0), b = at((i + 1) / n, 0); out.push(quad(a, b, at((i + 1) / n, w), at(i / n, w), [top(a), top(b)], y, inner, far)); }
  }
  return out;
}

/** House / hall boxes [{x, z, w, d, h, angle, wall, roof}] from the config (nothing inside the terrain rectangle). */
export function houseBoxes() {
  const boxes = [], r = rng(1682);
  for (const g of E.houses) {
    const a = g.angle * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), W = g.cols * g.w + (g.cols - 1) * g.colGap, D = g.rows * g.d + (g.rows - 1) * g.rowGap;
    for (let i = 0; i < g.rows; i++) for (let j = 0; j < g.cols; j++) {
      const lx = -W / 2 + g.w / 2 + j * (g.w + g.colGap) + (r() - 0.5) * 2, lz = -D / 2 + g.d / 2 + i * (g.d + g.rowGap) + (r() - 0.5) * 2;
      boxes.push({ x: g.at[0] + lx * ca - lz * sa, z: g.at[1] + lx * sa + lz * ca, w: g.w, d: g.d, h: g.h * (0.9 + r() * 0.2), angle: a, wall: g.walls[(i + j) % g.walls.length], roof: g.roofs[(i * 3 + j) % g.roofs.length] });
    }
  }
  for (const h of E.halls) boxes.push({ x: h.at[0], z: h.at[1], w: h.w, d: h.d, h: h.h, angle: h.angle * Math.PI / 180, wall: h.wall, roof: h.roof });
  return boxes.filter((b) => ![[-1, -1], [1, -1], [1, 1], [-1, 1]].some(([sx, sz]) => inRect(b.x + sx * b.w / 2 * Math.cos(b.angle) - sz * b.d / 2 * Math.sin(b.angle), b.z + sx * b.w / 2 * Math.sin(b.angle) + sz * b.d / 2 * Math.cos(b.angle), 6)));
}

/** Tree spots [{x, z, y, h, r, edge}] for the south backdrop's instanced batches: rows along field edges and woods (none on phones). */
export function edgeTreeSpots() {
  if (lowMemory && E.lowMemory.trees === false) return [];
  const r = rng(2916), H = S.treeHeight, R = S.treeRadius, out = [], add = (x, z) => { if (!inRect(x, z, 4)) out.push({ x, z, y: E.level, edge: true, h: H[0] + r() * (H[1] - H[0]), r: R[0] + r() * (R[1] - R[0]) }); };
  for (const row of E.treeRows) for (let i = 0; i + 1 < row.path.length; i++) {
    const [a, b] = [row.path[i], row.path[i + 1]], len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.floor(len / row.spacing);
    for (let k = 0; k <= n; k++) add(a[0] + (b[0] - a[0]) * k / n + (r() - 0.5) * 4, a[1] + (b[1] - a[1]) * k / n + (r() - 0.5) * 4);
  }
  for (const wd of E.woods) {
    const xs = wd.polygon.map((q) => q[0]), zs = wd.polygon.map((q) => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const inside = (x, z) => { let yes = false; for (let i = 0, j = wd.polygon.length - 1; i < wd.polygon.length; j = i++) { const p = wd.polygon[i], q = wd.polygon[j]; if ((p[1] > z) !== (q[1] > z) && x < (q[0] - p[0]) * (z - p[1]) / (q[1] - p[1]) + p[0]) yes = !yes; } return yes; };
    let n = 0; for (let i = 0; i < wd.n * 30 && n < wd.n; i++) { const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0); if (inside(x, z)) { add(x, z); n++; } }
  }
  return out;
}

/** The two meshes in one group: `edge-land` and `edge-houses`. */
export function buildEdgeBackdrop(ground) {
  const group = new THREE.Group(), far = grassMeanColor(), lift = E.lift, parts = [], N = E.north;
  group.name = 'edge-backdrop';
  parts.push(flat([[N.x0, N.z0], [N.x1, N.z0], [N.x1, B.z0], [N.x0, B.z0]], E.level, far));
  parts.push(...skirtParts(far, ground));
  for (const f of E.fields) parts.push(flat(f.polygon, E.level + lift.field, f.color));
  for (const p of E.paths) parts.push(ribbon(p.path, p.width, E.level + lift.path, p.color));
  for (const p of E.roads) parts.push(ribbon(p.path, p.width, E.level + lift.road, p.color));
  const land = new THREE.Mesh(geometry(parts), new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
  land.name = 'edge-land';
  group.add(land);
  const mats = [land.material];
  if (!(lowMemory && E.lowMemory.houses === false)) {
    const geos = houseBoxes().map((b) => {
      const g = new THREE.BoxGeometry(b.w, b.h + 0.1, b.d).toNonIndexed(), n = g.attributes.normal, p = g.attributes.position, cols = [], wc = new THREE.Color(b.wall), rc = new THREE.Color(b.roof);
      for (let i = 0; i < p.count; i++) { const c = n.getY(i) > 0.5 ? rc : wc; cols.push(c.r, c.g, c.b); }
      g.deleteAttribute('uv'); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      return g.rotateY(-b.angle).translate(b.x, E.level + b.h / 2 - 0.05, b.z);
    });
    const houses = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.95 }));
    houses.name = 'edge-houses';
    geos.forEach((g) => g.dispose());
    group.add(houses);
    registerSnow(houses.material, SEASON.snow.roof);
    mats.push(houses.material);
  }
  registerSnow(land.material, SEASON.snow.ground);
  registerSeasonal((month) => { const colored = !SEASON.snowMonths.includes(month); for (const m of mats) if (m.vertexColors !== colored) { m.vertexColors = colored; m.needsUpdate = true; } }); // snow months: all white like the rest of the backdrop (#1676)
  return group;
}
