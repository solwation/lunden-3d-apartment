import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONTENTS } from './config.js';

// What is inside cabinets and drawers (#228): one shared helper. Contents are built as world-space meshes (merged per
// material by the caller, e.g. interior.js's Batch) and handed to `attachContents` with the Openable that closes them:
//   - `carry: true` (drawers, and anything that moves with the front): the meshes become children of the Openable's
//     pivot (`object`), so they slide out with it;
//   - otherwise they sit still in the carcass (a hinged door swings away from them) in a group the caller adds to the scene.
// Either way they are hidden while the front is shut (no draw calls, no triangles for closed cabinets) and shown as soon
// as it starts to open. They are decoration: no E targets (raycast off). `openable.contents` = the group.

/**
 * @param {THREE.Mesh[]} meshes  world-space meshes (merged per material)
 * @param {object} openable      an Openable-like ({ object, isOpen, t, update })
 * @returns {THREE.Group} the group (already in the pivot when `carry`; add it to the scene yourself otherwise)
 */
export function attachContents(meshes, openable, { carry = false } = {}) {
  const g = new THREE.Group();
  g.name = 'contents';
  for (const m of meshes) {
    m.raycast = () => {}; // decoration: never an E target, never in the way of one
    g.add(m);
  }
  if (carry) {
    const piv = openable.object;
    piv.updateWorldMatrix(true, false);
    // the pivot is at its home (closed) pose now: bring the world-space geometry into its frame
    const inv = piv.matrixWorld.clone().invert();
    for (const m of meshes) { m.geometry.applyMatrix4(inv); m.geometry.computeBoundingSphere(); }
    piv.add(g);
  }
  g.visible = false;
  const update = openable.update.bind(openable);
  openable.update = (dt) => {
    update(dt);
    g.visible = openable.isOpen || openable.t > 0;
  };
  openable.contents = g;
  return g;
}

// ---------- #231: the living room, the hall wardrobe, the bathrooms and the laundry ----------

// What lies in the cabinets, drawers and the hall wardrobe (#231, part of #228): films and games in the BYÅS TV
// bench, board games and photo albums behind the BESTÅ's wooden doors, coats on hangers in the hall wardrobe,
// toothbrushes and bottles in the Stage 50 mirror cabinet, towels and brushes in the vanity drawers, detergent and
// a laundry basket under the laundry sink. Decoration only (no E targets).
//
// Cheap on purpose: a Pack collects plain boxes / cylinders, each with its own colour as a vertex colour, and
// bakes them into ONE mesh per finish (matte / gloss) — so a whole drawer of films is one or two draw calls,
// whatever the colours. Builders work in a container's local frame (x across its front, y up, z out of the
// front); the caller places the mesh (a child of the drawer, so it rides along).

const MATS = {
  matte: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
  gloss: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3 }),
};

/** A tiny seeded random generator (the same layout on every visit). */
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

const tmp = new THREE.Matrix4(), eul = new THREE.Euler();

export class Pack {
  constructor() { this.parts = { matte: [], gloss: [] }; }

  /** Add a positioned geometry in colour `color` (hex, sRGB). */
  add(geo, color, gloss = false) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n);
    const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    this.parts[gloss ? 'gloss' : 'matte'].push(g);
    return g;
  }

  /** Box w × h × d centred at (x, y, z), turned by r = [rx, ry, rz] (radians) about its centre. */
  box(w, h, d, x, y, z, color, { r, gloss } = {}) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (r) g.applyMatrix4(tmp.makeRotationFromEuler(eul.set(...r)));
    return this.add(g.translate(x, y, z), color, gloss);
  }

  /** Cylinder (radius rt at the top, rb at the bottom, height h) centred at (x, y, z), axis y unless turned by r. */
  cyl(rt, rb, h, x, y, z, color, { r, gloss, seg = 12 } = {}) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg);
    if (r) g.applyMatrix4(tmp.makeRotationFromEuler(eul.set(...r)));
    return this.add(g.translate(x, y, z), color, gloss);
  }

  /** Any other geometry, turned by r and moved to (x, y, z). */
  geo(geo, x, y, z, color, { r, gloss } = {}) {
    if (r) geo.applyMatrix4(tmp.makeRotationFromEuler(eul.set(...r)));
    return this.add(geo.translate(x, y, z), color, gloss);
  }

  /** The baked meshes (one per finish), their geometry moved by `matrix` (optional). No shadows cast: they sit in
   * cabinets the sun never reaches, and the shadow pass stays as it was. */
  meshes(matrix) {
    const out = [];
    for (const [k, list] of Object.entries(this.parts)) {
      if (!list.length) continue;
      const geo = mergeGeometries(list);
      if (matrix) geo.applyMatrix4(matrix);
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, MATS[k]);
      m.receiveShadow = true;
      out.push(m);
    }
    return out;
  }

  /** The meshes in a group (for parents that want one object). */
  group(matrix) {
    const g = new THREE.Group();
    for (const m of this.meshes(matrix)) g.add(m);
    return g;
  }
}

/** The matrix that puts a builder's local frame (z out of the front) at world `origin`, the front facing `dir`
 * ('e' +x, 'w' −x, 'n' −z, 's' +z). A pure rotation + move, so faces keep their winding. */
export function frameMatrix(dir, origin) {
  const yaw = { e: Math.PI / 2, w: -Math.PI / 2, n: Math.PI, s: 0 }[dir];
  return new THREE.Matrix4().makeRotationY(yaw).setPosition(origin);
}

const pick = (rand, list) => list[Math.floor(rand() * list.length) % list.length];

// ---------- the living room ----------

/** A game pad lying flat, centred at (x, z) on the floor y, turned by yaw. */
function gamepad(P, x, y, z, yaw, color) {
  const c = Math.cos(yaw), s = Math.sin(yaw), at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
  P.box(0.11, 0.028, 0.065, x, y + 0.014, z, color, { r: [0, yaw, 0] });
  for (const k of [-1, 1]) {
    const [gx, gz] = at(k * 0.055, 0.025);
    P.cyl(0.024, 0.024, 0.026, gx, y + 0.013, gz, color, { seg: 10 });            // the grips
    const [sx, sz] = at(k * 0.03, -0.005);
    P.cyl(0.009, 0.009, 0.012, sx, y + 0.032, sz, 0x2a2b2e, { seg: 8 });           // the sticks
  }
  const [bx, bz] = at(0.04, -0.018);
  P.box(0.02, 0.006, 0.02, bx, y + 0.03, bz, 0x5a6b8c, { r: [0, yaw, 0], gloss: true }); // buttons
}

/** A TV remote lying flat, long side along z. */
function remote(P, x, y, z, color, len = 0.17) {
  P.box(0.045, 0.02, len, x, y + 0.01, z, color, { gloss: true });
  P.box(0.03, 0.003, len * 0.55, x, y + 0.021, z + len * 0.12, 0x4a4c50);
  P.box(0.008, 0.004, 0.008, x, y + 0.022, z - len * 0.38, 0xc0392b, { gloss: true }); // power
}

/** A coil of cable lying flat. */
function coil(P, x, y, z, r, color = 0x2a2a2c) {
  P.geo(new THREE.TorusGeometry(r, 0.005, 5, 20), x, y + 0.005, z, color, { r: [Math.PI / 2, 0, 0] });
}

/** Cases standing on their long edge with the spine up, filed front to back (z): `n` of them from z0 towards
 * −z, each `len` long (x) and `h` high, `t` thick; colours from `cols`. */
function caseRow(P, rand, { x, y, z0, n, len, h, t, cols, gap = 0.0015, labels = 0.5 }) {
  for (let i = 0; i < n; i++) {
    const z = z0 - t / 2 - i * (t + gap), col = pick(rand, cols);
    P.box(len, h, t, x, y + h / 2, z, col, { gloss: true });
    if (rand() < labels) P.box(len * (0.3 + rand() * 0.35), 0.002, t * 0.8, x + (rand() - 0.5) * len * 0.3, y + h + 0.001, z, pick(rand, [0xf2f2ee, 0xe8c547, 0x1c1c1c]));
  }
}

/** BYÅS drawer contents (#231), the drawer's own frame: floor at y, the box from z −0.018 back `depth`, inner
 * half-width hw. side −1 = the left drawer (games, game pads, cables, remotes), +1 = the right (films). */
export function byasDrawer(P, side, { y, depth, hw }) {
  const B = CONTENTS.byas, rand = rng(side < 0 ? 31 : 37), z0 = -0.03, n = Math.floor((depth - 0.03) / (B.film.t + 0.0015));
  if (side > 0) { // two rows of films, spines up: dvd cases on the left, a mix with blu-rays on the right
    caseRow(P, rand, { x: -hw + 0.012 + B.film.len / 2, y, z0, n, len: B.film.len, h: B.film.h, t: B.film.t, cols: B.filmColours });
    caseRow(P, rand, { x: hw - 0.012 - B.bluray.len / 2, y, z0, n: Math.floor(n * 1.1), len: B.bluray.len, h: B.bluray.h, t: B.bluray.t, cols: [0x1d5fb4, 0x1d5fb4, ...B.filmColours] });
  } else { // a row of game cases (blue ones, a few red small ones), game pads, remotes and coiled cables
    const g = B.game;
    caseRow(P, rand, { x: -hw + 0.012 + g.len / 2, y, z0, n: n - 2, len: g.len, h: g.h, t: g.t, cols: [0x1f4fa8, 0x1f4fa8, 0x1f4fa8, 0xd2232a, 0x2b2b2b], labels: 0.8 });
    const x1 = -hw + 0.03 + g.len; // the free strip beside the games
    gamepad(P, x1 + 0.07, y, -0.075, 0.2, 0x1c1d20);
    gamepad(P, x1 + 0.07, y, -0.17, -0.15, 0xf0f0ee);
    remote(P, hw - 0.03, y, -0.11, 0x222326);
    remote(P, hw - 0.03, y, -0.28, 0x3a3b3e, 0.15);
    coil(P, x1 + 0.065, y, -depth + 0.07, 0.055);
    coil(P, x1 + 0.065, y + 0.011, -depth + 0.07, 0.045, 0xe8e8e4);
  }
}

/** The BYÅS's open middle compartment (#231): the console and a stack of games on the bottom, the router (and a
 * remote) on the shelf. Bench frame: x across, bottom board's top at y0, shelf top at y1, back at zb. */
export function byasMiddle(P, { hw, y0, y1, zb }) {
  const C = CONTENTS.byas.console, zc = zb + 0.02 + C.d / 2;
  const cx = -hw + 0.012 + C.w / 2;
  P.box(C.w - 0.02, C.h - 0.02, C.d - 0.01, cx, y0 + 0.004 + C.h / 2, zc, 0x16171a, { gloss: true }); // the black core
  for (const [y, s] of [[y0 + 0.004 + 0.008, 1], [y0 + 0.004 + C.h - 0.008, 1]]) P.box(C.w, 0.016 * s, C.d, cx, y, zc, 0xf4f4f2, { gloss: true }); // white shells
  P.box(0.012, 0.004, 0.003, cx + C.w / 2 - 0.04, y0 + 0.004 + C.h / 2, zc + C.d / 2 + 0.001, 0x9fc4ff, { gloss: true }); // the light strip
  const rand = rng(41);
  for (let i = 0; i < 4; i++) P.box(0.135, 0.014, 0.17, hw - 0.012 - 0.0675, y0 + 0.007 + i * 0.0145, zc + (rand() - 0.5) * 0.01, i === 1 ? 0xd2232a : 0x1f4fa8, { gloss: true, r: [0, (rand() - 0.5) * 0.08, 0] });
  gamepad(P, hw - 0.08, y0 + 0.06, zc + 0.03, 0.3, 0xf0f0ee);
  // the router on the shelf: a black box on its feet with two aerials, little green lights at the front
  const R = CONTENTS.byas.router, rx = -hw + 0.03 + R.w / 2, rz = zb + 0.02 + R.d / 2;
  P.box(R.w, R.h, R.d, rx, y1 + 0.006 + R.h / 2, rz, 0x1e1f22, { gloss: true });
  for (const k of [-1, 1]) P.box(0.012, R.aerial, 0.008, rx + k * (R.w / 2 - 0.02), y1 + 0.006 + R.h + R.aerial / 2 - 0.005, rz - R.d / 2 + 0.01, 0x1e1f22);
  for (let i = 0; i < 4; i++) P.box(0.005, 0.004, 0.002, rx - 0.04 + i * 0.02, y1 + 0.006 + R.h * 0.5, rz + R.d / 2 + 0.001, 0x3fe07a, { gloss: true });
  remote(P, hw - 0.06, y1, zb + 0.13, 0x222326);
}

/** Behind the BESTÅ's wooden doors (#231): board games and puzzles stacked, photo albums in a row, napkins.
 * Cabinet frame: columns centred at ±col/2 (inner half-width chw), sections' inner floors at yb (bottom) and yt
 * (top), from the back zb to the front zf. Only the compartment behind one door: `top` or the bottom, `side` −1 left / +1 right. */
export function bestaContents(P, { col, chw, yb, yt, zb, zf }, { top, side }) {
  const rand = rng(53), d = zf - zb, mid = (zb + zf) / 2;
  const boxes = (x, y, list) => { // a stack of game boxes: [w, h, depth, colour, lid colour]
    let yy = y;
    for (const [w, h, dd, c, lid] of list) {
      const dx = (rand() - 0.5) * 0.006;
      P.box(w, h, dd, x + dx, yy + h / 2, zb + 0.015 + dd / 2, c);
      P.box(w * 0.55, 0.002, dd * 0.4, x + dx, yy + h + 0.001, zb + 0.015 + dd * 0.55, lid); // the title on the lid
      yy += h + 0.001;
    }
  };
  const L = -col / 2, R = col / 2;
  const at = (t, s) => top === t && side === s;
  // bottom left: two stacks of board games
  if (at(false, -1)) boxes(L - chw + 0.138, yb, [[0.27, 0.075, 0.27, 0xc0392b, 0xf2e6c8], [0.27, 0.06, 0.27, 0x2e6da4, 0xffffff], [0.26, 0.08, 0.26, 0x2f7d4f, 0xf6d55c], [0.25, 0.05, 0.25, 0xf0c419, 0x1c1c1c]]);
  if (at(false, -1)) boxes(L + chw - 0.142, yb, [[0.27, 0.055, 0.34, 0xe3e0d4, 0xc0392b], [0.27, 0.07, 0.27, 0x6c3483, 0xf2e6c8], [0.26, 0.06, 0.26, 0xe67e22, 0xffffff], [0.2, 0.06, 0.2, 0x1c2833, 0xe8c547]]);
  // bottom right: photo albums standing with their spines out, napkins in packs beside them
  const A = CONTENTS.besta.album;
  let x = R - chw + 0.01;
  if (at(false, 1)) for (let i = 0; i < A.n; i++) {
    const t = A.t * (0.8 + rand() * 0.4);
    P.box(t, A.h, A.d, x + t / 2, yb + A.h / 2, zb + 0.02 + A.d / 2, pick(rand, A.colours));
    P.box(t * 0.7, 0.03, 0.002, x + t / 2, yb + A.h * 0.8, zb + 0.02 + A.d + 0.001, 0xe8dcb8); // the label on the spine
    x += t + 0.002;
  }
  const nap = CONTENTS.besta.napkins;
  if (at(false, 1)) nap.colours.forEach((c, i) => P.box(nap.w, nap.h, nap.w, R + chw - 0.01 - nap.w / 2, yb + nap.h / 2 + i * (nap.h + 0.001), mid, c));
  // top left: puzzles flat, card games standing in a row
  if (at(true, -1)) boxes(L - chw + 0.18, yt, [[0.36, 0.06, 0.26, 0x5dade2, 0xffffff], [0.35, 0.06, 0.25, 0xa04000, 0xf2e6c8], [0.34, 0.055, 0.25, 0x7d3c98, 0xf6d55c]]);
  if (at(true, -1)) [0xd2232a, 0x1c1c1c, 0x2e86c1].forEach((c, i) => P.box(0.06, 0.1, 0.095, L + chw - 0.025 - i * 0.065, yt + 0.05, zb + 0.06, c));
  // top right: two photo boxes and a folded table cloth
  if (!at(true, 1)) return;
  P.box(0.25, 0.15, Math.min(0.33, d - 0.04), R - chw + 0.135, yt + 0.075, zb + 0.015 + Math.min(0.33, d - 0.04) / 2, 0xd8c3a0);
  P.box(0.25, 0.12, Math.min(0.33, d - 0.04), R - chw + 0.135, yt + 0.15 + 0.06 + 0.001, zb + 0.015 + Math.min(0.33, d - 0.04) / 2, 0xf2f0ea);
  for (let i = 0; i < 3; i++) P.box(0.26, 0.025, 0.3, R + chw - 0.14, yt + 0.0125 + i * 0.026, mid, [0xf4f1e8, 0xb7c9a8, 0xf4f1e8][i]);
}

// ---------- the hall wardrobe ----------

/** A coat on a hanger whose hook is on the rod (centre x, rod at y, z), its width across the wardrobe (z). */
function coat(P, x, rodY, z, { len, w, t, colour, hood, hanger }) {
  // the hanger: a hook round the rod, a neck and a bar
  P.geo(new THREE.TorusGeometry(0.018, 0.0025, 4, 10, Math.PI * 1.3), x, rodY + 0.004, z, 0xb8bcc0, { r: [0, Math.PI / 2, -0.1] });
  P.box(0.006, 0.04, 0.006, x, rodY - 0.028, z, 0xb8bcc0);
  P.box(0.012, 0.022, w - 0.02, x, rodY - 0.058, z, hanger);
  // the coat: a square frustum (wider at the hem), shoulders rounded by a roll along the top
  const top = rodY - 0.05, geo = new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2 * 1.15, 1, 4, 1);
  geo.rotateY(Math.PI / 4).scale(t, len, w * 0.92).translate(x, top - len / 2, z);
  P.add(geo, colour);
  P.cyl(t / 2, t / 2, w * 0.86, x, top - t * 0.3, z, colour, { r: [Math.PI / 2, 0, 0], seg: 8 });
  if (hood) P.box(t * 0.9, 0.16, w * 0.4, x + t * 0.3, top - 0.07, z, colour);
}

/** A shoe (heel at the origin, toe along −z, sole down) baked into P by the matrix m. */
function shoe(P, m, colour, { len = 0.27, kid = false } = {}) {
  const w = kid ? 0.07 : 0.09, add = (g, c) => P.add(g.applyMatrix4(m), c);
  add(new THREE.BoxGeometry(w, 0.022, len).translate(0, 0.011, -len / 2), 0xe9e6df);           // sole
  add(new THREE.BoxGeometry(w * 0.95, 0.07, len * 0.55).translate(0, 0.022 + 0.035, -len * 0.3), colour); // upper
  add(new THREE.BoxGeometry(w * 0.9, 0.04, len * 0.4).translate(0, 0.022 + 0.02, -len * 0.75), colour);  // toe
}

/**
 * The hall wardrobe "G" (#231). Frame: x along the rod (inner half-length hl), z from the back (0) to the front
 * (depth), floor (top of the plinth) y 0.08, the rod at rodY / rodZ, the hat shelf's top at shelfY. Coats and jackets
 * hang on hangers (grown-ups' long coats on the left, the kids' short jackets on the right, all above the floor so the
 * cat still fits underneath), hats, gloves and scarves on the shelf, shoes on a slanted rack along the back and a
 * pair of rubber boots — the middle of the floor stays free (the cat sits there, wardrobeSpot in cat.js).
 */
export function hallWardrobe(P, { hl, depth, rodY, rodZ, shelfY, topY, reserveCoat=false }) {
  const W = CONTENTS.wardrobe, rand = rng(61);
  const n = W.coats.length, pitch = (2 * hl - 0.12) / (n - 1);
  W.coats.forEach((c,i)=>{const x=-hl+.06+i*pitch+(rand()-.5)*.01;if(!reserveCoat||i!==0)coat(P,x,rodY,rodZ,{...c,hanger:c.kid?0xf2f2ee:0x9a6b43});});
  // the shelf: a basket of mittens, a stack of scarves, beanies, gloves and a cap
  const y = shelfY, zc = Math.min(depth - 0.08, 0.3);
  const bx = -hl + 0.16, bw = 0.28, bd = 0.3, bh = 0.15;
  P.box(bw, 0.01, bd, bx, y + 0.005, zc, 0xb08a5a);
  for (const s of [-1, 1]) { P.box(0.01, bh, bd, bx + s * (bw / 2 - 0.005), y + bh / 2, zc, 0xb08a5a); P.box(bw, bh, 0.01, bx, y + bh / 2, zc + s * (bd / 2 - 0.005), 0xb08a5a); }
  for (const [dx, dz, c] of [[-0.06, -0.05, 0xc0392b], [0.05, -0.06, 0x2e86c1], [-0.04, 0.07, 0xf1c40f], [0.06, 0.05, 0x7d3c98]]) P.cyl(0.05, 0.055, 0.06, bx + dx, y + bh - 0.01, zc + dz, c, { seg: 8 }); // mittens peeking up
  const sx = bx + bw / 2 + 0.17;
  [0x7f8c8d, 0xc0392b, 0x2c3e50, 0xe8dcc0].forEach((c, i) => P.box(0.26, 0.028, 0.2, sx, y + 0.014 + i * 0.029, zc, c)); // folded scarves
  const hx = sx + 0.25;
  [[0x1c2833, 0], [0xd35400, 0.16], [0xe84393, -0.16]].forEach(([c, dz]) => { // beanies: a dome on a turned-up band
    P.cyl(0.085, 0.088, 0.05, hx, y + 0.025, zc + dz, c, { seg: 14 });
    P.geo(new THREE.SphereGeometry(0.085, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), hx, y + 0.05, zc + dz, c);
    P.cyl(0.02, 0.02, 0.03, hx, y + 0.13, zc + dz, 0xf2f2ee, { seg: 8 });
  });
  const gx = Math.min(hl - 0.08, hx + 0.2);
  [[0x2b2b2b, -0.1], [0x6e4b33, 0.12]].forEach(([c, dz]) => { for (let k = 0; k < 2; k++) P.box(0.1, 0.02, 0.2, gx, y + 0.01 + k * 0.021, zc + dz, c); }); // pairs of gloves
  // shoes on a slanted rack along the back: the heel on a low rail at the front, the toe up against a high one
  const S = W.rack, pairs = W.shoes, a = S.tilt * Math.PI / 180;
  const x0 = -hl + 0.04, x1 = x0 + pairs.length * S.pitch;
  for (const [ry, rz] of [[0.08 + S.heelY, S.heelZ], [0.08 + S.heelY + 0.27 * Math.sin(a) - 0.03, S.heelZ - 0.27 * Math.cos(a) + 0.02]]) P.box(x1 - x0, 0.012, 0.012, (x0 + x1) / 2, ry - 0.006, rz, 0x2b2b2b, { gloss: true });
  for (const x of [x0, x1]) P.box(0.012, 0.3, 0.012, x, 0.08 + 0.15, S.heelZ - 0.05, 0x2b2b2b, { gloss: true });
  pairs.forEach(([colour, kid], i) => {
    for (const k of [-1, 1]) {
      const m = new THREE.Matrix4().makeRotationX(a).setPosition(x0 + (i + 0.5) * S.pitch + k * (kid ? 0.042 : 0.05), 0.08 + S.heelY, S.heelZ);
      shoe(P, m, colour, { kid, len: kid ? 0.2 : 0.27 });
    }
  });
  // a pair of kids' rubber boots in profile at the other end, toes pointing along the rod
  const bz = 0.075;
  for (let k = 0; k < 2; k++) {
    const x = hl - 0.06 - k * 0.17;
    P.box(0.17, 0.05, 0.075, x - 0.03, 0.08 + 0.025, bz, W.boots);
    P.cyl(0.04, 0.042, 0.17, x - 0.07, 0.08 + 0.05 + 0.085, bz, W.boots, { seg: 10, gloss: true });
  }
}

// ---------- bathrooms and the laundry ----------

/** The Stage 50 mirror cabinet (#231): toothbrush glass, toothpaste, a razor and a jar below, bottles above.
 * Frame: x across (inner half-width hw), z from the back zb to the front zf, the shelves' tops at y0 and y1. */
export function mirrorCabinet(P, { hw, zb, zf, y0, y1 }) {
  const zc = (zb + zf) / 2;
  // lower shelf: a glass of toothbrushes, toothpaste lying, a razor, a jar of cream
  const gx = -hw + 0.05;
  P.cyl(0.032, 0.028, 0.1, gx, y0 + 0.05, zc, 0xcfe3e8, { gloss: true, seg: 14 });
  [[0x2e86c1, 0.12], [0xe84393, -0.1], [0x27ae60, 0.02]].forEach(([c, tilt], i) => {
    P.box(0.009, 0.18, 0.006, gx + tilt * 0.12, y0 + 0.1 + 0.03, zc + (i - 1) * 0.012, c, { r: [0, 0, -tilt], gloss: true });
    P.box(0.012, 0.025, 0.012, gx + tilt * 0.12 + Math.sin(tilt) * 0.08, y0 + 0.2 + 0.01, zc + (i - 1) * 0.012, 0xf2f2ee, { r: [0, 0, -tilt] });
  });
  P.cyl(0.017, 0.017, 0.15, gx + 0.14, y0 + 0.017, zc + 0.02, 0xf4f4f2, { r: [0, 0, Math.PI / 2], gloss: true });      // toothpaste
  P.box(0.012, 0.03, 0.036, gx + 0.14 + 0.08, y0 + 0.017, zc + 0.02, 0xc0392b, { gloss: true });                          // its cap
  P.box(0.11, 0.012, 0.014, gx + 0.15, y0 + 0.006, zc - 0.03, 0x34495e, { gloss: true });                                // razor handle
  P.box(0.012, 0.016, 0.04, gx + 0.15 + 0.06, y0 + 0.008, zc - 0.03, 0xbdc3c7, { gloss: true });                         // its head
  P.cyl(0.032, 0.032, 0.045, hw - 0.045, y0 + 0.0225, zc, 0xf2f2ee, { gloss: true, seg: 14 });                           // a jar of cream
  P.cyl(0.033, 0.033, 0.012, hw - 0.045, y0 + 0.051, zc, 0x5dade2, { gloss: true, seg: 14 });
  // upper shelf: bottles in a row (shampoo, lotion, a pump bottle, mouthwash)
  [[0.026, 0.15, 0xf6d55c], [0.03, 0.17, 0xf2f2ee], [0.024, 0.13, 0x48c9b0], [0.028, 0.16, 0xa9cce3]].forEach(([r, h, c], i) => {
    const x = -hw + 0.04 + i * 0.075;
    P.cyl(r, r, h, x, y1 + h / 2, zc, c, { gloss: true, seg: 12 });
    P.cyl(r * 0.6, r * 0.6, 0.025, x, y1 + h + 0.0125, zc, i === 1 ? 0x2c3e50 : 0xf4f4f2, { seg: 10 });
    if (i === 1) P.box(0.01, 0.01, 0.035, x, y1 + h + 0.03, zc + 0.012, 0x2c3e50);
  });
  P.box(0.07, 0.05, 0.05, hw - 0.05, y1 + 0.025, zc, 0xf4f4f2); // a box of plasters
  P.box(0.03, 0.03, 0.002, hw - 0.05, y1 + 0.028, zc + 0.026, 0xc0392b);
}

/** Vanity drawer contents (#231). Drawer frame: x across (inner half-width hw), floor y, z from −depth to the
 * front 0. `top`: the shallow drawer under the basin (brushes, plasters, hair ties), else the deep one (towels). */
export function vanityDrawer(P, top, { hw, y, depth }) {
  const rand = rng(top ? 71 : 73), zc = -depth / 2;
  if (!top) { // folded towels, stacked, centred; rolled hand towels beside them where there is room
    const T = CONTENTS.towels, n = Math.max(1, Math.floor((2 * hw + 0.01) / (T.w + 0.01))), d = Math.min(T.d, depth - 0.02);
    const span = n * T.w + (n - 1) * 0.01, x0 = -hw + 0.005, rolls = Math.floor((2 * hw - 0.01 - span) / 0.072);
    for (let s = 0; s < n; s++) for (let k = 0; k < T.stack; k++) {
      const x = x0 + T.w / 2 + s * (T.w + 0.01);
      P.box(T.w, T.h, d, x + (rand() - 0.5) * 0.006, y + T.h / 2 + k * (T.h + 0.002), zc, T.colours[(s + k) % T.colours.length]);
    }
    for (let i = 0; i < rolls; i++) for (let k = 0; k < 2; k++) {
      P.cyl(0.034, 0.034, d * 0.9, x0 + span + 0.01 + 0.036 + i * 0.072, y + 0.034 + k * 0.066, zc, T.colours[(i + k + 1) % T.colours.length], { r: [Math.PI / 2, 0, 0], seg: 10 });
    }
    return;
  }
  // hairbrushes (long side across), a comb, a box of plasters, hair ties
  const zb = zc - depth / 4, zf = zc + depth / 4;
  P.box(0.12, 0.03, 0.07, -hw + 0.07, y + 0.015, zb, 0x1c1c1c);                          // brush head
  P.box(0.1, 0.02, 0.03, -hw + 0.18, y + 0.01, zb, 0x1c1c1c, { gloss: true });           // its handle
  P.box(0.09, 0.026, 0.05, -hw + 0.055, y + 0.013, zf, 0xe84393, { gloss: true });       // a kids' brush
  P.box(0.08, 0.018, 0.025, -hw + 0.14, y + 0.009, zf, 0xe84393, { gloss: true });
  P.box(0.03, 0.004, Math.min(0.16, depth - 0.03), hw - 0.13, y + 0.002, zc, 0x2c3e50, { gloss: true }); // comb
  P.box(0.07, 0.03, 0.06, hw - 0.05, y + 0.015, zb, 0xf4f4f2);                            // plasters
  P.box(0.03, 0.002, 0.03, hw - 0.05, y + 0.031, zb, 0xc0392b);
  for (let i = 0; i < 6; i++) P.geo(new THREE.TorusGeometry(0.013, 0.003, 4, 12), hw - 0.05 + (rand() - 0.5) * 0.05, y + 0.003, zf + (rand() - 0.5) * 0.02,
    pick(rand, [0x1c1c1c, 0xe84393, 0x8e44ad, 0xf1c40f, 0x2e86c1]), { r: [Math.PI / 2, 0, 0] }); // hair ties
}

/** Under the laundry sink (#231): detergent, fabric softener, stain remover at the back, a laundry basket with
 * clothes pegs at the front. Frame: x across (inner half-width hw), floor y, z from the back zb to the front zf. */
export function laundrySink(P, { hw, y, zb, zf, h }) {
  // at the back: a jug of detergent, fabric softener, a stain-remover spray
  P.box(0.11, 0.26, 0.16, -hw + 0.06, y + 0.13, zb + 0.09, 0xf2f2ee, { gloss: true });
  P.box(0.07, 0.03, 0.04, -hw + 0.06, y + 0.275, zb + 0.13, 0x2e86c1, { gloss: true });
  P.box(0.112, 0.1, 0.002, -hw + 0.06, y + 0.14, zb + 0.171, 0x2e86c1);               // its label
  P.cyl(0.05, 0.055, 0.23, hw - 0.06, y + 0.115, zb + 0.07, 0xf5b7d0, { gloss: true });
  P.cyl(0.03, 0.03, 0.03, hw - 0.06, y + 0.245, zb + 0.07, 0x8e44ad, { gloss: true });
  P.cyl(0.028, 0.03, 0.17, hw - 0.05, y + 0.085, zb + 0.18, 0xf39c12, { gloss: true }); // stain remover
  P.box(0.03, 0.05, 0.05, hw - 0.05, y + 0.195, zb + 0.19, 0xf4f4f2);
  // at the front: a laundry basket (white plastic, open top) with folded clothes and a tub of pegs
  const bw = 2 * hw - 0.02, bd = Math.min(0.3, zf - zb - 0.27), bh = Math.min(0.24, h - 0.05), bz = zf - 0.01 - bd / 2;
  P.box(bw, 0.01, bd, 0, y + 0.005, bz, 0xf2f2ee);
  for (const s of [-1, 1]) { P.box(0.01, bh, bd, s * (bw / 2 - 0.005), y + bh / 2, bz, 0xf2f2ee); P.box(bw, bh, 0.01, 0, y + bh / 2, bz + s * (bd / 2 - 0.005), 0xf2f2ee); }
  [0x5d6d7e, 0xe8dcc0, 0x2e86c1, 0xf2f2ee].forEach((c, i) => P.box(bw - 0.05, 0.035, bd - 0.07, 0, y + 0.03 + i * 0.036, bz, c)); // folded clothes
  // a tub of clothes pegs on them, the pegs standing in a ring
  const tx = -bw / 2 + 0.07, ty = y + 0.03 + 4 * 0.036 - 0.018, tr = 0.05;
  P.cyl(tr, tr * 0.9, 0.05, tx, ty + 0.025, bz, 0x48c9b0, { seg: 14 });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    P.box(0.011, 0.07, 0.009, tx + Math.cos(a) * tr * 0.6, ty + 0.05, bz + Math.sin(a) * tr * 0.6, [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0xf4f4f2][i % 5], { r: [0, -a, 0], gloss: true });
  }
}

/** The HAVBÄCK tall cabinet in the Badrum (#293), after IKEA's open photo. Frame: x across (inner half-width hw), y up,
 * z from the back zb to the front zf; `levels` = the six compartments bottom to top as [floor, ceiling] heights:
 * toilet rolls and a cleaning spray | big bath towels | big towels and a rolled one | bottles with pumps, a jar of cream,
 * a small bamboo box of toiletries | folded hand towels (glass shelf) | a bamboo storage box (glass shelf). */
export function havbackContents(P, { hw, zb, zf, levels }) {
  const rand = rng(293), zc = (zb + zf) / 2, d = zf - zb, white = 0xf3f2ee, bamboo = 0xd8bd8c;
  const [l0, l1, l2, l3, l4, l5] = levels;
  // bottom: toilet rolls, two by two, a second layer on the left; a cleaning spray on the right
  for (const [x, z, k] of [[-hw + 0.06, zb + 0.07, 0], [-hw + 0.06, zb + 0.185, 0], [-hw + 0.175, zb + 0.07, 0], [-hw + 0.06, zb + 0.07, 1], [-hw + 0.06, zb + 0.185, 1]]) {
    P.cyl(0.054, 0.054, 0.1, x, l0[0] + 0.05 + k * 0.1, z, white, { seg: 14 });
    P.cyl(0.021, 0.021, 0.101, x, l0[0] + 0.05 + k * 0.1, z, 0xb59a7a, { seg: 8 }); // the cardboard core
  }
  const sx = hw - 0.06, sz = zc;
  P.box(0.07, 0.2, 0.045, sx, l0[0] + 0.1, sz, 0x48c9b0, { gloss: true });            // the spray bottle
  P.cyl(0.014, 0.016, 0.03, sx, l0[0] + 0.215, sz, 0xf4f4f2, { seg: 10 });            // its neck
  P.box(0.03, 0.045, 0.075, sx, l0[0] + 0.25, sz + 0.012, 0xf4f4f2, { gloss: true });  // the trigger head
  P.box(0.012, 0.035, 0.012, sx, l0[0] + 0.215, sz + 0.035, 0xf4f4f2);                // the trigger
  P.box(0.071, 0.08, 0.002, sx, l0[0] + 0.1, sz + 0.023, 0xf4f4f2);                   // the label
  // a folded bath towel: a flat block with a rounded fold at the front and fine ribs (a slightly darker line)
  const towel = (x, y, w, h, colour) => {
    const td = Math.min(0.28, d - 0.02);
    P.box(w, h, td - h / 2, x, y + h / 2, zc - h / 4, colour);
    P.cyl(h / 2, h / 2, w, x, y + h / 2, zc + td / 2 - h / 2, colour, { r: [0, 0, Math.PI / 2], seg: 8 });
    P.box(w + 0.002, 0.003, 0.004, x, y + h / 2, zc + td / 2 - 0.001, 0xd9d7d0);
  };
  const stack = (lv, n, h, w = 2 * hw - 0.02) => {
    for (let k = 0; k < n && lv[0] + (k + 1) * (h + 0.002) < lv[1] - 0.01; k++) {
      towel((rand() - 0.5) * 0.012, lv[0] + k * (h + 0.002), w - rand() * 0.015, h, k % 4 === 2 ? 0xe9e7e0 : white);
    }
  };
  stack(l1, 5, 0.075);
  stack(l2, 3, 0.075);
  // a rolled towel on top of the stack in l2
  P.cyl(0.04, 0.04, 0.26, 0, l2[0] + 3 * 0.077 + 0.04, zc, white, { r: [0, 0, Math.PI / 2], seg: 12 });
  // bottles with pumps (shampoo, conditioner, body lotion), a jar of cream, a small bamboo box with toiletries
  [[0.026, 0.17, 0xe8c4b8], [0.026, 0.17, 0x2d2d2d], [0.03, 0.15, 0xf2f2ee]].forEach(([r, h, c], i) => {
    const x = -hw + 0.035 + i * 0.062, z = zb + 0.06 + (i % 2) * 0.03, y = l3[0];
    P.cyl(r, r, h, x, y + h / 2, z, c, { gloss: true, seg: 12 });
    P.cyl(r * 0.45, r * 0.45, 0.02, x, y + h + 0.01, z, 0xf4f4f2, { seg: 8 });         // the collar
    P.cyl(0.005, 0.005, 0.03, x, y + h + 0.035, z, 0xf4f4f2, { seg: 6 });               // the stem
    P.box(0.018, 0.012, 0.045, x, y + h + 0.052, z + 0.012, 0xf4f4f2);                 // the pump head + nozzle
    P.box(2 * r * 0.9, h * 0.4, 0.002, x, y + h * 0.45, z + r, i === 1 ? 0xd9d7d0 : 0x7f8c8d); // its label
  });
  P.cyl(0.035, 0.035, 0.065, -hw + 0.07, l3[0] + 0.0325, zf - 0.06, 0xe5e5e0, { gloss: true, seg: 14 }); // a jar of cream
  P.cyl(0.036, 0.036, 0.015, -hw + 0.07, l3[0] + 0.072, zf - 0.06, 0x95a5a6, { seg: 14 });
  { // the small bamboo box (open, toiletries poking up)
    const bw = 0.15, bd = 0.13, bh = 0.13, x = hw - bw / 2 - 0.005, z = zc;
    P.box(bw, 0.008, bd, x, l3[0] + 0.004, z, bamboo);
    for (const s of [-1, 1]) {
      P.box(0.008, bh, bd, x + s * (bw / 2 - 0.004), l3[0] + bh / 2, z, bamboo);
      P.box(bw, bh, 0.008, x, l3[0] + bh / 2, z + s * (bd / 2 - 0.004), bamboo);
    }
    P.cyl(0.016, 0.016, 0.16, x - 0.04, l3[0] + 0.08, z - 0.02, 0x5dade2, { gloss: true, seg: 10 });  // a tube
    P.cyl(0.02, 0.02, 0.15, x + 0.01, l3[0] + 0.075, z + 0.02, 0xf4f4f2, { gloss: true, seg: 10 });   // a deodorant
    P.cyl(0.021, 0.021, 0.02, x + 0.01, l3[0] + 0.16, z + 0.02, 0x2c3e50, { seg: 10 });
    P.box(0.04, 0.15, 0.03, x + 0.045, l3[0] + 0.075, z - 0.025, 0xc39bd3, { gloss: true });          // a box of cotton buds
  }
  // folded hand towels in two stacks on the lower glass shelf
  const hwT = (2 * hw - 0.03) / 2;
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
    const h = 0.04;
    if (l4[0] + (k + 1) * (h + 0.002) > l4[1] - 0.01) break;
    P.box(hwT - rand() * 0.01, h, Math.min(0.22, d - 0.04), s * (hwT / 2 + 0.005), l4[0] + h / 2 + k * (h + 0.002), zc, white);
  }
  { // the bamboo storage box on the top glass shelf, a lid with a finger hole
    const bh = Math.min(0.2, l5[1] - l5[0] - 0.01), bw = 2 * hw - 0.02, bd = Math.min(0.29, d - 0.02);
    P.box(bw, bh - 0.012, bd, 0, l5[0] + (bh - 0.012) / 2, zc, bamboo);
    P.box(bw + 0.004, 0.012, bd + 0.004, 0, l5[0] + bh - 0.006, zc, 0xcfb07a);
    P.box(0.07, 0.002, 0.02, 0, l5[0] + bh + 0.0005, zc + bd / 2 - 0.04, 0x8a6d43);
  }
}
