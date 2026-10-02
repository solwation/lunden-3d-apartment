import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FINISH, TILED_ROOMS, KITCHEN as K, SKIRTING, LAUNDRY_SINK, LAUNDRY_CABINET, VANITY_BASIN } from './config.js';
import { wallCabinet } from './cabinets.js';
import { Fridge } from './fridge.js';
import { buildOvens } from './ovens.js';
import { Openable, pivotAround } from './openables.js';
import { Moccamaster } from './coffee.js';
import { mirrorMaterial } from './mirror.js';
import { addReflector } from './reflections.js';

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
  carcass: std(0xf4f4f1, { roughness: 0.6 }), // cabinet insides (#103)
  dishwasher: std(0xb9bcc0, { roughness: 0.35, metalness: 0.5 }),
  bin: std(0x8a8d90, { roughness: 0.6 }), binGreen: std(0x4f8a4a, { roughness: 0.6 }), binBlue: std(0x3a6fb5, { roughness: 0.6 }),
  skirting: std(0xf4f4f1, { roughness: 0.45 }),
  laundry: std(T.laundryFront, { roughness: 0.45 }),
  appliance: std(0xf7f7f7, { roughness: 0.3 }),
  vanity: std(T.vanity, { roughness: 0.5 }),
  porcelain: std(0xffffff, { roughness: 0.15 }),
  chrome: std(T.chrome, { roughness: 0.15, metalness: 0.6 }),
  mirror: mirrorMaterial, // shared with the hall mirror (mirror.js)
  frosted: new THREE.MeshStandardMaterial({
    color: 0xf1f5f6, transparent: true, opacity: 0.55, roughness: 0.3, depthWrite: false, side: THREE.DoubleSide,
  }),
  splash: textured(tileTexture({ tw: T.splash.w, th: T.splash.h, nx: 2, ny: 2, bond: true, color: T.splash.color, vary: 0.03, grout: T.splash.grout, joint: 0.003, ppm: 800, seed: 3 }), { roughness: 0.6 }),
  wallTile: textured(tileTexture({ tw: T.wallTile.w, th: T.wallTile.h, nx: 2, ny: 3, color: T.wallTile.color, vary: 0.02, grout: T.grout, joint: 0.003, seed: 5 }), { roughness: 0.6 }),
  hallTile: textured(tileTexture({ tw: T.hallTile.w, th: T.hallTile.h, nx: 2, ny: 4, color: T.hallTile.color, vary: 0.12, mottle: 0.12, grout: 0x46484a, joint: 0.003, ppm: 300, seed: 11 }), { roughness: 0.7 }),
  wetTile: textured(tileTexture({ tw: T.wetTile.w, th: T.wetTile.h, nx: 4, ny: 4, color: T.wetTile.color, vary: 0.14, mottle: 0.14, grout: 0x45474a, joint: 0.003, ppm: 400, seed: 13 }), { roughness: 0.75 }),
};

for (const k of ['splash', 'wallTile', 'hallTile', 'wetTile']) M[k].userData.skin = true;

/**
 * Light-emitting parts (spots, globe, LED strips, mirror light) get one material per room so
 * the room's switch can turn them on and off (lights.js). Key: "level:room name".
 */
export const lampMaterials = new Map();
export function lampMat(level, room) {
  const key = `${level}:${room}`;
  if (!lampMaterials.has(key)) {
    lampMaterials.set(key, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2dc, emissiveIntensity: 1.2 }));
  }
  return lampMaterials.get(key);
}

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

/** Split [a0, a1] into doors of about `size` and add them with paired handles. With `opts.open` ({ group,
 * list, depth }) every door opens (#103): a hollow carcass behind each one, the door on a hinge opposite its
 * handle. */
function doorRow(F, a0, a1, y0, y1, size, opts) {
  const n = Math.max(1, Math.round((a1 - a0) / size));
  const w = (a1 - a0) / n;
  for (let i = 0; i < n; i++) {
    const b0 = a0 + i * w, b1 = a0 + (i + 1) * w;
    // a door ending in an inside corner (`corner`: 'a1') hinges on its other side: the other run is in the way
    const handle = opts.open?.corner === 'a1' && i === n - 1 ? 'v-hi' : i % 2 ? 'v-lo' : 'v-hi';
    if (!opts.open) { front(F, b0, b1, y0, y1, opts.material ?? M.front, handle, opts); continue; }
    shell(F, b0, b1, y0, y1, opts.open.depth);
    openFront(opts.open, F, b0, b1, y0, y1, opts.material ?? M.front, handle, opts, { mode: 'hinge', name: opts.open.name ?? 'skåpet' });
  }
}

/** A frame like F that builds into another batch (an opening front's own geometry). */
function onBatch(F, OB) {
  const { f, dir } = F;
  const box = (a0, a1, d0, d1, y0, y1, m, origin) => {
    if (dir === 'w') OB.box(f - d1, f - d0, a0, a1, y0, y1, m, origin);
    else if (dir === 'e') OB.box(f + d0, f + d1, a0, a1, y0, y1, m, origin);
    else OB.box(a0, a1, f - d1, f - d0, y0, y1, m, origin);
  };
  return { ...F, box, add: (geo, m) => OB.add(geo, m) };
}

/** A hollow carcass behind the front plane (#103): outer sides/top/bottom in the front colour, white inside,
 * a shelf when it is tall enough (`outer`: another colour). `depth` = from the front plane to the wall. */
function shell(F, a0, a1, y0, y1, depth, { shelf = true, inner = M.carcass, outer = M.front } = {}) {
  const t = 0.016, d0 = -depth, d1 = -FT;
  F.box(a0, a0 + t, d0, d1, y0, y1, outer);
  F.box(a1 - t, a1, d0, d1, y0, y1, outer);
  F.box(a0 + t, a1 - t, d0, d1, y0, y0 + t, outer);
  F.box(a0 + t, a1 - t, d0, d1, y1 - t, y1, outer);
  F.box(a0 + t, a1 - t, d0, d0 + 0.008, y0 + t, y1 - t, inner);                                    // back
  for (const [b0, b1] of [[a0 + t, a0 + t + 0.001], [a1 - t - 0.001, a1 - t]]) F.box(b0, b1, d0, d1, y0 + t, y1 - t, inner); // linings
  F.box(a0 + t, a1 - t, d0, d1, y0 + t, y0 + t + 0.001, inner);
  F.box(a0 + t, a1 - t, d0, d1, y1 - t - 0.001, y1 - t, inner);
  if (shelf && y1 - y0 > 0.45) F.box(a0 + t, a1 - t, d0 + 0.01, d1 - 0.02, (y0 + y1) / 2 - 0.009, (y0 + y1) / 2 + 0.009, inner);
}

/**
 * A front that opens (#103): built into its own batch, wrapped in a pivot and driven by an Openable.
 * how: { mode: 'hinge' (on the side away from the handle, or `at`: 'a0' / 'a1'), 'flap' (hinged at the
 * bottom, `top: true` = at the top, lifting up), 'drawer' (a box `depth` deep behind the front, slides out),
 * name, max, build(P, a0, a1, y0, y1) = a front of its own instead of the shaker one }. The pivot sits on the front plane, so the door swings clear of its own carcass and the
 * neighbours; `max` stops it before it meets anything. `ctx` = { group, list }.
 */
function openFront(ctx, F, a0, a1, y0, y1, material, handle, opts, how) {
  const OB = new Batch(), P = onBatch(F, OB);
  if (how.build) how.build(P, a0, a1, y0, y1); else front(P, a0, a1, y0, y1, material, handle, opts);
  const normal = F.dir === 'w' ? [-1, 0, 0] : F.dir === 'e' ? [1, 0, 0] : [0, 0, -1];
  const world = (u, d, y) => { const [x, z] = F.at(u, d); return new THREE.Vector3(x, y, z); };
  let at, o;
  if (how.mode === 'drawer') {
    const dd = how.depth, t = 0.012, c = M.carcass;
    P.box(a0 + 0.02, a1 - 0.02, -FT - dd, -FT, y0 + 0.02, y0 + 0.028, c);             // bottom
    P.box(a0 + 0.02, a0 + 0.02 + t, -FT - dd, -FT, y0 + 0.02, y1 - 0.04, c);           // sides
    P.box(a1 - 0.02 - t, a1 - 0.02, -FT - dd, -FT, y0 + 0.02, y1 - 0.04, c);
    P.box(a0 + 0.02, a1 - 0.02, -FT - dd, -FT - dd + t, y0 + 0.02, y1 - 0.04, c);      // back
    at = world((a0 + a1) / 2, 0, y0);
    o = new Openable({ name: how.name ?? 'lådan', object: pivotAround(OB.meshes(), at), mode: 'drawer', out: normal.map((v) => v * dd * 0.8), speed: 3 });
  } else if (how.mode === 'flap') {
    at = world((a0 + a1) / 2, 0, how.top ? y1 : y0);
    const axis = F.dir === 'n' ? [1, 0, 0] : [0, 0, 1];
    // which way: the free edge has to come out of the front (along the normal)
    const edge = new THREE.Vector3(0, how.top ? -1 : 1, 0).applyAxisAngle(new THREE.Vector3(...axis), 0.1);
    const sign = edge.dot(new THREE.Vector3(...normal)) > 0 ? 1 : -1;
    o = new Openable({ name: how.name ?? 'luckan', object: pivotAround(OB.meshes(), at), mode: 'flap', axis, sign, max: how.max ?? 85 });
  } else {
    const hinge = how.at ?? (handle === 'v-lo' ? 'a1' : 'a0'), u = hinge === 'a0' ? a0 : a1;
    at = world(u, 0, (y0 + y1) / 2);
    const free = world(hinge === 'a0' ? a1 : a0, 0, at.y).sub(at);
    const sign = free.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.1).dot(new THREE.Vector3(...normal)) > 0 ? 1 : -1;
    o = new Openable({ name: how.name ?? 'skåpet', object: pivotAround(OB.meshes(), at), mode: 'hinge', sign, max: how.max ?? 90 }); // 90°: flat beside the neighbour, never over it
  }
  o.normal = new THREE.Vector3(...normal); // which way the front faces (tests stand in front of it)
  ctx.group.add(o.object);
  ctx.list.push(o);
  return o;
}

const inside = (r, a, tol = 0.02) => r.x0 >= a.x0 - tol && r.x1 <= a.x1 + tol && r.z0 >= a.z0 - tol && r.z1 <= a.z1 + tol;
const centre = (r) => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];

function cylinderY(B, x, z, r, y0, y1, material, segs = 16) {
  const geo = new THREE.CylinderGeometry(r, r, y1 - y0, segs);
  geo.translate(x, (y0 + y1) / 2, z);
  B.add(geo, material);
}

/** A slab (x0..x1, z0..z1, y0..y1) with a rectangular hole `h` cut out: four boxes around it. */
function slabWithHole(B, x0, x1, z0, z1, y0, y1, h, material) {
  B.box(x0, x1, z0, h.z0, y0, y1, material);
  B.box(x0, x1, h.z1, z1, y0, y1, material);
  B.box(x0, h.x0, h.z0, h.z1, y0, y1, material);
  B.box(h.x1, x1, h.z0, h.z1, y0, y1, material);
}

/**
 * A sink bowl hanging from `top` into the hole `h` (#122): four walls, a bottom `depth` below the top,
 * a drain (grate + plug) in the middle and an overflow hole on the wall at x = h[overflow]. Returns the
 * bottom's height (where a tap's stream lands).
 */
function sinkBowl(B, h, top, depth, material, overflow = 'x1') {
  const t = 0.008, yb = top - depth;
  B.box(h.x0, h.x1, h.z0, h.z1, yb - t, yb, material);
  B.box(h.x0, h.x1, h.z0 - t, h.z0, yb, top, material);
  B.box(h.x0, h.x1, h.z1, h.z1 + t, yb, top, material);
  B.box(h.x0 - t, h.x0, h.z0, h.z1, yb, top, material);
  B.box(h.x1, h.x1 + t, h.z0, h.z1, yb, top, material);
  // soft inner corners: a slim fillet strip down each corner and along the bottom edges
  const f = 0.012;
  for (const [x, z] of [[h.x0, h.z0], [h.x0, h.z1], [h.x1, h.z0], [h.x1, h.z1]]) {
    B.box(Math.min(x, x + (x === h.x0 ? f : -f)), Math.max(x, x + (x === h.x0 ? f : -f)),
      Math.min(z, z + (z === h.z0 ? f : -f)), Math.max(z, z + (z === h.z0 ? f : -f)), yb, top - 0.002, material);
  }
  const cx = (h.x0 + h.x1) / 2, cz = (h.z0 + h.z1) / 2;
  cylinderY(B, cx, cz, 0.035, yb, yb + 0.002, M.chrome, 20);           // drain ring
  cylinderY(B, cx, cz, 0.026, yb + 0.002, yb + 0.0028, M.black, 20);    // the dark hole under the grate
  for (const dz of [-0.016, -0.008, 0, 0.008, 0.016]) B.box(cx - 0.024, cx + 0.024, cz + dz - 0.0015, cz + dz + 0.0015, yb + 0.0028, yb + 0.0034, M.chrome); // grate
  const ox = overflow === 'x1' ? h.x1 - 0.0005 : h.x0 + 0.0005, s = overflow === 'x1' ? -1 : 1;
  B.box(Math.min(ox, ox + s * 0.002), Math.max(ox, ox + s * 0.002), cz - 0.02, cz + 0.02, top - 0.05, top - 0.035, M.black); // overflow
  return yb;
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
  const open = { group, list: appliances }; // fronts that open with E (#103)
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

  // the plan's cabinet rectangles overlap by a couple of cm along a run: meet in the middle, so neighbouring
  // fronts (and doors swung open beside them) don't run into each other (#103)
  const span = new Map(cabs.map((c) => [c, dirOf(c) === 'w' ? [c.z0, c.z1] : [c.x0, c.x1]]));
  for (const run of [east, ret]) for (let i = 1; i < run.length; i++) {
    const a = span.get(run[i - 1]), b = span.get(run[i]);
    if (a[1] > b[0]) a[1] = b[0] = (a[1] + b[0]) / 2;
  }
  for (const c of cabs) {
    const F = frame(B, c, dirOf(c));
    const [u0, u1] = span.get(c);
    if (c === tall) {
      // tall unit: door, oven, microwave, grille, top door (Peab render). The oven and microwave
      // doors open with E (ovens.js): hollow insides, the carcass is solid only below and above.
      const yOven = y0 + 0.78, yMicro = yOven + 0.6, yGrille = yMicro + 0.4;
      F.box(u0, u1, -F.depth, -FT, y0, yb, M.front);
      shell(F, u0, u1, yb, yOven, F.depth);
      shell(F, u0, u1, yGrille + K.grille, yTop, F.depth);
      F.box(u0, u1, -F.depth, -FT, yGrille, yGrille + K.grille, M.front);
      F.box(u0, u1, -0.07, -0.05, y0, yb, M.front);
      openFront(open, F, u0, u1, yb, yOven, M.front, 'v-hi', {}, { mode: 'hinge', name: 'skåpet' });
      if (F.dir === 'w') {
        const ov = buildOvens({ f: F.f, z0: u0, z1: u1, yOven, yMicro, yGrille, microW: 0.44 });
        group.add(ov.parts, ...ov.doors.map((d) => d.object));
        appliances.push(...ov.doors);
        const mocca = new Moccamaster(top); // on the worktop between the tall unit and the sink
        group.add(mocca.object);
        appliances.push(mocca);
        looseItems.push(mocca.object); // a loose thing on the worktop: hidden with F
      }
      F.box(u0 + 0.005, u1 - 0.005, -FT, 0, yGrille, yGrille + K.grille, M.steel);
      openFront(open, F, u0, u1, yGrille + K.grille, yTop, M.front, 'v-hi', { low: true }, { mode: 'hinge', name: 'skåpet' });
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
      F.box(u0, u1, -F.depth, -FT, yF, yF + K.grille, M.front);
      shell(F, u0, u1, yF + K.grille, yTop, F.depth, { shelf: false });
      F.box(u0 + 0.005, u1 - 0.005, -FT, 0, yF, yF + K.grille, M.steel);
      for (let y = yF + 0.012; y < yF + K.grille - 0.01; y += 0.012) F.box(u0 + 0.02, u1 - 0.02, 0, 0.002, y, y + 0.004, M.black);
      openFront(open, F, u0, u1, yF + K.grille, yTop, M.front, 'bottom', {}, { mode: 'flap', top: true, name: 'skåpet', max: 80 }); // lifts up
      continue;
    }
    // base unit: carcass + recessed plinth + fronts (under the sink the carcass stops below the bowl, #122)
    const sinkUnit = sinkF && inside(sinkF, c);
    F.box(u0, u1, -0.07, -0.05, y0, yb, M.front);
    F.box(u0, u1, -F.depth, -0.07, y0, yb, M.front);
    if (c.label === 'DM') {
      // integrated dishwasher (KEZA9310W): its door folds down onto a steel tub with two racks
      shell(F, u0, u1, yb, yt, F.depth, { shelf: false, inner: M.dishwasher });
      for (const y of [yb + 0.12, yb + 0.42]) for (let k = 0; k < 9; k++) { const a = u0 + 0.04 + k * (u1 - u0 - 0.08) / 8; F.box(a - 0.002, a + 0.002, -F.depth + 0.04, -FT - 0.04, y, y + 0.004, M.chrome); }
      openFront(open, F, u0, u1, yb, yt, M.front, 'top', {}, { mode: 'flap', name: 'diskmaskinen', max: 88 });
    } else if (sinkUnit) {
      shell(F, u0, u1, yb, top - K.sink.depth - 0.02, F.depth, { shelf: false });
      // waste sorting under the sink (#103): a grey bin, a green one for food waste, a small blue one for paper
      const d0 = -F.depth + 0.06, d1 = -FT - 0.05, uw = (u1 - u0 - 0.06) / 3;
      [[M.bin, 0.3], [M.binGreen, 0.24], [M.binBlue, 0.2]].forEach(([m, h], k) => {
        const a = u0 + 0.025 + k * (uw + 0.005);
        F.box(a, a + uw, d0, d1, yb + 0.016, yb + 0.016 + h, m);
        F.box(a + 0.01, a + uw - 0.01, d0 + 0.01, d1 - 0.01, yb + 0.016 + h - 0.002, yb + 0.018 + h, M.black); // its opening
      });
      openFront(open, F, u0, (u0 + u1) / 2, yb, yt, M.front, 'v-hi', {}, { mode: 'hinge', name: 'skåpet' });
      openFront(open, F, (u0 + u1) / 2, u1, yb, yt, M.front, 'v-lo', {}, { mode: 'hinge', name: 'skåpet' });
    } else if (ret.includes(c)) {
      // corner unit: only the part beside the east run is a visible door
      const vis = Math.min(u1, east[0] ? east[0].x0 : u1);
      shell(F, u0, vis, yb, yt, F.depth);
      if (vis < u1) F.box(vis, u1, -F.depth, -FT, yb, yt, M.front);
      openFront(open, F, u0, vis, yb, yt, M.front, 'v-hi', {}, { mode: 'hinge', name: 'hörnskåpet' }); // hinged away from the corner: the other run is in the way there
    } else {
      F.box(u0, u1, -F.depth, -FT, yb, yt, M.front); // drawer unit: the drawers' boxes slide out of it
      const h = yt - yb, hs = [0.2 * h, 0.4 * h, 0.4 * h];
      let y = yt;
      for (const dh of hs) { openFront(open, F, u0, u1, y - dh, y, M.front, 'top', {}, { mode: 'drawer', depth: F.depth - 0.08, name: 'lådan' }); y -= dh; }
    }
  }

  // Worktop (Delaware stone): east run + the corner, and the return in front of the corner unit
  const runZ0 = tall ? tall.z1 : Math.min(...east.map((c) => c.z0));
  const eFront = east.length ? Math.min(...east.map((c) => c.x0)) : eastWall - depth;
  // the sink's hole in the stone (undermounted: the stone edge shows), see below
  const sinkC = sinkF && centre(sinkF), sinkX = sinkF && Math.min(sinkC[0], eastWall - K.sink.d / 2 - 0.08);
  const sinkHole = sinkF && { x0: sinkX - K.sink.d / 2 + 0.02, x1: sinkX + K.sink.d / 2 - 0.02, z0: sinkC[1] - K.sink.w / 2 + 0.02, z1: sinkC[1] + K.sink.w / 2 - 0.02 };
  if (sinkHole) slabWithHole(B, eFront - 0.02, eastWall, runZ0, southWall, yt, top, sinkHole, M.counter);
  else B.box(eFront - 0.02, eastWall, runZ0, southWall, yt, top, M.counter);
  const retX0 = ret.length ? Math.min(...ret.map((c) => c.x0)) : eFront;
  const retFront = ret.length ? Math.min(...ret.map((c) => c.z0)) : southWall - depth;
  if (retX0 < eFront) B.box(retX0, eFront - 0.02, retFront - 0.02, southWall, yt, top, M.counter);

  // Sink (undermounted, steel) + matt black gooseneck mixer behind it
  if (sinkF) {
    const sz = sinkC[1];
    const bottom = sinkBowl(B, sinkHole, top, K.sink.depth, M.steel, 'x1');
    taps.push({ ...mixer(B, eastWall - 0.06, sz, top, [-1, 0], M.handle), basin: bottom, name: 'köksblandaren' });
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
  const kitchenLamp = lampMat(K.level, K.room); // LED Linear under the wall cabinets + hood light
  const wallX = eastWall - wd;
  const hob = hobCab ? [hobCab.z0, hobCab.z1] : null;
  const eastSpans = hob ? [[runZ0, hob[0]], [hob[1], southWall]] : [[runZ0, southWall]];
  const EW = frame(B, { x0: wallX, x1: eastWall, z0: runZ0, z1: southWall }, 'w');
  // the first wall cabinet (over the coffee machine) is the cup cabinet: hollow, its door opens (#90)
  const firstEnd = hob ? hob[0] : southWall - wd;
  const cupW = (firstEnd - runZ0) / Math.max(1, Math.round((firstEnd - runZ0) / 0.5));
  // the last 35 cm by the south wall are hidden behind the return wall cabinet
  const visEnd = southWall - wd;
  for (const [a, b] of eastSpans) if (b > visEnd) EW.box(visEnd, b, -wd, -FT, yW, yTop, M.front);
  const wallOpen = { ...open, depth: wd };
  doorRow(EW, runZ0 + cupW, hob ? hob[0] : visEnd, yW, yTop, 0.5, { low: true, open: hob ? wallOpen : { ...wallOpen, corner: 'a1' } });
  cupCabinet = { front: wallX, back: eastWall, z0: runZ0, z1: runZ0 + cupW, y0: yW, y1: yTop, material: M.front, handle: M.handle };
  // the worktop between the tall unit and the hob: somewhere to put a cup down
  cupSurfaces.push({ x0: eFront + 0.03, x1: eastWall - 0.03, z0: runZ0 + 0.03, z1: firstEnd - 0.03, y: top });
  if (hob) {
    doorRow(EW, hob[1], visEnd, yW, yTop, 0.5, { low: true, open: { ...wallOpen, corner: 'a1' } });
    const yH = yHood + K.hoodHeight;
    shell(EW, hob[0], hob[1], yH, yTop, wd, { shelf: false });
    openFront(open, EW, hob[0], hob[1], yH, yTop, M.front, 'bottom', {}, { mode: 'flap', top: true, name: 'skåpet', max: 80 }); // over the hood: lifts up
    EW.box(hob[0] + 0.01, hob[1] - 0.01, -wd + 0.02, 0, yHood, yH, M.steel);
    EW.box(hob[0] + 0.03, hob[1] - 0.03, -wd + 0.05, -0.03, yHood - 0.002, yHood, kitchenLamp);
    EW.box(hob[0], hob[1], -wd, 0, yTop, yC, M.white); // Lokal gipsinklädnad ovan spiskåpa
  }
  const fridgeX1 = fridges.length ? Math.max(...fridges.map((c) => c.x1)) : retX0;
  if (fridgeX1 < wallX) {
    const RW = frame(B, { x0: fridgeX1, x1: wallX, z0: southWall - wd, z1: southWall }, 'n');
    doorRow(RW, fridgeX1, wallX, yW, yTop, 0.5, { low: true, open: { ...wallOpen, corner: 'a1' } });
    RW.box(fridgeX1 + 0.02, wallX, -wd + 0.02, -wd + 0.04, yW - 0.008, yW, kitchenLamp);
  }
  // under-cabinet LED (Belysning LED Linear) and the splashback tiles (10×20 half bond)
  for (const [a, b] of eastSpans) EW.box(a + 0.02, b - 0.02, -wd + 0.02, -wd + 0.04, yW - 0.008, yW, kitchenLamp);
  const o = [0, top, 0];
  B.box(eastWall - 0.006, eastWall, runZ0, southWall, top, yW, M.splash, o);
  if (hob) B.box(eastWall - 0.006, eastWall, hob[0], hob[1], yW, yHood, M.splash, o);
  B.box(retX0, eastWall, southWall - 0.006, southWall, top, yW, M.splash, o);

  return cabs.map((c) => (fridges.includes(c) ? { ...c, z0: c.z0 - 0.04 } : c));
}

// ---------- laundry (Tvätt) ----------

function buildLaundry(B, group, floor, room, y0, handled, taps, appliances) {
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
    // the drum opening behind the door
    const drum = new THREE.CylinderGeometry(0.16, 0.16, 0.004, 32);
    drum.rotateZ(Math.PI / 2);
    drum.translate(...(([x, z]) => [x, y0 + 0.42, z])(F.at((a0 + a1) / 2, 0.001)));
    B.add(drum, M.black);
    // the round door: hinged on its left edge, opens with E (#103)
    const DB = new Batch();
    const ring = new THREE.TorusGeometry(0.17, 0.025, 10, 32);
    ring.rotateY(Math.PI / 2);
    ring.translate(dx, y0 + 0.42, dz);
    DB.add(ring, M.chrome);
    const glass = new THREE.CylinderGeometry(0.15, 0.15, 0.02, 32);
    glass.rotateZ(Math.PI / 2);
    glass.translate(dx, y0 + 0.42, dz);
    DB.add(glass, M.glassDark);
    const [hx, hz] = F.at((a0 + a1) / 2 - 0.195, 0.01), at = new THREE.Vector3(hx, y0 + 0.42, hz);
    const free = new THREE.Vector3(dx - hx, 0, dz - hz).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.1);
    const o = new Openable({ name: c.label === 'TM' ? 'tvättmaskinen' : 'torktumlaren', object: pivotAround(DB.meshes(), at), mode: 'hinge', sign: free.x > 0 ? 1 : -1, max: 100 });
    o.normal = new THREE.Vector3(1, 0, 0);
    group.add(o.object);
    appliances.push(o);
  }
  // worktop over the machines + the sink cabinet (Arkitekt plus Frost, knob Point krom)
  const tvSink = sinkF && (() => { const [sx, sz] = centre(sinkF), { w, d } = LAUNDRY_SINK; return { x0: sx - d / 2, x1: sx + d / 2, z0: sz - w / 2, z1: sz + w / 2 }; })();
  if (tvSink) slabWithHole(B, run.x0, run.x1 + 0.02, run.z0, run.z1, yt, yt + 0.03, tvSink, M.counter);
  else B.box(run.x0, run.x1 + 0.02, run.z0, run.z1, yt, yt + 0.03, M.counter);
  if (sinkF) {
    const F = frame(B, { ...run, z0: sinkF.z0, z1: run.z1 }, 'e');
    F.box(F.u0, F.u1, -F.depth, -FT, y0, y0 + 0.1, M.laundry);
    shell(F, F.u0, F.u1, y0 + 0.1, yt + 0.033 - LAUNDRY_SINK.depth - 0.02, F.depth, { shelf: false, outer: M.laundry }); // stops below the bowl (#122)
    // its door opens with E (#103), hinged away from the knob
    openFront({ group, list: appliances }, F, F.u0, F.u1, y0 + 0.1, yt, M.laundry, null, {}, { mode: 'hinge', at: 'a1', name: 'skåpet', build: (P, a0, a1, b0, b1) => {
      front(P, a0, a1, b0, b1, M.laundry, null);
      const [kx, kz] = F.at(a0 + 0.04, 0.012);
      P.add(new THREE.SphereGeometry(0.0125, 12, 8).translate(kx, b1 - 0.06, kz), M.chrome);
    } });
    const [, sz] = centre(sinkF), h = tvSink, rim = 0.02, yr = yt + 0.03;
    slabWithHole(B, h.x0 - rim, h.x1 + rim, h.z0 - rim, h.z1 + rim, yr, yr + 0.003, h, M.steelDark); // inset sink's rim
    const bottom = sinkBowl(B, h, yr + 0.003, LAUNDRY_SINK.depth, M.steel, 'x0');
    taps.push({ ...mixer(B, run.x0 + 0.06, sz, yt + 0.03, [1, 0], M.chrome, { h: 0.28, r: 0.08 }), basin: bottom, name: 'blandaren' });
  }
  // the wall cabinet over the worktop (#138): white doors that open, detergent and towels inside
  const C = LAUNDRY_CABINET, cy0 = y0 + C.y0, cy1 = y0 + C.y1, shelf = cy0 + (cy1 - cy0) * 0.5 + 0.007;
  const xIn = run.x0 + 0.02, towels = [], bottles = [], caps = [];
  const cz1 = run.z0 + (run.z1 - run.z0) * C.share;
  for (let k = 0; k < 3; k++) towels.push(new THREE.BoxGeometry(0.25, 0.045, 0.3).translate(xIn + 0.15, cy0 + 0.016 + 0.0225 + k * 0.046, run.z0 + 0.25)); // folded towels
  for (let k = 0; k < 2; k++) towels.push(new THREE.BoxGeometry(0.25, 0.045, 0.3).translate(xIn + 0.15, cy0 + 0.016 + 0.0225 + k * 0.046, run.z0 + 0.76));
  for (const [dz, h, r] of [[0.2, 0.24, 0.045], [0.34, 0.2, 0.04], [0.85, 0.28, 0.05]]) { // bottles of detergent and fabric softener
    bottles.push(new THREE.CylinderGeometry(r, r, h, 14).translate(xIn + 0.12, shelf + h / 2, run.z0 + dz));
    caps.push(new THREE.CylinderGeometry(r * 0.45, r * 0.45, 0.03, 10).translate(xIn + 0.12, shelf + h + 0.015, run.z0 + dz));
  }
  bottles.push(new THREE.BoxGeometry(0.18, 0.22, 0.12).translate(xIn + 0.13, cy0 + 0.016 + 0.11, run.z0 + 1.02)); // a box of washing powder
  const lc = wallCabinet({ wall: run.x0, dir: 1, z0: run.z0, z1: cz1, y0: cy0, y1: cy1, depth: C.depth, units: C.units, material: M.laundry, handle: M.chrome,
    contents: [[towels, std(0xd9e6ea, { roughness: 0.95 })], [bottles, std(0x3b7fc4, { roughness: 0.4 })], [caps, M.white]] });
  group.add(lc.object);
  appliances.push(...lc.doors);
  // ceiling globe (Classic glob 150 vit klarglas)
  const [cx, cz] = centre(room);
  const yc = y0 + (room.ceiling ?? 2.5);
  cylinderY(B, cx, cz, 0.03, yc - 0.05, yc, M.white);
  const globe = new THREE.SphereGeometry(0.075, 16, 12);
  globe.translate(cx, yc - 0.12, cz);
  B.add(globe, lampMat(0, room.name));
  return [run];
}

// ---------- bathrooms ----------

/** Wall-hung vanity (Core Grip, Carbon Grey) with a white basin and a chrome mixer. */
function vanity(B, sinkF, wallX, y0, width, depth, open) {
  const [, cz] = centre(sinkF);
  const r = { x0: wallX, x1: wallX + depth, z0: cz - width / 2, z1: cz + width / 2 };
  const F = frame(B, r, 'e');
  // the body stops below the basin; the top drawer front (2 cm) runs up to the porcelain top (#122)
  F.box(F.u0, F.u1, -depth, -0.02, y0 + 0.4, y0 + 0.86 - VANITY_BASIN.depth, M.vanity);
  for (const u of [F.u0, F.u1 - 0.02]) F.box(u, u + 0.02, -depth, -0.02, y0 + 0.4, y0 + 0.84, M.vanity); // the sides
  // two drawers (#103), plain fronts with the grip line between them; the top one is short: the basin is behind it
  const plain = (grip) => (P, a0, a1, b0, b1) => {
    P.box(a0 + 0.0015, a1 - 0.0015, -0.02, 0, b0 + 0.0015, b1 - 0.0015, M.vanity);
    if (grip) P.box(a0 + 0.01, a1 - 0.01, 0, 0.003, b0 + 0.0015, b0 + 0.008, M.black);
  };
  const ym = y0 + 0.62;
  openFront(open, F, F.u0 + 0.02, F.u1 - 0.02, y0 + 0.4, ym, M.vanity, null, {}, { mode: 'drawer', depth: depth - 0.06, name: 'lådan', build: plain(false) });
  openFront(open, F, F.u0 + 0.02, F.u1 - 0.02, ym, y0 + 0.84, M.vanity, null, {}, { mode: 'drawer', depth: depth - 0.17, name: 'lådan', build: plain(true) });
  // the porcelain top with its basin (#122): a hole in the slab, a bowl VANITY_BASIN.depth deep
  const bowl = { x0: wallX + 0.13, x1: wallX + depth - 0.05, z0: cz - width / 2 + 0.07, z1: cz + width / 2 - 0.07 };
  slabWithHole(B, wallX, wallX + depth + 0.01, cz - width / 2, cz + width / 2, y0 + 0.84, y0 + 0.87, bowl, M.porcelain);
  const bottom = sinkBowl(B, bowl, y0 + 0.87, VANITY_BASIN.depth, M.porcelain, 'x0');
  cylinderY(B, wallX + 0.08, cz, 0.018, y0 + 0.87, y0 + 1.0, M.chrome);
  B.box(wallX + 0.08, wallX + 0.2, cz - 0.012, cz + 0.012, y0 + 0.97, y0 + 0.99, M.chrome);
  r.tap = { pos: [wallX + 0.19, y0 + 0.966, cz], dir: [0, -1, 0], r: 0.008, basin: bottom, name: 'blandaren' };
  return r;
}

/** Oval mirror (Slot 50) with LED backlight, on the wall at x = wallX. */
function ovalMirror(B, wallX, cz, y0, w, h, led) {
  const shape = (s) => {
    const r = (w * s) / 2, l = (h * s) / 2 - r;
    const p = new THREE.Shape();
    p.absarc(0, l, r, 0, Math.PI, false);
    p.absarc(0, -l, r, Math.PI, 2 * Math.PI, false);
    return p;
  };
  for (const [s, d, m] of [[1.04, 0.012, led], [1, 0.018, M.mirror]]) {
    const geo = new THREE.ShapeGeometry(shape(s), 24);
    geo.rotateY(Math.PI / 2);
    geo.translate(wallX + d, y0, cz);
    B.add(geo, m);
  }
  return { shape: shape(1), x: wallX + 0.018, y: y0, z: cz };
}

/** Mirror image over a mirror lying in the plane x = const, facing +x (shape in its own y/z). */
function mirrorReflector(group, geo, x, y, z, level) {
  const holder = new THREE.Group();
  holder.position.set(x, y, z);
  holder.rotation.y = Math.PI / 2; // local +z → world +x
  group.add(holder);
  addReflector(holder, geo, { level });
  return holder;
}

/** LED strips on mirrors, switchable with E on their own (lights.js treats them like floor lamps). */
export const mirrorLamps = [];
/** Loose things among the fitted interior (the Moccamaster): world.js hides them with F. */
export const looseItems = [];
/** The cup cabinet's box (cups.js builds it) and worktop rects for cups (#90); filled by buildInterior. */
export let cupCabinet = null;
export const cupSurfaces = [];

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

function spots(B, room, y, n, material) {
  const [cx] = centre(room);
  for (let i = 0; i < n; i++) {
    const z = room.z0 + ((i + 0.5) * (room.z1 - room.z0)) / n;
    cylinderY(B, cx, z, 0.04, y - 0.006, y, material, 16);
  }
}

function buildBathroom(B, group, floor, room, y0, handled, taps, appliances) {
  const segs = [];
  const sinkF = floor.fixtures.find((f) => f.kind === 'sink' && inside(f, room));
  const shower = floor.fixtures.find((f) => f.kind === 'shower' && inside(f, room));
  const upstairs = room.level === 1;
  const yc = y0 + (room.wallTile ?? 2.5);
  if (sinkF) {
    handled.add(sinkF);
    // Badrum: Core Grip 60 + Slot 50 oval mirror. WC/dusch: Core XS Grip 50 + mirror cabinet Stage 50.
    const open = { group, list: appliances }; // drawers and the mirror cabinet open with E (#103)
    const r = vanity(B, sinkF, room.x0 + 0.005, y0, upstairs ? 0.5 : 0.6, upstairs ? 0.36 : 0.45, open);
    segs.push(r);
    taps.push(r.tap);
    const [, cz] = centre(sinkF);
    if (upstairs) {
      const m = frame(B, { x0: room.x0, x1: room.x0 + 0.15, z0: cz - 0.25, z1: cz + 0.25 }, 'e');
      // Stage 50: a hollow cabinet with shelves, its mirror door opens with E (#103); the mirror image rides on the door
      shell(m, m.u0, m.u1, y0 + 1.2, y0 + 1.9, 0.15, { inner: M.white, outer: M.vanity });
      const door = openFront(open, m, m.u0, m.u1, y0 + 1.2, y0 + 1.9, M.vanity, null, {}, { mode: 'hinge', at: 'a0', name: 'spegelskåpet', max: 100, build: (P, a0, a1, b0, b1) => {
        P.box(a0, a1, -FT, 0, b0, b1, M.vanity);
        P.box(a0 + 0.01, a1 - 0.01, 0, 0.004, b0 + 0.01, b1 - 0.01, M.mirror);
      } });
      const holder = mirrorReflector(group, new THREE.PlaneGeometry(m.u1 - m.u0 - 0.02, 0.68), m.f + 0.0045, y0 + 1.55, cz, room.level); // on the cabinet's front (#139)
      group.updateMatrixWorld(true);
      door.object.attach(holder);
      holder.traverse((o) => { o.userData.door = door; }); // the (invisible) mirror image is part of the door's E target
    } else {
      // Slot 50 with its LED backlight on a switch of its own (E on the mirror, #50)
      const led = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2dc, emissiveIntensity: 0.04 });
      const om = ovalMirror(B, room.x0, cz, y0 + 1.5, 0.5, 0.9, led);
      mirrorReflector(group, new THREE.ShapeGeometry(om.shape, 24), om.x, om.y, om.z, room.level);
      const pick = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.95, 0.56), new THREE.MeshBasicMaterial());
      pick.position.set(room.x0 + 0.03, y0 + 1.5, cz);
      pick.visible = false; // raycasts ignore visibility: the E target for the LED strip
      group.add(pick);
      mirrorLamps.push({ object: pick, shade: led, height: 0, level: room.level, name: 'spegelbelysningen', offset: [0.35, 0] });
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
  spots(B, room, yc - 0.004, 2, lampMat(room.level, room.name));
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
/**
 * The hall's EL/C cabinet (#103): a tall hollow white cabinet facing into the hall (`dir`), its door opens with E.
 * Inside: the fuse box (a grey enclosure with rows of breakers, the main switch) and the fibre box + router with
 * blinking-green LEDs on a shelf above it. Returns the Openable (an E target in world.lids).
 */
export function buildElCabinet(group, cab, dir, y0, h, list) {
  const B = new Batch(), F = frame(B, cab, dir), y1 = y0 + h;
  const white = std(0xf4f4f1, { roughness: 0.5 }), grey = std(0xc9cbc8, { roughness: 0.6 }), dark = std(0x2b2d2f, { roughness: 0.5 });
  const ledGreen = std(0x40ff70, { emissive: 0x30ff60, emissiveIntensity: 1.5 });
  shell(F, F.u0, F.u1, y0, y1, F.depth, { shelf: false, inner: white, outer: white });
  const a0 = F.u0 + 0.05, a1 = F.u1 - 0.05, d = -F.depth + 0.008;
  F.box(a0, a1, d, d + 0.11, y0 + 1.15, y0 + 1.75, grey);                                  // fuse box
  for (let r = 0; r < 3; r++) for (let k = 0; k < 10; k++) {                                 // breakers in three rows
    const u = a0 + 0.025 + k * (a1 - a0 - 0.05) / 10;
    F.box(u, u + 0.022, d + 0.11, d + 0.13, y0 + 1.25 + r * 0.16, y0 + 1.34 + r * 0.16, k === 0 && r === 2 ? M.handle : white);
    F.box(u + 0.006, u + 0.016, d + 0.13, d + 0.14, y0 + 1.3 + r * 0.16, y0 + 1.32 + r * 0.16, dark); // toggle
  }
  F.box(F.u0 + 0.016, F.u1 - 0.016, -F.depth + 0.01, -FT - 0.02, y0 + 1.9, y0 + 1.918, white);  // shelf
  F.box(a0, a0 + 0.14, d, d + 0.18, y0 + 1.918, y0 + 1.95, dark);                           // router
  F.box(a0 + 0.17, a1, d, d + 0.06, y0 + 1.918, y0 + 2.0, white);                            // fibre box
  for (let k = 0; k < 4; k++) F.box(a0 + 0.02 + k * 0.025, a0 + 0.03 + k * 0.025, d + 0.18, d + 0.182, y0 + 1.935, y0 + 1.94, ledGreen);
  group.add(...B.meshes());
  return openFront({ group, list }, F, F.u0, F.u1, y0, y1, white, null, {}, { mode: 'hinge', at: 'a0', name: 'elskåpet', build: (P, b0, b1, c0, c1) => {
    P.box(b0 + 0.0015, b1 - 0.0015, -FT, 0, c0 + 0.0015, c1 - 0.0015, white);
    P.box(b1 - 0.04, b1 - 0.025, 0, 0.012, c0 + 1.05, c0 + 1.15, M.chrome);                 // a small handle
  } });
}

export function buildInterior(group, floor, li, y0, yC, wallBoxes, handled, taps = [], appliances = []) {
  const B = new Batch();
  const rects = [];
  if (li === K.level) rects.push(...buildKitchen(B, group, floor, y0, yC, handled, taps, appliances));
  for (const room of TILED_ROOMS.filter((r) => r.level === li)) {
    B.box(room.x0, room.x1, room.z0, room.z1, y0 + 0.001, y0 + 0.004, M[room.floor]);
    if (room.wallTile) {
      tileWalls(B, room, wallBoxes, y0, room.wallTile, M.wallTile);
      rects.push(...buildBathroom(B, group, floor, room, y0, handled, taps, appliances));
    }
    if (room.name === 'Tvätt') rects.push(...buildLaundry(B, group, floor, { ...room, ceiling: 2.5 }, y0, handled, taps, appliances));
  }
  skirting(B, [...wallBoxes, ...floor.windows], li, floor.size, y0);
  group.add(...B.meshes());
  return rects;
}
