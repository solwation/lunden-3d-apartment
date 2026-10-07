import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CLEANING as C } from './config.js';
import { Pack } from './contents.js';

// The Klk under the stair on Entréplan (#338, CLEANING in config): cleaning things, neatly kept. Two parts:
// - `cleaningFittings` (world.js, fittings that stay with F): the white wall shelf on two standards on the north wall,
//   the aluminium tool rail with clips on the east wall, the stick vacuum's wall dock on the south wall;
// - the `cleaning` furniture builder (a loose item, hidden with F): what stands on the shelves (toilet paper, kitchen
//   roll, three labelled bins, soap and detergent bottles, spare bulbs), the mop bucket with its mop, the broom,
//   squeegee, dustpan and brush on the rail, the folded step stool and the stick vacuum in its dock.
// Plain products, no brand names. World plan coordinates (x east, z south, y over the Entréplan floor). Head room
// under the winders is low (CLEANING's comment): the mop leans on the east wall below 1.3 m, the tools hang below 1.45.

const white = new THREE.MeshStandardMaterial({ color: 0xf2f2ef, roughness: 0.55 });
const alu = new THREE.MeshStandardMaterial({ color: 0xc4c6c8, roughness: 0.35, metalness: 0.7 });
const grey = new THREE.MeshStandardMaterial({ color: 0x55585b, roughness: 0.6 });

function box(x0, x1, y0, y1, z0, z1, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.castShadow = m.receiveShadow = true;
  return m;
}

const NICHE = { x0: 3.981, x1: 4.531, z: 5.584 }; // the north wall steps back 12 cm here (plan.json)
const wallZ = (x) => (x > NICHE.x0 && x < NICHE.x1 ? NICHE.z : C.shelf.z);

/** The fittings, added to `group` at floor height `y0` (static meshes, world.js merges them). Returns the collision
 * rectangles (the shelf). */
export function cleaningFittings(group, y0) {
  const S = C.shelf, z1 = S.z + S.d;
  for (const y of S.ys) group.add(box(S.x0, S.x1, y0 + y, y0 + y + S.t, S.z, z1, white));
  for (const x of S.standards) {
    const wz = wallZ(x);
    group.add(box(x - 0.013, x + 0.013, y0 + S.ys[0] - 0.12, y0 + S.ys.at(-1) + 0.08, wz, wz + 0.014, white)); // standard
    for (const y of S.ys) group.add(box(x - 0.005, x + 0.005, y0 + y - 0.06, y0 + y, wz, z1 - 0.03, white));  // brackets
  }
  // the tool rail: an aluminium bar on two posts, dark clips and hooks
  const R = C.rail, rx = R.x - 0.03;
  group.add(box(rx - 0.006, rx + 0.006, y0 + R.y - 0.013, y0 + R.y + 0.013, R.z0, R.z1, alu));
  for (const z of [R.z0 + 0.03, R.z1 - 0.03]) group.add(box(rx, R.x, y0 + R.y - 0.01, y0 + R.y + 0.01, z - 0.01, z + 0.01, alu));
  for (const z of [5.88, 6.08]) group.add(box(rx - 0.04, rx - 0.004, y0 + R.y - 0.02, y0 + R.y + 0.02, z - 0.02, z + 0.02, grey)); // clips
  group.add(box(rx - 0.05, rx - 0.004, y0 + R.y - 0.008, y0 + R.y + 0.008, 6.235, 6.245, grey)); // a hook (dustpan)
  group.add(box(rx - 0.05, rx - 0.004, y0 + R.y - 0.008, y0 + R.y + 0.008, 6.285, 6.295, grey)); // a hook (brush)
  // the vacuum's dock: a grey plate on the south wall
  const V = C.vacuum;
  group.add(box(V.x - 0.045, V.x + 0.045, y0 + V.dock - 0.17, y0 + V.dock + 0.02, V.z - 0.022, V.z, grey));
  return [{ x0: S.solid[0], x1: S.x1, z0: S.z, z1: S.z + S.solid[1] }];
}

/** Plain printed labels for the bins: one canvas, a row each. */
function labelTexture(words) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64 * words.length;
  const g = c.getContext('2d');
  words.forEach((w, i) => {
    g.fillStyle = '#fbfbf8'; g.fillRect(0, i * 64, 256, 64);
    g.strokeStyle = '#9a9a96'; g.lineWidth = 3; g.strokeRect(6, i * 64 + 6, 244, 52);
    g.fillStyle = '#2a2a2a'; g.font = 'bold 38px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(w, 128, i * 64 + 34);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A hollow storage bin (open top) of width w, height h, depth d, its bottom centre at (x, y, z). */
function bin(P, w, h, d, x, y, z, col) {
  const t = 0.006;
  P.box(w, t, d, x, y + t / 2, z, col);
  P.box(w, h, t, x, y + h / 2, z - d / 2 + t / 2, col);
  P.box(w, h, t, x, y + h / 2, z + d / 2 - t / 2, col);
  P.box(t, h, d, x - w / 2 + t / 2, y + h / 2, z, col);
  P.box(t, h, d, x + w / 2 - t / 2, y + h / 2, z, col);
}

/** A bottle standing at (x, y, z): body, a coloured label band, a cap; `pump` = a pump head, `spray` = a trigger. */
function bottle(P, r, h, x, y, z, col, band, cap, { pump, spray, square } = {}) {
  if (square) P.box(r * 2, h, r * 1.3, x, y + h / 2, z, col, { gloss: true });
  else P.cyl(r, r, h, x, y + h / 2, z, col, { gloss: true, seg: 16 });
  if (square) P.box(r * 2 + 0.002, h * 0.4, r * 1.3 + 0.002, x, y + h * 0.45, z, band);
  else P.cyl(r + 0.001, r + 0.001, h * 0.4, x, y + h * 0.45, z, band, { seg: 16 });
  P.cyl(r * 0.45, r * 0.8, h * 0.12, x, y + h * 1.06, z, col, { gloss: true });          // the shoulder
  P.cyl(r * 0.38, r * 0.38, 0.025, x, y + h * 1.12 + 0.012, z, cap, { gloss: true });    // the cap
  const top = y + h * 1.12 + 0.025;
  if (pump) {
    P.cyl(0.005, 0.005, 0.03, x, top + 0.015, z, cap);
    P.box(0.018, 0.012, 0.045, x, top + 0.034, z + 0.012, cap, { gloss: true });
  }
  if (spray) {
    P.box(0.03, 0.05, 0.045, x, top + 0.025, z + 0.005, cap, { gloss: true });
    P.box(0.012, 0.04, 0.012, x, top + 0.0, z + 0.03, cap, { r: [0.4, 0, 0] });         // the trigger
    P.box(0.014, 0.014, 0.02, x, top + 0.04, z + 0.035, cap);                            // the nozzle
  }
}

/** The loose things in the Klk (a FURNITURE item at any x/z, rot 0: its inner group undoes the item's placement). */
export function cleaning(item) {
  const g = new THREE.Group(), inner = new THREE.Group();
  inner.rotation.y = -Math.PI; // the item's yaw is π (rot 0): back to plan axes
  inner.position.set(item.x, 0, item.z);
  g.add(inner);
  const P = new Pack(), S = C.shelf;
  const top = (i) => S.ys[i] + S.t, zc = S.z + S.d / 2;

  // shelf 1: a 12-pack of toilet paper (wrapped: a printed band), loose rolls, kitchen roll
  const tp = 0xf7f6f1, rr = 0.055, rh = 0.105;
  for (let ix = 0; ix < 3; ix++) for (let iz = 0; iz < 2; iz++) for (let iy = 0; iy < 2; iy++) {
    P.cyl(rr, rr, rh, 3.98 + ix * 0.112, top(0) + rh / 2 + iy * rh, zc - 0.056 + iz * 0.112, tp, { seg: 14 });
  }
  P.box(0.345, 0.05, 0.232, 4.092, top(0) + rh, zc, 0x9fc3dd, { gloss: true }); // the wrap's band
  P.box(0.06, 0.03, 0.01, 4.092, top(0) + 2 * rh + 0.015, zc, 0xe9eef2, { gloss: true }); // its carry loop
  for (const [x, y, z] of [[4.33, 0, -0.06], [4.33, rh, -0.06], [4.33, 0, 0.06]]) {
    P.cyl(rr, rr, rh, x, top(0) + y + rh / 2, zc + z, tp, { seg: 14 });
    P.cyl(0.02, 0.02, rh + 0.002, x, top(0) + y + rh / 2, zc + z, 0x8a7a64, { seg: 8 }); // the core
  }
  for (const x of [4.45, 4.568]) P.cyl(0.058, 0.058, 0.24, x, top(0) + 0.12, zc, 0xfbfbf7, { seg: 14 }); // kitchen roll
  P.box(0.24, 0.06, 0.122, 4.509, top(0) + 0.12, zc, 0xb9d6a8, { gloss: true });

  // shelf 2: three labelled bins (Städ: sponges and cloths, Tvål: refills, Påsar: rubbish-bag rolls)
  const bw = 0.24, bh = 0.15, bd = 0.25, bz = zc - 0.01, by = top(1), binCol = 0xd9dcdd;
  const bx = [3.995, 4.25, 4.505];
  for (const x of bx) bin(P, bw, bh, bd, x, by, bz, binCol);
  const sp = [0xf2c94c, 0x7bbf6a, 0xf2c94c, 0x7bbf6a];
  for (let i = 0; i < 4; i++) {                                                      // sponges (yellow, a green scourer)
    const stack = Math.floor(i / 2);
    const baseX = bx[0] - 0.06 + (i % 2) * 0.095;
    const baseZ = bz - 0.06;
    // scourer pad on bottom (0.008m thick), sponge on top (0.025m thick), perfectly stacked without overlap
    const padY = by + 0.114 + stack * 0.035;
    const spongeY = padY + 0.004 + 0.0125;
    P.box(0.08, 0.008, 0.06, baseX, padY, baseZ, i % 2 ? 0x2f6b3a : 0xf2c94c);
    P.box(0.08, 0.025, 0.06, baseX, spongeY, baseZ, sp[i]);
  }
  [0x5b8fd6, 0xe58fb0, 0xf0f0ec].forEach((c, i) => P.box(0.1, 0.03, 0.09, bx[0] + 0.045, by + 0.1 + i * 0.03, bz + 0.06, c)); // folded cloths
  for (let i = 0; i < 3; i++) P.box(0.06, 0.16, 0.04, bx[1] - 0.07 + i * 0.07, by + 0.09, bz + 0.03, [0xc9b5e0, 0x9fd2c4, 0xc9b5e0][i], { gloss: true, r: [-0.15, 0, 0] }); // refill pouches
  for (let i = 0; i < 4; i++) P.cyl(0.028, 0.028, 0.18, bx[2] - 0.084 + i * 0.056, by + 0.11, bz, [0x3b3f42, 0x6b8e5a, 0x3b3f42, 0x2f4f7a][i], { r: [Math.PI / 2, 0, 0], seg: 10 }); // bag rolls

  // shelf 3: hand soap, refill bottles, dish soap, a detergent bottle, a cleaning spray
  bottle(P, 0.032, 0.13, 3.92, top(2), zc + 0.05, 0xfbfbf7, 0x8fc4a8, 0xfbfbf7, { pump: true });
  bottle(P, 0.032, 0.13, 3.995, top(2), zc + 0.05, 0xfbfbf7, 0x8fc4a8, 0xfbfbf7, { pump: true });
  bottle(P, 0.045, 0.2, 3.935, top(2), zc - 0.07, 0xc9b5e0, 0xfbfbf7, 0x6b5a8a, { square: true });
  bottle(P, 0.045, 0.2, 4.035, top(2), zc - 0.07, 0xc9b5e0, 0xfbfbf7, 0x6b5a8a, { square: true });
  bottle(P, 0.03, 0.2, 4.13, top(2), zc - 0.04, 0x6fbf73, 0xfbfbf7, 0xe8e8e2, { square: true });
  bottle(P, 0.03, 0.2, 4.195, top(2), zc - 0.04, 0x6fbf73, 0xfbfbf7, 0xe8e8e2, { square: true });
  bottle(P, 0.065, 0.22, 4.32, top(2), zc - 0.02, 0x3f78c2, 0xfbfbf7, 0xf2f2ee, { square: true }); // detergent
  bottle(P, 0.04, 0.17, 4.47, top(2), zc + 0.02, 0xf4f4f0, 0x76b7e0, 0x2f6fae, { spray: true }); // all-purpose spray
  bottle(P, 0.04, 0.17, 4.57, top(2), zc + 0.02, 0xf4f4f0, 0xf0b36a, 0xd9822b, { spray: true }); // bathroom spray

  // shelf 4: spare bulbs, a box of light bulbs, folded cloths, a roll of baking paper / foil
  for (let i = 0; i < 4; i++) P.box(0.07, 0.11, 0.07, 3.93 + i * 0.08, top(3) + 0.055, zc - 0.06, i % 2 ? 0xf2e3c2 : 0xe9e4d8);
  P.box(0.22, 0.12, 0.2, 4.35, top(3) + 0.06, zc, 0xc8a878);                         // a cardboard storage box
  P.box(0.225, 0.012, 0.205, 4.35, top(3) + 0.126, zc, 0xb9986a);                     // its lid
  [0x5b8fd6, 0x8a9a7b, 0xe58fb0, 0x5b8fd6].forEach((c, i) => P.box(0.14, 0.025, 0.16, 4.54, top(3) + 0.0125 + i * 0.025, zc, c)); // microfibre cloths

  // a folded step stool standing against the wall under the shelf
  P.box(0.36, 0.62, 0.04, 4.25, 0.31, S.z + 0.04, 0xf2f2ef, { r: [-0.06, 0, 0] });
  P.box(0.3, 0.03, 0.05, 4.25, 0.5, S.z + 0.075, 0x8a8f94);
  P.box(0.3, 0.03, 0.05, 4.25, 0.25, S.z + 0.08, 0x8a8f94);

  // the mop bucket: a grey lathe (outside up, inside down), grey water, a blue wringer, a wire handle
  const B = C.bucket, prof = [[0, 0], [B.r - 0.02, 0], [B.r, 0.02], [B.r + 0.004, B.h], [B.r - 0.006, B.h], [B.r - 0.024, 0.012], [0, 0.012]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  P.geo(new THREE.LatheGeometry(prof, 24), B.x, 0, B.z, 0x8b9196);
  P.cyl(B.r - 0.012, B.r - 0.012, 0.004, B.x, 0.17, B.z, 0x8fa1a8, { gloss: true, seg: 24 });             // water
  P.box(0.11, 0.12, 0.2, B.x + B.r - 0.04, B.h + 0.03, B.z, 0x2f6fae, { gloss: true });                 // the wringer
  P.box(0.03, 0.014, 0.16, B.x + B.r - 0.02, B.h + 0.1, B.z, 0x1d4f84, { r: [0, 0, -0.5] });           // its lever
  P.geo(new THREE.TorusGeometry(B.r + 0.01, 0.004, 6, 24, Math.PI), B.x, B.h - 0.02, B.z, 0x55585b, { r: [0, Math.PI / 2, 0] }); // the handle
  // the mop: cotton strands in the bucket, the handle leaning on the east wall (top under the winders: < 1.3 m)
  const mopBase = new THREE.Vector3(B.x - 0.04, 0.2, B.z), mopTop = new THREE.Vector3(C.rail.x - 0.02, 1.25, B.z + 0.22);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    P.cyl(0.012, 0.009, 0.16, mopBase.x + Math.cos(a) * 0.035, 0.12, mopBase.z + Math.sin(a) * 0.035, 0xe9e5da, { r: [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35], seg: 5 });
  }
  P.cyl(0.03, 0.022, 0.05, mopBase.x, 0.215, mopBase.z, 0x2f6fae);                  // the head's socket
  const dir = mopTop.clone().sub(mopBase), len = dir.length(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  const handle = (r, l, at, col) => P.geo(new THREE.CylinderGeometry(r, r, l, 10).applyQuaternion(q), at.x, at.y, at.z, col, { gloss: true });
  handle(0.012, len, mopBase.clone().addScaledVector(dir, 0.5), 0xc4c6c8);
  handle(0.0145, 0.16, mopBase.clone().addScaledVector(dir, 1 - 0.08 / len), 0x2f6fae);  // the grip

  // on the rail: a broom (head down), a floor squeegee, a dustpan and a hand brush on hooks
  const rx = C.rail.x - 0.075;
  P.cyl(0.012, 0.012, 1.12, rx, 0.86, 5.88, 0x7a5a3c, { seg: 10 });                 // broom handle
  P.box(0.05, 0.06, 0.28, rx, 0.27, 5.88, 0x3b3f42);                                // its head
  P.box(0.045, 0.1, 0.27, rx, 0.19, 5.88, 0xc9a66b);                                // bristles
  P.cyl(0.012, 0.012, 0.98, rx, 0.91, 6.08, 0xc4c6c8, { seg: 10, gloss: true });    // squeegee handle
  P.box(0.03, 0.05, 0.34, rx, 0.4, 6.08, 0x55585b);                                 // its holder
  P.box(0.012, 0.03, 0.35, rx, 0.36, 6.08, 0x1d1d1f);                               // the rubber blade
  P.box(0.012, 0.2, 0.2, C.rail.x - 0.05, 1.06, 6.24, 0x2f6fae, { gloss: true });  // dustpan
  P.box(0.03, 0.2, 0.012, C.rail.x - 0.06, 1.06, 6.14, 0x2f6fae, { gloss: true });  // its sides
  P.box(0.03, 0.2, 0.012, C.rail.x - 0.06, 1.06, 6.34, 0x2f6fae, { gloss: true });
  P.box(0.02, 0.1, 0.03, C.rail.x - 0.05, 1.21, 6.24, 0x2f6fae, { gloss: true });   // its handle
  P.box(0.025, 0.22, 0.035, C.rail.x - 0.1, 1.15, 6.29, 0x2f6fae, { gloss: true }); // hand brush
  P.box(0.03, 0.06, 0.04, C.rail.x - 0.1, 1.01, 6.29, 0x3b3f42);                    // its bristles

  // the stick vacuum in its dock is managed by Vacuum holdable (vacuum.js, #389)
  const V = C.vacuum;
  const words = ['Städ', 'Tvål', 'Påsar'], tex = labelTexture(words);
  const labels = bx.map((x, i) => {
    const p = new THREE.PlaneGeometry(0.12, 0.03), uv = p.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setY(k, (words.length - 1 - i + uv.getY(k)) / words.length);
    return p.translate(x, by + bh * 0.6, bz + bd / 2 + 0.002);
  });
  inner.add(new THREE.Mesh(mergeGeometries(labels), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 })));

  // collision (local frame: yaw π, so local = item − world): the vacuum. The bucket and the tool rail stand under the
  // winders, where the stair's soffit already keeps you out; a footprint there would catch the visitor on the winders
  // (the level-0 segments still count up to 1.6 m)
  const loc = (x0, x1, z0, z1) => ({ x0: item.x - x1, x1: item.x - x0, z0: item.z - z1, z1: item.z - z0 });
  g.userData.footprint = [loc(V.x - 0.13, V.x + 0.13, V.z - 0.2, V.z)];
  return g;
}
