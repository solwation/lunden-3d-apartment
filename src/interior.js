import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FINISH, TILED_ROOMS, KITCHEN as K, SKIRTING } from './config.js';
import { Fridge } from './fridge.js';

// Fixed interior from our material choices: fitted kitchen, laundry, bathroom fittings,
// tiled floors and walls. Everything is merged into one mesh per material (few draw calls),
// and every part gets planar UVs in metres so tile textures keep their real size.

// ---------- textures ----------

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// canvas colour from an sRGB hex (THREE.Color would convert to linear), scaled by k
const rgb = (hex, k = 1) => `rgb(${[16, 8, 0].map((s) => Math.min(255, ((hex >> s) & 255) * k)).join(',')})`;

/**
 * nx × ny tiles of tw × th metres per texture repeat. `bond` = half bond (every other row
 * shifted half a tile), `vary` = per-tile shade variation, `mottle` = speckle strength
 * (granitkeramik), grout = joint colour (null: no joints, e.g. the worktop).
 */
function tileTexture({ tw, th, nx = 1, ny = 1, bond = false, color, vary = 0, mottle = 0, grout, joint = 0.003, ppm = 400, seed = 1 }) {
  const W = Math.round(tw * nx * ppm), H = Math.round(th * ny * ppm);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const rand = rng(seed);
  const tpx = W / nx, tpy = H / ny;
  for (let r = 0; r < ny; r++) {
    const shift = bond && r % 2 ? tpx / 2 : 0;
    for (let col = 0; col < nx; col++) {
      g.fillStyle = rgb(color, 1 + (rand() - 0.5) * vary);
      for (const wrap of [0, -W]) g.fillRect(col * tpx + shift + wrap, r * tpy, tpx + 1, tpy + 1);
    }
  }
  if (mottle) {
    for (let i = 0; i < W * H * 0.02; i++) {
      g.fillStyle = rand() < 0.5 ? `rgba(255,255,255,${mottle * rand()})` : `rgba(0,0,0,${mottle * rand()})`;
      const s = 1 + rand() * 2.5;
      g.fillRect(rand() * W, rand() * H, s, s);
    }
  }
  if (grout != null) {
    const j = Math.max(1, joint * ppm);
    g.fillStyle = rgb(grout);
    for (let r = 0; r < ny; r++) {
      g.fillRect(0, r * tpy - j / 2, W, j);
      const shift = bond && r % 2 ? tpx / 2 : 0;
      for (let col = 0; col <= nx; col++) g.fillRect((col * tpx + shift) % W - j / 2, r * tpy, j, tpy);
    }
    g.fillRect(0, H - j / 2, W, j);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.repeat.set(1 / (tw * nx), 1 / (th * ny));
  return tex;
}

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
const textured = (map, extra = {}) => new THREE.MeshStandardMaterial({ color: 0xffffff, map, roughness: 0.5, ...extra });

const T = FINISH;
const M = {
  front: std(T.kitchenFront, { roughness: 0.55 }),
  counter: textured(tileTexture({ tw: 0.6, th: 0.6, color: T.counter, mottle: 0.05, grout: null, ppm: 300, seed: 7 }), { roughness: 0.55 }),
  handle: std(T.handle, { roughness: 0.45, metalness: 0.3 }),
  steel: std(T.steel, { roughness: 0.32, metalness: 0.35 }),
  steelDark: std(0x8f9497, { roughness: 0.35, metalness: 0.35 }),
  black: std(T.black, { roughness: 0.18 }),
  glassDark: std(0x050606, { roughness: 0.08 }),
  led: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2dc, emissiveIntensity: 1.2 }),
  white: std(0xf1f1ee, { roughness: 0.85 }),
  skirting: std(0xf4f4f1, { roughness: 0.45 }),
  laundry: std(T.laundryFront, { roughness: 0.45 }),
  appliance: std(0xf7f7f7, { roughness: 0.3 }),
  vanity: std(T.vanity, { roughness: 0.5 }),
  porcelain: std(0xffffff, { roughness: 0.15 }),
  chrome: std(T.chrome, { roughness: 0.15, metalness: 0.6 }),
  mirror: std(0xdde5ea, { roughness: 0.05, metalness: 0.2 }),
  frosted: new THREE.MeshStandardMaterial({
    color: 0xf1f5f6, transparent: true, opacity: 0.55, roughness: 0.3, depthWrite: false, side: THREE.DoubleSide,
  }),
  splash: textured(tileTexture({ tw: T.splash.w, th: T.splash.h, nx: 2, ny: 2, bond: true, color: T.splash.color, vary: 0.03, grout: T.splash.grout, joint: 0.003, ppm: 800, seed: 3 }), { roughness: 0.6 }),
  wallTile: textured(tileTexture({ tw: T.wallTile.w, th: T.wallTile.h, nx: 2, ny: 3, color: T.wallTile.color, vary: 0.02, grout: T.grout, joint: 0.003, seed: 5 }), { roughness: 0.6 }),
  hallTile: textured(tileTexture({ tw: T.hallTile.w, th: T.hallTile.h, nx: 2, ny: 4, color: T.hallTile.color, vary: 0.12, mottle: 0.12, grout: 0x46484a, joint: 0.003, ppm: 300, seed: 11 }), { roughness: 0.7 }),
  wetTile: textured(tileTexture({ tw: T.wetTile.w, th: T.wetTile.h, nx: 4, ny: 4, color: T.wetTile.color, vary: 0.14, mottle: 0.14, grout: 0x45474a, joint: 0.003, ppm: 400, seed: 13 }), { roughness: 0.75 }),
};

for (const k of ['splash', 'wallTile', 'hallTile', 'wetTile']) M[k].userData.skin = true;

// ---------- geometry batching ----------

/** Planar UVs in metres from the dominant normal axis (relative to `origin`). */
function worldUV(geo, [ox, oy, oz]) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const x = p.getX(i) - ox, y = p.getY(i) - oy, z = p.getZ(i) - oz;
    if (ay >= ax && ay >= az) uv.setXY(i, x, -z);
    else if (ax >= az) uv.setXY(i, z, y);
    else uv.setXY(i, x, y);
  }
}

class Batch {
  constructor() { this.parts = new Map(); }

  add(geo, material, origin = [0, 0, 0]) {
    worldUV(geo, origin);
    if (!this.parts.has(material)) this.parts.set(material, []);
    this.parts.get(material).push(geo);
  }

  /** Box from plan ranges x, z and height range y (same argument order as world.js). */
  box(x0, x1, z0, z1, y0, y1, material, origin) {
    const geo = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
    geo.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.add(geo, material, origin);
  }

  meshes() {
    return [...this.parts].map(([material, geos]) => {
      const mesh = new THREE.Mesh(mergeGeometries(geos), material);
      // thin skins (tiles) and lights don't cast: avoids shadow acne on the floor/walls
      mesh.castShadow = !material.transparent && !material.userData.skin && material.emissive.getHex() === 0;
      mesh.receiveShadow = true;
      return mesh;
    });
  }
}

/**
 * Local frame of a cabinet-like rectangle whose front faces `dir` ('w' = −x, 'e' = +x,
 * 'n' = −z). `u` runs along the front, `d` is the distance in front of the front plane
 * (negative = inside the carcass).
 */
function frame(B, r, dir) {
  const f = { w: r.x0, e: r.x1, n: r.z0 }[dir];
  const depth = dir === 'n' ? r.z1 - r.z0 : r.x1 - r.x0;
  const [u0, u1] = dir === 'n' ? [r.x0, r.x1] : [r.z0, r.z1];
  const box = (a0, a1, d0, d1, y0, y1, m, origin) => {
    if (dir === 'w') B.box(f - d1, f - d0, a0, a1, y0, y1, m, origin);
    else if (dir === 'e') B.box(f + d0, f + d1, a0, a1, y0, y1, m, origin);
    else B.box(a0, a1, f - d1, f - d0, y0, y1, m, origin);
  };
  // point d in front of the plane at u (for cylinders etc.)
  const at = (u, d) => (dir === 'w' ? [f - d, u] : dir === 'e' ? [f + d, u] : [u, f - d]);
  return { u0, u1, f, depth, box, at, dir };
}

const FT = 0.02; // front thickness

/**
 * Shaker front (Form Tall): slab with a raised 6 cm frame, 3 mm gaps around.
 * handle: 'top' (horizontal, drawers), 'bottom', 'v-lo' / 'v-hi' (vertical at that edge,
 * near the top for base units, `low` puts it near the bottom for wall cabinets), or null.
 */
function front(F, a0, a1, y0, y1, material, handle, { low = false, rail = 0.06 } = {}) {
  const g = 0.0015;
  a0 += g; a1 -= g; y0 += g; y1 -= g;
  const rw = Math.min(rail, (y1 - y0) / 4, (a1 - a0) / 4);
  F.box(a0, a1, -FT, -0.006, y0, y1, material);
  F.box(a0, a1, -0.006, 0, y1 - rw, y1, material);
  F.box(a0, a1, -0.006, 0, y0, y0 + rw, material);
  F.box(a0, a0 + rw, -0.006, 0, y0 + rw, y1 - rw, material);
  F.box(a1 - rw, a1, -0.006, 0, y0 + rw, y1 - rw, material);
  if (!handle) return;
  const L = 0.15, t = 0.012, mid = (a0 + a1) / 2;
  if (handle === 'top' || handle === 'bottom') {
    const y = handle === 'top' ? y1 - rw / 2 : y0 + rw / 2;
    F.box(mid - L / 2, mid + L / 2, 0.012, 0.012 + t, y - t / 2, y + t / 2, M.handle);
    for (const s of [-1, 1]) F.box(mid + s * 0.064 - 0.005, mid + s * 0.064 + 0.005, 0, 0.012, y - 0.005, y + 0.005, M.handle);
  } else {
    const a = handle === 'v-lo' ? a0 + rw / 2 : a1 - rw / 2;
    const yc = low ? y0 + 0.05 + L / 2 : y1 - 0.05 - L / 2;
    F.box(a - t / 2, a + t / 2, 0.012, 0.012 + t, yc - L / 2, yc + L / 2, M.handle);
    for (const s of [-1, 1]) F.box(a - 0.005, a + 0.005, 0, 0.012, yc + s * 0.064 - 0.005, yc + s * 0.064 + 0.005, M.handle);
  }
}

/** Split [a0, a1] into doors of about `size` and add them with paired handles. */
function doorRow(F, a0, a1, y0, y1, size, opts) {
  const n = Math.max(1, Math.round((a1 - a0) / size));
  const w = (a1 - a0) / n;
  for (let i = 0; i < n; i++) {
    front(F, a0 + i * w, a0 + (i + 1) * w, y0, y1, opts.material ?? M.front, i % 2 ? 'v-lo' : 'v-hi', opts);
  }
}

const inside = (r, a, tol = 0.02) => r.x0 >= a.x0 - tol && r.x1 <= a.x1 + tol && r.z0 >= a.z0 - tol && r.z1 <= a.z1 + tol;
const centre = (r) => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];

function cylinderY(B, x, z, r, y0, y1, material, segs = 16) {
  const geo = new THREE.CylinderGeometry(r, r, y1 - y0, segs);
  geo.translate(x, (y0 + y1) / 2, z);
  B.add(geo, material);
}

/** Gooseneck mixer: column, half-circle spout towards the front (direction dx, dz). */
function mixer(B, x, z, y, [dx, dz], material, { h = 0.3, r = 0.09, tube = 0.011 } = {}) {
  cylinderY(B, x, z, 0.024, y, y + 0.06, material);
  cylinderY(B, x, z, tube, y, y + h, material, 10);
  const arc = new THREE.TorusGeometry(r, tube, 8, 20, Math.PI);
  arc.rotateY(Math.atan2(-dz, dx) + Math.PI); // arc runs from +x' to −x' (towards the front)
  arc.translate(x + dx * r, y + h, z + dz * r);
  B.add(arc, material);
  cylinderY(B, x + dx * 2 * r, z + dz * 2 * r, tube * 1.3, y + h - 0.07, y + h, material, 10);
  B.box(x - 0.008, x + 0.008, z - 0.008, z + 0.008, y + 0.06, y + 0.15, material);
  return { pos: [x + dx * 2 * r, y + h - 0.075, z + dz * 2 * r], dir: [0, -1, 0], r: tube, basin: y };
}

// ---------- kitchen ----------

function buildKitchen(B, group, floor, y0, yC, handled, taps, appliances) {
  const cabs = floor.cabinets.filter((c) => inside(c, K.area));
  if (!cabs.length) return [];
  const fixtures = floor.fixtures.filter((f) => inside(f, K.area));
  for (const x of [...cabs, ...fixtures]) handled.add(x);
  const sinkF = fixtures.find((f) => f.kind === 'sink');
  const hobF = fixtures.find((f) => f.kind === 'hob');

  const eastWall = Math.max(...cabs.map((c) => c.x1));
  const southWall = Math.max(...cabs.map((c) => c.z1));
  const depth = 0.6;
  // East run: 60 cm deep along x against the east wall, fronts face west.
  // The return along the south wall (corner unit, fridge, freezer) faces north.
  const dirOf = (c) => (Math.abs(c.x1 - c.x0 - depth) < 0.03 && c.x1 > eastWall - 0.02 ? 'w' : 'n');
  const yb = y0 + K.plinth, yt = y0 + K.baseTop, top = yt + K.worktop, yTop = y0 + K.top;
  const tall = cabs.find((c) => c.label === 'U/M');
  const fridges = cabs.filter((c) => c.label === 'K' || c.label === 'F').sort((a, b) => a.x0 - b.x0);
  const east = cabs.filter((c) => dirOf(c) === 'w').sort((a, b) => a.z0 - b.z0);
  const ret = cabs.filter((c) => dirOf(c) === 'n' && !fridges.includes(c));
  const hobCab = hobF && cabs.find((c) => inside(hobF, c));

  for (const c of cabs) {
    const F = frame(B, c, dirOf(c));
    const { u0, u1 } = F;
    if (c === tall) {
      // tall unit: door, oven, microwave, grille, top door (Peab render)
      F.box(u0, u1, -F.depth, -FT, y0, yTop, M.front);
      F.box(u0, u1, -0.07, -0.05, y0, yb, M.front);
      const yOven = y0 + 0.78, yMicro = yOven + 0.6, yGrille = yMicro + 0.4;
      front(F, u0, u1, yb, yOven, M.front, 'v-hi');
      F.box(u0 + 0.01, u1 - 0.01, -FT, 0.004, yOven + 0.005, yMicro - 0.005, M.black);
      F.box(u0 + 0.07, u1 - 0.07, 0.004, 0.006, yOven + 0.1, yMicro - 0.12, M.glassDark);
      F.box(u0 + 0.06, u1 - 0.06, 0.02, 0.035, yMicro - 0.07, yMicro - 0.055, M.steel);
      F.box(u0 + 0.01, u1 - 0.01, -FT, 0.004, yMicro + 0.005, yGrille - 0.005, M.black);
      F.box(u0 + 0.05, u0 + 0.4, 0.004, 0.006, yMicro + 0.06, yGrille - 0.06, M.glassDark);
      F.box(u0 + 0.005, u1 - 0.005, -FT, 0, yGrille, yGrille + K.grille, M.steel);
      front(F, u0, u1, yGrille + K.grille, yTop, M.front, 'v-hi', { low: true });
      continue;
    }
    if (fridges.includes(c)) {
      // freestanding stainless fridge/freezer, a ventilation grille and top cabinets above
      const yF = y0 + K.fridgeHeight;
      if (c.label === 'K') {
        // the fridge opens (fridge.js); hinged at the wall side, handle by the freezer
        const fr = new Fridge({ x0: u0 + 0.003, x1: u1 - 0.003, zFront: c.z0 + 0.015, zBack: c.z1 - 0.03, y0: y0 + 0.01, h: K.fridgeHeight - 0.01 });
        group.add(fr.object);
        appliances.push(fr);
      } else {
        F.box(u0 + 0.003, u1 - 0.003, -F.depth + 0.03, 0.04, y0 + 0.01, yF, M.steel);
        const other = fridges.find((o) => o !== c);
        const hiSide = other && other.x0 > c.x0; // handle at the edge where the two meet
        const a = hiSide ? u1 - 0.05 : u0 + 0.05;
        F.box(a - 0.01, a + 0.01, 0.04, 0.07, y0 + 0.75, y0 + 1.7, M.steelDark);
      }
      F.box(u0, u1, -F.depth, -FT, yF, yTop, M.front);
      F.box(u0 + 0.005, u1 - 0.005, -FT, 0, yF, yF + K.grille, M.steel);
      for (let y = yF + 0.012; y < yF + K.grille - 0.01; y += 0.012) F.box(u0 + 0.02, u1 - 0.02, 0, 0.002, y, y + 0.004, M.black);
      front(F, u0, u1, yF + K.grille, yTop, M.front, 'bottom');
      continue;
    }
    // base unit: carcass + recessed plinth + fronts
    F.box(u0, u1, -F.depth, -FT, y0, yt, M.front);
    F.box(u0, u1, -0.07, -0.05, y0, yb, M.front);
    if (c.label === 'DM') {
      front(F, u0, u1, yb, yt, M.front, 'top'); // integrated dishwasher (KEZA9310W)
    } else if (sinkF && inside(sinkF, c)) {
      front(F, u0, (u0 + u1) / 2, yb, yt, M.front, 'v-hi');
      front(F, (u0 + u1) / 2, u1, yb, yt, M.front, 'v-lo');
    } else if (ret.includes(c)) {
      // corner unit: only the part beside the east run is a visible door
      front(F, u0, Math.min(u1, east[0] ? east[0].x0 : u1), yb, yt, M.front, 'v-lo');
    } else {
      const h = yt - yb, hs = [0.2 * h, 0.4 * h, 0.4 * h];
      let y = yt;
      for (const dh of hs) { front(F, u0, u1, y - dh, y, M.front, 'top'); y -= dh; }
    }
  }

  // Worktop (Delaware stone): east run + the corner, and the return in front of the corner unit
  const runZ0 = tall ? tall.z1 : Math.min(...east.map((c) => c.z0));
  const eFront = east.length ? Math.min(...east.map((c) => c.x0)) : eastWall - depth;
  B.box(eFront - 0.02, eastWall, runZ0, southWall, yt, top, M.counter);
  const retX0 = ret.length ? Math.min(...ret.map((c) => c.x0)) : eFront;
  const retFront = ret.length ? Math.min(...ret.map((c) => c.z0)) : southWall - depth;
  if (retX0 < eFront) B.box(retX0, eFront - 0.02, retFront - 0.02, southWall, yt, top, M.counter);

  // Sink (undermounted, steel) + matt black gooseneck mixer behind it
  if (sinkF) {
    const [sx, sz] = centre(sinkF);
    const cx = Math.min(sx, eastWall - K.sink.d / 2 - 0.08);
    B.box(cx - K.sink.d / 2, cx + K.sink.d / 2, sz - K.sink.w / 2, sz + K.sink.w / 2, top, top + 0.0012, M.steelDark);
    B.box(cx - K.sink.d / 2 + 0.02, cx + K.sink.d / 2 - 0.02, sz - K.sink.w / 2 + 0.02, sz + K.sink.w / 2 - 0.02, top + 0.0012, top + 0.002, M.steel);
    taps.push({ ...mixer(B, eastWall - 0.06, sz, top, [-1, 0], M.handle), name: 'köksblandaren' });
  }
  // Induction hob, centred on its cabinet
  if (hobCab) {
    const [, hz] = centre(hobCab);
    const hx0 = eFront + 0.04;
    B.box(hx0, hx0 + K.hob.d, hz - K.hob.w / 2, hz + K.hob.w / 2, top, top + 0.006, M.black);
  }
  // Corner power box (Hörnbox svart) on the worktop
  B.box(eastWall - 0.1, eastWall, southWall - 0.1, southWall, top, top + 0.05, M.black);

  // Wall cabinets along the east wall (from the tall unit to the corner) and along the
  // south wall over the corner unit; hood + gypsum boxing to the ceiling over the hob.
  const wd = K.wallDepth, yW = y0 + K.wallBottom, yHood = y0 + K.hoodBottom;
  const wallX = eastWall - wd;
  const hob = hobCab ? [hobCab.z0, hobCab.z1] : null;
  const eastSpans = hob ? [[runZ0, hob[0]], [hob[1], southWall]] : [[runZ0, southWall]];
  const EW = frame(B, { x0: wallX, x1: eastWall, z0: runZ0, z1: southWall }, 'w');
  for (const [a, b] of eastSpans) EW.box(a, b, -wd, -FT, yW, yTop, M.front);
  // the last 35 cm by the south wall are hidden behind the return wall cabinet
  const visEnd = southWall - wd;
  doorRow(EW, runZ0, hob ? hob[0] : visEnd, yW, yTop, 0.5, { low: true });
  if (hob) {
    doorRow(EW, hob[1], visEnd, yW, yTop, 0.5, { low: true });
    const yH = yHood + K.hoodHeight;
    EW.box(hob[0], hob[1], -wd, -FT, yH, yTop, M.front);
    front(EW, hob[0], hob[1], yH, yTop, M.front, 'bottom');
    EW.box(hob[0] + 0.01, hob[1] - 0.01, -wd + 0.02, 0, yHood, yH, M.steel);
    EW.box(hob[0] + 0.03, hob[1] - 0.03, -wd + 0.05, -0.03, yHood - 0.002, yHood, M.led);
    EW.box(hob[0], hob[1], -wd, 0, yTop, yC, M.white); // Lokal gipsinklädnad ovan spiskåpa
  }
  const fridgeX1 = fridges.length ? Math.max(...fridges.map((c) => c.x1)) : retX0;
  if (fridgeX1 < wallX) {
    const RW = frame(B, { x0: fridgeX1, x1: wallX, z0: southWall - wd, z1: southWall }, 'n');
    RW.box(fridgeX1, wallX, -wd, -FT, yW, yTop, M.front);
    doorRow(RW, fridgeX1, wallX, yW, yTop, 0.5, { low: true });
    RW.box(fridgeX1 + 0.02, wallX, -wd + 0.02, -wd + 0.04, yW - 0.008, yW, M.led);
  }
  // under-cabinet LED (Belysning LED Linear) and the splashback tiles (10×20 half bond)
  for (const [a, b] of eastSpans) EW.box(a + 0.02, b - 0.02, -wd + 0.02, -wd + 0.04, yW - 0.008, yW, M.led);
  const o = [0, top, 0];
  B.box(eastWall - 0.006, eastWall, runZ0, southWall, top, yW, M.splash, o);
  if (hob) B.box(eastWall - 0.006, eastWall, hob[0], hob[1], yW, yHood, M.splash, o);
  B.box(retX0, eastWall, southWall - 0.006, southWall, top, yW, M.splash, o);

  return cabs.map((c) => (fridges.includes(c) ? { ...c, z0: c.z0 - 0.04 } : c));
}

// ---------- laundry (Tvätt) ----------

function buildLaundry(B, floor, room, y0, handled, taps) {
  const cabs = floor.cabinets.filter((c) => (c.label === 'TT' || c.label === 'TM') && inside(c, room));
  if (!cabs.length) return [];
  const sinkF = floor.fixtures.find((f) => f.kind === 'sink' && inside(f, room));
  for (const x of [...cabs, sinkF].filter(Boolean)) handled.add(x);
  const all = [...cabs, sinkF].filter(Boolean);
  const run = { x0: Math.min(...all.map((c) => c.x0)), x1: Math.max(...all.map((c) => c.x1)), z0: Math.min(...all.map((c) => c.z0)), z1: Math.max(...all.map((c) => c.z1)) };
  const yt = y0 + 0.88;
  // washer (TM) + dryer (TT): white bodies, round doors facing into the room
  for (const c of cabs) {
    const F = frame(B, c, 'e');
    const w = 0.6, a0 = (F.u0 + F.u1) / 2 - w / 2, a1 = a0 + w;
    F.box(a0, a1, -F.depth + 0.02, 0, y0 + 0.01, y0 + 0.85, M.appliance);
    F.box(a0 + 0.02, a1 - 0.02, 0, 0.004, y0 + 0.74, y0 + 0.82, M.steel);
    const [dx, dz] = F.at((a0 + a1) / 2, 0.01);
    const ring = new THREE.TorusGeometry(0.17, 0.025, 10, 32);
    ring.rotateY(Math.PI / 2);
    ring.translate(dx, y0 + 0.42, dz);
    B.add(ring, M.chrome);
    const glass = new THREE.CylinderGeometry(0.15, 0.15, 0.02, 32);
    glass.rotateZ(Math.PI / 2);
    glass.translate(dx, y0 + 0.42, dz);
    B.add(glass, M.glassDark);
  }
  // worktop over the machines + the sink cabinet (Arkitekt plus Frost, knob Point krom)
  B.box(run.x0, run.x1 + 0.02, run.z0, run.z1, yt, yt + 0.03, M.counter);
  if (sinkF) {
    const F = frame(B, { ...run, z0: sinkF.z0, z1: run.z1 }, 'e');
    F.box(F.u0, F.u1, -F.depth, -FT, y0, yt, M.laundry);
    front(F, F.u0, F.u1, y0 + 0.1, yt, M.laundry, null);
    const [kx, kz] = F.at(F.u0 + 0.04, 0.012);
    const knob = new THREE.SphereGeometry(0.0125, 12, 8);
    knob.translate(kx, yt - 0.06, kz);
    B.add(knob, M.chrome);
    const [sx, sz] = centre(sinkF);
    B.box(sx - 0.2, sx + 0.2, sz - 0.13, sz + 0.13, yt + 0.03, yt + 0.0315, M.steelDark);
    B.box(sx - 0.18, sx + 0.18, sz - 0.11, sz + 0.11, yt + 0.0315, yt + 0.032, M.steel);
    taps.push({ ...mixer(B, run.x0 + 0.06, sz, yt + 0.03, [1, 0], M.chrome, { h: 0.28, r: 0.08 }), name: 'blandaren' });
  }
  // ceiling globe (Classic glob 150 vit klarglas)
  const [cx, cz] = centre(room);
  const yc = y0 + (room.ceiling ?? 2.5);
  cylinderY(B, cx, cz, 0.03, yc - 0.05, yc, M.white);
  const globe = new THREE.SphereGeometry(0.075, 16, 12);
  globe.translate(cx, yc - 0.12, cz);
  B.add(globe, M.led);
  return [run];
}

// ---------- bathrooms ----------

/** Wall-hung vanity (Core Grip, Carbon Grey) with a white basin and a chrome mixer. */
function vanity(B, sinkF, wallX, y0, width, depth) {
  const [, cz] = centre(sinkF);
  const r = { x0: wallX, x1: wallX + depth, z0: cz - width / 2, z1: cz + width / 2 };
  const F = frame(B, r, 'e');
  F.box(F.u0, F.u1, -depth, 0, y0 + 0.4, y0 + 0.84, M.vanity);
  F.box(F.u0 + 0.01, F.u1 - 0.01, 0, 0.003, y0 + 0.615, y0 + 0.625, M.black); // grip line between drawers
  F.box(F.u0, F.u1, -depth, 0.01, y0 + 0.84, y0 + 0.87, M.porcelain);
  cylinderY(B, wallX + 0.08, cz, 0.018, y0 + 0.87, y0 + 1.0, M.chrome);
  B.box(wallX + 0.08, wallX + 0.2, cz - 0.012, cz + 0.012, y0 + 0.97, y0 + 0.99, M.chrome);
  r.tap = { pos: [wallX + 0.19, y0 + 0.966, cz], dir: [0, -1, 0], r: 0.008, basin: y0 + 0.86, name: 'blandaren' };
  return r;
}

/** Oval mirror (Slot 50) with LED backlight, on the wall at x = wallX. */
function ovalMirror(B, wallX, cz, y0, w, h) {
  const shape = (s) => {
    const r = (w * s) / 2, l = (h * s) / 2 - r;
    const p = new THREE.Shape();
    p.absarc(0, l, r, 0, Math.PI, false);
    p.absarc(0, -l, r, Math.PI, 2 * Math.PI, false);
    return p;
  };
  for (const [s, d, m] of [[1.04, 0.012, M.led], [1, 0.018, M.mirror]]) {
    const geo = new THREE.ShapeGeometry(shape(s), 24);
    geo.rotateY(Math.PI / 2);
    geo.translate(wallX + d, y0, cz);
    B.add(geo, m);
  }
}

/** Frosted glass panel between two plan points, floor to 1.95 m, aluminium edge profiles. */
function glassPanel(B, [ax, az], [bx, bz], y0) {
  const len = Math.hypot(bx - ax, bz - az), alongX = Math.abs(bx - ax) > Math.abs(bz - az);
  const t = 0.008;
  if (alongX) B.box(Math.min(ax, bx), Math.max(ax, bx), az - t / 2, az + t / 2, y0 + 0.02, y0 + 1.95, M.frosted);
  else B.box(ax - t / 2, ax + t / 2, Math.min(az, bz), Math.max(az, bz), y0 + 0.02, y0 + 1.95, M.frosted);
  for (const [x, z] of [[ax, az], [bx, bz]]) B.box(x - 0.012, x + 0.012, z - 0.012, z + 0.012, y0, y0 + 1.97, M.chrome);
  return len;
}

/** Hose as a tube along plan/height points [[x, y, z], …]. */
function hose(B, pts, material, r = 0.008) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  B.add(new THREE.TubeGeometry(curve, 24, r, 6), material);
}

/** Round shower head: disc of radius r centred at (x, y, z) facing `normal` (unit vector). */
function showerHead(B, [x, y, z], [nx, ny, nz], r, thick = 0.015) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-nx, -ny, -nz));
  const body = new THREE.CylinderGeometry(r, r * 0.92, thick, 28).applyQuaternion(q).translate(x, y, z);
  B.add(body, M.chrome);
  const face = new THREE.CylinderGeometry(r * 0.85, r * 0.85, 0.002, 28).applyQuaternion(q)
    .translate(x + nx * thick / 2, y + ny * thick / 2, z + nz * thick / 2);
  B.add(face, M.steelDark);
}

/**
 * Shower fittings on the wall at x = wallX (spraying into +x), centred at z. Returns the
 * outlets (for running water): position + spray direction + radius.
 *  - ceiling: Takduschpaket Tvm 7200-160 Lång (Badrum): thermostat, riser, long arm with a
 *    25 cm head, and a hand shower in a holder on the riser
 *  - else: Duschset Rt 105 + blandare Evm 168 (WC/dusch): thermostat, slide bar, hand shower
 */
function showerSet(B, wallX, z, y0, ceiling) {
  const outlets = [];
  // thermostat mixer: round body along the wall with two knobs
  const mix = new THREE.CylinderGeometry(0.03, 0.03, 0.3, 16).rotateX(Math.PI / 2).translate(wallX + 0.07, y0 + 1.0, z);
  B.add(mix, M.chrome);
  for (const s of [-1, 1]) cylinderY(B, wallX + 0.07, z + s * 0.17, 0.032, y0 + 0.97, y0 + 1.03, M.chrome, 16);
  for (const s of [-1, 1]) B.box(wallX, wallX + 0.05, z + s * 0.1 - 0.012, z + s * 0.1 + 0.012, y0 + 0.988, y0 + 1.012, M.chrome);
  if (ceiling) {
    const top = y0 + 2.1, armX = wallX + 0.42;
    cylinderY(B, wallX + 0.07, z, 0.013, y0 + 1.03, top, M.chrome, 12);
    B.box(wallX, wallX + 0.07, z - 0.02, z + 0.02, y0 + 1.75, y0 + 1.79, M.chrome); // wall bracket
    const arm = new THREE.CylinderGeometry(0.011, 0.011, armX - wallX - 0.07, 10).rotateZ(Math.PI / 2)
      .translate((wallX + 0.07 + armX) / 2, top, z);
    B.add(arm, M.chrome);
    cylinderY(B, armX, z, 0.012, top - 0.06, top, M.chrome, 10);
    showerHead(B, [armX, top - 0.07, z], [0, -1, 0], 0.125, 0.012);
    outlets.push({ pos: [armX, top - 0.08, z], dir: [0, -1, 0], r: 0.1, basin: y0, name: 'takduschen', pick: [wallX + 0.07, y0 + 1.0, z], shower: true });
    // hand shower parked in a holder on the riser, hose down to the mixer
    const hy = y0 + 1.35;
    B.box(wallX + 0.07, wallX + 0.11, z - 0.02, z + 0.02, hy - 0.02, hy + 0.02, M.chrome);
    const handle = new THREE.CylinderGeometry(0.014, 0.012, 0.2, 10).rotateZ(0.35).translate(wallX + 0.12, hy, z);
    B.add(handle, M.chrome);
    showerHead(B, [wallX + 0.16, hy + 0.12, z], [0.5, -0.86, 0], 0.045);
    hose(B, [[wallX + 0.08, hy - 0.1, z], [wallX + 0.12, y0 + 0.75, z + 0.06], [wallX + 0.09, y0 + 0.97, z + 0.05]], M.chrome);
  } else {
    // slide bar with two wall brackets, hand shower in the slider at ~1.75 m
    const x = wallX + 0.05;
    cylinderY(B, x, z, 0.011, y0 + 1.15, y0 + 1.95, M.chrome, 12);
    for (const y of [1.15, 1.95]) B.box(wallX, x, z - 0.015, z + 0.015, y0 + y - 0.015, y0 + y + 0.015, M.chrome);
    const hy = y0 + 1.75;
    B.box(x - 0.02, x + 0.04, z - 0.02, z + 0.02, hy - 0.03, hy + 0.03, M.chrome);
    const handle = new THREE.CylinderGeometry(0.015, 0.012, 0.21, 10).rotateZ(-0.6).translate(x + 0.08, hy - 0.06, z);
    B.add(handle, M.chrome);
    const head = [x + 0.15, hy + 0.04, z], dir = [0.3, -0.954, 0]; // lands ~0.95 m out, inside the shower
    showerHead(B, head, dir, 0.055, 0.02);
    outlets.push({ pos: [head[0] + 0.02, head[1] - 0.02, z], dir, r: 0.045, basin: y0, name: 'duschen', pick: [wallX + 0.07, y0 + 1.0, z], shower: true });
    hose(B, [[x + 0.02, hy - 0.15, z], [x + 0.1, y0 + 0.7, z + 0.08], [wallX + 0.09, y0 + 0.97, z + 0.05]], M.chrome);
  }
  return outlets;
}

function spots(B, room, y, n) {
  const [cx] = centre(room);
  for (let i = 0; i < n; i++) {
    const z = room.z0 + ((i + 0.5) * (room.z1 - room.z0)) / n;
    cylinderY(B, cx, z, 0.04, y - 0.006, y, M.led, 16);
  }
}

function buildBathroom(B, floor, room, y0, handled, taps) {
  const segs = [];
  const sinkF = floor.fixtures.find((f) => f.kind === 'sink' && inside(f, room));
  const shower = floor.fixtures.find((f) => f.kind === 'shower' && inside(f, room));
  const upstairs = room.level === 1;
  const yc = y0 + (room.wallTile ?? 2.5);
  if (sinkF) {
    handled.add(sinkF);
    // Badrum: Core Grip 60 + Slot 50 oval mirror. WC/dusch: Core XS Grip 50 + mirror cabinet Stage 50.
    const r = vanity(B, sinkF, room.x0 + 0.005, y0, upstairs ? 0.5 : 0.6, upstairs ? 0.36 : 0.45);
    segs.push(r);
    taps.push(r.tap);
    const [, cz] = centre(sinkF);
    if (upstairs) {
      const m = frame(B, { x0: room.x0, x1: room.x0 + 0.15, z0: cz - 0.25, z1: cz + 0.25 }, 'e');
      m.box(m.u0, m.u1, -0.15, 0, y0 + 1.2, y0 + 1.9, M.vanity);
      m.box(m.u0 + 0.01, m.u1 - 0.01, 0, 0.004, y0 + 1.21, y0 + 1.89, M.mirror);
    } else {
      ovalMirror(B, room.x0, cz, y0 + 1.5, 0.5, 0.9);
    }
  }
  if (shower) {
    handled.add(shower);
    const s = shower;
    if (upstairs) {
      // Duschvägg Linc Josephine 780, frostat glas: one panel from the side wall
      glassPanel(B, [s.x0, s.z1], [s.x0 + 0.78, s.z1], y0);
    } else {
      // Duschhörna Linc Angel 800×900, frostat glas, blankpolerad aluminium
      const zOpen = Math.abs(s.z0 - room.z0) < 0.05 ? s.z1 : s.z0;
      glassPanel(B, [s.x0, zOpen], [s.x1, zOpen], y0);
      glassPanel(B, [s.x1, s.z0], [s.x1, s.z1], y0);
    }
    taps.push(...showerSet(B, room.x0, (s.z0 + s.z1) / 2, y0, !upstairs));
  }
  spots(B, room, yc - 0.004, 2);
  return segs;
}

// ---------- tiles ----------

/** Tile skin on every wall face that faces into `room`, from the floor up to `h`. */
function tileWalls(B, room, wallBoxes, y0, h, material) {
  const t = 0.006, tol = 0.03, o = [0, y0, 0];
  const inX = (x) => x > room.x0 - tol && x < room.x1 + tol;
  const inZ = (z) => z > room.z0 - tol && z < room.z1 + tol;
  for (const w of wallBoxes) {
    const z0 = Math.max(w.z0, room.z0), z1 = Math.min(w.z1, room.z1);
    const x0 = Math.max(w.x0, room.x0), x1 = Math.min(w.x1, room.x1);
    if (z1 - z0 > 0.02 && inZ((z0 + z1) / 2)) {
      if (inX(w.x1) && w.x1 + 0.01 < room.x1) B.box(w.x1, w.x1 + t, z0, z1, y0, y0 + h, material, o);
      if (inX(w.x0) && w.x0 - 0.01 > room.x0) B.box(w.x0 - t, w.x0, z0, z1, y0, y0 + h, material, o);
    }
    if (x1 - x0 > 0.02 && inX((x0 + x1) / 2)) {
      if (inZ(w.z1) && w.z1 + 0.01 < room.z1) B.box(x0, x1, w.z1, w.z1 + t, y0, y0 + h, material, o);
      if (inZ(w.z0) && w.z0 - 0.01 > room.z0) B.box(x0, x1, w.z0 - t, w.z0, y0, y0 + h, material, o);
    }
  }
}

/**
 * White skirting (golvsockel) on every wall face that faces into the house, except in the
 * tiled rooms. `boxes` = wall boxes + window infills (the wall below the sill).
 */
function skirting(B, boxes, li, size, y0) {
  const tiled = TILED_ROOMS.filter((r) => r.level === li);
  const inTiled = (x, z) => tiled.some((r) => x > r.x0 - 0.02 && x < r.x1 + 0.02 && z > r.z0 - 0.02 && z < r.z1 + 0.02);
  const solid = (x, z) => x <= 0.01 || z <= 0.01 || x >= size.x - 0.01 || z >= size.z - 0.01
    || boxes.some((w) => x > w.x0 && x < w.x1 && z > w.z0 && z < w.z1);
  const { h, t } = SKIRTING;
  const y1 = y0 + h;
  for (const w of boxes) {
    // faces: [fixed coordinate, along-axis range, outward sign, axis of the face normal]
    const faces = [[w.x0, w.z0, w.z1, -1, 'x'], [w.x1, w.z0, w.z1, 1, 'x'], [w.z0, w.x0, w.x1, -1, 'z'], [w.z1, w.x0, w.x1, 1, 'z']];
    for (const [c, a0, a1, s, n] of faces) {
      if (a1 - a0 < 0.04) continue;
      // walk the face in 10 cm steps and emit runs where the room side is free floor
      let run = null;
      const flush = (end) => {
        if (run && end - run > 0.03) {
          if (n === 'x') B.box(s > 0 ? c : c - t, s > 0 ? c + t : c, run, end, y0, y1, M.skirting);
          else B.box(run, end, s > 0 ? c : c - t, s > 0 ? c + t : c, y0, y1, M.skirting);
        }
        run = null;
      };
      const step = 0.05;
      for (let a = a0; a < a1 + 1e-6; a += step) {
        const m = Math.min(a + step / 2, a1);
        const [x, z] = n === 'x' ? [c + s * 0.03, m] : [m, c + s * 0.03];
        const ok = !solid(x, z) && !inTiled(x, z);
        if (ok && run === null) run = a;
        if (!ok) flush(a);
      }
      flush(a1);
    }
  }
}

/**
 * Build the fixed interior of one level into `group`. Cabinets and fixtures it builds are
 * added to `handled` so world.js skips them. Returns collision rectangles.
 */
export function buildInterior(group, floor, li, y0, yC, wallBoxes, handled, taps = [], appliances = []) {
  const B = new Batch();
  const rects = [];
  if (li === K.level) rects.push(...buildKitchen(B, group, floor, y0, yC, handled, taps, appliances));
  for (const room of TILED_ROOMS.filter((r) => r.level === li)) {
    B.box(room.x0, room.x1, room.z0, room.z1, y0 + 0.001, y0 + 0.004, M[room.floor]);
    if (room.wallTile) {
      tileWalls(B, room, wallBoxes, y0, room.wallTile, M.wallTile);
      rects.push(...buildBathroom(B, floor, room, y0, handled, taps));
    }
    if (room.name === 'Tvätt') rects.push(...buildLaundry(B, floor, { ...room, ceiling: 2.5 }, y0, handled, taps));
  }
  skirting(B, [...wallBoxes, ...floor.windows], li, floor.size, y0);
  group.add(...B.meshes());
  return rects;
}
