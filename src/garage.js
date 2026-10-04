import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GARAGE as G, SITE } from './config.js';
import { carGeometry, bikeGeometry } from './streetlife.js';
import { sfx } from './audio.js';

// The garage and the storage rooms under the courtyard (#357, GARAGE in config — every number there is a guess: Peab has
// no garage plan). A hall south of Hus C behind the garage door (SITE.terrain.garageDoor) with an aisle and a row of
// stalls each side (painted lines and numbers, columns, parked cars, our own stall), a corridor of mesh-walled förråd
// (doors that open with E, things inside) north and then east to a lift / stair lobby under Hus L's stair core.
// Walking: the visitor is `below` (player.js) inside these rectangles at the floor's height; then this module's segments
// are the collision (not the courtyard's). Drawing: the shell, floors, cages, signs and tubes are MeshBasic with the
// fluorescent light baked into vertex colours (the materials' colour = how far the tubes are on), a handful of draw
// calls, and the group is only drawn when the camera is down here or west of the door looking in (`near`). The parked
// cars are lit by a few pool lights (lights.extra, no PointLight of our own) while the rest of the daylight is cut
// (DayCycle.under).

const T = SITE.terrain, GD = T.garageDoor, F = G.floor, C = G.ceiling, S = G.stalls, ST = G.storage, LI = G.lights;
const HALL = G.hall, DOORWAY = { x0: G.doorway.x0, x1: G.doorway.x1, z0: GD.z0, z1: GD.z1 };

/** The förråd: { n, x0, x1, z0, z1, front: 'n' | 'e', ours } — `e` along legE's south side, `n` along legN's west side. */
export const CAGES = [
  ...Array.from({ length: ST.e.n }, (_, i) => ({ n: i + 1, x0: ST.e.x0 + i * ST.w, x1: ST.e.x0 + (i + 1) * ST.w, z0: ST.e.z0, z1: ST.e.z0 + ST.d, front: 'n' })),
  ...Array.from({ length: ST.n.n }, (_, i) => ({ n: ST.e.n + i + 1, x0: ST.n.x1 - ST.d, x1: ST.n.x1, z0: ST.n.z0 + i * ST.w, z1: ST.n.z0 + (i + 1) * ST.w, front: 'e' })),
].map((c) => ({ ...c, ours: c.n === ST.ours }));

/** The stalls: { n, x0, x1, z0, z1, row: 'n' | 's', ours }. */
export const STALLS = [
  ...Array.from({ length: S.north }, (_, i) => ({ n: i + 1, x0: S.x0 + i * S.w, x1: S.x0 + (i + 1) * S.w, z0: HALL.z0, z1: HALL.z0 + S.d[0], row: 'n' })),
  ...Array.from({ length: S.south }, (_, i) => ({ n: S.north + i + 1, x0: S.x0 + i * S.w, x1: S.x0 + (i + 1) * S.w, z0: HALL.z1 - S.d[1], z1: HALL.z1, row: 's' })),
].map((s) => ({ ...s, ours: s.n === S.ours }));

/** Where the tubes hang (plan x, z; `ax` = along x). */
const TUBES = [
  ...[39.3, 44.4, 49.5].flatMap((z) => [-66, -60.5, -55, -49.5, -44.5].map((x) => ({ x, z, ax: false }))),
  ...[17.5, 22, 26.5, 31, 35].map((z) => ({ x: (G.legN.x0 + G.legN.x1) / 2, z, ax: false })),
  ...[-42, -37.5, -33, -28.5, -24].map((x) => ({ x, z: (G.legE.z0 + G.legE.z1) / 2, ax: true })),
  { x: -17, z: 15.2, ax: true },
];
const TUBE_Y = C - 0.09;

/** The baked fluorescent light at a point (0 … ~1.15). */
function light(x, y, z) {
  let s = LI.amb;
  for (const t of TUBES) s += 0.8 / (1 + ((x - t.x) ** 2 + ((y - TUBE_Y) * 1.3) ** 2 + (z - t.z) ** 2) / (LI.r * LI.r));
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

/** The hall's floor: concrete with the stall lines, numbers, our stall's reservation and the arrows (one canvas). */
const PPM = 40; // px per metre
function floorTexture() {
  const x0 = DOORWAY.x0, w = HALL.x1 - x0, d = HALL.z1 - HALL.z0;
  const c = document.createElement('canvas'); c.width = Math.round(w * PPM); c.height = Math.round(d * PPM);
  const g = c.getContext('2d'), R = rng(5);
  g.fillStyle = '#8e8f8c'; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 9000; i++) { const v = 120 + Math.floor(R() * 40); g.fillStyle = `rgba(${v},${v},${v - 4},0.35)`; g.fillRect(R() * c.width, R() * c.height, 2 + R() * 3, 2 + R() * 3); }
  g.fillStyle = 'rgba(60,60,58,0.18)'; // tyre tracks along the aisle
  for (const dz of [-1.1, 1.1]) g.fillRect(0, (44.4 + dz - HALL.z0 - 0.35) * PPM, c.width, 0.7 * PPM);
  const X = (x) => (x - x0) * PPM, Z = (z) => (z - HALL.z0) * PPM;
  g.fillStyle = '#ecebe4';
  for (const s of STALLS) { // the side lines (both ends of each row) and the numbers at the aisle end
    for (const x of [s.x0, s.x1]) g.fillRect(X(x) - 0.06 * PPM, Z(s.z0), 0.12 * PPM, (s.z1 - s.z0) * PPM);
  }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const s of STALLS) {
    const cx = X((s.x0 + s.x1) / 2), front = s.row === 'n' ? s.z1 - 0.7 : s.z0 + 0.7, back = s.row === 'n' ? s.z0 + 1.6 : s.z1 - 1.6;
    g.save(); g.translate(cx, Z(front)); if (s.row === 's') g.rotate(Math.PI);
    g.fillStyle = '#ecebe4'; g.font = `bold ${0.7 * PPM}px sans-serif`; g.fillText(String(s.n), 0, 0);
    g.restore();
    if (s.ours) { // reserved for L1007
      g.save(); g.translate(cx, Z(back)); if (s.row === 's') g.rotate(Math.PI);
      g.fillStyle = '#f2c230'; g.font = `bold ${0.36 * PPM}px sans-serif`; g.fillText('L1007', 0, 0);
      g.font = `bold ${0.2 * PPM}px sans-serif`; g.fillText('RESERVERAD', 0, 0.42 * PPM);
      g.restore();
      g.strokeStyle = '#f2c230'; g.lineWidth = 0.08 * PPM; g.strokeRect(X(s.x0) + 0.2 * PPM, Z(s.z0) + 0.2 * PPM, (s.x1 - s.x0 - 0.4) * PPM, (s.z1 - s.z0 - 0.4) * PPM);
    }
  }
  // arrows along the aisle: in towards the east, out towards the door
  g.fillStyle = '#ecebe4';
  const arrow = (x, z, dir) => { g.save(); g.translate(X(x), Z(z)); g.scale(dir, 1); g.beginPath();
    g.moveTo(0.9 * PPM, 0); g.lineTo(0.1 * PPM, -0.45 * PPM); g.lineTo(0.1 * PPM, -0.18 * PPM); g.lineTo(-0.9 * PPM, -0.18 * PPM);
    g.lineTo(-0.9 * PPM, 0.18 * PPM); g.lineTo(0.1 * PPM, 0.18 * PPM); g.lineTo(0.1 * PPM, 0.45 * PPM); g.closePath(); g.fill(); g.restore(); };
  for (const x of [-64, -52, -46]) { arrow(x, 45.6, 1); arrow(x + 3, 43.1, -1); }
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

/** Signs: one atlas of white-on-blue plates (cells of 256 × 64). */
const SIGNS = ['FÖRRÅD · HISS', 'HISS', 'TRAPPHUS L', 'UTFART', 'GARAGE', ...CAGES.map((c) => (c.ours ? 'FÖRRÅD 7 · L1007' : `FÖRRÅD ${c.n}`))];
function signTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 64 * Math.ceil(SIGNS.length / 4);
  const g = c.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  SIGNS.forEach((s, i) => {
    const x = (i % 4) * 256, y = Math.floor(i / 4) * 64;
    g.fillStyle = s.startsWith('UTFART') ? '#1d7a3a' : '#21508c'; g.fillRect(x, y, 256, 64);
    g.strokeStyle = '#f4f4f0'; g.lineWidth = 3; g.strokeRect(x + 5, y + 5, 246, 54);
    g.fillStyle = '#f4f4f0'; g.font = `bold ${s.length > 12 ? 24 : 32}px sans-serif`; g.fillText(s, x + 128, y + 33);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return { tex: t, rows: c.height / 64 };
}

export class Garage {
  constructor() {
    const group = new THREE.Group(), shell = [], mesh = [], signs = [], tubes = [], segs = [];
    this.object = group;
    this.rects = [HALL, DOORWAY, G.legN, G.legE, G.lobby, ...CAGES];
    const rooms = [[HALL, 'Garage'], [DOORWAY, 'Garage'], [G.lobby, 'Hisshall'], [G.legN, 'Förråd'], [G.legE, 'Förråd'], ...CAGES.map((c) => [c, 'Förråd'])];
    this.rooms = rooms;
    this.roomNames = [...new Set(rooms.map((r) => r[1]))];
    const WALL_LO = 0x7f8a90, WALL = 0xc6c4bd, CEIL = 0xb7b5b0, FLOOR = 0x8d8e8b;
    // a concrete wall: a painted band below, light concrete above (both collision and picture)
    const wall = (ax, az, bx, bz, coll = true) => {
      shell.push(bake(panel(ax, az, bx, bz, F, F + 1.0), WALL_LO), bake(panel(ax, az, bx, bz, F + 1.0, C), WALL));
      if (coll) seg(segs, ax, az, bx, bz);
    };
    const H = HALL, N = G.legN, E = G.legE, L = G.lobby;
    // the hall: the west wall with the door, the north wall with the corridor's opening, east, south
    wall(H.x0, H.z0, H.x0, GD.z0); wall(H.x0, GD.z1, H.x0, H.z1);
    shell.push(bake(panel(H.x0, GD.z0, H.x0, GD.z1, F + GD.h, C), WALL)); // over the door
    wall(DOORWAY.x0, GD.z0, DOORWAY.x1, GD.z0); wall(DOORWAY.x0, GD.z1, DOORWAY.x1, GD.z1); // the jambs
    wall(H.x0, H.z0, N.x0, H.z0); wall(N.x1, H.z0, H.x1, H.z0);
    shell.push(bake(panel(N.x0, H.z0, N.x1, H.z0, F + 2.2, C), WALL)); // over the opening
    wall(H.x1, H.z0, H.x1, H.z1); wall(H.x0, H.z1, H.x1, H.z1);
    // the corridor: legN (its west side: the n-förråd's fronts between their ends), legE (its south side: the e-förråd's)
    const nCages = CAGES.filter((c) => c.front === 'e'), eCages = CAGES.filter((c) => c.front === 'n');
    const nz0 = Math.min(...nCages.map((c) => c.z0)), nz1 = Math.max(...nCages.map((c) => c.z1));
    wall(N.x0, N.z0, N.x0, nz0); wall(N.x0, nz1, N.x0, N.z1);
    wall(N.x1, N.z0 + ST.d, N.x1, N.z1); // (z0 … z0 + d: the first e-förråd's west wall, below)
    wall(E.x0, E.z0, L.x0, E.z0); wall(E.x0, E.z0, E.x0, E.z1);
    // the lobby: the lift and the stairwell door in its north wall (under Hus L's core, by the portik)
    wall(L.x0, L.z0, L.x1, L.z0); wall(L.x1, L.z0, L.x1, L.z1); wall(L.x1, L.z1, L.x0, L.z1); wall(L.x0, E.z1 + ST.d, L.x0, L.z1);
    // the förråd: concrete backs (and the row's outer ends), wire-mesh partitions and fronts with a door each
    this.cageDoors = [];
    const meshWall = (ax, az, bx, bz) => { // wire mesh to the ceiling, a steel frame round it
      const len = Math.hypot(bx - ax, bz - az), g = panel(ax, az, bx, bz, F + 0.05, C - 0.02);
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 0.16, uv.getY(i) * (C - F) / 0.16);
      mesh.push(bake(g, 0xffffff, true));
      seg(segs, ax, az, bx, bz);
    };
    const post = (x, z) => mesh.push(solid(box(0.04, C - F, 0.04, x, (F + C) / 2, z)));
    const solid = (g) => { g = bake(g, 0x9aa0a4, true); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5, SOLID_V); return g; };
    for (const c of CAGES) {
      const along = c.front === 'n', a0 = along ? c.x0 : c.z0, a1 = along ? c.x1 : c.z1, line = along ? c.z0 : c.x1;
      const P = (a, b = line) => (along ? [a, b] : [b, a]); // (along the front, across) → plan
      // the back wall (concrete) and the ends of each row (concrete where they meet a corridor wall)
      if (along) wall(c.x0, c.z1, c.x1, c.z1); else wall(c.x0, c.z0, c.x0, c.z1);
      const back = along ? c.z1 : c.x0;
      const first = along ? c === eCages[0] : c === nCages[0], last = along ? c === eCages.at(-1) : c === nCages.at(-1);
      if (first) wall(...P(a0), ...P(a0, back)); else meshWall(...P(a0), ...P(a0, back));
      if (last) wall(...P(a1), ...P(a1, back));
      // the front: mesh either side of the door (hinged `door` from its a0 end + 0.15), a lintel over it
      const h0 = a0 + 0.15, h1 = h0 + ST.door;
      meshWall(...P(a0), ...P(h0)); meshWall(...P(h1), ...P(a1));
      const lg = panel(...P(h0), ...P(h1), F + 2.1, C - 0.02), uv = lg.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ST.door / 0.16, uv.getY(i) * (C - F - 2.1) / 0.16);
      mesh.push(bake(lg, 0xffffff, true));
      for (const a of [a0, h0, h1, a1]) post(...P(a));
      // the door: hinge at h0, shut along +a, opens outwards (into the corridor)
      const [hx, hz] = P(h0), dir = along ? [1, 0] : [0, 1], out = along ? [0, -1] : [1, 0];
      this.cageDoors.push({ cage: c, hx, hz, dir, out, angle: 0, target: 0 });
      // its plate over the door, facing the corridor
      const [px, pz] = P((h0 + h1) / 2, line + (along ? -0.03 : 0.03));
      signs.push(this.plate(SIGNS.indexOf(c.ours ? 'FÖRRÅD 7 · L1007' : `FÖRRÅD ${c.n}`), px, F + 2.3, pz, along ? Math.PI : Math.PI / 2, 0.5));
    }
    // floors and ceilings
    const floorTex = floorTexture(), fl = flat(DOORWAY.x0, H.x1, H.z0, H.z1, F + 0.003, 1.0);
    this.floorGeo = bake(fl, 0xffffff, true);
    for (const r of [N, E, L, ...CAGES]) shell.push(bake(flat(r.x0, r.x1, r.z0, r.z1, F + 0.003), FLOOR));
    for (const r of [H, DOORWAY, N, E, L, ...CAGES]) shell.push(bake(flat(r.x0, r.x1, r.z0, r.z1, C), CEIL));
    // columns on the stall lines at the aisle: concrete with a yellow foot band
    const K = G.columns;
    for (const x of K.xs) for (const z of K.zs) {
      const zc = z < 44 ? z - K.size / 2 : z + K.size / 2;
      shell.push(bake(box(K.size, 0.35, K.size, x, F + 0.175, zc), 0xe0b52a), bake(box(K.size, C - F - 0.35, K.size, x, (F + 0.35 + C) / 2, zc), 0xc9c7c0));
      rectSegs(segs, x - K.size / 2, x + K.size / 2, zc - K.size / 2, zc + K.size / 2);
    }
    // wheel stops at the back of each stall, a ventilation duct and a sprinkler main under the ceiling
    for (const s of STALLS) shell.push(bake(box(1.6, 0.1, 0.15, (s.x0 + s.x1) / 2, F + 0.05, s.row === 'n' ? s.z0 + 0.6 : s.z1 - 0.6), 0x5b5e60));
    shell.push(bake(new THREE.CylinderGeometry(0.22, 0.22, H.x1 - H.x0, 12, 1, true).rotateZ(Math.PI / 2).translate((H.x0 + H.x1) / 2, C - 0.32, 39.6), 0xa7abae));
    shell.push(bake(new THREE.CylinderGeometry(0.22, 0.22, N.z1 - E.z0 - 0.4, 12, 1, true).rotateX(Math.PI / 2).translate(N.x0 + 0.5, C - 0.3, (E.z0 + N.z1) / 2 + 0.2), 0xa7abae));
    shell.push(bake(new THREE.CylinderGeometry(0.035, 0.035, H.x1 - H.x0, 6).rotateZ(Math.PI / 2).translate((H.x0 + H.x1) / 2, C - 0.12, 45.7), 0xb3261e));
    // the lobby: the lift (steel doors, a frame, a call button) and the stairwell's door, both in its north wall
    const ly = L.z0 + 0.03;
    shell.push(bake(box(1.3, 2.25, 0.04, L.lift, F + 1.125, ly), 0x6d7378), bake(box(0.92, 2.05, 0.05, L.lift, F + 1.03, ly + 0.01), 0xb9bec2),
      bake(box(0.012, 2.05, 0.06, L.lift, F + 1.03, ly + 0.012), 0x55595d), bake(box(0.09, 0.16, 0.04, L.lift + 0.85, F + 1.1, ly), 0xd9dcde),
      bake(box(1.04, 2.12, 0.04, L.stair, F + 1.06, ly), 0x5e6266), bake(box(0.92, 2.06, 0.05, L.stair, F + 1.03, ly + 0.01), 0x8a6f4d),
      bake(box(0.14, 0.03, 0.06, L.stair + 0.33, F + 1.05, ly + 0.05), 0xc8cccf), bake(box(0.6, 0.45, 0.01, L.stair, F + 1.55, ly + 0.04), 0xdfe0dc));
    const lyBtn = bake(box(0.04, 0.04, 0.02, L.lift + 0.85, F + 1.12, ly + 0.03), 0xff9a2a); shell.push(lyBtn);
    signs.push(this.plate(SIGNS.indexOf('HISS'), L.lift, F + 2.45, ly + 0.03, 0, 0.6), this.plate(SIGNS.indexOf('TRAPPHUS L'), L.stair, F + 2.35, ly + 0.03, 0, 0.6),
      this.plate(SIGNS.indexOf('FÖRRÅD · HISS'), (N.x0 + N.x1) / 2, F + 2.45, H.z0 + 0.03, 0, 0.9),
      this.plate(SIGNS.indexOf('UTFART'), H.x0 + 0.03, F + GD.h + 0.12, (GD.z0 + GD.z1) / 2, Math.PI / 2, 0.8),
      this.plate(SIGNS.indexOf('GARAGE'), (N.x0 + N.x1) / 2, F + 2.45, H.z0 - 0.03, Math.PI, 0.7));
    // the tubes: housings (shell) and the tubes themselves (lit)
    for (const t of TUBES) {
      const [sx, sz] = t.ax ? [1.3, 0.15] : [0.15, 1.3];
      shell.push(bake(box(sx, 0.07, sz, t.x, C - 0.035, t.z), 0xdedede));
      tubes.push(box(t.ax ? 1.22 : 0.07, 0.035, t.ax ? 0.07 : 1.22, t.x, TUBE_Y, t.z));
    }
    // what stands in the förråd (seeded): moving boxes, plastic boxes, a bike or two, skis, a sled, tyres, a suitcase
    this.contents(shell);
    // parked cars in the other stalls (instanced like the car park's, #251), nose to the wall; their boxes collide
    const R = rng(S.seed), mats = [], colors = [], carSegs = [];
    this.carPolys = [];
    for (const s of STALLS) {
      if (s.ours || R() > S.cars) continue;
      const cx = (s.x0 + s.x1) / 2 + (R() - 0.5) * 0.2, cz = s.row === 'n' ? s.z0 + 2.4 : s.z1 - 2.5, yaw = (s.row === 'n' ? Math.PI / 2 : -Math.PI / 2) + (R() - 0.5) * 0.05;
      mats.push(new THREE.Matrix4().compose(new THREE.Vector3(cx, F, cz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(0.95 + R() * 0.08, 0.96 + R() * 0.1, 0.97 + R() * 0.06)));
      colors.push(SITE.life.carColors[Math.floor(R() * SITE.life.carColors.length)]);
      const q = [[cx - 0.93, cz - 2.18], [cx + 0.93, cz - 2.18], [cx + 0.93, cz + 2.18], [cx - 0.93, cz + 2.18]];
      this.carPolys.push(q); q.forEach((p, i) => carSegs.push([...p, ...q[(i + 1) % 4]]));
    }
    if (mats.length) {
      const [body, trim, glass, tyres] = carGeometry(), inst = (geo, mat, cols) => {
        const m = new THREE.InstancedMesh(geo, mat, mats.length);
        mats.forEach((x, i) => { m.setMatrixAt(i, x); if (cols) m.setColorAt(i, new THREE.Color(cols[i])); });
        return m;
      };
      group.add(inst(body, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.3 }), colors),
        inst(trim, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.45 })),
        inst(glass, new THREE.MeshStandardMaterial({ color: 0x33495c, roughness: 0.05, metalness: 0.55 })),
        inst(tyres, new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.85 })));
    }
    // the meshes: lit = their colour follows the tubes (update)
    this.mats = {
      shell: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
      floor: new THREE.MeshBasicMaterial({ vertexColors: true, map: floorTex }),
      mesh: new THREE.MeshBasicMaterial({ vertexColors: true, map: meshTexture(), alphaTest: 0.5, side: THREE.DoubleSide }),
      door: new THREE.MeshBasicMaterial({ map: null, alphaTest: 0.5, side: THREE.DoubleSide }),
      signs: new THREE.MeshBasicMaterial({ vertexColors: true, map: this.signTex.tex }),
      tubes: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    };
    this.mats.door.map = this.mats.mesh.map;
    const add = (geos, mat) => { const m = new THREE.Mesh(mergeGeometries(geos), mat); m.raycast = () => {}; group.add(m); return m; };
    add(shell, this.mats.shell); add([this.floorGeo], this.mats.floor); add(mesh, this.mats.mesh); add(signs, this.mats.signs); add(tubes, this.mats.tubes);
    // the förråd doors: one instanced leaf (mesh in a steel frame) + an invisible pick box each (E opens it)
    const leaf = [], LW = ST.door, LH = 2.0;
    { const g = new THREE.PlaneGeometry(LW, LH).translate(LW / 2, F + 0.05 + LH / 2, 0), uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * LW / 0.16, uv.getY(i) * LH / 0.16);
      leaf.push(g);
      for (const [sx, sy, x, y] of [[0.03, LH, 0.015, F + 0.05 + LH / 2], [0.03, LH, LW - 0.015, F + 0.05 + LH / 2], [LW, 0.03, LW / 2, F + 0.065], [LW, 0.03, LW / 2, F + 0.035 + LH], [0.03, 0.12, LW - 0.08, F + 1.05]]) {
        const b = new THREE.BoxGeometry(sx, sy, 0.03).translate(x, y, 0).toNonIndexed(), u = b.attributes.uv;
        for (let i = 0; i < u.count; i++) u.setXY(i, 0.5, SOLID_V);
        b.deleteAttribute('normal'); leaf.push(b);
      } }
    leaf.forEach((g, i) => { if (g.index) leaf[i] = g.toNonIndexed(); leaf[i].deleteAttribute('normal'); });
    this.leaves = new THREE.InstancedMesh(mergeGeometries(leaf), this.mats.door, this.cageDoors.length);
    this.leaves.raycast = () => {};
    group.add(this.leaves);
    const pickMat = new THREE.MeshBasicMaterial();
    this.targets = this.cageDoors.map((d, i) => {
      this.leaves.setColorAt(i, new THREE.Color(0x9aa0a4).multiplyScalar(light(d.hx, F + 1, d.hz)));
      const pivot = new THREE.Object3D(); pivot.position.set(d.hx, 0, d.hz);
      const pick = new THREE.Mesh(new THREE.BoxGeometry(LW, LH, 0.12), pickMat); pick.position.set(LW / 2, F + 0.05 + LH / 2, 0); pick.visible = false;
      pivot.add(pick); group.add(pivot);
      const garage = this;
      const t = { kind: 'cabinet', name: d.cage.ours ? 'vårt förråd' : `förråd ${d.cage.n}`, pickable: pick, door: d,
        get isOpen() { return d.target > 0; },
        toggle() { d.target = d.target > 0 ? 0 : ST.max; garage.sound(d); } };
      pick.userData.door = t;
      d.pivot = pivot; d.index = i;
      this.place(d);
      return t;
    });
    this.walls = segs; // walls, förråd, columns (what a way out must not cross, #314)
    this.segments = [...segs, ...carSegs]; // + the parked cars
    // seen from outside while the group is not drawn: a dark opening
    this.blackout = new THREE.Mesh(new THREE.PlaneGeometry(GD.z1 - GD.z0, GD.h).rotateY(Math.PI / 2).translate(GD.x + 0.1, F + GD.h / 2, (GD.z0 + GD.z1) / 2),
      new THREE.MeshBasicMaterial({ color: 0x141618 }));
    this.blackout.raycast = () => {};
    // the pool lights' spots (lights.extra; k: on while the visitor is down here)
    this.lamps = [[-65, 44], [-55.5, 44], [-46, 44], [-43.5, 26], [-32, 14], [-17, 15.2]].map(([x, z]) => ({ pos: new THREE.Vector3(x, C - 0.4, z), intensity: LI.intensity, range: LI.range, color: 0xeef3ff, level: 0, k: 0 }));
    Object.assign(this, { on: false, level: 0, hold: 0, flickT: 0, under: 0, present: false });
    this.setLevel(0);
  }

  /** A sign plate (atlas cell `i`) centred at (x, y, z), turned `ry`, `w` m wide (4:1). */
  plate(i, x, y, z, ry, w) {
    this.signTex ??= signTexture();
    const g = new THREE.PlaneGeometry(w, w / 4).rotateY(ry).translate(x, y, z), uv = g.attributes.uv, rows = this.signTex.rows;
    const u0 = (i % 4) / 4, v0 = 1 - (Math.floor(i / 4) + 1) / rows;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) / 4, v0 + uv.getY(k) / rows);
    return bake(g, 0xffffff, true);
  }

  /** Things in the förråd: boxes, bikes, skis, a sled, tyres (baked into the shell). */
  contents(shell) {
    const R = rng(ST.seed), [frame, tyres] = bikeGeometry();
    const cardboard = [0xb08a5a, 0xa47e4f, 0xbf9a68], plastic = [0x3d6fb0, 0xd9d6cf, 0x4f8a4a, 0x2b2b2b, 0xc0392b];
    for (const c of CAGES) {
      const along = c.front === 'n', w = along ? c.x1 - c.x0 : c.z1 - c.z0, d = along ? c.z1 - c.z0 : c.x1 - c.x0;
      const P = (a, b) => (along ? [c.x0 + a, c.z1 - b] : [c.x0 + b, c.z0 + a]); // a along the front from its a0 end, b from the back
      if (!c.ours && R() < 0.2) continue; // an empty one
      // a stack of boxes along the back, away from the door
      let a = w - 0.35;
      while (a > 0.9) {
        const bw = 0.4 + R() * 0.25, n = 1 + Math.floor(R() * 3);
        let y = F;
        for (let k = 0; k < n; k++) {
          const h = 0.28 + R() * 0.2, col = R() < 0.6 ? cardboard[Math.floor(R() * 3)] : plastic[Math.floor(R() * plastic.length)];
          const [x, z] = P(a - bw / 2, 0.35);
          shell.push(bake(box(along ? bw : 0.55, h, along ? 0.55 : bw, x, y + h / 2, z), col));
          y += h;
        }
        a -= bw + 0.05;
      }
      // something tall in the free corner: a bike, skis, a rolled rug
      const r = c.ours ? 0 : R(), [ax, az] = P(0.45, d - 0.6);
      if (r < 0.35) { // a bike, along the front
        for (const [geo, col] of [[frame, [0x1d3c6e, 0xb02a2a, 0x2a2a2a, 0x3c7a4a][Math.floor(R() * 4)]], [tyres, 0x141414]]) {
          const g = geo.clone().rotateY(along ? 0 : -Math.PI / 2).translate(...(along ? [c.x0 + w / 2, F, c.z0 + 0.45] : [c.x1 - 0.45, F, c.z0 + w / 2]));
          shell.push(bake(g, col));
        }
      } else if (r < 0.6) { // skis leaning in the corner
        for (const k of [0, 1]) shell.push(bake(box(0.08, 1.7, 0.02, 0, 0.85, 0).rotateZ(0.12).translate(ax + k * 0.1, F, az), [0xd23c3c, 0x2a63c4][k]));
      } else if (r < 0.8) { // a stack of winter tyres
        for (let k = 0; k < 4; k++) shell.push(bake(new THREE.CylinderGeometry(0.31, 0.31, 0.2, 14).translate(ax + 0.1, F + 0.1 + k * 0.21, az), 0x1b1c1e));
      }
      if (c.ours) { // ours: the kids' sled, a box marked for Christmas, the camping chairs, a bike
        shell.push(bake(box(0.45, 0.12, 0.95, 0, 0, 0).rotateX(-1.2).translate(ax, F + 0.5, az), 0xd8312a));
        for (const k of [0, 1]) shell.push(bake(box(0.5, 0.9, 0.08, ax + 0.6 + k * 0.1, F + 0.45, az + 0.2), 0x2f5d3a));
        const g = frame.clone().translate(c.x0 + w / 2 + 0.2, F, c.z0 + 0.45), t = tyres.clone().translate(c.x0 + w / 2 + 0.2, F, c.z0 + 0.45);
        shell.push(bake(g, 0x6fb7c7), bake(t, 0x141414));
      }
    }
  }

  /** Is (x, z) inside the garage, the corridor, the lobby or a förråd? */
  inside(x, z) { return this.rects.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1); }

  /** Room name at (x, z) ('Garage', 'Förråd', 'Hisshall') or null. */
  roomAt(x, z) { return this.rooms.find(([r]) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1)?.[1] ?? null; }

  /** The förråd doors' collision now (their leaves). */
  dynamic() {
    return this.cageDoors.map((d) => {
      const a = d.angle, dx = d.dir[0] * Math.cos(a) + d.out[0] * Math.sin(a), dz = d.dir[1] * Math.cos(a) + d.out[1] * Math.sin(a);
      return [d.hx, d.hz, d.hx + dx * ST.door, d.hz + dz * ST.door];
    });
  }

  /** Closed boxes down here (#314): the parked cars. */
  obstacles() { return this.carPolys; }

  place(d) {
    const a = d.angle, dx = d.dir[0] * Math.cos(a) + d.out[0] * Math.sin(a), dz = d.dir[1] * Math.cos(a) + d.out[1] * Math.sin(a), yaw = Math.atan2(-dz, dx);
    d.pivot.rotation.y = yaw; d.pivot.updateMatrix();
    this.leaves.setMatrixAt(d.index, new THREE.Matrix4().makeRotationY(yaw).setPosition(d.hx, 0, d.hz));
    this.leaves.instanceMatrix.needsUpdate = true;
  }

  sound(d) { const p = { x: d.hx, y: F + 1.1, z: d.hz }; if (d.target > 0) sfx.doorOpen(p); else sfx.doorClose(p, 0.35); }

  /** Is the camera down here or west of the door where it can look in? */
  near(cam) {
    const p = cam.position;
    if (p.y < C && this.inside(p.x, p.z)) return true;
    return p.x < GD.x + 0.5 && p.x > GD.x - 60 && Math.abs(p.z - (GD.z0 + GD.z1) / 2) < 25 && p.y < F + 6;
  }

  setLevel(k) {
    this.level = k;
    const v = 0.035 + 0.965 * k;
    for (const m of [this.mats.shell, this.mats.floor, this.mats.mesh, this.mats.door, this.mats.signs]) m.color.setScalar(v);
    this.mats.tubes.color.setScalar(0.25 + 0.75 * k);
  }

  /** Each frame: the förråd doors swing, the motion sensor, what is drawn, how much daylight is left (`under`). */
  update(dt, player, camera) {
    for (const d of this.cageDoors) {
      if (Math.abs(d.target - d.angle) < 1e-4) continue;
      d.angle += Math.sign(d.target - d.angle) * Math.min(Math.abs(d.target - d.angle), ST.speed * dt);
      this.place(d);
    }
    const p = player.pos, below = !!player.below;
    this.present = below || (p.y < F + 1.5 && Math.hypot(p.x - GD.x, p.z - (GD.z0 + GD.z1) / 2) < LI.sensor);
    if (this.present) {
      if (!this.on) { this.on = true; this.flickT = LI.flicker; sfx.click?.({ x: p.x, y: C, z: p.z }); }
      this.hold = LI.hold;
    } else if (this.on && (this.hold -= dt) <= 0) this.on = false;
    let k = this.on ? 1 : Math.max(0, this.level - dt * 2);
    if (this.on && this.flickT > 0) { // a fluorescent starting up: a few blinks
      this.flickT -= dt;
      const t = LI.flicker - this.flickT;
      k = t < 0.08 || (t > 0.2 && t < 0.28) || (t > 0.42 && t < 0.5) ? 0.9 : t < LI.flicker ? 0.15 : 1;
    }
    if (Math.abs(k - this.level) > 1e-3) this.setLevel(k);
    for (const l of this.lamps) l.k = below ? this.level : 0;
    const vis = this.near(camera);
    this.object.visible = vis;
    this.blackout.visible = !vis;
    // the daylight down here: none deep inside, some by the open door
    const want = below ? LI.dim * THREE.MathUtils.clamp((p.x - GD.x) / 7, 0, 1) : 0;
    this.under += (want - this.under) * Math.min(1, dt * 4);
    if (Math.abs(want - this.under) < 1e-3) this.under = want;
  }
}
