import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FINISH, TILED_ROOMS, KITCHEN as K, SKIRTING, LAUNDRY_SINK, LAUNDRY_CABINET, VANITY_BASIN, HAVBACK, LIGHTING, KITCHEN_SOCKETS, TAP_LEVER, LAUNDRY, SHOWER_FITTINGS, FLOOR_DRAIN } from './config.js';
import { wallCabinet } from './cabinets.js';
import { Fridge } from './fridge.js';
import { buildOvens } from './ovens.js';
import { Hob } from './hob.js';
import { Hood } from './hood.js';
import { attachContents, Pack, frameMatrix, mirrorCabinet, vanityDrawer, laundrySink, havbackContents } from './contents.js';
import { fillKitchen } from './kitchenstuff.js';
import { Openable, pivotAround } from './openables.js';
import { buildRacks } from './dishwasher.js';
import { Moccamaster } from './coffee.js';
import { socketGeometry } from './sockets.js';
import { mirrorMaterial, litMirrorMaterial, litEmissive, litReflect } from './mirror.js';
import { addReflector } from './reflections.js';
import { SPONGE, spongeMaterials } from './sponge.js';
import { openAvatarCustomizer } from './customizer.js';

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
export function tileTexture({ tw, th, nx = 1, ny = 1, bond = false, color, vary = 0, mottle = 0, grout, joint = 0.003, ppm = 400, seed = 1 }) {
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

export const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
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
  glassTint: new THREE.MeshStandardMaterial({ color: 0x9fb3bd, transparent: true, opacity: 0.32, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide }), // washer / dryer porthole (#687)
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
  chrome: std(T.chrome, { roughness: 0.12, metalness: 0.82 }),
  mixerBlack: std(T.handle, { roughness: 0.58, metalness: 0.22 }),
  safetyRed: std(SHOWER_FITTINGS.safetyColor, { roughness: 0.4 }),
  mirror: mirrorMaterial, // shared with the hall mirror (mirror.js)
  frosted: new THREE.MeshStandardMaterial({
    color: 0xf1f5f6, transparent: true, opacity: 0.55, roughness: 0.3, depthWrite: false, side: THREE.DoubleSide,
  }),
  splash: textured(tileTexture({ tw: T.splash.w, th: T.splash.h, nx: 2, ny: 2, bond: true, color: T.splash.color, vary: 0.03, grout: T.splash.grout, joint: 0.003, ppm: 800, seed: 3 }), { roughness: T.splash.roughness }),
  wallTile: textured(tileTexture({ tw: T.wallTile.w, th: T.wallTile.h, nx: 2, ny: 3, color: T.wallTile.color, vary: 0.02, grout: T.grout, joint: 0.003, seed: 5 }), { roughness: 0.6 }),
  hallTile: textured(tileTexture({ tw: T.hallTile.w, th: T.hallTile.h, nx: 2, ny: 4, color: T.hallTile.color, vary: 0.12, mottle: 0.12, grout: 0x46484a, joint: 0.003, ppm: 300, seed: 11 }), { roughness: 0.7 }),
  havback: std(HAVBACK.color, { roughness: 0.7 }),          // IKEA HAVBÄCK, dark grey (#293)
  havbackIn: std(0x535456, { roughness: 0.75 }),
  havbackGlass: new THREE.MeshStandardMaterial({ color: 0xdcebe6, transparent: true, opacity: 0.35, roughness: 0.1, depthWrite: false }),
  brass: std(HAVBACK.knob, { roughness: 0.35, metalness: 0.6 }),
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
/** Extra glow materials (additive, e.g. an uplight on the wall) switched with a room: `userData.glow` = the
 * opacity when lit (lights.js fades them in by opacity, not emissive). Key as for lampMaterials. */
export const lampGlows = new Map();
export function addLampGlow(level, room, material) {
  const key = `${level}:${room}`;
  if (!lampGlows.has(key)) lampGlows.set(key, []);
  lampGlows.get(key).push(material);
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

// the kitchen's wall sockets (#442, #510): black double sockets (plate and cups) according to Peab options
const socketMats = { plate: new THREE.MeshStandardMaterial({ color: KITCHEN_SOCKETS.color, roughness: 0.35 }),
  cup: new THREE.MeshStandardMaterial({ color: KITCHEN_SOCKETS.cupColor ?? 0x27282b, roughness: 0.5 }) };

export class Batch {
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
export function frame(B, r, dir) {
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
    // a door ending in an inside corner (`corner`: 'a1') hinges on its other side: the other run is in the way (#154);
    // `cornerMax` (#319) instead hinges it at the corner (handle on its other edge), stopped at that many degrees
    const last = opts.open?.corner === 'a1' && i === n - 1, atCorner = last && opts.open.cornerMax;
    const handle = atCorner ? 'v-lo' : last ? 'v-hi' : i % 2 ? 'v-lo' : 'v-hi';
    if (!opts.open) { front(F, b0, b1, y0, y1, opts.material ?? M.front, handle, opts); continue; }
    shell(F, b0, b1, y0, y1, opts.open.depth);
    const o = openFront(opts.open, F, b0, b1, y0, y1, opts.material ?? M.front, handle, opts, { mode: 'hinge', name: opts.open.name ?? 'skåpet', ...(atCorner ? { at: 'a1', max: opts.open.cornerMax } : {}) });
    if (opts.fill) stock(opts.open, F, o, opts.fill[i % opts.fill.length], b0, b1, y0, y1, opts.open.depth);
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
export function shell(F, a0, a1, y0, y1, depth, { shelf = true, inner = M.carcass, outer = M.front } = {}) {
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
export function openFront(ctx, F, a0, a1, y0, y1, material, handle, opts, how) {
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

/**
 * Fill an opening front's cabinet / drawer with kitchen things (#229, kitchenstuff.js): built into their own batch,
 * merged per material, hidden until the front opens (contents.js). Hinged doors and flaps leave the contents standing
 * in the carcass (a shelf half-way when it is tall enough, as `shell` builds it); drawers carry theirs. `o.stock` = the kind.
 */
function stock(ctx, F, o, kind, a0, a1, y0, y1, depth, { drawer = false, shelf = true } = {}) {
  o.stock = kind;
  const CB = new Batch(), P = onBatch(F, CB), t = 0.016;
  const b = drawer
    ? { a0: a0 + 0.04, a1: a1 - 0.04, d0: -FT - depth + 0.02, d1: -FT - 0.01, y0: y0 + 0.029, y1: y1 - 0.045, shelf: null }
    : { a0: a0 + t + 0.006, a1: a1 - t - 0.006, d0: -depth + 0.015, d1: -FT - 0.03, y0: y0 + t + 0.002, y1: y1 - t - 0.004, shelf: shelf && y1 - y0 > 0.45 ? (y0 + y1) / 2 + 0.009 : null };
  // where the life sim's slots go (#369, stores.js): a world point at (u along the front, d in front of its plane, y), and the
  // turn that lays a thing's long side (x) along the front
  o.stockFrame = { b, drawer, at: (u, d, y) => { const [x, z] = F.at(u, d); return new THREE.Vector3(x, y, z); }, yaw: F.dir === 'w' ? -Math.PI / 2 : F.dir === 'e' ? Math.PI / 2 : 0 };
  fillKitchen(P, kind, b);
  if (!CB.parts.size) return;
  const g = attachContents(CB.meshes(), o, { carry: drawer });
  if (!drawer) ctx.group.add(g);
}

const inside = (r, a, tol = 0.02) => r.x0 >= a.x0 - tol && r.x1 <= a.x1 + tol && r.z0 >= a.z0 - tol && r.z1 <= a.z1 + tol;
const centre = (r) => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];

export function cylinderY(B, x, z, r, y0, y1, material, segs = 16) {
  const geo = new THREE.CylinderGeometry(r, r, y1 - y0, segs);
  geo.translate(x, (y0 + y1) / 2, z);
  B.add(geo, material);
}

/**
 * A slab (x0..x1, z0..z1, y0..y1) with a rectangular hole `h` cut out (#608): one watertight shell on a 3×3 grid
 * of the slab's and hole's x/z lines (centre cell = the hole). Every face is split at every grid line, so all
 * neighbouring quads share exact corner coordinates — no T-junctions, hence no rasterisation cracks (the old four
 * overlapping boxes left a faint dotted seam from the hole's corners to the slab's edge), and no inner faces.
 */
export function slabWithHole(B, x0, x1, z0, z1, y0, y1, h, material) {
  const xs = [x0, h.x0, h.x1, x1], zs = [z0, h.z0, h.z1, z1];
  const solid = (i, j) => i >= 0 && i < 3 && j >= 0 && j < 3 && !(i === 1 && j === 1) &&
    xs[i + 1] - xs[i] > 1e-6 && zs[j + 1] - zs[j] > 1e-6;
  const pos = [], nor = [], idx = [];
  const quad = (pts, n) => {
    const [a, b, c] = pts;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const dot = (u[1] * v[2] - u[2] * v[1]) * n[0] + (u[2] * v[0] - u[0] * v[2]) * n[1] + (u[0] * v[1] - u[1] * v[0]) * n[2];
    if (dot < 0) pts = [pts[0], pts[3], pts[2], pts[1]];
    const k = pos.length / 3;
    for (const p of pts) { pos.push(...p); nor.push(...n); }
    idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
  };
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    if (!solid(i, j)) continue;
    const [a, b, c, d] = [xs[i], xs[i + 1], zs[j], zs[j + 1]];
    quad([[a, y1, c], [b, y1, c], [b, y1, d], [a, y1, d]], [0, 1, 0]);
    quad([[a, y0, c], [b, y0, c], [b, y0, d], [a, y0, d]], [0, -1, 0]);
    if (!solid(i - 1, j)) quad([[a, y0, c], [a, y0, d], [a, y1, d], [a, y1, c]], [-1, 0, 0]);
    if (!solid(i + 1, j)) quad([[b, y0, c], [b, y0, d], [b, y1, d], [b, y1, c]], [1, 0, 0]);
    if (!solid(i, j - 1)) quad([[a, y0, c], [b, y0, c], [b, y1, c], [a, y1, c]], [0, 0, -1]);
    if (!solid(i, j + 1)) quad([[a, y0, d], [b, y0, d], [b, y1, d], [a, y1, d]], [0, 0, 1]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  geo.setIndex(idx);
  B.add(geo, material);
}

/**
 * A sink bowl hanging from `top` into the hole `h` (#122): four walls, a bottom `depth` below the top,
 * a drain (grate + plug) in the middle and an overflow hole on the wall at x = h[overflow]. Returns the
 * bottom's height (where a tap's stream lands). The walls stop at `under`, the slab's underside (#608): above it the
 * slab's own hole walls show, and walls reaching `top` were coplanar with them and with the slab's top (z-fighting).
 */
export function sinkBowl(B, h, top, depth, material, overflow = 'x1', under = top) {
  const t = 0.008, yb = top - depth;
  B.box(h.x0, h.x1, h.z0, h.z1, yb - t, yb, material);
  B.box(h.x0, h.x1, h.z0 - t, h.z0, yb, under, material);
  B.box(h.x0, h.x1, h.z1, h.z1 + t, yb, under, material);
  B.box(h.x0 - t, h.x0, h.z0, h.z1, yb, under, material);
  B.box(h.x1, h.x1 + t, h.z0, h.z1, yb, under, material);
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

/** Gooseneck mixer (Tapwell ARM184): chamfered foot ring, column with lever boss, smooth svanhals and defined aerator nozzle. */
export function mixer(B, x, z, y, [dx, dz], material = M.mixerBlack, { h = 0.3, r = 0.09, tube = 0.011 } = {}) {
  // Chamfered foot ring / sockel
  B.add(new THREE.CylinderGeometry(0.024, 0.027, 0.007, 24).translate(x, y + 0.0035, z), material);

  // Column height adapts if compact mixer
  const colH = Math.min(0.12, Math.max(0.04, h - 0.12));
  cylinderY(B, x, z, 0.023, y + 0.007, y + colH, material, 24);

  // Side lever connection boss on the mixer body
  const leverH = Math.min(y + colH * 0.65, y + TAP_LEVER.side.height);
  const boss = new THREE.CylinderGeometry(0.0135, 0.0135, 0.016, 18).rotateZ(Math.PI / 2);
  boss.rotateY(Math.atan2(dx, -dz));
  boss.translate(x - dz * 0.023, leverH, z + dx * 0.023);
  B.add(boss, material);

  // Swivel collar and smooth transition to riser tube
  cylinderY(B, x, z, 0.0235, y + colH, y + colH + 0.006, material, 24);
  B.add(new THREE.CylinderGeometry(tube * 1.35, 0.023, 0.008, 24).translate(x, y + colH + 0.01, z), material);
  cylinderY(B, x, z, tube * 1.35, y + colH + 0.014, y + colH + 0.018, material, 24);

  // Riser tube
  const riserY0 = y + colH + 0.018;
  if (h > riserY0 - y) cylinderY(B, x, z, tube, riserY0, y + h, material, 20);

  // Smooth gooseneck arc: 16 radial segments, 36 tubular segments
  const arc = new THREE.TorusGeometry(r, tube, 16, 36, Math.PI);
  arc.rotateY(Math.atan2(-dz, dx) + Math.PI); // arc runs from +x' to −x' (towards the front)
  arc.translate(x + dx * r, y + h, z + dz * r);
  B.add(arc, material);

  // Spout drop tube and aerator nozzle (pipmunstycke med strålsamlare)
  const nx = x + dx * 2 * r, nz = z + dz * 2 * r;
  cylinderY(B, nx, nz, tube, y + h - 0.048, y + h, material, 20);
  cylinderY(B, nx, nz, tube * 1.22, y + h - 0.071, y + h - 0.048, material, 24);
  B.add(new THREE.CylinderGeometry(tube * 1.22, tube * 1.05, 0.003, 24).translate(nx, y + h - 0.0725, nz), material);
  B.add(new THREE.CylinderGeometry(tube * 0.95, tube * 0.95, 0.002, 20).translate(nx, y + h - 0.0715, nz), M.steelDark || M.black);

  return {
    pos: [nx, y + h - 0.075, nz],
    dir: [0, -1, 0],
    r: tube,
    basin: y,
    lever: {
      pos: [x - dz * TAP_LEVER.side.offset, leverH, z + dx * TAP_LEVER.side.offset],
      dir: [dx, dz],
      style: 'side',
      material
    }
  };
}

/** Basin mixer (Tapwell RT2 071): chamfered foot ring, cylindrical body, forward spout with aerator nozzle. */
export function basinMixer(B, x, z, y, [dx, dz], material = M.chrome, basinBottom = y - 0.15) {
  // Chamfered foot ring / sockel
  B.add(new THREE.CylinderGeometry(0.022, 0.025, 0.006, 24).translate(x, y + 0.003, z), material);
  // Cylindrical body
  cylinderY(B, x, z, 0.0215, y + 0.006, y + 0.125, material, 24);
  cylinderY(B, x, z, 0.022, y + 0.108, y + 0.113, material, 24); // cartridge seam ring

  // Forward spout
  const spoutLen = 0.11;
  const sx = x + dx * (spoutLen * 0.5 + 0.01), sz = z + dz * (spoutLen * 0.5 + 0.01);
  const spout = new THREE.CylinderGeometry(0.010, 0.0105, spoutLen - 0.015, 20).rotateZ(Math.PI / 2);
  spout.rotateY(Math.atan2(dz, dx));
  spout.translate(sx, y + 0.105, sz);
  B.add(spout, material);

  // Aerator nozzle (pipmunstycke med strålsamlare) at the spout tip
  const tx = x + dx * spoutLen, tz = z + dz * spoutLen;
  cylinderY(B, tx, tz, 0.011, y + 0.096, y + 0.108, material, 24);
  B.add(new THREE.CylinderGeometry(0.011, 0.0095, 0.002, 24).translate(tx, y + 0.095, tz), material);
  B.add(new THREE.CylinderGeometry(0.0085, 0.0085, 0.002, 20).translate(tx, y + 0.096, tz), M.steelDark || M.black);

  return {
    pos: [tx, y + 0.096, tz],
    dir: [0, -1, 0],
    r: 0.008,
    basin: basinBottom,
    name: 'blandaren',
    lever: {
      pos: [x, y + 0.13, z],
      dir: [dx, dz],
      style: 'top',
      material
    }
  };
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
  // the drawer unit nearest the corner: the toaster stands in its bottom drawer (#401, toaster.js)
  const toasterCab = east.filter((c) => c !== tall && c !== hobCab && c.label !== 'DM' && !(sinkF && inside(sinkF, c))).at(-1);

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
      stock(open, F, openFront(open, F, u0, u1, yb, yOven, M.front, 'v-hi', {}, { mode: 'hinge', name: 'skåpet' }), 'baking', u0, u1, yb, yOven, F.depth);
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
      stock(open, F, openFront(open, F, u0, u1, yGrille + K.grille, yTop, M.front, 'v-hi', { low: true }, { mode: 'hinge', name: 'skåpet' }), 'serving', u0, u1, yGrille + K.grille, yTop, F.depth);
      continue;
    }
    if (fridges.includes(c)) {
      // freestanding stainless fridge/freezer, a ventilation grille and top cabinets above
      const yF = y0 + K.fridgeHeight;
      if (c.label === 'K') {
        // the fridge opens (fridge.js); hinged at the wall side, handle by the freezer
        const fr = new Fridge({ x0: u0 + 0.003, x1: u1 - 0.003, zFront: c.z0 + 0.015, zBack: c.z1 - 0.03, y0: y0 + 0.01, h: K.fridgeHeight - 0.01 });
        group.add(fr.object);
        appliances.push(fr, ...fr.drawers);
      } else {
        // the freezer opens too (#161), hinged at the far side so the handles meet; the changelog note on
        // its door is attached by main.js and swings with it. 90°: the corner unit's front is beside it (#116)
        const other = fridges.find((o) => o !== c);
        const hiSide = other && other.x0 > c.x0; // handle at the edge where the two meet
        const fz = new Fridge({ x0: u0 + 0.003, x1: u1 - 0.003, zFront: c.z0 + 0.015, zBack: c.z1 - 0.03, y0: y0 + 0.01, h: K.fridgeHeight - 0.01,
          hinge: hiSide ? 'x0' : 'x1', freezer: true, max: 90, name: 'frysen' });
        group.add(fz.object);
        appliances.push(fz, ...fz.drawers);
      }
      F.box(u0, u1, -F.depth, -FT, yF, yF + K.grille, M.front);
      shell(F, u0, u1, yF + K.grille, yTop, F.depth, { shelf: false });
      F.box(u0 + 0.005, u1 - 0.005, -FT, 0, yF, yF + K.grille, M.steel);
      for (let y = yF + 0.012; y < yF + K.grille - 0.01; y += 0.012) F.box(u0 + 0.02, u1 - 0.02, 0, 0.002, y, y + 0.004, M.black);
      const flap = openFront(open, F, u0, u1, yF + K.grille, yTop, M.front, 'bottom', {}, { mode: 'flap', top: true, name: 'skåpet', max: 80 }); // lifts up
      stock(open, F, flap, c.label === 'K' ? 'festive' : 'serving', u0, u1, yF + K.grille, yTop, F.depth, { shelf: false }); // the good china, platters (#229)
      continue;
    }
    // base unit: carcass + recessed plinth + fronts (under the sink the carcass stops below the bowl, #122)
    const sinkUnit = sinkF && inside(sinkF, c);
    F.box(u0, u1, -0.07, -0.05, y0, yb, M.front);
    F.box(u0, u1, -F.depth, -0.07, y0, yb, M.front);
    if (c.label === 'DM') {
      // integrated dishwasher (KEZA9310W): its door folds down onto a steel tub with two racks
      shell(F, u0, u1, yb, yt, F.depth, { shelf: false, inner: M.dishwasher });
      const dwDoor = openFront(open, F, u0, u1, yb, yt, M.front, 'top', {}, { mode: 'flap', name: 'diskmaskinen', max: 88 });
      dwDoor.stock = 'own'; // its racks: two that roll out with E while the door is down, slots for the life sim (#384, dishwasher.js)
      buildRacks({ F, u0, u1, yb, yt, door: dwDoor, open, batch: () => new Batch(), onBatch, chrome: M.chrome, FT });
    } else if (sinkUnit) {
      shell(F, u0, u1, yb, top - K.sink.depth - 0.02, F.depth, { shelf: false });
      // waste sorting under the sink (#103): a grey bin, a green one for food waste, a small blue one for paper
      const d0 = -F.depth + 0.06, d1 = -FT - 0.05, uw = (u1 - u0 - 0.06) / 3;
      // (the grey one behind the bins' own door: the life sim's waste bin "Avfall", #381)
      const binAt = [];
      [[M.binBlue, 0.2], [M.binGreen, 0.24], [M.bin, 0.3]].forEach(([m, h], k) => {
        const a = u0 + 0.025 + k * (uw + 0.005);
        F.box(a, a + uw, d0, d1, yb + 0.016, yb + 0.016 + h, m);
        F.box(a + 0.01, a + uw - 0.01, d0 + 0.01, d1 - 0.01, yb + 0.016 + h - 0.002, yb + 0.018 + h, M.black); // its opening
        const [x, z] = F.at(a + uw / 2, (d0 + d1) / 2);
        binAt.push({ pos: new THREE.Vector3(x, yb + 0.016, z), w: uw, d: d1 - d0, h });
      });
      const sinkTop = top - K.sink.depth - 0.02;
      const leftDoor = openFront(open, F, u0, (u0 + u1) / 2, yb, yt, M.front, 'v-hi', {}, { mode: 'hinge', name: 'skåpet' });
      stock(open, F, leftDoor, 'sink', u0, u1, yb, sinkTop, F.depth, { shelf: false });
      const yaw = F.dir === 'w' ? -Math.PI / 2 : F.dir === 'e' ? Math.PI / 2 : 0;
      // the bins (`bin`: the grey one's bottom centre and size, #381; `bins`: all three with the door(s) in front of each, #386)
      Object.assign(openFront(open, F, (u0 + u1) / 2, u1, yb, yt, M.front, 'v-lo', {}, { mode: 'hinge', name: 'skåpet' }), { stock: 'own', bin: { ...binAt[2], yaw },
        bins: binAt.map((b, k) => ({ ...b, yaw, door: ['left', 'either', 'right'][k] })), leftDoor });
    } else if (ret.includes(c)) {
      // corner unit: only the part beside the east run is a visible door
      const vis = Math.min(u1, east[0] ? east[0].x0 : u1);
      shell(F, u0, vis, yb, yt, F.depth);
      if (vis < u1) F.box(vis, u1, -F.depth, -FT, yb, yt, M.front);
      stock(open, F, openFront(open, F, u0, vis, yb, yt, M.front, 'v-hi', {}, { mode: 'hinge', name: 'hörnskåpet' }), 'corner', u0, vis, yb, yt, F.depth); // hinged away from the corner: the other run is in the way there
    } else {
      F.box(u0, u1, -F.depth, -FT, yb, yt, M.front); // drawer unit: the drawers' boxes slide out of it
      const h = yt - yb, hs = [0.2 * h, 0.4 * h, 0.4 * h];
      let y = yt;
      hs.forEach((dh, k) => {
        const d = openFront(open, F, u0, u1, y - dh, y, M.front, 'top', {}, { mode: 'drawer', depth: F.depth - 0.08, name: 'lådan' });
        if (c === hobCab && k === 1) { d.panHome = true; d.stock = 'own'; } // the frying pan's place (#159, pan.js)
        else if (c === toasterCab && k === 2) { d.toasterHome = true; stock(open, F, d, 'drawerToaster', u0, u1, y - dh, y, F.depth - 0.08, { drawer: true }); } // pots at the back, the toaster in front (#401)
        else stock(open, F, d, [c === hobCab ? 'utensils' : 'cutlery', 'rolls', 'drawerPots'][k], u0, u1, y - dh, y, F.depth - 0.08, { drawer: true }); // #229
        y -= dh;
      });
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
    const bottom = sinkBowl(B, sinkHole, top, K.sink.depth, M.steel, 'x1', yt);
    taps.push({ ...mixer(B, eastWall - 0.06, sz, top, [-1, 0], M.mixerBlack), basin: bottom, name: 'köksblandaren' });
    // A small two-layer sponge beside the basin. Both pieces join the existing material batches.
    const sx = sinkHole.x0 - SPONGE.width / 2 - 0.025;
    const szp = sz + K.sink.w / 2 - SPONGE.depth / 2;
    if (sx - SPONGE.width / 2 > eFront + 0.01) {
      const spongeBox = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
      B.add(spongeBox(SPONGE.width, SPONGE.scour, SPONGE.depth, sx, top, szp), spongeMaterials.scour);
      B.add(spongeBox(SPONGE.width, SPONGE.foam, SPONGE.depth, sx, top + SPONGE.scour, szp), spongeMaterials.foam);
    }
  }
  // Induction hob, centred on its cabinet
  if (hobCab) {
    const [, hz] = centre(hobCab);
    const hx0 = eFront + 0.04;
    const hob = new Hob({ x0: hx0, z: hz, y: top }); // its own object: E switches it on (#158)
    group.add(hob.object);
    appliances.push(hob);
  }
  // Wall sockets at the top of the splashback (#442, sockets.js): over the Moccamaster, between the sink and the hob, and in
  // the corner (they replaced the "Hörnbox" power box on the worktop)
  const sock = socketGeometry();
  for (const g of sock.plate) B.add(g, socketMats.plate);
  for (const g of sock.cup) B.add(g, socketMats.cup);
  for (const g of sock.hole) B.add(g, M.black);

  // Wall cabinets along the east wall (from the tall unit to the corner) and along the
  // south wall over the corner unit; hood, a dummy front over it (#320) + gypsum boxing to the ceiling over the hob.
  const wd = K.wallDepth, yW = y0 + K.wallBottom, yHood = y0 + K.hoodBottom;
  const kitchenLamp = lampMat(K.level, K.room); // (the room's lamp material: the ceiling light's)
  // #221: the under-cabinet LED (Belysning LED Linear) and the hood's light are lamps of their own (world.lamps → lights.js
  // FloorLamp): own emissive materials, a warm additive wash on the worktop and splashback, their own switches
  const benchLamp = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2dc, emissiveIntensity: 0.04 });
  const hoodLamp = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2dc, emissiveIntensity: 0.04 });
  const UL = K.underLights;
  const washTex = (() => { // bright along one edge (v = 1), easing out (#271: no linear ramp ending in a line)
    const c = document.createElement('canvas'); c.width = 4; c.height = 64;
    const g = c.getContext('2d'), r = g.createLinearGradient(0, 0, 0, 64);
    for (let i = 0; i <= 8; i++) r.addColorStop(i / 8, `rgba(255,255,255,${((1 - i / 8) ** 2).toFixed(3)})`);
    g.fillStyle = r; g.fillRect(0, 0, 4, 64);
    return new THREE.CanvasTexture(c);
  })();
  const wash = (k) => { const m = new THREE.MeshBasicMaterial({ color: 0xffd9a0, map: washTex, vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }); m.userData.on = k; return m; };
  const BL = UL.bench, benchWash = wash(BL.wash), hoodWash = wash(UL.hood.wash);
  // a wash plane w × h; its ends (along w) fade out over s0 / s1 m (vertex colours, smoothstep; s0 at local −w/2), so a
  // run that stops at the hood or a cabinet has no hard edge (#271); 0 = no fade (an end at a wall or a corner, #285)
  const washGeometry = (w, h, s0 = UL.soft, s1 = UL.soft) => {
    s0 = Math.min(s0, w / 2); s1 = Math.min(s1, w / 2);
    const n = 6, xs = [];
    for (let i = 0; i <= n; i++) xs.push(-w / 2 + (s0 * i) / n);
    for (let i = n; i >= 0; i--) xs.push(w / 2 - (s1 * i) / n);
    const pos = [], uv = [], col = [], idx = [];
    for (const [j, x] of xs.entries()) {
      const t = Math.min(1, s0 > 0 ? (x + w / 2) / s0 : 1, s1 > 0 ? (w / 2 - x) / s1 : 1), f = t * t * (3 - 2 * t);
      for (const v of [1, 0]) { pos.push(x, (v - 0.5) * h, 0); uv.push((x + w / 2) / w, v); col.push(f, f, f); }
      if (j) { const a = 2 * (j - 1); idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    return g;
  };
  const washPlane = (w, h, m, rotX, rotY, x, y, z, s0, s1) => { const p = new THREE.Mesh(washGeometry(w, h, s0, s1), m); p.rotation.set(rotX, rotY, 0, 'YXZ'); p.position.set(x, y, z); p.raycast = () => {}; p.renderOrder = 2; group.add(p); return p; };
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
  doorRow(EW, runZ0 + cupW, hob ? hob[0] : visEnd, yW, yTop, 0.5, { low: true, open: hob ? wallOpen : { ...wallOpen, corner: 'a1' }, fill: ['plates', 'glasses', 'mugs', 'platesLife'] }); // (the one over the free worktop: the life sim's plates, #379)
  cupCabinet = { front: wallX, back: eastWall, z0: runZ0, z1: runZ0 + cupW, y0: yW, y1: yTop, material: M.front, handle: M.handle };
  // the worktop between the tall unit and the hob: somewhere to put a cup down
  cupSurfaces.push({ x0: eFront + 0.03, x1: eastWall - 0.03, z0: runZ0 + 0.03, z1: firstEnd - 0.03, y: top });
  // and between the hob and the corner, where the toaster's cord reaches the corner wall socket (#401, #442; the air fryer has the corner)
  if (hob) cupSurfaces.push({ x0: eFront + 0.03, x1: eastWall - 0.03, z0: hob[1] + 0.03, z1: southWall - depth - 0.03, y: top });
  if (hob) {
    // its corner door hinges at the corner and opens to the right (the user, #319): handle away from the return row's
    doorRow(EW, hob[1], visEnd, yW, yTop, 0.5, { low: true, open: { ...wallOpen, corner: 'a1', cornerMax: K.cornerDoorMax }, fill: ['pantry', 'tea'] }); // the first one is the life sim's pantry (#369): dry goods at the back, slots in front
    const yH = yHood + K.hoodHeight;
    // over the hood: a dummy front (#320), the duct runs there — no handle, no E target, no Openable; a solid carcass
    // behind it (baked into the static merge) so no gap shows between the gypsum boxing above and the hood below
    EW.box(hob[0] + 0.002, hob[1] - 0.002, -wd, -FT, yH, yTop, M.front);
    front(EW, hob[0], hob[1], yH, yTop, M.front, null);
    const hood = new Hood({ x0: wallX, x1: eastWall, z0: hob[0] + 0.01, z1: hob[1] - 0.01, y0: yHood, y1: yH, lampMaterial: hoodLamp }); // E: the fan (#194); its light has its own button (#221)
    group.add(hood.object);
    appliances.push(hood);
    // the hood's light on the hob: the wash on the worktop under it and up the splashback under the hood (bright at the
    // top), a pool light over the hob, well out from the tiles (#271); its ends cross-fade with the bench light's (#285)
    const hz = (hob[0] + hob[1]) / 2;
    washPlane(hob[1] - hob[0] + 2 * BL.spill, eastWall - eFront, hoodWash, -Math.PI / 2, -Math.PI / 2, (eFront + eastWall) / 2, top + 0.012, hz);
    washPlane(hob[1] - hob[0] + 2 * BL.spill, yHood - top, hoodWash, 0, -Math.PI / 2, eastWall - 0.008, (top + yHood) / 2, hz);
    const bp = hood.lampButton.getWorldPosition(new THREE.Vector3()); // the group sits at the origin
    mirrorLamps.push({ object: hood.lampButton, shade: hoodLamp, glows: [hoodWash], height: top + UL.hood.y - bp.y, offset: [eastWall - UL.hood.out - bp.x, hz - bp.z], level: K.level, name: 'lampan i köksfläkten', light: UL.hood.pool, auto: false }); // a work light: by hand only (#234)
    EW.box(hob[0], hob[1], -wd, 0, yTop, yC, M.white); // Lokal gipsinklädnad ovan spiskåpa
  }
  const fridgeX1 = fridges.length ? Math.max(...fridges.map((c) => c.x1)) : retX0;
  if (fridgeX1 < wallX) {
    const RW = frame(B, { x0: fridgeX1, x1: wallX, z0: southWall - wd, z1: southWall }, 'n');
    doorRow(RW, fridgeX1, wallX, yW, yTop, 0.5, { low: true, open: { ...wallOpen, corner: 'a1' }, fill: ['tea', 'plates', 'dry'] });
    RW.box(fridgeX1 + 0.02, wallX + BL.strip + 0.01, -BL.strip - 0.01, -BL.strip, yW - 0.008, yW, benchLamp); // the strip runs on into the corner
  }
  // under-cabinet LED (Belysning LED Linear, #285): one continuous 1 cm strip just behind the front edge of every wall
  // cabinet, from the cup cabinet past the sink and the hood (not under it: its own light) into the corner
  for (const [a, b] of eastSpans) EW.box(a + 0.02, b - 0.02, -BL.strip - 0.01, -BL.strip, yW - 0.008, yW, benchLamp);
  // the bench light's wash: on the worktop (bright by the wall) and up the splashback (bright at the top), one even band
  // per run. An end by the hood reaches BL.spill under it and fades (soft, no hole between the runs); an end at the tall
  // unit / freezer fades over BL.endSoft; the ends meeting in the corner do not fade (the two runs overlap there)
  const soft = (z, inner) => (z === southWall ? 0 : hob && (z === hob[0] || z === hob[1]) ? UL.soft : inner ? BL.endSoft : UL.soft);
  for (const [a, b] of eastSpans) {
    const z0 = hob && a === hob[1] ? a - BL.spill : a, z1 = hob && b === hob[0] ? b + BL.spill : b;
    const len = z1 - z0, mz = (z0 + z1) / 2, s0 = soft(a, a === runZ0), s1 = soft(b, false);
    washPlane(len, eastWall - eFront, benchWash, -Math.PI / 2, -Math.PI / 2, (eFront + eastWall) / 2, top + 0.011, mz, s0, s1);   // v = 1 by the wall
    washPlane(len, yW - top, benchWash, 0, -Math.PI / 2, eastWall - 0.008, (top + yW) / 2, mz, s0, s1);                            // v = 1 at the top
  }
  if (fridgeX1 < wallX) { // the return over the corner unit: its worktop (bright by the south wall) and splashback, on to the east wall
    washPlane(eastWall - fridgeX1, southWall - retFront, benchWash, -Math.PI / 2, Math.PI, (fridgeX1 + eastWall) / 2, top + 0.010, (retFront + southWall) / 2, 0, BL.endSoft);
    washPlane(eastWall - fridgeX1, yW - top, benchWash, 0, Math.PI, (fridgeX1 + eastWall) / 2, (top + yW) / 2, southWall - 0.008, 0, BL.endSoft);
  }
  // its switch: a small white rocker under the first wall cabinet after the cup cabinet, near its front edge
  const sw = new THREE.Group();
  sw.position.set(wallX + 0.035, yW - 0.006, runZ0 + cupW + 0.12);
  const rocker = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.012, 0.045), new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.4 }));
  const swPick = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.1), new THREE.MeshBasicMaterial());
  swPick.visible = false;
  sw.add(rocker, swPick);
  group.add(sw);
  // its pool lights: one over the middle of each run, under the cabinets and well over the worktop, weak — the washes
  // carry the even look (#271: no hot spot on the tiles; #285: one light could not reach the sink)
  const anchors = (hob ? [[runZ0, hob[0]], [hob[1], visEnd]] : [[runZ0, (runZ0 + visEnd) / 2], [(runZ0 + visEnd) / 2, visEnd]])
    .map(([a, b]) => ({ offset: [eastWall - BL.out - sw.position.x, (a + b) / 2 - sw.position.z], height: top + BL.y - sw.position.y, light: BL.pool }));
  mirrorLamps.push({ object: sw, shade: benchLamp, glows: [benchWash], anchors, level: K.level, name: 'bänkbelysningen' });
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
    // A real hollow drum rather than a black disc on a solid body (#550).
    const D=LAUNDRY.drum, mid=(a0+a1)/2, t=D.shell;
    F.box(a0,a0+t,-F.depth+.02,0,y0+.01,y0+.85,M.appliance);
    F.box(a1-t,a1,-F.depth+.02,0,y0+.01,y0+.85,M.appliance);
    F.box(a0+t,a1-t,-F.depth+.02,0,y0+.01,y0+.01+t,M.appliance);
    F.box(a0+t,a1-t,-F.depth+.02,0,y0+.85-t,y0+.85,M.appliance);
    F.box(a0+t,a1-t,-F.depth+.02,-F.depth+.02+t,y0+.01+t,y0+.85-t,M.appliance);
    const face=new THREE.Shape();
    face.moveTo(-w/2,.01-D.centerY);face.lineTo(w/2,.01-D.centerY);
    face.lineTo(w/2,.85-D.centerY);face.lineTo(-w/2,.85-D.centerY);face.closePath();
    const hole=new THREE.Path();hole.absarc(0,0,D.radius,0,Math.PI*2,true);face.holes.push(hole);
    const panel=new THREE.ExtrudeGeometry(face,{depth:t,bevelEnabled:false,curveSegments:32})
      .rotateY(Math.PI/2).translate(F.f-t,y0+D.centerY,mid);
    panel.setIndex(Array.from({length:panel.attributes.position.count},(_,i)=>i));B.add(panel,M.appliance);
    F.box(a0+.02,a1-.02,0,.004,y0+.74,y0+.82,M.steel);
    const [dx,dz]=F.at(mid,.01);
    const drum=new THREE.CylinderGeometry(D.radius-.003,D.radius-.003,D.depth,32,1,true);
    // Inward faces use the existing steel finish, without another material or two-sided draw.
    const ix=drum.index.array;for(let k=0;k<ix.length;k+=3)[ix[k+1],ix[k+2]]=[ix[k+2],ix[k+1]];
    drum.computeVertexNormals();drum.rotateZ(Math.PI/2).translate(F.f-D.depth/2,y0+D.centerY,mid);B.add(drum,M.steel);
    B.add(new THREE.CircleGeometry(D.radius-.003,32).rotateY(Math.PI/2)
      .translate(F.f-D.depth,y0+D.centerY,mid),M.black);
    // the round door: hinged on its left edge, opens with E (#103)
    const DB = new Batch();
    const ring = new THREE.TorusGeometry(0.17, 0.025, 10, 32);
    ring.rotateY(Math.PI / 2);
    ring.translate(dx, y0 + 0.42, dz);
    DB.add(ring, M.chrome);
    // bowl-shaped tinted glass (#687): a shallow sphere cap bulging out of the ring, so the drum shows through
    const gR = 0.25, gA = Math.asin(0.15 / gR);
    const glass = new THREE.SphereGeometry(gR, 28, 6, 0, Math.PI * 2, 0, gA);
    glass.rotateZ(-Math.PI / 2);
    glass.translate(dx - gR * Math.cos(gA) + 0.004, y0 + 0.42, dz);
    DB.add(glass, M.glassTint);
    { // door handle on the ring's free edge (opposite the hinge)
      const [kx, kz] = F.at(mid + 0.2, 0.026);
      DB.add(new THREE.BoxGeometry(0.02, 0.09, 0.016).translate(kx, y0 + 0.42, kz), M.chrome);
    }
    { // two chrome hinges on the body at the hinge side
      for (const dy of [-0.09, 0.09]) { const [hxx, hzz] = F.at(mid - 0.205, 0.006); B.add(new THREE.BoxGeometry(0.012, 0.05, 0.026).translate(hxx, y0 + 0.42 + dy, hzz), M.chrome); }
    }
    { // inside the drum: three stainless paddles and a ring of perforation holes on the back (a few tiny discs, merged)
      for (let k = 0; k < 3; k++) {
        const a = k * Math.PI * 2 / 3 + 0.5, rr = D.radius - 0.02;
        B.add(new THREE.BoxGeometry(D.depth * 0.9, 0.03, 0.012).rotateX(Math.PI / 2 - a).translate(F.f - D.depth / 2, y0 + D.centerY + Math.sin(a) * rr, mid + Math.cos(a) * rr), M.steel);
      }
      for (const [n, rr] of [[8, 0.05], [14, 0.1], [20, 0.145]]) for (let k = 0; k < n; k++) {
        const a = k * Math.PI * 2 / n;
        B.add(new THREE.CircleGeometry(0.006, 6).rotateY(Math.PI / 2).translate(F.f - D.depth + 0.001, y0 + D.centerY + Math.sin(a) * rr, mid + Math.cos(a) * rr), M.black);
      }
    }
    { // control panel (#687): detergent drawer (three compartment lines) / condensate tank on one side, a programme knob with a pointer on the other
      const pl = F.f + 0.002, py = y0 + 0.78;
      F.box(a0 + 0.03, a0 + 0.13, 0, 0.007, py - 0.025, py + 0.025, M.black);
      F.box(a0 + 0.034, a0 + 0.126, 0.007, 0.009, py - 0.021, py + 0.021, M.appliance);
      for (const v of [-0.007, 0.007]) F.box(a0 + 0.034, a0 + 0.126, 0.009, 0.011, py + v - 0.001, py + v + 0.001, M.black);
      F.box(a0 + 0.07, a0 + 0.09, 0.009, 0.019, py - 0.006, py + 0.006, M.steel);
      const nz = F.at(a1 - 0.07, 0)[1];
      B.add(new THREE.CylinderGeometry(0.03, 0.03, 0.016, 24).rotateZ(Math.PI / 2).translate(pl + 0.008, py, nz), M.chrome);
      B.add(new THREE.CylinderGeometry(0.024, 0.024, 0.004, 24).rotateZ(Math.PI / 2).translate(pl + 0.018, py, nz), M.black);
      const pz2 = F.at(a1 - 0.07 + 0.012, 0)[1];
      B.add(new THREE.BoxGeometry(0.003, 0.003, 0.016).translate(pl + 0.021, py, pz2), M.appliance);
    }
    const [hx, hz] = F.at((a0 + a1) / 2 - 0.195, 0.01), at = new THREE.Vector3(hx, y0 + 0.42, hz);
    const free = new THREE.Vector3(dx - hx, 0, dz - hz).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.1);
    const o = new Openable({ name: c.label === 'TM' ? 'tvättmaskinen' : 'torktumlaren', object: pivotAround(DB.meshes(), at), mode: 'hinge', sign: free.x > 0 ? 1 : -1, max: 100 });
    o.laundry = { kind: c.label === 'TM' ? 'washer' : 'dryer', front: F.f, center: [F.f,y0+LAUNDRY.drum.centerY,(a0+a1)/2] };
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
    const ys = yt + 0.033 - LAUNDRY_SINK.depth - 0.02;
    shell(F, F.u0, F.u1, y0 + 0.1, ys, F.depth, { shelf: false, outer: M.laundry }); // stops below the bowl (#122)
    // its door opens with E (#103), hinged away from the knob
    const door = openFront({ group, list: appliances }, F, F.u0, F.u1, y0 + 0.1, yt, M.laundry, null, {}, { mode: 'hinge', at: 'a1', name: 'skåpet', build: (P, a0, a1, b0, b1) => {
      front(P, a0, a1, b0, b1, M.laundry, null);
      const [kx, kz] = F.at(a0 + 0.04, 0.012);
      P.add(new THREE.SphereGeometry(0.0125, 12, 8).translate(kx, b1 - 0.06, kz), M.chrome);
    } });
    { // inside (#231): detergent, fabric softener, stain remover, a laundry basket with pegs (drawn while it is open)
      const P = new Pack(), [x, z] = F.at((F.u0 + F.u1) / 2, 0);
      laundrySink(P, { hw: (F.u1 - F.u0) / 2 - 0.016 - 0.003, y: 0.116, zb: -F.depth + 0.008 + 0.003, zf: -FT - 0.005, h: ys - y0 - 0.016 - 0.116 });
      group.add(attachContents(P.meshes(frameMatrix(F.dir, new THREE.Vector3(x, y0, z))), door));
    }
    const [, sz] = centre(sinkF), h = tvSink, rim = 0.02, yr = yt + 0.03;
    slabWithHole(B, h.x0 - rim, h.x1 + rim, h.z0 - rim, h.z1 + rim, yr, yr + 0.003, h, M.steelDark); // inset sink's rim
    const bottom = sinkBowl(B, h, yr + 0.003, LAUNDRY_SINK.depth, M.steel, 'x0', yt);
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
  // the north end meets the side wall: that door hinges on its other side (#154)
  const lc = wallCabinet({ wall: run.x0, dir: 1, z0: run.z0, z1: cz1, corner: 'z0', y0: cy0, y1: cy1, depth: C.depth, units: C.units, material: M.laundry, handle: M.chrome,
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
  floorDrain(B, ...laundryDrainAt(run, room, 'e'), y0 + 0.004, M.steel, M.black); // in front of the machines (#1072)
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
  // what is in them (#231): towels below, brushes, plasters and hair ties in the shallow top one; they ride along
  const fill = (o, top, yb, dd) => {
    const P = new Pack(), [x, z] = F.at((F.u0 + F.u1) / 2, -FT);
    vanityDrawer(P, top, { hw: (F.u1 - F.u0 - 0.04) / 2 - 0.032, y: 0.028, depth: dd - 0.012 });
    attachContents(P.meshes(frameMatrix(F.dir, new THREE.Vector3(x, yb, z))), o, { carry: true });
  };
  fill(openFront(open, F, F.u0 + 0.02, F.u1 - 0.02, y0 + 0.4, ym, M.vanity, null, {}, { mode: 'drawer', depth: depth - 0.06, name: 'lådan', build: plain(false) }), false, y0 + 0.4, depth - 0.06);
  fill(openFront(open, F, F.u0 + 0.02, F.u1 - 0.02, ym, y0 + 0.84, M.vanity, null, {}, { mode: 'drawer', depth: depth - 0.17, name: 'lådan', build: plain(true) }), true, ym, depth - 0.17);
  // the porcelain top with its basin (#122): a hole in the slab, a bowl VANITY_BASIN.depth deep
  const bowl = { x0: wallX + 0.13, x1: wallX + depth - 0.05, z0: cz - width / 2 + 0.07, z1: cz + width / 2 - 0.07 };
  slabWithHole(B, wallX, wallX + depth + 0.01, cz - width / 2, cz + width / 2, y0 + 0.84, y0 + 0.87, bowl, M.porcelain);
  const bottom = sinkBowl(B, bowl, y0 + 0.87, VANITY_BASIN.depth, M.porcelain, 'x0', y0 + 0.84);
  r.tap = basinMixer(B, wallX + 0.08, cz, y0 + 0.87, [1, 0], M.chrome, bottom);
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
  for (const [s, d, m] of [[1.04, 0.012, led], [1, 0.018, litMirrorMaterial]]) {
    const geo = new THREE.ShapeGeometry(shape(s), 24);
    geo.rotateY(Math.PI / 2);
    geo.translate(wallX + d, y0, cz);
    B.add(geo, m);
  }
  return { shape: shape(1), x: wallX + 0.018, y: y0, z: cz };
}

/** Mirror image over a mirror lying in the plane x = const, facing +x (shape in its own y/z). */
function mirrorReflector(group, geo, x, y, z, level, opts = {}) {
  const holder = new THREE.Group();
  holder.position.set(x, y, z);
  holder.rotation.y = Math.PI / 2; // local +z → world +x
  group.add(holder);
  addReflector(holder, geo, { level, ...opts });
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
export function glassPanel(B, [ax, az], [bx, bz], y0) {
  const len = Math.hypot(bx - ax, bz - az), alongX = Math.abs(bx - ax) > Math.abs(bz - az);
  const t = 0.008;
  if (alongX) B.box(Math.min(ax, bx), Math.max(ax, bx), az - t / 2, az + t / 2, y0 + 0.02, y0 + 1.95, M.frosted);
  else B.box(ax - t / 2, ax + t / 2, Math.min(az, bz), Math.max(az, bz), y0 + 0.02, y0 + 1.95, M.frosted);
  for (const [x, z] of [[ax, az], [bx, bz]]) B.box(x - 0.012, x + 0.012, z - 0.012, z + 0.012, y0, y0 + 1.97, M.chrome);
  return len;
}

/**
 * A square floor drain (#1072, FLOOR_DRAIN) centred at (cx, cz) on a floor whose top is at `yf`: a raised stainless
 * frame, a dark recess and grate bars over it, all a few millimetres proud of the tiles (no coplanar faces with them,
 * no flicker). Visual only: the collision floor stays flat. Goes into the floor's batch, so it adds no draw call where
 * `metal` / `dark` are already in it.
 */
export function floorDrain(B, cx, cz, yf, metal, dark) {
  const { size, grate, bars, h } = FLOOR_DRAIN, o = size / 2, g = grate / 2, yr = yf + h * 0.3;
  B.box(cx - o, cx + o, cz - o, cz - g, yf, yf + h, metal);   // frame
  B.box(cx - o, cx + o, cz + g, cz + o, yf, yf + h, metal);
  B.box(cx - o, cx - g, cz - g, cz + g, yf, yf + h, metal);
  B.box(cx + g, cx + o, cz - g, cz + g, yf, yf + h, metal);
  B.box(cx - g, cx + g, cz - g, cz + g, yf, yr, dark);         // the recess seen through the slots
  const pitch = grate / bars, w = pitch * 0.55;
  for (let i = 0; i < bars; i++) {                              // grate bars, slightly below the frame's top
    const x = cx - g + (i + 0.5) * pitch;
    B.box(x - w / 2, x + w / 2, cz - g, cz + g, yr, yf + h * 0.8, metal);
  }
  B.box(cx - g, cx + g, cz - 0.004, cz + 0.004, yr, yf + h * 0.8, metal); // a cross rib holding the bars
}

/** Where the drain of a room with machines but no shower goes: FLOOR_DRAIN.laundryGap in front of the machine run
 * `run` (fronts facing `dir`, 'e' / 'w'), centred along it, kept inside `room`. */
export function laundryDrainAt(run, room, dir) {
  const o = FLOOR_DRAIN.size / 2 + 0.02, x = dir === 'w' ? run.x0 - FLOOR_DRAIN.laundryGap : run.x1 + FLOOR_DRAIN.laundryGap;
  const clamp = (v, a, b) => Math.min(Math.max(v, a + o), b - o);
  return [clamp(x, room.x0, room.x1), clamp((run.z0 + run.z1) / 2, room.z0, room.z1)];
}

/** Where a shower's drain goes (FLOOR_DRAIN.shower: fractions of its plan rectangle). */
export function showerDrainAt(s) {
  const { u, v } = FLOOR_DRAIN.shower;
  return [s.x0 + (s.x1 - s.x0) * u, s.z0 + (s.z1 - s.z0) * v];
}

// Both our bathrooms and standard/visitable flats use the same two modest-detail templates.
// Batch owns mutable geometry: clone the cached merged parts before translating / assigning world UVs.
const showerTemplates = new Map();
export function showerSet(B, wallX, z, y0, ceiling) {
  const key = !!ceiling;
  if (!showerTemplates.has(key)) {
    const batch = new Batch();
    const outlets = buildShowerSet(batch, 0, 0, 0, key);
    const parts = [...batch.parts].map(([material, geometries]) => {
      const geometry = mergeGeometries(geometries);
      for (const g of geometries) g.dispose();
      return { material, geometry };
    });
    showerTemplates.set(key, { parts, outlets });
  }
  const template = showerTemplates.get(key);
  for (const { material, geometry } of template.parts) B.add(geometry.clone().translate(wallX, y0, z), material);
  const moved = (p) => [p[0] + wallX, p[1] + y0, p[2] + z];
  return template.outlets.map((outlet) => ({ ...outlet, pos: moved(outlet.pos), pick: moved(outlet.pick), dir: [...outlet.dir], basin: outlet.basin + y0 }));
}

/** Beveled escutcheon / wall rosette flush against wall tile. */
function escutcheonX(B, wallX, y, z, rWall = 0.035, rOuter = 0.029, depth = 0.016, segs = 20) {
  const geo = new THREE.CylinderGeometry(rOuter, rWall, depth, segs)
    .rotateZ(-Math.PI / 2)
    .translate(wallX + depth / 2, y, z);
  B.add(geo, M.chrome);
}

/** Visual approximation of the specified Tapwell sets; detail dimensions are guesses, not a product survey. */
function thermostatMixer(B, wallX, y0, z, ceiling) {
  const mx = wallX + 0.07, my = y0 + 1.0;
  // Wall connections (160 mm c/c: +-0.08 m) with beveled rosettes
  for (const s of [-1, 1]) {
    const pz = z + s * 0.08;
    escutcheonX(B, wallX, my, pz, 0.035, 0.029, 0.016, 20);
    const pipe = new THREE.CylinderGeometry(0.014, 0.014, 0.044, 14)
      .rotateZ(-Math.PI / 2)
      .translate(wallX + 0.038, my, pz);
    B.add(pipe, M.chrome);
    const nut = new THREE.CylinderGeometry(0.018, 0.018, 0.012, 8)
      .rotateZ(-Math.PI / 2)
      .translate(wallX + 0.058, my, pz);
    B.add(nut, M.chrome);
  }

  // Central mixer body: horizontal cylinder between knobs
  const body = new THREE.CylinderGeometry(0.0215, 0.0215, 0.176, 22)
    .rotateX(Math.PI / 2)
    .translate(mx, my, z);
  B.add(body, M.chrome);

  // Hose connection underneath at center
  const nipple = new THREE.CylinderGeometry(0.0095, 0.0095, 0.016, 14)
    .translate(mx, my - 0.027, z);
  const nippleNut = new THREE.CylinderGeometry(0.012, 0.012, 0.008, 14)
    .translate(mx, my - 0.023, z);
  B.add(nipple, M.chrome);
  B.add(nippleNut, M.chrome);

  // Riser connection / diverter on top if ceiling set
  if (ceiling) {
    const topCollar = new THREE.CylinderGeometry(0.014, 0.014, 0.024, 16)
      .translate(mx, my + 0.025, z);
    B.add(topCollar, M.chrome);
    const divKnob = new THREE.CylinderGeometry(0.006, 0.006, 0.016, 12)
      .translate(mx - 0.014, my + 0.022, z);
    B.add(divKnob, M.chrome);
  }

  // Left knob: Flödesvred (volume / diverter)
  const lz = z - 0.118;
  const lKnob = new THREE.CylinderGeometry(0.022, 0.022, 0.046, 20)
    .rotateX(Math.PI / 2)
    .translate(mx, my, lz);
  B.add(lKnob, M.chrome);
  const lCap = new THREE.CylinderGeometry(0.018, 0.022, 0.006, 20)
    .rotateX(Math.PI / 2)
    .translate(mx, my, z - 0.144);
  B.add(lCap, M.chrome);
  const lCollar = new THREE.CylinderGeometry(0.020, 0.020, 0.004, 20)
    .rotateX(Math.PI / 2)
    .translate(mx, my, z - 0.092);
  B.add(lCollar, M.steelDark);
  const lGrip = new THREE.BoxGeometry(0.005, 0.004, 0.032)
    .translate(mx + 0.022, my, lz);
  B.add(lGrip, M.chrome);
  for (let a = 0; a < 6; a++) {
    const ang = (a / 6) * Math.PI * 2;
    const rib = new THREE.BoxGeometry(0.002, 0.002, 0.028)
      .translate(mx + 0.0215 * Math.cos(ang), my + 0.0215 * Math.sin(ang), lz);
    B.add(rib, M.chrome);
  }

  // Right knob: Temperaturvred med 38°C skållningsspärr
  const rz = z + 0.118;
  const rKnob = new THREE.CylinderGeometry(0.022, 0.022, 0.046, 20)
    .rotateX(Math.PI / 2)
    .translate(mx, my, rz);
  B.add(rKnob, M.chrome);
  const rCap = new THREE.CylinderGeometry(0.022, 0.018, 0.006, 20)
    .rotateX(Math.PI / 2)
    .translate(mx, my, z + 0.144);
  B.add(rCap, M.chrome);
  const rCollar = new THREE.CylinderGeometry(0.020, 0.020, 0.004, 20)
    .rotateX(Math.PI / 2)
    .translate(mx, my, z + 0.092);
  B.add(rCollar, M.steelDark);
  const rGrip = new THREE.BoxGeometry(0.005, 0.004, 0.032)
    .translate(mx + 0.022, my, rz);
  B.add(rGrip, M.chrome);
  for (let a = 0; a < 6; a++) {
    const ang = (a / 6) * Math.PI * 2;
    const rib = new THREE.BoxGeometry(0.002, 0.002, 0.028)
      .translate(mx + 0.0215 * Math.cos(ang), my + 0.0215 * Math.sin(ang), rz);
    B.add(rib, M.chrome);
  }
  // 38°C scald safety button
  const cos45 = Math.SQRT1_2, sin45 = Math.SQRT1_2;
  const bx = mx + 0.0225 * cos45, by = my + 0.0225 * sin45;
  const btnHousing = new THREE.BoxGeometry(0.006, 0.004, 0.012)
    .rotateZ(-Math.PI / 4)
    .translate(bx, by, z + 0.110);
  B.add(btnHousing, M.steelDark);
  const btn = new THREE.BoxGeometry(0.005, 0.003, 0.008)
    .rotateZ(-Math.PI / 4)
    .translate(bx + 0.0015 * cos45, by + 0.0015 * sin45, z + 0.110);
  B.add(btn, M.chrome);
  const redDot = new THREE.BoxGeometry(0.003, 0.002, 0.003)
    .rotateZ(-Math.PI / 4)
    .translate(bx + 0.0025 * cos45, by + 0.0025 * sin45, z + 0.110);
  B.add(redDot, M.safetyRed);
}

/** Overhead shower head (Takduschhuvud TVM 7200, 25 cm) with profiled dome & silicone nozzles. */
function showerHeadOverhead(B, [x, y, z], r = 0.125) {
  // Swivel ball joint and top nut
  const sphere = new THREE.SphereGeometry(0.010, 14, 10).translate(x, y + 0.012, z);
  B.add(sphere, M.chrome);
  const nut = new THREE.CylinderGeometry(0.014, 0.014, 0.009, 16).translate(x, y + 0.007, z);
  B.add(nut, M.chrome);

  // Profiled dome with gently curved top
  const dome1 = new THREE.CylinderGeometry(0.014, 0.065, 0.007, 32).translate(x, y + 0.002, z);
  const dome2 = new THREE.CylinderGeometry(0.065, r - 0.004, 0.007, 32).translate(x, y - 0.004, z);
  const rim = new THREE.CylinderGeometry(r - 0.004, r, 0.004, 32).translate(x, y - 0.008, z);
  B.add(dome1, M.chrome);
  B.add(dome2, M.chrome);
  B.add(rim, M.chrome);

  // Bottom outer chrome bezel
  const bezel = new THREE.CylinderGeometry(r, r, 0.003, 32).translate(x, y - 0.010, z);
  B.add(bezel, M.chrome);

  // Recessed spray face plate on underside
  const faceR = r - 0.009;
  const face = new THREE.CylinderGeometry(faceR, faceR, 0.002, 32).translate(x, y - 0.011, z);
  B.add(face, M.steelDark);

  // Nozzle pattern (silikonnoppor / strålhål) in concentric rings
  const rings = [
    { r: 0.026, count: 8 },
    { r: 0.050, count: 14 },
    { r: 0.074, count: 20 },
    { r: 0.098, count: 26 },
  ];
  const nozzleGeos = [];
  nozzleGeos.push(new THREE.CylinderGeometry(0.0018, 0.0018, 0.0025, 5).translate(x, y - 0.0125, z));
  for (const ring of rings) {
    for (let i = 0; i < ring.count; i++) {
      const ang = (i / ring.count) * Math.PI * 2;
      const nx = x + ring.r * Math.cos(ang);
      const nz = z + ring.r * Math.sin(ang);
      nozzleGeos.push(new THREE.CylinderGeometry(0.0016, 0.0018, 0.0025, 5).translate(nx, y - 0.0125, nz));
    }
  }
  const mergedNozzles = mergeGeometries(nozzleGeos);
  for (const g of nozzleGeos) g.dispose();
  B.add(mergedNozzles, M.steelDark);
}

/** Angled hand shower head (duschsil) with outer bezel, spray face and silicone nozzles. */
function handShowerHead(B, [x, y, z], [nx, ny, nz], r = 0.039) {
  const dir = new THREE.Vector3(nx, ny, nz).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);

  // Tapered chrome back casing
  const back = new THREE.CylinderGeometry(0.016, r, 0.016, 24)
    .applyQuaternion(q)
    .translate(x - dir.x * 0.008, y - dir.y * 0.008, z - dir.z * 0.008);
  B.add(back, M.chrome);

  // Outer bezel
  const bezel = new THREE.CylinderGeometry(r, r, 0.004, 24)
    .applyQuaternion(q)
    .translate(x, y, z);
  B.add(bezel, M.chrome);

  // Recessed spray face plate
  const faceR = r - 0.004;
  const face = new THREE.CylinderGeometry(faceR, faceR, 0.002, 24)
    .applyQuaternion(q)
    .translate(x + dir.x * 0.002, y + dir.y * 0.002, z + dir.z * 0.002);
  B.add(face, M.steelDark);

  // Silicone spray nozzles
  const rings = [
    { r: 0.013, count: 6 },
    { r: 0.024, count: 12 },
  ];
  const nozzleGeos = [];
  const cCenter = new THREE.Vector3(0, -0.003, 0).applyQuaternion(q).add(new THREE.Vector3(x, y, z));
  nozzleGeos.push(new THREE.CylinderGeometry(0.0014, 0.0016, 0.002, 5).applyQuaternion(q).translate(cCenter.x, cCenter.y, cCenter.z));
  for (const ring of rings) {
    for (let i = 0; i < ring.count; i++) {
      const ang = (i / ring.count) * Math.PI * 2;
      const local = new THREE.Vector3(ring.r * Math.cos(ang), -0.003, ring.r * Math.sin(ang));
      const pos = local.applyQuaternion(q).add(new THREE.Vector3(x, y, z));
      nozzleGeos.push(new THREE.CylinderGeometry(0.0014, 0.0016, 0.002, 5).applyQuaternion(q).translate(pos.x, pos.y, pos.z));
    }
  }
  const merged = mergeGeometries(nozzleGeos);
  for (const g of nozzleGeos) g.dispose();
  B.add(merged, M.steelDark);
}

/**
 * Hand shower unit (ergonomic handle, angled head) mounted in a detailed slider/holder on rail.
 * Returns { headPos, sprayDir, hoseBase }
 */
function handShowerUnit(B, pipeX, hy, z, tiltRad, headPos, sprayDir) {
  // Slider / clamp on rail
  cylinderY(B, pipeX, z, 0.015, hy - 0.022, hy + 0.022, M.chrome, 16);
  // Tightening lever on side
  const lever = new THREE.CylinderGeometry(0.005, 0.005, 0.022, 12)
    .rotateX(Math.PI / 2)
    .translate(pipeX, hy, z - 0.022);
  B.add(lever, M.chrome);
  const knob = new THREE.SphereGeometry(0.007, 10, 8).translate(pipeX, hy, z - 0.033);
  B.add(knob, M.chrome);

  // Standoff arm to holder cup
  const arm = new THREE.CylinderGeometry(0.0075, 0.0075, 0.018, 12)
    .rotateZ(-Math.PI / 2)
    .translate(pipeX + 0.016, hy, z);
  B.add(arm, M.chrome);

  // Conical holder cup
  const cupX = pipeX + 0.030, cupY = hy;
  const cup = new THREE.CylinderGeometry(0.0135, 0.0105, 0.032, 16)
    .rotateZ(tiltRad)
    .translate(cupX, cupY, z);
  B.add(cup, M.chrome);

  // Hand shower handle seated in holder
  const ux = -Math.sin(tiltRad), uy = Math.cos(tiltRad);

  // Conical hose coupling nut at base of handle
  const nut = new THREE.CylinderGeometry(0.011, 0.0085, 0.025, 14)
    .rotateZ(tiltRad)
    .translate(cupX - 0.022 * ux, cupY - 0.022 * uy, z);
  B.add(nut, M.chrome);

  // Lower ergonomic handle segment (tapering to waist)
  const lowerH = new THREE.CylinderGeometry(0.0092, 0.0112, 0.060, 16)
    .rotateZ(tiltRad)
    .translate(cupX + 0.020 * ux, cupY + 0.020 * uy, z);
  B.add(lowerH, M.chrome);

  // Upper ergonomic handle segment (flaring to neck)
  const upperH = new THREE.CylinderGeometry(0.0125, 0.0092, 0.080, 16)
    .rotateZ(tiltRad)
    .translate(cupX + 0.090 * ux, cupY + 0.090 * uy, z);
  B.add(upperH, M.chrome);

  // Angled transition neck
  const neckX = cupX + 0.130 * ux, neckY = cupY + 0.130 * uy;
  const neck = new THREE.CylinderGeometry(0.013, 0.0125, 0.020, 16)
    .rotateZ(tiltRad - 0.35)
    .translate(neckX + 0.008, neckY + 0.006, z);
  B.add(neck, M.chrome);

  // Angled shower head
  handShowerHead(B, headPos, sprayDir, 0.039);

  const hoseBase = [cupX - 0.035 * ux, cupY - 0.035 * uy, z];
  return { headPos, sprayDir, hoseBase };
}

/** Shower hose with fine segmentation, natural gravity drape and end couplings. */
function showerHose(B, pts, mixerX, mixerY, mixerZ) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const tube = new THREE.TubeGeometry(curve, SHOWER_FITTINGS.hoseSegments, SHOWER_FITTINGS.hoseRadius, 8);
  B.add(tube, M.chrome);

  // Coupling collar at mixer outlet
  const hexNut = new THREE.CylinderGeometry(0.010, 0.010, 0.014, 12).translate(mixerX, mixerY - 0.004, mixerZ);
  const ferrule = new THREE.CylinderGeometry(0.008, 0.0095, 0.008, 12).translate(mixerX, mixerY - 0.014, mixerZ);
  B.add(hexNut, M.chrome);
  B.add(ferrule, M.chrome);
}

/**
 * Shower fittings on the wall at x = wallX (spraying into +x), centred at z. Returns the
 * outlets (for running water): position + spray direction + radius.
 *  - ceiling: Takduschpaket Tvm 7200-160 Lång (Badrum): thermostat, riser, curved arm with a
 *    25 cm head, and a hand shower in a holder on the riser
 *  - else: Duschset Rt 105 + blandare Evm 168 (WC/dusch): thermostat, slide bar, hand shower
 */
function buildShowerSet(B, wallX, z, y0, ceiling) {
  const outlets = [];
  // Thermostat mixer: detailed body with beveled rosettes, ribbed knobs & scald safety button
  thermostatMixer(B, wallX, y0, z, ceiling);

  if (ceiling) {
    const top = y0 + 2.1, armX = wallX + 0.42;
    // Vertical riser pipe up from mixer
    cylinderY(B, wallX + 0.07, z, 0.0125, y0 + 1.025, top - 0.18, M.chrome, 14);

    // Wall bracket with beveled escutcheon at y0 + 1.77
    escutcheonX(B, wallX, y0 + 1.77, z, 0.028, 0.023, 0.015, 18);
    const standoff = new THREE.CylinderGeometry(0.009, 0.009, 0.042, 14)
      .rotateZ(-Math.PI / 2)
      .translate(wallX + 0.036, y0 + 1.77, z);
    B.add(standoff, M.chrome);
    cylinderY(B, wallX + 0.07, z, 0.015, y0 + 1.756, y0 + 1.784, M.chrome, 16);

    // Smooth curved top shower arm (swept 90° curve)
    const armPts = [
      [wallX + 0.07, top - 0.18, z],
      [wallX + 0.07, top - 0.07, z],
      [wallX + 0.11, top - 0.015, z],
      [wallX + 0.20, top, z],
      [armX, top, z]
    ];
    const armCurve = new THREE.CatmullRomCurve3(armPts.map(([x, y, pz]) => new THREE.Vector3(x, y, pz)));
    B.add(new THREE.TubeGeometry(armCurve, 28, 0.011, 14), M.chrome);

    // Vertical drop tube to overhead shower head
    cylinderY(B, armX, z, 0.011, top - 0.05, top, M.chrome, 14);
    showerHeadOverhead(B, [armX, top - 0.065, z], 0.125);
    outlets.push({ pos: [armX, top - 0.08, z], dir: [0, -1, 0], r: 0.10, basin: y0, name: 'takduschen', pick: [wallX + 0.07, y0 + 1.0, z], shower: true });

    // Hand shower in holder on the riser at y0 + 1.35
    const hy = y0 + 1.35;
    const hand = handShowerUnit(B, wallX + 0.07, hy, z, -0.22, [wallX + 0.16, hy + 0.12, z], [0.5, -0.86, 0]);

    // Smooth draped hose to mixer outlet
    const hosePts = [
      hand.hoseBase,
      [wallX + 0.12, hy - 0.20, z + 0.02],
      [wallX + 0.15, y0 + 0.78, z + 0.05],
      [wallX + 0.12, y0 + 0.63, z + 0.05],
      [wallX + 0.08, y0 + 0.72, z + 0.03],
      [wallX + 0.07, y0 + 0.965, z]
    ];
    showerHose(B, hosePts, wallX + 0.07, y0 + 0.965, z);
  } else {
    // Slide bar (Duschset Rt 105) with beveled wall brackets
    const barX = wallX + 0.05;
    cylinderY(B, barX, z, 0.011, y0 + 1.15, y0 + 1.95, M.chrome, 16);
    // Rounded end caps
    const capTop = new THREE.SphereGeometry(0.011, 14, 8).translate(barX, y0 + 1.95, z);
    const capBot = new THREE.SphereGeometry(0.011, 14, 8).translate(barX, y0 + 1.15, z);
    B.add(capTop, M.chrome);
    B.add(capBot, M.chrome);

    // Wall brackets with beveled escutcheons at y0 + 1.20 and y0 + 1.90
    for (const by of [1.20, 1.90]) {
      escutcheonX(B, wallX, y0 + by, z, 0.026, 0.021, 0.014, 18);
      const post = new THREE.CylinderGeometry(0.009, 0.009, 0.041, 14)
        .rotateZ(-Math.PI / 2)
        .translate(wallX + 0.0345, y0 + by, z);
      B.add(post, M.chrome);
      cylinderY(B, barX, z, 0.014, y0 + by - 0.013, y0 + by + 0.013, M.chrome, 16);
    }

    // Hand shower in slider at y0 + 1.75
    const hy = y0 + 1.75;
    const hand = handShowerUnit(B, barX, hy - 0.08, z, -0.42, [barX + 0.15, hy + 0.04, z], [0.3, -0.954, 0]);

    const head = hand.headPos, dir = hand.sprayDir;
    outlets.push({ pos: [head[0] + 0.02, head[1] - 0.02, z], dir, r: 0.045, basin: y0, name: 'duschen', pick: [wallX + 0.07, y0 + 1.0, z], shower: true });

    // Smooth draped hose to mixer outlet
    const hosePts = [
      hand.hoseBase,
      [wallX + 0.11, hy - 0.30, z + 0.02],
      [wallX + 0.15, y0 + 1.05, z + 0.05],
      [wallX + 0.13, y0 + 0.67, z + 0.05],
      [wallX + 0.08, y0 + 0.74, z + 0.03],
      [wallX + 0.07, y0 + 0.965, z]
    ];
    showerHose(B, hosePts, wallX + 0.07, y0 + 0.965, z);
  }
  return outlets;
}

/**
 * IKEA HAVBÄCK tall cabinet (#293, HAVBACK): wall-hung in the room's south-east corner, back to the south wall, a hollow
 * dark grey carcass with grey and glass shelves, the door on the side-wall side (E opens it) with a brass knob; bathroom
 * things inside, drawn while it is open. Returns its collision rectangle.
 */
function havback(B, group, list, room, y0) {
  const H = HAVBACK, x1 = room.x1 - 0.01, z1 = room.z1 - 0.004; // clear of the wall tiles
  const r = { x0: x1 - H.w, x1, z0: z1 - H.d, z1 };
  const F = frame(B, r, 'n'), yb = y0 + H.bottom, yt = yb + H.h, t = 0.016;
  shell(F, F.u0, F.u1, yb, yt, H.d, { shelf: false, inner: M.havbackIn, outer: M.havback });
  const levels = [];
  let floor = H.bottom + t;
  for (const [h, kind] of H.shelves) {
    const glass = kind === 'glass', th = glass ? 0.006 : 0.018;
    F.box(F.u0 + t, F.u1 - t, -H.d + 0.008, -FT - 0.006, yb + h - th, yb + h, glass ? M.havbackGlass : M.havbackIn);
    levels.push([floor, H.bottom + h - th]);
    floor = H.bottom + h;
  }
  levels.push([floor, H.bottom + H.h - t]);
  const door = openFront({ group, list }, F, F.u0, F.u1, yb, yt, M.havback, null, {}, { mode: 'hinge', at: 'a1', name: 'högskåpet', max: H.max,
    build: (P, a0, a1, b0, b1) => {
      const g = 0.0015, e = 0.012;
      P.box(a0 + g, a1 - g, -FT, -0.002, b0 + g, b1 - g, M.havback);            // the slab
      P.box(a0 + g, a1 - g, -0.002, 0, b1 - g - e, b1 - g, M.havback);           // its thin flat frame
      P.box(a0 + g, a1 - g, -0.002, 0, b0 + g, b0 + g + e, M.havback);
      for (const a of [a0 + g, a1 - g - e]) P.box(a, a + e, -0.002, 0, b0 + g + e, b1 - g - e, M.havback);
      const ku = a0 + 0.035, ky = (b0 + b1) / 2, [kx, kz] = P.at(ku, 0.022);     // the brass knob on the free edge
      P.box(ku - 0.005, ku + 0.005, 0, 0.014, ky - 0.005, ky + 0.005, M.brass);
      P.add(new THREE.SphereGeometry(0.013, 14, 10).scale(1, 1, 0.75).translate(kx, ky, kz), M.brass);
    } });
  const P = new Pack(), [x, z] = F.at((F.u0 + F.u1) / 2, 0);
  const hw=H.w/2-t-.004,zb=-H.d+.012;
  // The five original rolls become Items at the same shelf positions (#557).
  door.toiletRolls={matrix:frameMatrix(F.dir,new THREE.Vector3(x,y0,z)),positions:[[-hw+.06,levels[0][0],zb+.07],[-hw+.06,levels[0][0],zb+.185],[-hw+.175,levels[0][0],zb+.07],[-hw+.06,levels[0][0]+.1,zb+.07],[-hw+.06,levels[0][0]+.1,zb+.185]]};
  havbackContents(P, { hw, zb, zf: -FT - 0.008, levels });
  group.add(attachContents(P.meshes(frameMatrix(F.dir, new THREE.Vector3(x, y0, z))), door));
  return { x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1 };
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
      door.options = () => [
        { label: 'byt utseende vid spegeln', run: () => openAvatarCustomizer() },
        { label: door.isOpen ? 'stäng spegelskåpet' : 'öppna spegelskåpet', run: () => door.toggle() }
      ];
      const holder = mirrorReflector(group, new THREE.PlaneGeometry(m.u1 - m.u0 - 0.02, 0.68), m.f + 0.0045, y0 + 1.55, cz, room.level); // on the cabinet's front (#139)
      group.updateMatrixWorld(true);
      door.object.attach(holder);
      { // on its shelves (#231): a glass of toothbrushes, toothpaste, a razor, jars and bottles (drawn while it is open)
        const P = new Pack(), [x, z] = m.at(cz, 0);
        mirrorCabinet(P, { hw: 0.25 - 0.016 - 0.004, zb: -0.15 + 0.008 + 0.003, zf: -FT - 0.005, y0: 1.2 + 0.016 + 0.001, y1: 1.55 + 0.009 });
        group.add(attachContents(P.meshes(frameMatrix(m.dir, new THREE.Vector3(x, y0, z))), door));
      }
      holder.traverse((o) => { o.userData.door = door; }); // the (invisible) mirror image is part of the door's E target
    } else {
      // Slot 50 with its LED backlight on a switch of its own (E on the mirror, #50)
      const led = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: litEmissive(0xfff2dc), emissiveIntensity: 0.04 }); // dimmed (#339)
      const om = ovalMirror(B, room.x0, cz, y0 + 1.5, 0.5, 0.9, led);
      const holder = mirrorReflector(group, new THREE.ShapeGeometry(om.shape, 24), om.x, om.y, om.z, room.level, litReflect);
      const pick = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.95, 0.56), new THREE.MeshBasicMaterial());
      pick.position.set(room.x0 + 0.03, y0 + 1.5, cz);
      pick.visible = false; // raycasts ignore visibility: the E target for the LED strip
      group.add(pick);
      mirrorLamps.push({
        object: pick, shade: led, height: 0, level: room.level, name: 'spegeln i toaletten', offset: [0.35, 0], light: LIGHTING.mirror.light,
        mirrorReflector: holder,
        options: (lamp) => [
          { label: 'byt utseende vid spegeln', run: () => openAvatarCustomizer() },
          { label: lamp.isOpen ? 'släck spegelbelysningen' : 'tänd spegelbelysningen', run: () => lamp.toggle() }
        ]
      });
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
    floorDrain(B, ...showerDrainAt(s), y0 + 0.004, M.steel, M.black); // on the room's tiles (buildInterior)
    if (!upstairs) segs.push(havback(B, group, appliances, room, y0)); // not in WC/dusch: no room beside its shower (HAVBACK)
  }
  spots(B, room, yc - 0.004, 2, lampMat(room.level, room.name));
  return segs;
}

// ---------- tiles ----------

/** Tile skin on every wall face that faces into `room`, from the floor up to `h`. */
export function tileWalls(B, room, wallBoxes, y0, h, material) {
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
export function skirting(B, boxes, li, size, y0, rooms = TILED_ROOMS, material = M.skirting, floorHole = null) {
  const tiled = rooms.filter((r) => r.level === li);
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
      // no floor in front of the face over the stair opening (#1135): a wall running down the stairwell keeps no skirting
      // at the upper floor's level (it hung there as a 7 cm ledge that caught the sun and broke the wall at the slab)
      const gap = floorHole && (n === 'x' ? [floorHole.z0, floorHole.z1, floorHole.x0, floorHole.x1] : [floorHole.x0, floorHole.x1, floorHole.z0, floorHole.z1]);
      const over = gap && c + s * 0.03 > gap[2] && c + s * 0.03 < gap[3];
      const emit = (lo, hi) => {
        if (hi - lo <= 0.03) return;
        if (n === 'x') B.box(s > 0 ? c : c - t, s > 0 ? c + t : c, lo, hi, y0, y1, material);
        else B.box(lo, hi, s > 0 ? c : c - t, s > 0 ? c + t : c, y0, y1, material);
      };
      const flush = (end) => {
        if (run !== null && end - run > 0.03) {
          if (over && gap[0] < end && gap[1] > run) { emit(run, Math.min(end, gap[0])); emit(Math.max(run, gap[1]), end); }
          else emit(run, end);
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
  const o = openFront({ group, list }, F, F.u0, F.u1, y0, y1, white, null, {}, { mode: 'hinge', at: 'a0', name: 'elskåpet', build: (P, b0, b1, c0, c1) => {
    P.box(b0 + 0.0015, b1 - 0.0015, -FT, 0, c0 + 0.0015, c1 - 0.0015, white);
    P.box(b1 - 0.04, b1 - 0.025, 0, 0.012, c0 + 1.05, c0 + 1.15, M.chrome);                 // a small handle
  } });
  // the power cut (#604, power.js): where the fuse box is (its back and the breakers' front at u0 / u1 along the
  // cabinet, y0 … y1, plan points via `at`) and the router's LEDs, which go dark with the power
  o.fuse = { back: F.at(a0, d), front: F.at(a1, d + 0.14), y0: y0 + 1.15, y1: y0 + 1.75, normal: o.normal, leds: ledGreen };
  return o;
}

/**
 * Tiles through the door openings of tiled rooms (#306): a room's rectangle stops at the wall's face, so the opening
 * (the wall's depth) showed the parquet. A door between a tiled room and parquet gets the tile up to the closed leaf's
 * plane (`c`, the threshold), an exterior door the whole depth of the opening, two different tiles meet under the leaf.
 * The patches lie over the parquet and overlap their own room's tiles seamlessly (world-space UVs).
 */
export function doorwayTiles(B, rooms, doorways, y0, mats = M) {
  for (const { gap, c, exterior } of doorways) {
    const x = gap.axis === 'x';
    const mid = (gap.lo + gap.hi) / 2;
    const [n0, n1] = x ? ['z0', 'z1'] : ['x0', 'x1']; // across the opening
    const [a0, a1] = x ? ['x0', 'x1'] : ['z0', 'z1']; // along it
    // the tiled room on each side: it covers the opening's middle, lies on that side and reaches within 15 cm of the
    // wall face (its rectangle may end inside the wall: the hall's stops 17 cm into the 47 cm front wall)
    const lo = rooms.find((r) => r[a0] < mid && r[a1] > mid && r[n0] < gap.p0 && r[n1] > gap.p0 - 0.15);
    const hi = rooms.find((r) => r[a0] < mid && r[a1] > mid && r[n1] > gap.p1 && r[n0] < gap.p1 + 0.15);
    const strip = (room, p0, p1) => {
      if (p1 - p0 < 0.002) return;
      // 1 mm above the room floors: where two tiles meet under the leaf, the strip wins over the other room's rectangle
      if (x) B.box(gap.lo, gap.hi, p0, p1, y0 + 0.001, y0 + 0.005, mats[room.floor]);
      else B.box(p0, p1, gap.lo, gap.hi, y0 + 0.001, y0 + 0.005, mats[room.floor]);
    };
    const from = lo && Math.min(gap.p0, lo[n1]), to = hi && Math.max(gap.p1, hi[n0]);
    if (lo && hi && lo.floor === hi.floor) strip(lo, from, to);
    else if (exterior) { if (lo) strip(lo, from, gap.p1); if (hi) strip(hi, gap.p0, to); }
    else { if (lo) strip(lo, from, c); if (hi) strip(hi, c, to); }
  }
}

export function buildInterior(group, floor, li, y0, yC, wallBoxes, handled, taps = [], appliances = [], doorways = [], floorHole = null) {
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
  doorwayTiles(B, TILED_ROOMS.filter((r) => r.level === li), doorways, y0);
  skirting(B, [...wallBoxes, ...floor.windows], li, floor.size, y0, TILED_ROOMS, M.skirting, floorHole);
  group.add(...B.meshes());
  return rects;
}
