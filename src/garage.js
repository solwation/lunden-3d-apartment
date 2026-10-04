import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GARAGE as G, SITE } from './config.js';
import { carGeometry, bikeGeometry } from './streetlife.js';
import { groundY } from './surroundings.js';
import { sfx } from './audio.js';

// The garage under the courtyard and Hus L's basement (#357, #417, GARAGE in config — the layout is the våning −1
// plan's; heights, stalls, cages and lights are ours). The entrance hall behind the garage door (SITE.terrain.garageDoor)
// turns north-east into the big hall under the whole courtyard (painted stalls and numbers on canvas floors, the plan's
// column grid, parked cars, the car pool, bike racks, our own stall straight under our patio), Hus L's basement through
// a steel door: bike rooms, the elrum, the lift / stair lobby in the core, the 15 wire-mesh förråd (doors that open with
// E, things inside); the miljörum under Hus C.
// Walking: the visitor is `below` (player.js) inside these rectangles at the floor's height; then this module's segments
// are the collision (not the courtyard's). Walls stand on every rectangle edge that touches no other rectangle. Drawing:
// per sensor area the shell, floors, cages, signs and tubes are MeshBasic with the fluorescent light baked into vertex
// colours (the materials' colour = how far that area's tubes are on), and nothing is drawn unless the camera is down here
// or west of the garage door looking in (`near`). The parked cars are lit by pool lights (lights.extra, one spot per
// area, no PointLight of our own) while the daylight is cut (DayCycle.under).

const T = SITE.terrain, GD = T.garageDoor, F = G.floor, C = G.ceiling, S = G.stalls, ST = G.storage, LI = G.lights;
const westYAt = (x, z) => groundY(x, z);
const RECTS = G.rects, R = Object.fromEntries(RECTS.map((r) => [r.id, r])), ENTR = R.entrance;
const AREAS = [...new Set(RECTS.map((r) => r.area))];
const inRect = (r, x, z, e = 0) => x > r.x0 - e && x < r.x1 + e && z > r.z0 - e && z < r.z1 + e;
const rectAt = (x, z) => RECTS.find((r) => inRect(r, x, z)) ?? null;

/** The stalls: { n, x0, x1, z0, z1, nose 'n' | 's', ours, pool }, numbered along the rows. */
export const STALLS = (() => {
  const out = [];
  S.rows.forEach(([x0, x1, z0, z1, nose, w], row) => {
    const n = Math.floor((x1 - x0) / w + 1e-6);
    for (let k = 0; k < n; k++) {
      const a = x0 + k * w, b = a + w, mid = (a + b) / 2;
      if (row === 0 && S.skip.some(([s0, s1]) => mid > s0 && mid < s1)) continue; // (in front of the basement door)
      out.push({ n: out.length + 1, x0: a, x1: b, z0, z1, nose, ours: row === 0 && mid > S.ours[0] && mid < S.ours[1], pool: row === 0 && S.pool.some(([p0, p1]) => mid > p0 && mid < p1) }); // (both in the big hall's north row)
    }
  });
  return out;
})();

/** The förråd: { n, x0, x1, z0, z1, front: 'n' | 's' (the face with the door), ours }. */
export const CAGES = (() => {
  const out = [];
  ST.bays.forEach(([a0, a1], i) => {
    const h = (a1 - a0) / 2;
    for (const k of [0, 1]) out.push({ x0: a0 + k * h, x1: a0 + (k + 1) * h, z0: ST.north[0], z1: ST.north[1], front: 's' });
    for (const k of [0, 1]) if (!(i === ST.skipSouth && k === 1)) out.push({ x0: a0 + k * h, x1: a0 + (k + 1) * h, z0: ST.south[0], z1: ST.south[1], front: 'n' });
  });
  return out.map((c, i) => ({ ...c, n: i + 1, ours: i + 1 === ST.ours }));
})();

/** The columns' centres [x, z]. */
export const COLUMNS = [
  ...G.columns.grid.xs.flatMap((x) => G.columns.grid.zs.map((z) => [x, z])),
  ...G.columns.south.xs.map((x) => [x, G.columns.south.z]),
  ...G.columns.entrance.xs.flatMap((x) => G.columns.entrance.zs.map((z) => [x, z])),
];

/** Where the tubes hang: a grid over every room (plan x, z; `ax` = along x; `rect` = the room it lights). */
const TUBES = RECTS.filter((r) => (r.x1 - r.x0) > 1.2 && (r.z1 - r.z0) > 1.2).flatMap((r) => {
  const w = r.x1 - r.x0, d = r.z1 - r.z0, nx = Math.max(1, Math.round(w / LI.spacing)), nz = Math.max(1, Math.round(d / LI.spacing)), out = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) out.push({ x: r.x0 + (i + 0.5) * w / nx, z: r.z0 + (j + 0.5) * d / nz, ax: w >= d, rect: r, area: r.area });
  return out;
});
const TUBE_Y = C - 0.09;

/** The baked fluorescent light at a point (0 … ~1.15): the tubes of the rooms it is in or on the wall of. */
function light(x, y, z) {
  let s = LI.amb;
  for (const t of TUBES) if (inRect(t.rect, x, z, 0.4)) s += 0.8 / (1 + ((x - t.x) ** 2 + ((y - TUBE_Y) * 1.3) ** 2 + (z - t.z) ** 2) / (LI.r * LI.r));
  return Math.min(1.15, s);
}

/** A geometry → non-indexed, colour = `hex` × the light at each vertex (uv kept only with `uv`). */
function bake(geo, hex, uv = false) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && !(uv && k === 'uv')) g.deleteAttribute(k);
  const p = g.attributes.position, c = new THREE.Color(hex), col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const l = light(p.getX(i), p.getY(i), p.getZ(i)); col.set([c.r * l, c.g * l, c.b * l], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (uv && !g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(p.count * 2), 2));
  return g;
}
/** A vertical panel from (ax, az) to (bx, bz), y0 … y1, subdivided for the baked light. */
function panel(ax, az, bx, bz, y0, y1) {
  const len = Math.hypot(bx - ax, bz - az);
  return new THREE.PlaneGeometry(len, y1 - y0, Math.max(1, Math.ceil(len / 1.2)), Math.max(1, Math.ceil((y1 - y0) / 1.3)))
    .rotateY(-Math.atan2(bz - az, bx - ax)).translate((ax + bx) / 2, (y0 + y1) / 2, (az + bz) / 2);
}
/** A horizontal rectangle at y (facing up; the materials are double-sided). */
const flat = (x0, x1, z0, z1, y, step = 1.25) => new THREE.PlaneGeometry(x1 - x0, z1 - z0, Math.max(1, Math.ceil((x1 - x0) / step)), Math.max(1, Math.ceil((z1 - z0) / step)))
  .rotateX(-Math.PI / 2).translate((x0 + x1) / 2, y, (z0 + z1) / 2);
const box = (sx, sy, sz, x, y, z) => new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z);
const seg = (out, ax, az, bx, bz) => out.push([ax, az, bx, bz]);
const rectSegs = (out, x0, x1, z0, z1) => { seg(out, x0, z0, x1, z0); seg(out, x1, z0, x1, z1); seg(out, x1, z1, x0, z1); seg(out, x0, z1, x0, z0); };
function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

/** The walls: every rectangle edge, cut where the ground just outside it is another rectangle (5 cm samples). */
function wallLines() {
  const out = [], h = 0.05;
  for (const r of RECTS) for (const [ax, az, bx, bz, ox, oz] of [[r.x0, r.z0, r.x1, r.z0, 0, -1], [r.x1, r.z0, r.x1, r.z1, 1, 0], [r.x0, r.z1, r.x1, r.z1, 0, 1], [r.x0, r.z0, r.x0, r.z1, -1, 0]]) {
    if (r.id === 'doorway' && ox < 0) continue; // the garage door's opening: GarageDoor
    if (r.id === 'core') continue; // the stair core's walls: core.js (#415)
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / h));
    let start = null;
    const open = (t) => { const x = ax + (bx - ax) * t + ox * 0.03, z = az + (bz - az) * t + oz * 0.03; return !!rectAt(x, z); };
    for (let k = 0; k <= n; k++) {
      const t = Math.min(1, (k + 0.5) / n), wall = k < n && !open(t);
      if (wall && start === null) start = k / n;
      if (!wall && start !== null) { const e = k / n; out.push([ax + (bx - ax) * start, az + (bz - az) * start, ax + (bx - ax) * e, az + (bz - az) * e, r]); start = null; }
    }
  }
  return out;
}

/** A floor canvas for a garage rectangle: concrete with the stall lines and numbers, our stall, the car pool, arrows. */
const PPM = 40; // px per metre
function floorTexture(r, arrows = []) {
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  const c = document.createElement('canvas'); c.width = Math.round(w * PPM); c.height = Math.round(d * PPM);
  const g = c.getContext('2d'), Rn = rng(Math.round(r.x0 * 7 + r.z0));
  g.fillStyle = '#8e8f8c'; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < w * d * 12; i++) { const v = 120 + Math.floor(Rn() * 40); g.fillStyle = `rgba(${v},${v},${v - 4},0.35)`; g.fillRect(Rn() * c.width, Rn() * c.height, 2 + Rn() * 3, 2 + Rn() * 3); }
  const X = (x) => (x - r.x0) * PPM, Z = (z) => (z - r.z0) * PPM;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const s of STALLS) {
    const cx = (s.x0 + s.x1) / 2;
    if (s.x1 < r.x0 || s.x0 > r.x1 || s.z1 < r.z0 || s.z0 > r.z1) continue; // (the canvas clips what lies beyond it)
    g.fillStyle = '#ecebe4';
    for (const x of [s.x0, s.x1]) g.fillRect(X(x) - 0.06 * PPM, Z(s.z0), 0.12 * PPM, (s.z1 - s.z0) * PPM);
    const front = s.nose === 'n' ? s.z1 - 0.7 : s.z0 + 0.7, back = s.nose === 'n' ? s.z0 + 1.6 : s.z1 - 1.6;
    const text = (t, z, size, col, dy = 0) => { g.save(); g.translate(X(cx), Z(z)); if (s.nose === 's') g.rotate(Math.PI); g.fillStyle = col; g.font = `bold ${size * PPM}px sans-serif`; g.fillText(t, 0, dy * PPM); g.restore(); };
    text(String(s.n), front, 0.7, '#ecebe4');
    const mark = s.ours ? ['#f2c230', 'L1007', 'RESERVERAD'] : s.pool ? ['#3fa34d', 'BILPOOL', 'LADDPLATS'] : null;
    if (mark) {
      text(mark[1], back, 0.36, mark[0]); text(mark[2], back, 0.2, mark[0], 0.42);
      g.strokeStyle = mark[0]; g.lineWidth = 0.08 * PPM; g.strokeRect(X(s.x0) + 0.2 * PPM, Z(s.z0) + 0.2 * PPM, (s.x1 - s.x0 - 0.4) * PPM, (s.z1 - s.z0 - 0.4) * PPM);
    }
  }
  g.fillStyle = '#ecebe4';
  for (const [x, z, dx, dz] of arrows) { // an arrow along the aisle, pointing (dx, dz)
    g.save(); g.translate(X(x), Z(z)); g.rotate(Math.atan2(dz, dx)); g.beginPath();
    g.moveTo(0.9 * PPM, 0); g.lineTo(0.1 * PPM, -0.45 * PPM); g.lineTo(0.1 * PPM, -0.18 * PPM); g.lineTo(-0.9 * PPM, -0.18 * PPM);
    g.lineTo(-0.9 * PPM, 0.18 * PPM); g.lineTo(0.1 * PPM, 0.18 * PPM); g.lineTo(0.1 * PPM, 0.45 * PPM); g.closePath(); g.fill(); g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/** The wire mesh of the förråd walls: a square grid; the top rows are solid (frames use uv there). */
function meshTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#c9ccce';
  for (let k = 0; k < 4; k++) { g.fillRect(k * 16, 0, 5, 64); g.fillRect(0, k * 16, 64, 5); }
  g.fillRect(0, 0, 64, 6); // (v 0.91…1: solid)
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
const SOLID_V = 0.97;

/** Signs: one atlas of plates (cells of 256 × 64; green for the car pool and the way out). */
const SIGNS = ['HISS', 'TRAPPHUS L', 'UTFART', 'GARAGE', 'BILPOOL', 'L1007', 'MILJÖRUM', 'ELRUM', 'CYKELFÖRRÅD', 'FÖRRÅD', 'KÄLLARE · HISS',
  ...new Set(G.fakeDoors.map((f) => f[3])), ...CAGES.map((c) => (c.ours ? 'FÖRRÅD 7 · L1007' : `FÖRRÅD ${c.n}`))];
function signTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 64 * Math.ceil(SIGNS.length / 4);
  const g = c.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  SIGNS.forEach((s, i) => {
    const x = (i % 4) * 256, y = Math.floor(i / 4) * 64;
    g.fillStyle = s === 'UTFART' || s === 'BILPOOL' ? '#1d7a3a' : s === 'L1007' ? '#d9a91a' : '#21508c'; g.fillRect(x, y, 256, 64);
    g.strokeStyle = '#f4f4f0'; g.lineWidth = 3; g.strokeRect(x + 5, y + 5, 246, 54);
    g.fillStyle = '#f4f4f0'; g.font = `bold ${s.length > 12 ? 24 : 32}px sans-serif`; g.fillText(s, x + 128, y + 33);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return { tex: t, rows: c.height / 64 };
}
const SIGN_TEX = { v: null };
/** A sign plate (atlas text `s`) centred at (x, y, z), turned `ry`, `w` m wide (4:1). */
function plate(s, x, y, z, ry, w) {
  SIGN_TEX.v ??= signTexture();
  const i = SIGNS.indexOf(s), g = new THREE.PlaneGeometry(w, w / 4).rotateY(ry).translate(x, y, z), uv = g.attributes.uv, rows = SIGN_TEX.v.rows;
  const u0 = (i % 4) / 4, v0 = 1 - (Math.floor(i / 4) + 1) / rows;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) / 4, v0 + uv.getY(k) / rows);
  return bake(g, 0xffffff, true);
}
/** The rotation of a plate facing (ox, oz) (a PlaneGeometry faces +z). */
const facing = (ox, oz) => Math.atan2(ox, oz);
const FACES = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };

export class Garage {
  constructor() {
    const group = new THREE.Group();
    this.object = group;
    this.rects = RECTS;
    this.roomNames = [...new Set(RECTS.map((r) => r.room))];
    // per area: the geometries per material, an own group (drawn or not), the sensor's state
    this.areas = Object.fromEntries(AREAS.map((a) => [a, { name: a, group: new THREE.Group(), geos: { shell: [], mesh: [], signs: [], tubes: [] }, floors: [],
      on: false, level: 0, hold: 0, flickT: 0 }]));
    for (const a of Object.values(this.areas)) group.add(a.group);
    const areaAt = (x, z) => this.areas[rectAt(x, z)?.area ?? 'entrance'] ?? this.areas.entrance;
    const put = (kind, g, x, z) => areaAt(x, z).geos[kind].push(g);
    const segs = [];
    const WALL_LO = 0x7f8a90, WALL = 0xc6c4bd, CEIL = 0xb7b5b0, FLOOR = 0x8d8e8b;
    // the walls (a painted band below, light concrete above) on every free rectangle edge; collision on the same lines
    for (const [ax, az, bx, bz, r] of wallLines()) {
      const into = (g) => this.areas[r.area].geos.shell.push(g); // (the room it bounds: its sensor)
      into(bake(panel(ax, az, bx, bz, F, F + 1.0), WALL_LO)); into(bake(panel(ax, az, bx, bz, F + 1.0, C), WALL));
      seg(segs, ax, az, bx, bz);
    }
    // over every doorway (a thin rectangle through a wall): the lintel; the garage door's: up to the ceiling from its head
    for (const r of RECTS.filter((q) => Math.min(q.x1 - q.x0, q.z1 - q.z0) < 0.7)) {
      const across = r.x1 - r.x0 < r.z1 - r.z0, head = r.id === 'doorway' ? F + GD.h : F + 2.1;
      for (const v of across ? [r.x0, r.x1] : [r.z0, r.z1]) this.areas[r.area].geos.shell.push(bake(across ? panel(v, r.z0, v, r.z1, head, C) : panel(r.x0, v, r.x1, v, head, C), WALL));
    }
    // the partial walls and the columns: concrete boxes (a yellow foot band on the columns)
    for (const [x0, x1, z0, z1] of G.partials) { put('shell', bake(box(x1 - x0, C - F, z1 - z0, (x0 + x1) / 2, (F + C) / 2, (z0 + z1) / 2), WALL), (x0 + x1) / 2, (z0 + z1) / 2); rectSegs(segs, x0, x1, z0, z1); }
    const K = G.columns.size;
    this.columns = COLUMNS;
    for (const [x, z] of COLUMNS) {
      put('shell', bake(box(K, 0.35, K, x, F + 0.175, z), 0xe0b52a), x, z); put('shell', bake(box(K, C - F - 0.35, K, x, (F + 0.35 + C) / 2, z), 0xc9c7c0), x, z);
      rectSegs(segs, x - K / 2, x + K / 2, z - K / 2, z + K / 2);
    }
    // floors: the garage rooms on canvases (lines, numbers), the rest plain concrete; ceilings everywhere
    const canvasRooms = { entrance: [[-62, 42.6, -1, 0], [-50, 45.2, 1, 0], [-46.6, 37, 0, -1]], hallW: [[-30, 20.2, -1, 0], [-20, 22.6, 1, 0], [-46.6, 28, 0, 1]], hallE: [[-3, 20.2, -1, 0], [4, 22.6, 1, 0]] };
    for (const r of RECTS) {
      const mx = (r.x0 + r.x1) / 2, mz = (r.z0 + r.z1) / 2;
      if (canvasRooms[r.id]) this.areas[r.area].floors.push({ geo: bake(flat(r.x0, r.x1, r.z0, r.z1, F + 0.003, 1.0), 0xffffff, true), tex: floorTexture(r, canvasRooms[r.id]) });
      else put('shell', bake(flat(r.x0, r.x1, r.z0, r.z1, F + 0.003), FLOOR), mx, mz);
      if (r.id !== 'core') put('shell', bake(flat(r.x0, r.x1, r.z0, r.z1, C), CEIL), mx, mz); // (the stairwell goes on up, #415)
    }
    // wheel stops, our stall's and the car pool's charging posts, ducts and a sprinkler main under the big hall's ceiling
    for (const s of STALLS) {
      const cx = (s.x0 + s.x1) / 2, bz = s.nose === 'n' ? s.z0 : s.z1, sg = s.nose === 'n' ? 1 : -1;
      put('shell', bake(box(1.6, 0.1, 0.15, cx, F + 0.05, bz + sg * 0.6), 0x5b5e60), cx, bz + sg);
      if (s.ours || s.pool) { // a wall box charger with a green light
        put('shell', bake(box(0.3, 0.45, 0.14, s.x1 - 0.45, F + 1.25, bz + sg * 0.08), 0xe9ebec), cx, bz + sg);
        put('shell', bake(box(0.05, 0.05, 0.02, s.x1 - 0.45, F + 1.38, bz + sg * 0.16), 0x2fd35a), cx, bz + sg);
        put('signs', plate(s.ours ? 'L1007' : 'BILPOOL', cx - 0.3, F + 1.9, bz + sg * 0.03, facing(0, sg), 0.9), cx, bz + sg);
      }
    }
    const duct = (ax, az, bx, bz, y, r, col) => { const len = Math.hypot(bx - ax, bz - az), g = new THREE.CylinderGeometry(r, r, len, 10, Math.max(1, Math.ceil(len / 2)), true).rotateZ(Math.PI / 2).rotateY(-Math.atan2(bz - az, bx - ax)).translate((ax + bx) / 2, y, (az + bz) / 2); put('shell', bake(g, col), (ax + bx) / 2, (az + bz) / 2); };
    duct(-69.6, 37.5, -42, 37.5, C - 0.32, 0.22, 0xa7abae);
    duct(-51, 19.4, 8.5, 19.4, C - 0.32, 0.22, 0xa7abae); duct(-51, 26.4, -10, 26.4, C - 0.32, 0.22, 0xa7abae);
    duct(-69.6, 45.6, -42, 45.6, C - 0.12, 0.035, 0xb3261e); duct(-51, 22.2, 8.5, 22.2, C - 0.12, 0.035, 0xb3261e);
    // signs: the way out, over the doors to the rooms
    put('signs', plate('UTFART', ENTR.x0 + 0.03, F + 2.25, GD.z0 - 0.75, facing(1, 0), 0.8), ENTR.x0 + 1, 40);
    put('signs', plate('GARAGE', -45, F + 2.35, 34.6, facing(0, 1), 0.8), -45, 35);
    put('signs', plate('KÄLLARE · HISS', -15.0, F + 2.35, 12.65, facing(0, 1), 0.9), -15, 13);
    put('signs', plate('MILJÖRUM', -64.5, F + 2.35, 34.55, facing(0, 1), 0.7), -64.5, 35);
    put('signs', plate('ELRUM', -23.55, F + 2.35, 2.7, facing(0, 1), 0.6), -23.55, 3);
    put('signs', plate('FÖRRÅD', -0.53, F + 2.35, 7.82, facing(0, 1), 0.6), -0.53, 8.2);
    put('signs', plate('CYKELFÖRRÅD', -15.0, F + 2.35, 7.82, facing(0, 1), 0.8), -15, 8.2);
    // doors we cannot open: a steel leaf on the wall and its sign
    for (const [x, z, face, label] of G.fakeDoors) {
      const [ox, oz] = FACES[face], along = oz !== 0, px = x + ox * 0.03, pz = z + oz * 0.03, ax = x + ox, az = z + oz;
      put('shell', bake(box(along ? 1.0 : 0.04, 2.12, along ? 0.04 : 1.0, px, F + 1.06, pz), 0x5e6266), ax, az);
      put('shell', bake(box(along ? 0.9 : 0.05, 2.04, along ? 0.05 : 0.9, px + ox * 0.01, F + 1.03, pz + oz * 0.01), 0x7d858b), ax, az);
      put('shell', bake(box(along ? 0.14 : 0.06, 0.03, along ? 0.06 : 0.14, px + ox * 0.04 + (along ? 0.33 : 0), F + 1.05, pz + oz * 0.04 + (along ? 0 : 0.33)), 0xc8cccf), ax, az);
      put('signs', plate(label, px + ox * 0.03, F + 2.35, pz + oz * 0.03, facing(ox, oz), 0.6), ax, az);
    }
    // the tubes: housings (shell) and the tubes themselves (lit)
    for (const t of TUBES) {
      const [sx2, sz2] = t.ax ? [1.3, 0.15] : [0.15, 1.3];
      put('shell', bake(box(sx2, 0.07, sz2, t.x, C - 0.035, t.z), 0xdedede), t.x, t.z);
      this.areas[t.area].geos.tubes.push(box(t.ax ? 1.22 : 0.07, 0.035, t.ax ? 0.07 : 1.22, t.x, TUBE_Y, t.z));
    }
    // the miljörum's bins (660 l, lids): mixed waste, food, paper, packaging
    [0x3d4245, 0x6b4a2b, 0x2f5f9e, 0xd8c23a, 0x4d8a3c].forEach((col, i) => {
      const x = R.miljo.x0 + 0.8 + i * 1.35, z = R.miljo.z0 + 0.65;
      put('shell', bake(box(1.26, 1.1, 0.8, x, F + 0.6, z), col), x, z); put('shell', bake(box(1.3, 0.06, 0.85, x, F + 1.18, z), col), x, z);
      for (const dx of [-0.5, 0.5]) put('shell', bake(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 8).rotateX(Math.PI / 2).translate(x + dx, F + 0.06, z + 0.36), 0x111111), x, z);
      rectSegs(segs, x - 0.65, x + 0.65, z - 0.45, z + 0.45);
    });
    // bike racks with bikes (CYKELPARKERING, the bike rooms)
    const [frame, tyres] = bikeGeometry(), Rb = rng(7), bikeCols = [0x1d3c6e, 0xb02a2a, 0x2a2a2a, 0xe2e2dc, 0x3c7a4a, 0x8a8f96, 0xd8a020];
    for (const [x0, x1, z, f] of G.bikes) {
      put('shell', bake(box(x1 - x0, 0.04, 0.04, (x0 + x1) / 2, F + 0.3, z), 0x6f7377), (x0 + x1) / 2, z + f * 0.5);
      for (let x = x0 + 0.3; x < x1 - 0.2; x += 0.62) {
        put('shell', bake(box(0.04, 0.6, 0.5, x, F + 0.3, z + f * 0.2), 0x6f7377), x, z + f * 0.5);
        if (Rb() < 0.65) for (const [geo, col] of [[frame, bikeCols[Math.floor(Rb() * bikeCols.length)]], [tyres, 0x141414]])
          put('shell', bake(geo.clone().rotateY(f * Math.PI / 2).translate(x, F, z + f * 0.42), col), x, z + f * 0.5);
      }
      const za = Math.min(z, z + f * 1.3), zb = Math.max(z, z + f * 1.3);
      rectSegs(segs, x0, x1, za, zb);
    }
    // the förråd: wire-mesh walls and fronts with a door each; things inside
    this.cageDoors = [];
    const meshWall = (ax, az, bx, bz) => {
      const len = Math.hypot(bx - ax, bz - az), g = panel(ax, az, bx, bz, F + 0.05, C - 0.02);
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 0.16, uv.getY(i) * (C - F) / 0.16);
      put('mesh', bake(g, 0xffffff, true), (ax + bx) / 2, (az + bz) / 2);
      seg(segs, ax, az, bx, bz);
    };
    const solid = (g) => { g = bake(g, 0x9aa0a4, true); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5, SOLID_V); return g; };
    const post = (x, z) => put('mesh', solid(box(0.04, C - F, 0.04, x, (F + C) / 2, z)), x, z);
    for (const c of CAGES) {
      const line = c.front === 'n' ? c.z0 : c.z1, back = c.front === 'n' ? c.z1 : c.z0, out = c.front === 'n' ? -1 : 1;
      for (const x of [c.x0, c.x1]) if (!G.partials.some(([p0, p1, q0, q1]) => x > p0 - 0.35 && x < p1 + 0.35 && (q0 + q1) / 2 > Math.min(line, back) && (q0 + q1) / 2 < Math.max(line, back)) && x > R.forrad.x0 + 0.1 && x < R.forrad.x1 - 0.1) meshWall(x, line, x, back);
      const h0 = c.x0 + 0.15, h1 = h0 + ST.door;
      meshWall(c.x0, line, h0, line); meshWall(h1, line, c.x1, line);
      const lg = panel(h0, line, h1, line, F + 2.1, C - 0.02), uv = lg.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ST.door / 0.16, uv.getY(i) * (C - F - 2.1) / 0.16);
      put('mesh', bake(lg, 0xffffff, true), (h0 + h1) / 2, line);
      for (const x of [c.x0, h0, h1, c.x1]) post(x, line);
      this.cageDoors.push({ cage: c, hx: h0, hz: line, dir: [1, 0], out: [0, out], w: ST.door, angle: 0, target: 0, steel: false, max: ST.max });
      put('signs', plate(c.ours ? 'FÖRRÅD 7 · L1007' : `FÖRRÅD ${c.n}`, (h0 + h1) / 2, F + 2.3, line + out * 0.03, facing(0, out), 0.5), (h0 + h1) / 2, line);
    }
    this.contents((kind, g, x, z) => put(kind, g, x, z));
    // the steel doors (the miljörum, the elrum, the basement ↔ garage): a leaf in each such doorway, E opens it
    for (const r of RECTS.filter((q) => q.door)) {
      const along = r.x1 - r.x0 > r.z1 - r.z0, D = r.door; // (a door across a wall along x)
      const line = along ? (r.z0 + r.z1) / 2 : (r.x0 + r.x1) / 2;
      const hx = along ? r[D.hinge] : line, hz = along ? line : r[D.hinge === 'x0' ? 'z0' : 'z1'];
      this.cageDoors.push({ rect: r, name: D.name, hx, hz, dir: along ? [D.hinge === 'x0' ? 1 : -1, 0] : [0, 1], out: along ? [0, D.open] : [D.open, 0], w: along ? r.x1 - r.x0 : r.z1 - r.z0,
        angle: 0, target: 0, steel: true, max: 1.55 });
    }
    // parked cars in the other stalls (instanced like the car park's, #251), the two car-pool cars; their boxes collide
    const Rc = rng(S.seed), mats = [], colors = [], carSegs = [];
    this.carPolys = [];
    for (const s of STALLS) {
      if (s.ours || (!s.pool && Rc() > S.cars)) continue;
      const cx = (s.x0 + s.x1) / 2 + (Rc() - 0.5) * 0.2, cz = s.nose === 'n' ? s.z0 + 2.2 : s.z1 - 2.2, yaw = (s.nose === 'n' ? Math.PI / 2 : -Math.PI / 2) + (Rc() - 0.5) * 0.05;
      mats.push(new THREE.Matrix4().compose(new THREE.Vector3(cx, F, cz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(0.95 + Rc() * 0.08, 0.96 + Rc() * 0.1, 0.97 + Rc() * 0.06)));
      colors.push(s.pool ? 0x2f8f5b : SITE.life.carColors[Math.floor(Rc() * SITE.life.carColors.length)]);
      const q = [[cx - 0.93, cz - 2.18], [cx + 0.93, cz - 2.18], [cx + 0.93, cz + 2.18], [cx - 0.93, cz + 2.18]];
      this.carPolys.push(q); q.forEach((p, i) => carSegs.push([...p, ...q[(i + 1) % 4]]));
    }
    this.carArea = new THREE.Group(); group.add(this.carArea);
    if (mats.length) {
      const [body, trim, glass, tyres2] = carGeometry(), inst = (geo, mat, cols) => {
        const m = new THREE.InstancedMesh(geo, mat, mats.length);
        mats.forEach((x, i) => { m.setMatrixAt(i, x); if (cols) m.setColorAt(i, new THREE.Color(cols[i])); });
        m.computeBoundingSphere();
        return m;
      };
      this.carArea.add(inst(body, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.3 }), colors),
        inst(trim, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.45 })),
        inst(glass, new THREE.MeshStandardMaterial({ color: 0x33495c, roughness: 0.05, metalness: 0.55 })),
        inst(tyres2, new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.85 })));
    }
    // the meshes per area: their colour follows the area's tubes (setLevel)
    const meshTex = meshTexture();
    for (const a of Object.values(this.areas)) {
      a.mats = {
        shell: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }), // (wins over a façade a few cm behind a wall, Hus B's)
        mesh: new THREE.MeshBasicMaterial({ vertexColors: true, map: meshTex, alphaTest: 0.5, side: THREE.DoubleSide }),
        signs: new THREE.MeshBasicMaterial({ vertexColors: true, map: SIGN_TEX.v.tex }),
        tubes: new THREE.MeshBasicMaterial({ color: 0xffffff }),
        floors: a.floors.map((f) => new THREE.MeshBasicMaterial({ vertexColors: true, map: f.tex })),
      };
      const add = (geos, mat) => { if (!geos.length) return; const m = new THREE.Mesh(mergeGeometries(geos), mat); m.raycast = () => {}; a.group.add(m); };
      for (const k of ['shell', 'mesh', 'signs', 'tubes']) add(a.geos[k], a.mats[k]);
      a.floors.forEach((f, i) => add([f.geo], a.mats.floors[i]));
      delete a.geos;
    }
    // the doors: one instanced leaf for the cages (mesh in a steel frame), one for the steel doors; an invisible pick box each
    const leafGeo = (w, h, mesh) => {
      const parts = [];
      if (mesh) {
        const g = new THREE.PlaneGeometry(w, h).translate(w / 2, F + 0.05 + h / 2, 0), uv = g.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 0.16, uv.getY(i) * h / 0.16);
        parts.push(g.toNonIndexed());
        for (const [sx, sy, x, y] of [[0.03, h, 0.015, F + 0.05 + h / 2], [0.03, h, w - 0.015, F + 0.05 + h / 2], [w, 0.03, w / 2, F + 0.065], [w, 0.03, w / 2, F + 0.035 + h], [0.03, 0.12, w - 0.08, F + 1.05]]) {
          const b = new THREE.BoxGeometry(sx, sy, 0.03).translate(x, y, 0).toNonIndexed(), u = b.attributes.uv;
          for (let i = 0; i < u.count; i++) u.setXY(i, 0.5, SOLID_V);
          parts.push(b);
        }
      } else parts.push(new THREE.BoxGeometry(w - 0.02, h, 0.05).translate(w / 2, F + h / 2, 0).toNonIndexed(), new THREE.BoxGeometry(0.03, 0.03, 0.14).translate(w - 0.12, F + 1.05, 0).toNonIndexed());
      parts.forEach((g) => g.deleteAttribute('normal'));
      return mergeGeometries(parts);
    };
    const cages = this.cageDoors.filter((d) => !d.steel), steel = this.cageDoors.filter((d) => d.steel);
    this.leaves = new THREE.InstancedMesh(leafGeo(ST.door, 2.0, true), new THREE.MeshBasicMaterial({ map: meshTex, alphaTest: 0.5, side: THREE.DoubleSide }), cages.length);
    this.steelLeaves = new THREE.InstancedMesh(leafGeo(0.9, 2.05, false), new THREE.MeshBasicMaterial({ color: 0xffffff }), steel.length);
    for (const m of [this.leaves, this.steelLeaves]) { m.raycast = () => {}; m.frustumCulled = false; group.add(m); }
    const pickMat = new THREE.MeshBasicMaterial();
    this.targets = this.cageDoors.map((d) => {
      const inst = d.steel ? this.steelLeaves : this.leaves, list = d.steel ? steel : cages;
      d.inst = inst; d.index = list.indexOf(d);
      inst.setColorAt(d.index, new THREE.Color(d.steel ? 0x7d858b : 0x9aa0a4).multiplyScalar(light(d.hx + d.out[0] * 0.6, F + 1, d.hz + d.out[1] * 0.6)));
      const pivot = new THREE.Object3D(); pivot.position.set(d.hx, 0, d.hz);
      const pick = new THREE.Mesh(new THREE.BoxGeometry(d.w, 2.0, 0.12), pickMat); pick.position.set(d.w / 2, F + 1.05, 0); pick.visible = false;
      pivot.add(pick); group.add(pivot);
      const garage = this;
      const t = { kind: 'cabinet', name: d.steel ? d.name : d.cage.ours ? 'vårt förråd' : `förråd ${d.cage.n}`, pickable: pick, door: d,
        get isOpen() { return d.target > 0; },
        toggle() { d.target = d.target > 0 ? 0 : d.max; garage.sound(d); } };
      pick.userData.door = t;
      d.pivot = pivot;
      this.place(d);
      return t;
    });
    this.walls = segs; // walls, förråd, columns, racks, bins (what a way out must not cross, #314)
    this.segments = [...segs, ...carSegs]; // + the parked cars
    // seen from outside while the entrance is not drawn: a dark opening
    this.blackout = new THREE.Mesh(new THREE.PlaneGeometry(GD.z1 - GD.z0, GD.h).rotateY(Math.PI / 2).translate(GD.x + 0.3, F + GD.h / 2, (GD.z0 + GD.z1) / 2),
      new THREE.MeshBasicMaterial({ color: 0x141618 }));
    this.blackout.raycast = () => {};
    // the pool lights' spots (lights.extra; k: the area's tubes while the visitor is down here)
    this.lamps = AREAS.map((a) => {
      const rs = RECTS.filter((r) => r.area === a).sort((p, q) => (q.x1 - q.x0) * (q.z1 - q.z0) - (p.x1 - p.x0) * (p.z1 - p.z0)), r = rs[0];
      return { pos: new THREE.Vector3((r.x0 + r.x1) / 2, C - 0.4, (r.z0 + r.z1) / 2), intensity: LI.intensity, range: LI.range * 1.6, color: 0xeef3ff, level: 0, k: 0, area: a };
    });
    Object.assign(this, { under: 0, lit: 0, present: false });
    this.door = new GarageDoor(this.areas.entrance.group); // #358
    this.targets.push(...this.door.targets);
    for (const a of Object.values(this.areas)) this.setLevel(a, 0);
  }

  /** Things in the förråd: boxes, bikes, skis, a sled, tyres (baked into the shell). */
  contents(put) {
    const Rn = rng(ST.seed), [frame, tyres] = bikeGeometry();
    const cardboard = [0xb08a5a, 0xa47e4f, 0xbf9a68], plastic = [0x3d6fb0, 0xd9d6cf, 0x4f8a4a, 0x2b2b2b, 0xc0392b];
    for (const c of CAGES) {
      const w = c.x1 - c.x0, d = c.z1 - c.z0, backZ = c.front === 'n' ? c.z1 : c.z0, sg = c.front === 'n' ? -1 : 1; // sg: from the back towards the door
      const P = (a, b) => [c.x0 + a, backZ + sg * b]; // a along the front from x0, b from the back
      const add = (g, col) => put('shell', bake(g, col), c.x0 + w / 2, (c.z0 + c.z1) / 2);
      if (!c.ours && Rn() < 0.2) continue; // an empty one
      let a = w - 0.35;
      while (a > 0.9) { // a stack of boxes along the back, away from the door
        const bw = 0.4 + Rn() * 0.25, n = 1 + Math.floor(Rn() * 3);
        let y = F;
        for (let k = 0; k < n; k++) {
          const h = 0.28 + Rn() * 0.2, col = Rn() < 0.6 ? cardboard[Math.floor(Rn() * 3)] : plastic[Math.floor(Rn() * plastic.length)];
          const [x, z] = P(a - bw / 2, 0.35);
          add(box(bw, h, 0.55, x, y + h / 2, z), col);
          y += h;
        }
        a -= bw + 0.05;
      }
      const r = c.ours ? 0 : Rn(), [ax, az] = P(0.45, d - 0.6);
      if (r < 0.35) { // a bike along the front
        const bz = c.front === 'n' ? c.z0 + 0.45 : c.z1 - 0.45;
        for (const [geo, col] of [[frame, [0x1d3c6e, 0xb02a2a, 0x2a2a2a, 0x3c7a4a][Math.floor(Rn() * 4)]], [tyres, 0x141414]]) add(geo.clone().translate(c.x0 + w / 2, F, bz), col);
      } else if (r < 0.6) { // skis leaning in the corner
        for (const k of [0, 1]) add(box(0.08, 1.7, 0.02, 0, 0.85, 0).rotateZ(0.12).translate(ax + k * 0.1, F, az), [0xd23c3c, 0x2a63c4][k]);
      } else if (r < 0.8) { // a stack of winter tyres
        for (let k = 0; k < 4; k++) add(new THREE.CylinderGeometry(0.31, 0.31, 0.2, 14).translate(ax + 0.1, F + 0.1 + k * 0.21, az), 0x1b1c1e);
      }
      if (c.ours) { // ours: the kids' sled, camping chairs, a bike
        add(box(0.45, 0.12, 0.95, 0, 0, 0).rotateX(-1.2).translate(ax, F + 0.5, az), 0xd8312a);
        for (const k of [0, 1]) add(box(0.5, 0.9, 0.08, ax + 0.6 + k * 0.1, F + 0.45, az - sg * 0.2), 0x2f5d3a);
        const bz = c.front === 'n' ? c.z0 + 0.45 : c.z1 - 0.45;
        add(frame.clone().translate(c.x0 + w / 2 + 0.2, F, bz), 0x6fb7c7); add(tyres.clone().translate(c.x0 + w / 2 + 0.2, F, bz), 0x141414);
      }
    }
  }

  /** Is (x, z) inside the garage, the basement or a room down here? */
  inside(x, z) { return !!rectAt(x, z); }

  /** Room name at (x, z) ('Garage', 'Cykelförråd', 'Förråd', 'Miljörum', 'Elrum', 'Hisshall') or null. */
  roomAt(x, z) { return rectAt(x, z)?.room ?? null; }

  /** The sensor area at (x, z) or null. */
  areaAt(x, z) { return rectAt(x, z)?.area ?? null; }

  /** The doors' collision now (their leaves), the garage door while shut, our car in its stall (#358). */
  dynamic() {
    return [...(this.door?.segments() ?? []), ...(this.extra?.() ?? []), ...this.cageDoors.map((d) => {
      const a = d.angle, dx = d.dir[0] * Math.cos(a) + d.out[0] * Math.sin(a), dz = d.dir[1] * Math.cos(a) + d.out[1] * Math.sin(a);
      return [d.hx, d.hz, d.hx + dx * d.w, d.hz + dz * d.w];
    })];
  }

  /** Closed boxes down here (#314): the parked cars (+ ours, `extraPolys`). */
  obstacles() { return [...this.carPolys, ...(this.extraPolys?.() ?? [])]; }

  place(d) {
    const a = d.angle, dx = d.dir[0] * Math.cos(a) + d.out[0] * Math.sin(a), dz = d.dir[1] * Math.cos(a) + d.out[1] * Math.sin(a), yaw = Math.atan2(-dz, dx);
    d.pivot.rotation.y = yaw; d.pivot.updateMatrix();
    d.inst.setMatrixAt(d.index, new THREE.Matrix4().makeRotationY(yaw).setPosition(d.hx, 0, d.hz));
    d.inst.instanceMatrix.needsUpdate = true;
  }

  sound(d) { const p = { x: d.hx, y: F + 1.1, z: d.hz }; if (d.target > 0) sfx.doorOpen(p); else sfx.doorClose(p, 0.35); }

  /** Is the camera down here, or west of the door where it can look in? (`outside`: the latter) */
  near(cam) {
    const p = cam.position;
    if (p.y < C && this.inside(p.x, p.z)) return true;
    return p.x < GD.x + 0.5 && p.x > GD.x - 60 && Math.abs(p.z - (GD.z0 + GD.z1) / 2) < 25 && p.y < F + 6 ? 'outside' : false;
  }

  setLevel(a, k) {
    a.level = k;
    const v = 0.035 + 0.965 * k;
    for (const m of [a.mats.shell, a.mats.mesh, a.mats.signs, ...a.mats.floors]) m.color.setScalar(v);
    a.mats.tubes.color.setScalar(0.25 + 0.75 * k);
  }

  /** Each frame: the doors swing, the motion sensors, what is drawn, how much daylight is left (`under`). */
  update(dt, player, camera, car = null) {
    this.door.update(dt, player, car);
    for (const d of this.cageDoors) {
      if (Math.abs(d.target - d.angle) < 1e-4) continue;
      d.angle += Math.sign(d.target - d.angle) * Math.min(Math.abs(d.target - d.angle), ST.speed * dt);
      this.place(d);
    }
    const p = player.pos, below = !!player.below;
    const atDoor = p.y < F + 1.5 && Math.hypot(p.x - GD.x, p.z - (GD.z0 + GD.z1) / 2) < LI.sensor;
    this.present = below || atDoor;
    // each area's sensor: the visitor in it or within `sensor` m of one of its rooms (the entrance: also at the door)
    for (const a of Object.values(this.areas)) {
      const sees = (below && RECTS.some((r) => r.area === a.name && inRect(r, p.x, p.z, LI.sensor))) || (a.name === 'entrance' && atDoor);
      if (sees) {
        if (!a.on) { a.on = true; a.flickT = LI.flicker; sfx.click?.({ x: p.x, y: C, z: p.z }); }
        a.hold = LI.hold;
      } else if (a.on && (a.hold -= dt) <= 0) a.on = false;
      let k = a.on ? 1 : Math.max(0, a.level - dt * 2);
      if (a.on && a.flickT > 0) { // a fluorescent starting up: a few blinks
        a.flickT -= dt;
        const t = LI.flicker - a.flickT;
        k = t < 0.08 || (t > 0.2 && t < 0.28) || (t > 0.42 && t < 0.5) ? 0.9 : t < LI.flicker ? 0.15 : 1;
      }
      if (Math.abs(k - a.level) > 1e-3) this.setLevel(a, k);
    }
    this.on = Object.values(this.areas).some((a) => a.on);
    this.level = Math.max(...Object.values(this.areas).map((a) => a.level));
    for (const l of this.lamps) l.k = below ? this.areas[l.area].level : 0;
    // drawn: everything while the camera is down here; only the entrance hall (+ the cars) from outside the door
    const vis = this.near(camera);
    this.object.visible = !!vis;
    for (const a of Object.values(this.areas)) a.group.visible = vis === true || a.name === 'entrance';
    this.blackout.visible = !vis;
    // the daylight down here: none deep inside, some by the open door
    const want = below ? LI.dim * THREE.MathUtils.clamp((p.x - GD.x) / 7, 0, 1) : 0;
    this.under += (want - this.under) * Math.min(1, dt * 4);
    if (Math.abs(want - this.under) < 1e-3) this.under = want;
    // the tubes' light on the lit materials (the cars, #440): the visitor's area's tubes, as far in as the daylight is cut
    const here = below ? this.areas[this.areaAt(p.x, p.z) ?? 'entrance'] : null;
    this.lit = here ? here.level * (this.under / LI.dim) : 0;
  }
}

/** The ribbed panels of the garage door. */
function ribTexture() {
  const c = document.createElement('canvas'); c.width = 16; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#e4e5e2'; g.fillRect(0, 0, 16, 64);
  g.fillStyle = '#b9bcbc'; for (let y = 0; y < 64; y += 16) g.fillRect(0, y, 16, 2);
  g.fillStyle = '#9a9d9e'; g.fillRect(0, 62, 16, 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * The garage door (#358, GARAGE.door): a sectional door in the opening (terrain.garageDoor). Its panels run up on
 * tracks and in under the ceiling (one InstancedMesh); a button on a post outside and one inside (E), an amber
 * warning light that blinks while it moves, the motor's sound. `t` 0 shut … 1 open; it shuts by itself after `auto` s
 * unless the visitor or our car is in the opening, and opens again if one comes into it while it shuts. While shut
 * (below `passable`) it is a wall (`segments`).
 */
export class GarageDoor {
  constructor(inside) {
    const D = G.door, N = D.sections, w = GD.z1 - GD.z0;
    this.object = new THREE.Group();
    this.sh = GD.h / N; this.xd = GD.x + 0.1;
    const panel = new THREE.BoxGeometry(0.045, this.sh - 0.004, w - 0.02).translate(0, this.sh / 2, 0);
    { const uv = panel.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i)); }
    this.panels = new THREE.InstancedMesh(panel, new THREE.MeshStandardMaterial({ map: ribTexture(), roughness: 0.55, metalness: 0.25 }), N);
    this.panels.castShadow = this.panels.receiveShadow = true;
    this.object.add(this.panels);
    // the warning lights (outside over the door's north corner, inside the same) and the buttons
    this.lampMat = new THREE.MeshStandardMaterial({ color: 0x8a5a10, emissive: 0xffa21a, emissiveIntensity: 0, roughness: 0.4 });
    const grey = new THREE.MeshStandardMaterial({ color: 0x5d6266, roughness: 0.6, metalness: 0.3 });
    const btnMat = new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.5 });
    const mk = (geo, mat, parent, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
    mk(new THREE.BoxGeometry(0.1, 0.12, 0.16), this.lampMat, this.object, GD.x - 0.09, F + GD.h + 0.18, GD.z0 - 0.35);
    mk(new THREE.BoxGeometry(0.1, 0.12, 0.16), this.lampMat, inside, ENTR.x0 + 0.06, F + 2.35, GD.z1 + 0.5);
    const [px, pz] = D.post, [ix, iz] = D.inside;
    mk(new THREE.BoxGeometry(0.1, 1.1, 0.1), grey, this.object, px, westYAt(px, pz) + 0.55, pz);
    // (#439: the housing and the button on the post's west face, towards whoever comes down the drive)
    mk(new THREE.BoxGeometry(0.06, 0.2, 0.16), grey, this.object, px - 0.05, westYAt(px, pz) + 1.05, pz);
    const outBtn = mk(new THREE.BoxGeometry(0.03, 0.07, 0.07), btnMat, this.object, px - 0.09, westYAt(px, pz) + 1.06, pz);
    mk(new THREE.BoxGeometry(0.03, 0.2, 0.14), grey, inside, ix + 0.015, F + 1.2, iz);
    const inBtn = mk(new THREE.BoxGeometry(0.03, 0.07, 0.07), btnMat, inside, ix + 0.04, F + 1.21, iz);
    const door = this;
    this.targets = [outBtn, inBtn].map((pick) => {
      const t = { kind: 'garagebutton', name: 'knappen till garageporten', verb: 'trycka på', pickable: pick, press() { door.toggle(); } };
      pick.userData.door = t;
      return t;
    });
    Object.assign(this, { t: 0, target: 0, autoT: 0, blinkT: 0, motor: null, presses: 0 });
    this.place();
  }

  get isOpen() { return this.t >= 1 - 1e-6; }
  get moving() { return this.t !== this.target; }

  open() { if (this.target !== 1) { this.target = 1; this.start(); } this.autoT = G.door.auto; }
  close() { if (this.target !== 0) { this.target = 0; this.start(); } }
  toggle() { this.presses++; sfx.click({ x: GD.x, y: F + 1.2, z: GD.z1 }); if (this.target > 0) this.close(); else this.open(); }
  start() { if (!this.motor) this.motor = sfx.garageMotor?.({ x: GD.x, y: F + GD.h, z: (GD.z0 + GD.z1) / 2 }) ?? null; }

  /** In the way while it is too low to walk / drive under. */
  segments() { return this.t < G.door.passable ? [[GD.x, GD.z0, GD.x, GD.z1]] : []; }

  /** Where along the track a point `u` m from the sill is: the vertical run, then in under the ceiling. */
  track(u) { return u <= GD.h ? [this.xd, F + u] : [this.xd + (u - GD.h), F + GD.h + 0.02]; }

  place() {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), zc = (GD.z0 + GD.z1) / 2, one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < G.door.sections; i++) {
      const u = i * this.sh + this.t * GD.h, [ax, ay] = this.track(u), [bx, by] = this.track(u + this.sh);
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(-(bx - ax), by - ay));
      this.panels.setMatrixAt(i, m.compose(new THREE.Vector3(ax, ay, zc), q, one));
    }
    this.panels.instanceMatrix.needsUpdate = true;
  }

  /** Someone / something in the opening (a strip either side of the door line)? */
  inOpening(x, z, y, r = 0.6) { return Math.abs(x - GD.x) < r + 0.3 && z > GD.z0 - 0.2 && z < GD.z1 + 0.2 && y < F + GD.h; }

  update(dt, player, car) {
    const p = player.pos;
    const busy = this.inOpening(p.x, p.z, p.y) || (car && car.inOpening?.());
    if (this.target === 0 && this.t > 0 && busy) this.open(); // never down on the visitor or the car (#314)
    if (this.isOpen && this.target === 1) {
      if (busy || car?.wantsDoor?.()) this.autoT = G.door.auto;
      else if ((this.autoT -= dt) <= 0) this.close();
    }
    if (this.moving) {
      const step = dt / G.door.seconds;
      this.t = this.target > this.t ? Math.min(this.target, this.t + step) : Math.max(this.target, this.t - step);
      this.place();
      this.blinkT += dt;
      if (!this.moving) { this.motor?.stop(); this.motor = null; sfx.click({ x: GD.x, y: F + GD.h, z: (GD.z0 + GD.z1) / 2 }); }
    }
    this.lampMat.emissiveIntensity = this.moving && Math.floor(this.blinkT * 2.5) % 2 === 0 ? 2.2 : 0;
  }

  /** For a reload record: > 0 opening / open (at t), < 0 shutting (at −t), 0 shut. */
  saveState() { const t = Math.round(this.t * 1000) / 1000; return this.target > 0 ? Math.max(0.001, t) : t > 0 ? -t : 0; }
  /** Back as saved: `v` > 0 opening / open at |v|, < 0 shutting at |v|. */
  loadState(v) {
    if (!Number.isFinite(v) || v === 0) return;
    this.t = Math.min(1, Math.abs(v)); this.target = v > 0 ? 1 : 0;
    if (this.target === 1) this.autoT = G.door.auto;
    this.place();
  }
}
