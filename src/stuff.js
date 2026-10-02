import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { STUFF as S } from './config.js';

// What is inside the cupboards, wardrobes and drawers (#228: #230 bedrooms, #231 living room, hall, bathrooms,
// laundry). Everything is decoration: plain boxes / cylinders tinted per vertex and merged into ONE mesh per
// container (one draw call, one material shared by all of them), no raycast. Kept tidy: rows and stacks.
// Clothes on hangers along a rod, folded stacks, rolled socks, shoes, boxes and cases with coloured spines.

const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });

/** Collects tinted geometries and turns them into one mesh. Coordinates are the container's local frame. */
export class Pack {
  constructor() { this.geos = []; this.m = new THREE.Matrix4(); }

  /** Add `geo` (consumed) in colour `hex`, after `matrix` (optional) and the pack's current frame. */
  add(geo, hex, matrix = null) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (matrix) g.applyMatrix4(matrix);
    g.applyMatrix4(this.m);
    const c = new THREE.Color(hex), n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.geos.push(g);
    return this;
  }

  /** An axis-aligned box sx × sy × sz with its bottom centre at (x, y, z), turned `ry` about y. */
  box(sx, sy, sz, x, y, z, hex, ry = 0) {
    return this.add(new THREE.BoxGeometry(sx, sy, sz).translate(0, sy / 2, 0).rotateY(ry).translate(x, y, z), hex);
  }

  /** A cylinder (radius r, length l) lying along x (axis 'x') or z, or standing (y), bottom/centre at (x, y, z). */
  cyl(r, l, x, y, z, hex, axis = 'y', seg = 8) {
    const g = new THREE.CylinderGeometry(r, r, l, seg);
    if (axis === 'x') g.rotateZ(Math.PI / 2).translate(x, y + r, z);
    else if (axis === 'z') g.rotateX(Math.PI / 2).translate(x, y + r, z);
    else g.translate(x, y + l / 2, z);
    return this.add(g, hex);
  }

  /** Run `fn` with the frame moved to (x, y, z) and turned `ry` about y (nested placements). */
  at(x, y, z, ry, fn) {
    const prev = this.m.clone();
    this.m.multiply(new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z));
    // (makeRotationY then setPosition = translate after rotating, which is what a child frame wants)
    fn(this);
    this.m.copy(prev);
    return this;
  }

  /** The merged mesh (null if empty): no shadows cast (small things inside dark boxes), not a raycast target. */
  mesh() {
    if (!this.geos.length) return null;
    const m = new THREE.Mesh(mergeGeometries(this.geos), material);
    m.receiveShadow = true;
    m.raycast = () => {};
    m.userData.stuff = true;
    return m;
  }
}

/** A tiny seeded random (the same contents on every visit). */
export function rng(seed) { let s = seed % 2147483646 + 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
const pick = (R, list) => list[Math.floor(R() * list.length)];

// ---------- clothes ----------

/**
 * One garment on a hanger, in the frame of the rod: x along the rod, z across (front/back), y = the rod.
 * kind: shirt | tee | dress | trousers | jacket | coat; s = size (1 adult, ~0.65 child).
 */
export function garment(p, kind, hex, s = 1) {
  const W = 0.44 * Math.min(1, 0.35 + s * 0.65), t = 0.035;
  p.box(0.006, 0.006, W * 0.9, 0, -0.06, 0, S.hanger);                                     // the hanger's bar
  p.add(new THREE.TorusGeometry(0.018, 0.0025, 4, 8, Math.PI).rotateY(Math.PI / 2).translate(0, -0.012, 0), S.hook); // its hook over the rod
  const top = -0.055;
  const L = { shirt: 0.72, tee: 0.62, dress: 1.0, trousers: 0.62, jacket: 0.8, coat: 1.05 }[kind] * s;
  if (kind === 'trousers') { // folded over the bar: two layers hanging
    p.box(t * 0.8, L / 2, W * 0.8, 0, top - L / 2, 0, hex);
    p.box(t * 0.4, 0.02, W * 0.82, 0, top - 0.01, 0, hex);
    return;
  }
  if (kind === 'dress') { // a narrow bodice, a flared skirt
    p.box(t * 0.8, L * 0.38, W * 0.62, 0, top - L * 0.38, 0, hex);
    p.add(new THREE.CylinderGeometry(W * 0.32, W * 0.62, L * 0.62, 4, 1).rotateY(Math.PI / 4).scale(0.11, 1, 1.42).translate(0, top - L * 0.38 - L * 0.31, 0), hex);
    return;
  }
  const thick = kind === 'coat' || kind === 'jacket' ? t * 1.6 : t;
  p.box(thick, L, W, 0, top - L, 0, hex);                                                  // the body
  if (kind !== 'tee') for (const sz of [-1, 1]) p.box(thick * 0.8, L * 0.78, 0.07 * s + 0.02, 0.004, top - 0.02 - L * 0.78, sz * (W / 2 + 0.03 * s), hex); // sleeves
  else for (const sz of [-1, 1]) p.box(thick * 0.9, L * 0.25, 0.08 * s, 0, top - L * 0.25, sz * (W / 2 + 0.03), hex);
  if (kind === 'coat' || kind === 'jacket') p.box(thick * 1.05, 0.08 * s, W * 0.55, 0, top - 0.06 * s, 0, S.collar ?? hex); // collar
}

/** A folded stack on a shelf / in a drawer: `n` pieces w × h × d, colours cycling, bottom centre at (x, y, z). */
export function stack(p, n, w, h, d, x, y, z, colors, R = Math.random) {
  for (let i = 0; i < n; i++) p.box(w - R() * 0.01, h, d - R() * 0.01, x + (R() - 0.5) * 0.008, y + i * h, z + (R() - 0.5) * 0.008, colors[i % colors.length]);
}

/** Rolled socks / underwear: a grid of small rolls lying along z, bottom at y. */
export function rolls(p, nx, nz, r, l, x0, x1, z0, z1, y, colors, R) {
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    const x = x0 + (x1 - x0) * (i + 0.5) / nx, z = z0 + (z1 - z0) * (k + 0.5) / nz;
    p.cyl(r, l, x, y, z, colors[(i * nz + k + Math.floor(R() * 3)) % colors.length], 'z', 7);
  }
}

/** A pair of shoes side by side, toes towards local −z of the frame, at (x, y, z). */
export function shoes(p, len, hex, x, y, z, ry = 0) {
  p.at(x, y, z, ry, (q) => {
    for (const sx of [-1, 1]) {
      q.box(len * 0.36, len * 0.22, len * 0.75, sx * len * 0.22, 0, len * 0.1, hex);        // the heel and upper
      q.box(len * 0.34, len * 0.14, len * 0.3, sx * len * 0.22, 0, -len * 0.35, hex);       // the toe
      q.box(len * 0.37, len * 0.03, len, sx * len * 0.22, 0, 0, S.sole);                    // the sole
    }
  });
}

// ---------- who has what ----------

/** The palettes and sizes of the people (STUFF.people) for a room name, or null. */
export function personFor(room) {
  return S.people.find((p) => p.rooms.includes(room)) ?? null;
}

/**
 * A wardrobe's contents: clothes on the rod (`a0`..`a1` along the rod at height `rodY`, depth centre `mid`), folded
 * things / boxes on the hat shelf (`shelfY`, up to `topY`), shoes on the floor along the front. `along`: the rod
 * runs along plan x (else z); `outward`: which way the front faces (±1 on the across axis). Returns one mesh.
 */
export function wardrobeFill({ along, a0, a1, mid, depth, outward, y0, rodY, shelfY, topY }, who, seed = 1) {
  const R = rng(seed), p = new Pack();
  // build in a frame with x along the rod and z across (+z = towards the front), then turn into plan axes
  const frame = new THREE.Matrix4();
  if (along) frame.makeRotationY(outward > 0 ? 0 : Math.PI).setPosition((a0 + a1) / 2, 0, mid);
  else frame.makeRotationY(outward > 0 ? Math.PI / 2 : -Math.PI / 2).setPosition(mid, 0, (a0 + a1) / 2);
  p.m.copy(frame);
  const L = a1 - a0 - 0.06, half = L / 2;
  // hanging clothes, tidy: grouped by kind, a gap now and then
  let x = -half + 0.03;
  const kinds = who.hang;
  let k = 0;
  while (x < half - 0.03) {
    const kind = kinds[k % kinds.length], col = who.colors[Math.floor(R() * who.colors.length)];
    p.at(x, rodY, 0, 0, (q) => garment(q, kind, col, who.size));
    x += kind === 'coat' || kind === 'jacket' ? 0.075 : 0.05 + R() * 0.012;
    if (R() < 0.12) x += 0.06;
    if (R() < 0.35) k++;
  }
  // the hat shelf: folded sweaters and a storage box or two
  const room = topY - shelfY - 0.02;
  if (room > 0.08) {
    let sx = -half + 0.05;
    while (sx < half - 0.2) {
      if (R() < 0.3) { p.box(0.32, Math.min(0.22, room - 0.02), depth * 0.7, sx + 0.16, shelfY, -0.02, pick(R, S.boxes)); sx += 0.38; continue; }
      stack(p, Math.max(1, Math.min(4, Math.floor((room - 0.02) / 0.06))), 0.3, 0.055, depth * 0.55, sx + 0.15, shelfY, 0, who.folded, R);
      sx += 0.36;
    }
  }
  // shoes on the floor near the front, toes in (clear of the middle, where the cat turns up)
  const sl = 0.26 * who.size + 0.04;
  for (let sx = -half + 0.12; sx < half - 0.1; sx += sl * 0.95 + 0.06) shoes(p, sl, pick(R, who.shoes), sx, y0 + 0.08, depth / 2 - sl / 2 - 0.02, 0);
  return p.mesh();
}

/**
 * A drawer's contents in its own frame (x across, z from −0.018 back to −0.018 − depth, floor at `y`): `what` is
 * 'tees' | 'socks' | 'underwear' | 'pyjamas' | 'jeans' | 'toys' | 'crafts' | 'nightstand'.
 */
export function drawerFill(what, { w, depth, h, y }, who, seed = 1) {
  const R = rng(seed), p = new Pack(), zc = -0.018 - depth / 2, z0 = -0.018 - depth + 0.02, z1 = -0.038;
  const cols = who?.folded ?? S.people[0].folded;
  const rows = (pw, pd, ph, n) => { // folded pieces in a grid, stacked n high
    const nx = Math.max(1, Math.floor((w - 0.02) / (pw + 0.01))), nz = Math.max(1, Math.floor((depth - 0.02) / (pd + 0.01)));
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) stack(p, n, pw, ph, pd, -w / 2 + 0.01 + (i + 0.5) * (w - 0.02) / nx, y, z0 + (k + 0.5) * (z1 - z0) / nz, cols.slice((i + k) % cols.length).concat(cols), R);
  };
  const maxN = (ph) => Math.max(1, Math.min(4, Math.floor((h - 0.03) / ph)));
  if (what === 'tees') rows(0.24, 0.2, 0.035, maxN(0.035));
  else if (what === 'pyjamas') rows(0.26, 0.22, 0.045, maxN(0.045));
  else if (what === 'jeans') { // folded jeans, as many stacks as fit across
    const blue = [0x2c4a7a, 0x3b5f94, 0x26364f, 0x4a6fa5], pw = Math.min(0.3, w - 0.02), n = Math.max(1, Math.floor((w - 0.02) / (pw + 0.02)));
    for (let i = 0; i < n; i++) stack(p, maxN(0.04), pw, 0.04, Math.min(0.32, depth - 0.04), -w / 2 + 0.01 + (i + 0.5) * (w - 0.02) / n, y, zc, blue.slice(i % 4).concat(blue), R);
  }
  else if (what === 'socks') rolls(p, Math.floor((w - 0.02) / 0.05), Math.floor((depth - 0.02) / 0.09), 0.018, 0.075, -w / 2 + 0.01, w / 2 - 0.01, z0, z1, y, who?.socks ?? S.socks, R);
  else if (what === 'underwear') rolls(p, Math.floor((w - 0.02) / 0.07), Math.floor((depth - 0.02) / 0.12), 0.022, 0.1, -w / 2 + 0.01, w / 2 - 0.01, z0, z1, y, who?.under ?? S.under, R);
  else if (what === 'toys') { // a few blocks, a ball, a toy car
    for (let i = 0; i < 6; i++) p.box(0.05, 0.05, 0.05, -w / 2 + 0.06 + (i % 3) * 0.07, y + Math.floor(i / 3) * 0.05, zc - 0.05, pick(R, [0xe63946, 0xf4a261, 0x2a9d8f, 0x457b9d, 0xffd166]));
    p.add(new THREE.SphereGeometry(0.045, 10, 8).translate(w / 4, y + 0.045, zc), 0xff6f91);
    p.box(0.1, 0.035, 0.05, -w / 2 + 0.3, y, zc + 0.08, 0x1d3557);
  } else if (what === 'crafts') { // paper stacks, a pencil case, crayons
    stack(p, 6, 0.21, 0.004, 0.297 > depth - 0.04 ? depth - 0.04 : 0.297, -w / 4, y, zc, [0xffffff, 0xffc8dd, 0xbde0fe, 0xfff3b0], R);
    p.box(0.2, 0.04, 0.06, w / 4, y, zc - 0.06, 0x9b5de5);
    for (let i = 0; i < 8; i++) p.cyl(0.005, 0.09, w / 4 - 0.08 + i * 0.022, y, zc + 0.06, pick(R, [0xe63946, 0xf77f00, 0xfcbf49, 0x2a9d8f, 0x3a86ff, 0x8338ec]), 'z', 6);
  } else if (what === 'nightstand') { // books, a charger, a glasses case
    stack(p, 3, 0.15, 0.025, 0.21, -w / 2 + 0.1, y, zc, [0x6d597a, 0xb56576, 0x355070], R);
    p.box(0.16, 0.035, 0.06, w / 2 - 0.12, y, zc - 0.05, 0x222222);
    p.cyl(0.004, 0.25, w / 2 - 0.12, y, zc + 0.06, 0xf2f2f2, 'x', 5);
    p.box(0.05, 0.025, 0.05, w / 2 - 0.12, y, zc + 0.06, 0xf2f2f2);
  }
  return p.mesh();
}
