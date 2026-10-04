import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { KLK, FURNITURE } from './config.js';
import { mergeStatic } from './merge.js';
import { litMirrorMaterial, litEmissive, litReflect } from './mirror.js';
import { addReflector } from './reflections.js';
import { Pack as StuffPack, garment, stack, rng } from './stuff.js';
import { Pack } from './contents.js';

// Sovrum 1's walk-in closet, the Klk (#331, KLK in config). Two parts:
// - `klkFittings` (world.js, Peab's fittings, stay with F): white wall standards, the high shelf on the side wall and
//   the far wall on brackets, a chrome rail under the side-wall shelf;
// - the `klk` furniture builder (a loose item): the clothes on the rail, what lies on the shelves, the make-up corner on
//   the NORDLI and the LED mirror over it (a lamp of its own + a Reflector).
// Both are authored in plan coordinates (x east, z south, y over the Övre plan floor).

const sideX = () => (KLK.side > 0 ? KLK.x1 : KLK.x0); // the side wall's inner face
const inward = () => -KLK.side;                       // from the side wall into the closet

const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f1, roughness: 0.5 });
const chrome = new THREE.MeshStandardMaterial({ color: 0xd9dadc, roughness: 0.25, metalness: 0.85 });

function box(x0, x1, y0, y1, z0, z1, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** Peab's fittings on wall rails (bärlister): added to `group` at floor height `y0` (plain static meshes, world.js
 * merges them). */
export function klkFittings(group, y0) {
  const { shelf: S, rail: R, standards: T } = KLK, wx = sideX(), dir = inward();
  const sx0 = Math.min(wx, wx + dir * S.d), sx1 = Math.max(wx, wx + dir * S.d); // the side shelf's x span
  const bx0 = KLK.side > 0 ? KLK.x0 : sx1, bx1 = KLK.side > 0 ? sx0 : KLK.x1;    // the back shelf runs up to it
  const sy = y0 + S.y;
  group.add(box(sx0, sx1, sy, sy + S.t, KLK.z0, KLK.z1, white));                  // the side shelf
  group.add(box(bx0, bx1, sy, sy + S.t, KLK.z1 - S.d, KLK.z1, white));            // the far-wall shelf
  for (const z of T.side) { // standards on the side wall + a shelf bracket on each
    group.add(box(Math.min(wx, wx + dir * T.d), Math.max(wx, wx + dir * T.d), y0 + T.y0, y0 + T.y1, z - T.w / 2, z + T.w / 2, white));
    group.add(box(Math.min(wx, wx + dir * (S.d - 0.03)), Math.max(wx, wx + dir * (S.d - 0.03)), sy - 0.05, sy, z - 0.006, z + 0.006, white));
    // the rail's bracket: an arm out from the standard, down to the rail
    const rx = wx + dir * R.out;
    group.add(box(Math.min(wx, rx), Math.max(wx, rx), y0 + R.y + 0.03, y0 + R.y + 0.045, z - 0.008, z + 0.008, chrome));
    group.add(box(rx - 0.008, rx + 0.008, y0 + R.y, y0 + R.y + 0.045, z - 0.008, z + 0.008, chrome));
  }
  for (const x of T.back) { // standards on the far wall + brackets
    group.add(box(x - T.w / 2, x + T.w / 2, y0 + T.y0, y0 + T.y1, KLK.z1 - T.d, KLK.z1, white));
    group.add(box(x - 0.006, x + 0.006, sy - 0.05, sy, KLK.z1 - S.d + 0.03, KLK.z1, white));
  }
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(R.r, R.r, R.z1 - R.z0, 16).rotateX(Math.PI / 2), chrome);
  rail.position.set(wx + dir * R.out, y0 + R.y, (R.z0 + R.z1) / 2);
  rail.castShadow = rail.receiveShadow = true;
  group.add(rail);
}

/** The loose things in the Klk (a FURNITURE item at any x/z, rot 0: its inner group undoes the item's placement). */
export function klk(item, lights) {
  const g = new THREE.Group(), inner = new THREE.Group();
  inner.rotation.y = -Math.PI; // the item's yaw is π (rot 0): back to plan axes
  inner.position.set(item.x, 0, item.z);
  g.add(inner);
  const { shelf: S, rail: R } = KLK, wx = sideX(), dir = inward();
  const keep = [];

  // clothes on the rail and things on the shelves: one vertex-coloured mesh (no raycast)
  const p = new StuffPack(), Rn = rng(331), rx = wx + dir * R.out;
  let z = R.z0 + 0.05;
  for (const [kind, hex] of KLK.clothes) {
    const step = { coat: 0.08, jacket: 0.07, dress: 0.065 }[kind] ?? 0.055;
    p.at(rx, R.y, z + step / 2, -Math.PI / 2, (q) => garment(q, kind, hex));
    z += step;
  }
  const sy = S.y + S.t, mx = wx + dir * S.d / 2, mz = KLK.z1 - S.d / 2;
  stack(p, 4, 0.24, 0.06, 0.28, mx, sy, R.z0 + 0.17, [0xeee6d3, 0x8a9a7b, 0x24324a, 0x9fb7d0], Rn); // sweaters
  stack(p, 3, 0.24, 0.07, 0.28, mx, sy, R.z0 + 0.5, [0xf5f5f0, 0xbfc8b8, 0xf5f5f0], Rn);           // towels
  p.rbox(0.25, 0.17, 0.24, mx, sy, R.z0 + 0.77, 0xb08a5a, 0.015);                                   // a basket …
  p.box(0.27, 0.015, 0.26, mx, sy + 0.165, R.z0 + 0.77, 0x8f6c44);                                  // … its rim
  p.cyl(0.12, 0.2, mx, sy, KLK.z1 - 0.14, 0xd9cbb5);                                               // a hat box in the corner
  const bx = KLK.side > 0 ? KLK.x1 - S.d : KLK.x0 + S.d;
  const along = (d) => bx - KLK.side * d; // along the far-wall shelf, from the side wall's corner
  p.box(0.33, 0.12, 0.2, along(0.25), sy, mz, 0xe8e2d6);                                           // a shoebox
  p.box(0.335, 0.03, 0.205, along(0.25), sy + 0.12, mz, 0xc9bca8);                                 // its lid
  stack(p, 3, 0.3, 0.06, 0.24, along(0.65), sy, mz, [0x1f1f1f, 0xa4532f, 0x2e3a4f], Rn);            // folded jumpers
  const hx = along(1.15);
  p.cyl(0.16, 0.012, hx, sy, mz - 0.02, 0xc2a27a, 'y', 20);                                        // a straw hat: brim,
  p.cyl(0.085, 0.09, hx, sy + 0.012, mz - 0.02, 0xc2a27a, 'y', 16);                                // crown,
  p.cyl(0.087, 0.022, hx, sy + 0.014, mz - 0.02, 0x1f1f1f, 'y', 16);                               // band
  const stuff = p.mesh();
  inner.add(stuff);
  keep.push(stuff);

  // the make-up corner on the NORDLI's top (under the mirror; its front east part stays free to put things down)
  const chest = FURNITURE.find((f) => f.type === 'nordli' && f.level === KLK.level);
  const top = chest.h, zb = KLK.z1 - 0.08, zf = KLK.z1 - chest.d + 0.12, mxM = chest.x + KLK.mirror.dx;
  const P = new Pack(), gold = 0xd4af37;
  P.box(0.3, 0.012, 0.17, mxM, top + 0.006, zb, 0xeee6d3, { gloss: true });                        // a tray …
  P.box(0.05, 0.08, 0.035, mxM - 0.09, top + 0.052, zb, 0xf3d9c9, { gloss: true });                // … perfume,
  P.cyl(0.014, 0.014, 0.025, mxM - 0.09, top + 0.104, zb, gold, { gloss: true });
  P.cyl(0.026, 0.026, 0.07, mxM - 0.02, top + 0.047, zb + 0.02, 0xd9a066, { gloss: true });         // another,
  P.cyl(0.012, 0.012, 0.03, mxM - 0.02, top + 0.097, zb + 0.02, 0x1d1d1f, { gloss: true });
  P.cyl(0.032, 0.032, 0.04, mxM + 0.06, top + 0.032, zb - 0.02, 0xfafaf8, { gloss: true });         // a jar of cream
  P.cyl(0.033, 0.033, 0.012, mxM + 0.06, top + 0.058, zb - 0.02, gold, { gloss: true });
  P.box(0.035, 0.1, 0.025, mxM + 0.11, top + 0.062, zb + 0.03, 0xe3c2a4, { gloss: true });          // foundation
  P.cyl(0.009, 0.009, 0.03, mxM + 0.11, top + 0.127, zb + 0.03, 0x111111);
  const cx = mxM - 0.22, cz = zb;                                                                   // brushes in a cup
  P.cyl(0.032, 0.027, 0.09, cx, top + 0.045, cz, 0x8a9a7b, { gloss: true });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2, tilt = [Math.sin(a) * 0.16, 0, -Math.cos(a) * 0.16];
    const x = cx + Math.cos(a) * 0.013, zz = cz + Math.sin(a) * 0.013;
    P.cyl(0.004, 0.004, 0.15, x, top + 0.11, zz, i % 2 ? 0x1d1d1f : 0xd8b4a0, { r: tilt });
    P.cyl(0.008, 0.004, 0.03, x + Math.cos(a) * 0.012, top + 0.19, zz + Math.sin(a) * 0.012, 0x3a2a24, { r: tilt });
  }
  for (let i = 0; i < 4; i++) {                                                                      // lipsticks
    const lx = mxM - 0.2 + i * 0.026;
    P.cyl(0.008, 0.008, 0.045, lx, top + 0.0225, zf, i % 2 ? gold : 0x1d1d1f, { gloss: true });
    P.cyl(0.006, 0.006, 0.02, lx, top + 0.055, zf, [0xa4532f, 0x8c2f39, 0xd8a1b0, 0xc9184a][i]);
  }
  P.box(0.15, 0.012, 0.09, mxM + 0.02, top + 0.006, zf, 0x1d1d1f, { r: [0, 0.2, 0] });              // an open palette
  [0xf5d0c5, 0xe8a598, 0xc97b84, 0x8d5b4c, 0xd8b4a0, 0x6d4c41, 0xb08a66, 0x2b2b2b].forEach((c, k) => {
    const lx = -0.0525 + (k % 4) * 0.035, lz = -0.02 + Math.floor(k / 4) * 0.04, ry = 0.2;
    P.box(0.026, 0.004, 0.03, mxM + 0.02 + lx * Math.cos(ry) + lz * Math.sin(ry), top + 0.014, zf - lx * Math.sin(ry) + lz * Math.cos(ry), c, { r: [0, ry, 0] });
  });
  const dx = mxM + 0.4;                                                                             // a jewellery dish
  P.cyl(0.055, 0.045, 0.015, dx, top + 0.0075, zb, 0xfafaf8, { gloss: true, seg: 20 });
  P.geo(new THREE.TorusGeometry(0.011, 0.0022, 6, 16), dx - 0.015, top + 0.018, zb + 0.01, gold, { r: [Math.PI / 2, 0, 0], gloss: true });
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; P.geo(new THREE.SphereGeometry(0.0045, 6, 4), dx + 0.012 + Math.cos(a) * 0.022, top + 0.019, zb - 0.008 + Math.sin(a) * 0.018, 0xf4efe6, { gloss: true }); }
  const px = (KLK.side > 0 ? chest.x + chest.w / 2 : chest.x - chest.w / 2) + dir * 0.1;            // a small plant
  P.cyl(0.05, 0.04, 0.085, px, top + 0.0425, zb, 0xc0704a);
  P.cyl(0.045, 0.045, 0.01, px, top + 0.08, zb, 0x3a2a1e);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3, lean = 0.35 + (i % 3) * 0.15;
    P.geo(new THREE.SphereGeometry(1, 8, 6).scale(0.014, 0.07, 0.03), px + Math.cos(a) * 0.025, top + 0.14, zb + Math.sin(a) * 0.025, i % 2 ? 0x5f8a4a : 0x4c7a3d,
      { r: [Math.sin(a) * lean, -a, -Math.cos(a) * lean] });
  }
  for (const m of P.meshes()) inner.add(m);

  // the LED mirror over the chest: a thin aluminium frame, the glass, a frosted LED band round it (the lamp)
  const M = KLK.mirror, mirror = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: 0xc8c8c6, roughness: 0.35, metalness: 0.6 });
  const led = new THREE.MeshStandardMaterial({ color: 0xf6f3ee, emissive: litEmissive(0xfff3e0), emissiveIntensity: 0.04, roughness: 0.3 });
  mirror.add(new THREE.Mesh(new RoundedBoxGeometry(M.w + 0.024, M.h + 0.024, 0.024, 2, 0.008).translate(0, 0, 0.012), frame));
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(M.w, M.h), litMirrorMaterial);
  glass.position.z = 0.0245;
  mirror.add(glass);
  const e = 0.035, L = M.led; // the band, inset from the glass's edge
  for (const [w, h, x, y] of [[M.w - 2 * e, L, 0, M.h / 2 - e], [M.w - 2 * e, L, 0, -M.h / 2 + e],
    [L, M.h - 2 * e - L, M.w / 2 - e, 0], [L, M.h - 2 * e - L, -M.w / 2 + e, 0]]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.002), led);
    s.position.set(x, y, 0.0265);
    mirror.add(s);
  }
  mergeStatic(mirror);
  addReflector(glass, new THREE.PlaneGeometry(M.w, M.h), { level: item.level, name: 'klk', ...litReflect }); // its mirror image (#50)
  mirror.rotation.y = Math.PI; // facing north, into the closet
  mirror.position.set(mxM, M.bottom + M.h / 2, KLK.z1 - 0.002);
  inner.add(mirror);
  keep.push(mirror);
  lights.push({ object: mirror, shade: led, height: 0, level: item.level, name: 'spegelns lampa', room: 'Klk', light: M.light, offset: [0, -0.35] });
  g.userData.keep = keep;
  return g;
}
