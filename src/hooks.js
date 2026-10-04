// Hook rails (#329, HOOKS in config): Sovrum 1's oak board with black single hooks on the Klk wall, a sage terry
// dressing gown hanging by its loop, a navy hoodie hanging by its hood, the other hooks empty. #330: the kids' rooms get
// one each on the wardrobe's end by the door (KID_HOOKS, `set` on the FURNITURE item): Sovrum 2 a charcoal hoodie with a
// red print and a cap, Sovrum 3 a pink zip hoodie and a tote bag with a rainbow. Built by furniture.js (FURNITURE type
// 'hookrail'), merged per material there; a loose item (hidden with F), no collision.
import * as THREE from 'three';
import { HOOKS, KID_HOOKS, TOWEL_HOOKS } from './config.js';

/** A small tileable cloth texture (grey levels, multiplied by the material colour): `kind` 'waffle' (terry waffle
 * cells) or 'rib' (fine vertical ribs). Also the bump map. */
function clothTexture(kind) {
  const n = 64, c = document.createElement('canvas'); c.width = c.height = n;
  const x = c.getContext('2d'), img = x.createImageData(n, n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    let v;
    if (kind === 'waffle') {
      const a = Math.abs(((i + 0.5) / n) * 2 - 1), b = Math.abs(((j + 0.5) / n) * 2 - 1);
      const ridge = Math.max(Math.pow(a, 6), Math.pow(b, 6)); // raised ridges round a sunken cell
      v = 0.8 + 0.2 * ridge;
    } else if (kind === 'terry') { // loop pile: speckled light / dark fuzz in tiny clumps
      const h = (a, b) => { const q = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return q - Math.floor(q); };
      v = 0.8 + 0.12 * h(i, j) + 0.08 * h(i >> 1, j >> 1);
    } else v = 0.86 + 0.14 * Math.pow(Math.abs(Math.sin(((i + 0.5) / n) * Math.PI * 4)), 0.6);
    v *= 0.94 + 0.06 * Math.sin(i * 12.9898 + j * 78.233) ** 2; // a little fibre noise
    const k = (j * n + i) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.round(255 * v); img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function cloth(color, kind, cell) {
  const map = clothTexture(kind);
  map.repeat.set(1 / cell, 1 / cell); // UVs are in metres
  return new THREE.MeshStandardMaterial({ color, map, bumpMap: map, bumpScale: 0.6, roughness: 1, side: THREE.DoubleSide });
}

const smooth = (a, b, t) => { const u = Math.min(1, Math.max(0, (t - a) / (b - a))); return u * u * (3 - 2 * u); };

/**
 * A soft hanging piece of cloth: a flattened tube from y 0 down to −len, its back flat against the wall (local z 0) and
 * its front bulging out. `hw(v)` / `hd(v)` = half width / depth at v (0 top … 1 hem); `folds(v)` = depth of the
 * vertical folds on the front, `out(v)` = how far the tube stands off the wall (the top on the hook). UVs in metres.
 */
function drape(len, { hw, hd, folds = () => 0, out = () => 0, seed = 1, nu = 40, nv = 36, x0 = 0 }) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) {
    const v = j / nv, w = hw(v), d = hd(v), f = folds(v), o = out(v);
    let arc = 0, px = 0, pz = 0;
    for (let i = 0; i <= nu; i++) {
      const th = (i / nu) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      let x = w * c, z;
      if (s >= 0) z = d * Math.pow(s, 0.7) + f * s * Math.sin((x / 0.11) * Math.PI * 2 + seed) ; // the front, with folds
      else z = d * 0.15 * s;                                                                     // the back, nearly flat
      z += d * 0.15 + o + 0.004;
      const y = -v * len + (v > 0.97 ? 0.006 * Math.sin(x * 40 + seed) : 0); // an uneven hem
      if (i) arc += Math.hypot(x - px, z - pz);
      px = x; pz = z;
      pos.push(x + x0, y, z); uv.push(arc, v * len);
    }
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + nu + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** The front surface's z of a drape at (x ≈ 0, v): for patches sewn on the front. */
const frontZ = (hd, out, v) => hd(v) * 1.15 + out(v) + 0.004;

function mesh(geo, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = o.receiveShadow = true;
  return o;
}

/** A sleeve hanging from a shoulder: a tube `len` long, `r0` → `r1`, a cuff (turned back) at the end. */
function sleeve(len, r0, r1, m, cuff) {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(r0, r1, len, 14, 6, true);
  // soft creases: wobble the radius a little along the length
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), a = Math.atan2(p.getZ(i), p.getX(i)), k = 1 + 0.08 * Math.sin(y * 23 + a * 2) * (0.5 - y / len);
    p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k * 0.75);
  }
  geo.computeVertexNormals();
  g.add(mesh(geo, m, 0, -len / 2, 0));
  if (cuff) { const cf = mesh(new THREE.CylinderGeometry(r1 * cuff, r1 * cuff * 1.04, 0.07, 14, 1), m, 0, -len + 0.03, 0); cf.scale.z = 0.75; g.add(cf); }
  return g;
}

/** The dressing gown, hung from its neck loop at (0, 0, hookZ): shawl collar, sleeves with turned-back cuffs, a belt
 * knotted at the waist with both ends hanging, patch pockets. Back against the wall (local z 0). */
function gown(spec, hookZ) {
  const g = new THREE.Group();
  const m = cloth(spec.color, 'waffle', 0.022);
  const len = spec.len;
  // the loop pulls the collar into a point; the shoulders drop away from it, the body widens a little to the hem
  const hw = (v) => 0.03 + 0.14 * smooth(0, 0.16, v) + 0.015 * smooth(0.5, 1, v);
  const hd = (v) => 0.02 + 0.035 * smooth(0, 0.2, v) - 0.012 * smooth(0.6, 1, v);
  const out = (v) => (hookZ - 0.02) * (1 - smooth(0, 0.18, v));
  const folds = (v) => 0.004 + 0.014 * smooth(0.4, 1, v);
  g.add(mesh(drape(len, { hw, hd, out, folds, seed: 1.3 }), m));
  // shawl collar: two thick lapels from the neck down to the belt, crossing in a V
  const vb = 0.43, yb = -vb * len, zf = frontZ(hd, out, 0.25);
  for (const s of [-1, 1]) {
    const lap = mesh(new THREE.CapsuleGeometry(0.03, 0.34, 4, 8), m, s * 0.05, -0.26, zf + 0.004);
    lap.rotation.z = s * 0.28; lap.scale.set(1, 1, 0.45);
    g.add(lap);
  }
  // sleeves along the sides, a little forward, turned-back cuffs
  for (const s of [-1, 1]) {
    const sl = sleeve(0.56, 0.06, 0.07, m, 1.18); // hanging in front of the body's sides
    sl.position.set(s * 0.11, -0.15, frontZ(hd, out, 0.3) - 0.01);
    sl.rotation.z = s * 0.05;
    g.add(sl);
  }
  // the belt: round the waist (a band over the front), a knot, both ends hanging
  const band = drape(0.045, { hw: () => hw(vb) + 0.012, hd: () => hd(vb) + 0.01, out: () => out(vb), nv: 2 });
  g.add(mesh(band, m, 0, yb + 0.02, -0.004));
  const zk = frontZ(hd, out, vb) + 0.02;
  const knot = mesh(new THREE.SphereGeometry(0.03, 12, 8), m, -0.05, yb, zk);
  knot.scale.set(1.3, 0.9, 0.7);
  g.add(knot);
  for (const [dx, l, a] of [[-0.07, spec.belt, 0.08], [-0.035, spec.belt * 0.8, -0.05]]) {
    const end = mesh(new THREE.CapsuleGeometry(0.02, l, 3, 6), m, dx, yb - l / 2 - 0.01, zk + 0.004);
    end.scale.set(1, 1, 0.4); end.rotation.z = a;
    g.add(end);
  }
  // the front edge (the wrap's overlap) from the belt down, and two patch pockets
  const ze = frontZ(hd, out, 0.7);
  const edge = mesh(new THREE.CapsuleGeometry(0.012, len * 0.5, 3, 6), m, 0.04, yb - len * 0.29, ze);
  edge.scale.set(1, 1, 0.5);
  g.add(edge);
  for (const s of [-1, 1]) {
    const p = mesh(new THREE.BoxGeometry(0.12, 0.15, 0.012), m, s * 0.1, -0.6 * len, frontZ(hd, out, 0.6) - 0.01);
    g.add(p);
  }
  // the hanging loop over the hook
  const loop = mesh(new THREE.TorusGeometry(0.018, 0.004, 6, 14), m, 0, 0.004, hookZ - 0.006);
  loop.rotation.y = Math.PI / 2;
  g.add(loop);
  return g;
}

/** The hoodie hung by its hood from (0, 0, hookZ): the hood (its face opening dark), drawstrings, the body with a
 * kangaroo pocket and a ribbed hem, sleeves with ribbed cuffs. */
function hoodie(spec, hookZ) {
  const g = new THREE.Group();
  const m = cloth(spec.color, 'rib', 0.012);
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.color).multiplyScalar(0.35), roughness: 1 });
  const H = spec.hood, len = spec.len;
  // the hood: pinched on the hook, a rounded pouch down to the neck
  const hhw = (v) => 0.02 + 0.09 * smooth(0, 0.5, v) - 0.02 * smooth(0.75, 1, v);
  const hhd = (v) => 0.02 + 0.05 * smooth(0, 0.5, v);
  const hout = (v) => (hookZ - 0.02) * (1 - smooth(0, 0.5, v)) + 0.01;
  g.add(mesh(drape(H + 0.04, { hw: hhw, hd: hhd, out: hout, nu: 28, nv: 16 }), m));
  const face = mesh(new THREE.SphereGeometry(1, 16, 10), dark, 0, -H * 0.62, frontZ(hhd, hout, 0.62) - 0.012);
  face.scale.set(0.055, 0.07, 0.012);
  g.add(face);
  // the body from the neck (under the hood) down
  const body = new THREE.Group();
  body.position.y = -H;
  const hw = (v) => 0.09 + 0.1 * smooth(0, 0.12, v) - 0.02 * smooth(0.9, 0.93, v);
  const hd = (v) => 0.03 + 0.03 * smooth(0, 0.15, v) - 0.01 * smooth(0.7, 1, v);
  const out = () => 0.005;
  const folds = (v) => 0.003 + 0.006 * smooth(0.3, 0.9, v);
  body.add(mesh(drape(len, { hw, hd, out, folds, seed: 4.1 }), m));
  // kangaroo pocket: a trapezoid patch on the front, its openings dark lines
  const zp = frontZ(hd, out, 0.72);
  const ps = new THREE.Shape();
  ps.moveTo(-0.12, 0); ps.lineTo(0.12, 0); ps.lineTo(0.08, 0.15); ps.lineTo(-0.08, 0.15); ps.closePath();
  const pg = new THREE.ExtrudeGeometry(ps, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.006, bevelSegments: 1 });
  if (spec.zip) {
    // a zip hoodie: split pocket halves either side of the zip, a zip tape from the neck to the hem, a pull at the top
    const tape = new THREE.MeshStandardMaterial({ color: spec.zip, roughness: 0.5, metalness: 0.3 });
    for (const s of [-1, 1]) body.add(mesh(new THREE.BoxGeometry(0.09, 0.13, 0.01), m, s * 0.065, -0.79 * len, zp - 0.002));
    for (let k = 0; k < 6; k++) {
      const v0 = 0.02 + k * 0.16, v1 = Math.min(0.97, v0 + 0.16), y = -((v0 + v1) / 2) * len;
      const zz = (frontZ(hd, out, v0) + frontZ(hd, out, v1)) / 2 + (v0 > 0.6 ? 0.012 : 0.002);
      body.add(mesh(new THREE.BoxGeometry(0.009, (v1 - v0) * len + 0.004, 0.004), tape, 0, y, zz));
    }
    body.add(mesh(new THREE.BoxGeometry(0.014, 0.035, 0.005), tape, 0, -0.04, frontZ(hd, out, 0.04) + 0.006));
  } else {
    body.add(mesh(pg, m, 0, -0.86 * len, zp - 0.006));
    for (const s of [-1, 1]) {
      const slit = mesh(new THREE.BoxGeometry(0.008, 0.12, 0.004), dark, s * 0.105, -0.86 * len + 0.07, zp + 0.009);
      slit.rotation.z = s * 0.3;
      body.add(slit);
    }
  }
  if (spec.print) {
    // a small chest print on the left breast (the wearer's left = our right): a ring round a dot
    const ink = new THREE.MeshStandardMaterial({ color: spec.print, roughness: 0.7 });
    const zc = frontZ(hd, out, 0.24) + 0.001, px = spec.zip ? 0.08 : 0.07;
    body.add(mesh(new THREE.TorusGeometry(0.024, 0.006, 6, 20), ink, px, -0.24 * len, zc));
    body.add(mesh(new THREE.CircleGeometry(0.01, 14), ink, px, -0.24 * len, zc + 0.002));
  }
  // sleeves with ribbed cuffs
  for (const s of [-1, 1]) {
    const sl = sleeve(0.58, 0.055, 0.05, m, 0.85);
    sl.position.set(s * 0.14, -0.07, frontZ(hd, out, 0.2) - 0.012);
    sl.rotation.z = s * 0.06;
    body.add(sl);
  }
  g.add(body);
  // drawstrings from the hood's front edge, white aglets
  const white = new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.8 });
  const zs = frontZ(hd, out, 0.08) + 0.004;
  for (const s of [-1, 1]) {
    const l = s < 0 ? 0.22 : 0.26;
    body.add(mesh(new THREE.CylinderGeometry(0.0035, 0.0035, l, 5), white, s * 0.04, -l / 2, zs));
    body.add(mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.025, 6), white, s * 0.04, -l - 0.01, zs));
  }
  return g;
}

/** A cap hung by its back strap from (0, 0, hookZ): the crown's opening against the wall, its top (with the button)
 * facing out, the peak sticking out and down from the crown's lower edge, a small round badge on the front panel just
 * above it. */
function cap(spec, hookZ) {
  const g = new THREE.Group();
  const m = cloth(spec.color, 'rib', 0.006);
  const r = spec.r, cy = -r - 0.02, dz = 0.82; // the crown's centre; squashed out from the wall (a cap is shallow)
  const crown = mesh(new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, cy, 0.006);
  crown.rotation.x = Math.PI / 2; crown.scale.set(1, dz, 1); // local y = out from the wall
  g.add(crown);
  // the button at the top of the crown (now its outermost point)
  g.add(mesh(new THREE.SphereGeometry(0.008, 8, 6), m, 0, cy, 0.006 + r * dz + 0.002));
  // the peak: a flattened half disc on the crown's lower edge, pointing out and down
  const pg = new THREE.CylinderGeometry(r * 0.95, r * 0.95, 0.007, 20, 1, false, -Math.PI / 2, Math.PI);
  const pp = pg.attributes.position;
  for (let i = 0; i < pp.count; i++) pp.setY(i, pp.getY(i) - 2.2 * pp.getX(i) ** 2); // curved across, like a real peak
  pg.computeVertexNormals();
  const peak = mesh(pg, m);
  peak.scale.set(1, 1, 0.8);
  const pivot = new THREE.Group();
  pivot.add(peak);
  pivot.position.set(0, cy - r * 0.82, 0.015); pivot.rotation.x = 0.95; // its base inside the crown, hanging down-out
  g.add(pivot);
  // the back strap's loop on the hook
  const strap = mesh(new THREE.TorusGeometry(0.014, 0.004, 6, 12), m, 0, -0.008, hookZ - 0.006);
  strap.rotation.y = Math.PI / 2;
  g.add(strap);
  if (spec.badge) {
    const badge = new THREE.MeshStandardMaterial({ color: spec.badge, roughness: 0.6 });
    const a = 0.42, b = mesh(new THREE.CircleGeometry(0.016, 16), badge, 0, cy - r * Math.sin(a) * 0.98, 0.006 + r * dz * Math.cos(a) + 0.004);
    b.rotation.x = a * 0.8;
    g.add(b);
  }
  return g;
}

/** A canvas tote bag hung by both handles from (0, 0, hookZ): a soft flat bag (bulging a little), the handles meeting on
 * the hook, a rainbow print (arcs and two clouds) on the front. */
function tote(spec, hookZ) {
  const g = new THREE.Group();
  const m = cloth(spec.color, 'rib', 0.008);
  const H = spec.h, hw = spec.w / 2, top = -spec.handle;
  const hd = (v) => 0.01 + 0.025 * Math.sin(Math.PI * Math.min(1, v * 1.1));
  g.add(mesh(drape(H, { hw: (v) => hw * (0.96 + 0.04 * smooth(0, 0.3, v)), hd, out: () => 0.002,
    folds: (v) => 0.002 * smooth(0.5, 1, v), nu: 28, nv: 18, seed: 2.2 }), m, 0, top, 0));
  // the handles: a strap from each top corner up to the hook
  for (const s of [-1, 1]) {
    const a = new THREE.Vector3(s * hw * 0.55, top + 0.005, 0.02), b = new THREE.Vector3(0, -0.006, hookZ - 0.004);
    const strap = mesh(new THREE.BoxGeometry(0.022, a.distanceTo(b), 0.004), m, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    strap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.add(strap);
  }
  if (spec.rainbow) {
    const v = 0.55, zc = hd(v) * 1.15 + 0.002 + 0.004 + 0.002, yc = top - H * v;
    spec.rainbow.forEach((c, k) => {
      const ink = new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
      g.add(mesh(new THREE.TorusGeometry(0.07 - k * 0.013, 0.006, 6, 24, Math.PI), ink, 0, yc, zc));
    });
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    for (const s of [-1, 1]) {
      const cl = mesh(new THREE.SphereGeometry(0.018, 10, 6), white, s * 0.062, yc - 0.002, zc);
      cl.scale.set(1.5, 0.8, 0.3);
      g.add(cl);
    }
  }
  return g;
}

const towelMats = new Map(); // one material per colour for every towel (and bath mat), both bathrooms
function towelCloth(color, kind, cell) {
  const k = `${color}|${kind}|${cell}`;
  if (!towelMats.has(k)) towelMats.set(k, cloth(color, kind, cell));
  return towelMats.get(k);
}

/** A terry hand towel hung by its loop from (0, 0, hookZ) (#424): pinched at the loop, widening and falling in soft
 * folds, a smoother woven border band across it near the top and the hem, the hem a little uneven. */
function towel(spec, hookZ) {
  const g = new THREE.Group();
  const m = towelCloth(spec.color, 'terry', 0.03), band = towelCloth(spec.band ?? spec.color, 'rib', 0.006);
  const len = spec.len, W = spec.w / 2, sd = spec.seed ?? 1;
  const hw = (v) => 0.022 + (W - 0.022) * smooth(0, 0.22, v) + 0.01 * smooth(0.6, 1, v);
  const hd = (v) => 0.007 + 0.012 * smooth(0, 0.2, v) + 0.005 * Math.sin(v * 7 + sd);
  const out = (v) => (hookZ - 0.012) * (1 - smooth(0, 0.2, v));
  const folds = (v) => 0.004 + 0.008 * smooth(0.1, 1, v);
  // hung by a corner loop: the cloth sways a little sideways down its length and the hem runs on the slant
  const slant = spec.slant ?? 0.35, sway = 0.012;
  const bend = (geo, dy) => {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), v = Math.min(1, Math.max(0, -(p.getY(i) + dy) / len));
      p.setX(i, x + sway * Math.sin(v * 4 + sd) * v);
      p.setY(i, p.getY(i) + slant * x * smooth(0.45, 1, v));
    }
    geo.computeVertexNormals();
    return geo;
  };
  g.add(mesh(bend(drape(len, { hw, hd, out, folds, seed: sd, nu: 32, nv: 30 }), 0), m));
  // the woven border bands: thin sleeves just over the terry
  for (const vb of spec.bands ?? [0.24, 0.9]) {
    const dy = -vb * len + 0.011;
    const bb = drape(0.022, { hw: () => hw(vb) + 0.0015, hd: () => hd(vb) + 0.0015, out: () => out(vb), folds: () => folds(vb), seed: sd, nu: 32, nv: 1 });
    g.add(mesh(bend(bb, dy), band, 0, dy, -0.0015));
  }
  // the hanging loop over the hook
  const loop = mesh(new THREE.TorusGeometry(0.016, 0.0035, 6, 14), band, 0, 0.004, hookZ - 0.008);
  loop.rotation.y = Math.PI / 2; loop.scale.set(1, 1.4, 1);
  g.add(loop);
  return g;
}

const GARMENTS = { gown, hoodie, cap, tote, towel };

/** The rail (local −z = the wall, the board's back at z 0): a board, `hooks` single hooks and the garments
 * (`garments`: [{ kind, on, scale?, dz?, ... }], `on` = the hook, 0 = local −x; the other hooks stay empty). */
export function hookrail(item) {
  const c = { ...HOOKS, ...(item.set ? KID_HOOKS[item.set] : {}), ...item };
  const g = new THREE.Group();
  const oak = new THREE.MeshStandardMaterial({ color: c.board, roughness: 0.6 });
  const black = new THREE.MeshStandardMaterial({ color: c.hook ?? 0x1c1c1e, roughness: 0.45, metalness: c.hookMetal ?? 0.5 });
  const t = 0.018;
  g.add(mesh(new THREE.BoxGeometry(c.w, c.h, t), oak, 0, c.y, t / 2));
  const xs = [];
  for (let i = 0; i < c.hooks; i++) xs.push(-c.w / 2 + 0.06 + (i * (c.w - 0.12)) / (c.hooks - 1));
  // one hook: a round foot on the board, an arm out and down, the tip curling up to a ball
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, t), new THREE.Vector3(0, -0.012, t + 0.025), new THREE.Vector3(0, -0.016, t + 0.05),
    new THREE.Vector3(0, -0.004, t + 0.064), new THREE.Vector3(0, 0.012, t + 0.066)]);
  const arm = new THREE.TubeGeometry(curve, 12, 0.0045, 6);
  const tipZ = t + 0.055, hy = c.y - 0.006;
  for (const x of xs) {
    const foot = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.006, 14), black, x, hy, t + 0.003);
    foot.rotation.x = Math.PI / 2;
    g.add(foot, mesh(arm, black, x, hy, 0), mesh(new THREE.SphereGeometry(0.0065, 10, 6), black, x, hy + 0.013, t + 0.066));
  }
  // the garments: the loop / hood sits in the hook's bend
  const hang = (o, i, dz) => { o.position.set(xs[i], hy - 0.014, dz); g.add(o); };
  for (const gm of c.garments) {
    const k = gm.scale ?? 1, o = GARMENTS[gm.kind](gm, tipZ / k);
    o.scale.setScalar(k);
    hang(o, gm.on, gm.dz ?? 0.006); // the gown 0.012
  }
  return g;
}

/** Round single towel hooks straight on the (tiled) wall (#424, TOWEL_HOOKS; local −z = the wall, z 0 its face): a
 * round rose, a short cylindrical pin with a flat end, brushed steel; a hand towel on each (`towels`, one per hook). */
export function towelhooks(item) {
  const c = { ...TOWEL_HOOKS, ...item }, H = c.hook;
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: H.color, metalness: H.metalness, roughness: H.roughness });
  const xs = c.towels.map((_, i) => (i - (c.towels.length - 1) / 2) * c.gap);
  for (const x of xs) {
    const rose = mesh(new THREE.CylinderGeometry(H.rose, H.rose, H.roseT, 24), steel, x, c.y, H.roseT / 2);
    const pin = mesh(new THREE.CylinderGeometry(H.pin, H.pin, H.len, 16), steel, x, c.y, H.roseT + H.len / 2);
    const end = mesh(new THREE.CylinderGeometry(H.end, H.end, H.endT, 20), steel, x, c.y, H.roseT + H.len + H.endT / 2);
    for (const o of [rose, pin, end]) o.rotation.x = Math.PI / 2;
    g.add(rose, pin, end);
  }
  c.towels.forEach((t, i) => {
    const o = towel({ ...c.towel, ...t }, H.roseT + H.len * 0.6);
    o.position.set(xs[i], c.y - H.pin - 0.002, 0.002);
    g.add(o);
  });
  return g;
}
