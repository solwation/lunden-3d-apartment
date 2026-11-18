// #2095: rendered façades (puts): one small shared bump/roughness map, world-projected UVs and faint dirt strips.
// Startup-only: the map is built once, UVs and dirt strips are baked before merging. No per-frame work, no extra draws,
// the albedo grain is divided by its own mean (the façade's average colour stays); dirt is vertex colour on a few extra triangles.
import * as THREE from 'three';
import { RENDER_SURFACE as R } from './config.js';

const hash = (i, salt) => { let h = (Math.imul(i + 1, 374761393) ^ Math.imul(salt + R.seed, 668265263)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const smooth = (t) => t * t * (3 - 2 * t);
const wrap = (i, n) => ((i % n) + n) % n;
/** Periodic 2D value noise in [-1, 1] with `cells` across the tile. */
const noise2 = (x, y, cells, salt) => {
  const fx = x * cells, fy = y * cells, ix = Math.floor(fx), iy = Math.floor(fy), kx = smooth(fx - ix), ky = smooth(fy - iy);
  const at = (i, j) => hash(wrap(i, cells) + wrap(j, cells) * cells, salt);
  const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * kx, bottom = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * kx;
  return (top + (bottom - top) * ky) * 2 - 1;
};

let pixels = null, albedo = null, meanG = 0, meanA = 0, texture = null, albedoTexture = null;
/** RGBA bytes (row-major, linear): R = bump height, G = roughness factor. Texel (0, 0) is the neutral texel (mean G):
 * parts that share a render material but should stay plain (frames) map every vertex onto it (plainUV). Deterministic. */
export function renderSurfacePixels() {
  if (pixels) return pixels;
  const n = R.size, H = R.height, A = R.albedo, white = new Float32Array(n * n), out = new Uint8Array(n * n * 4), alb = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) white[i] = hash(i, 1) * 2 - 1;
  let sum = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let g = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) g += white[wrap(y + dy, n) * n + wrap(x + dx, n)] * (dx || dy ? 1 : 2);
    g /= 10;                                                                                    // fine sand grain, slightly smoothed
    const pit = hash(y * n + x, 2) < H.pits ? -H.pit : 0, m = noise2(x / n, y / n, H.mottleCells, 3);
    const h = 0.5 + H.grain * g * 1.6 + pit + H.mottle * m, r = R.roughness.mean + R.roughness.spread * (g * 1.6 - pit * 1.5);
    const at = 4 * (y * n + x);
    out[at] = Math.max(0, Math.min(255, Math.round(h * 255)));
    out[at + 1] = Math.max(0, Math.min(255, Math.round(r * 255)));
    out[at + 3] = 255;
    sum += out[at + 1];
    alb[at] = alb[at + 1] = alb[at + 2] = Math.max(0, Math.min(255, Math.round(A.base + A.grain * (h - 0.5) * 2 + A.mottle * m))); alb[at + 3] = 255;
  }
  meanG = sum / (n * n) / 255;
  out[0] = 128; out[1] = Math.round(meanG * 255);
  const lin = (k) => new THREE.Color().setRGB(k / 255, 0, 0, THREE.SRGBColorSpace).r;
  let la = 0; for (let i = 4; i < alb.length; i += 4) la += lin(alb[i]); meanA = la / (n * n - 1);
  let k0 = 0; for (let k = 1; k < 256; k++) if (Math.abs(lin(k) - meanA) < Math.abs(lin(k0) - meanA)) k0 = k;
  alb[0] = alb[1] = alb[2] = k0; // the neutral texel: the mean albedo too
  albedo = alb;
  return (pixels = out);
}
/** The faint albedo grain (sRGB grey RGBA bytes, same layout; texel (0, 0) ≈ the linear mean). */
export const renderAlbedoPixels = () => (renderSurfacePixels(), albedo);
/** Linear mean of the albedo grain: materials divide their colour by it, so the façade's average colour stays. */
export const renderAlbedoMean = () => (renderSurfacePixels(), meanA);
/** The map's mean roughness factor: materials divide their roughness by it, so the average stays. */
export const renderMeanRoughness = () => (renderSurfacePixels(), meanG);

/** The shared packed texture (bumpMap + roughnessMap of the render materials). */
export function renderSurfaceTexture() {
  if (texture) return texture;
  const t = new THREE.DataTexture(renderSurfacePixels(), R.size, R.size, THREE.RGBAFormat);
  t.name = 'render-surface'; t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = R.anisotropy;
  t.needsUpdate = true;
  return (texture = t);
}

/** The shared albedo grain texture (the render materials' `map`). */
export function renderAlbedoTexture() {
  if (albedoTexture) return albedoTexture;
  const t = new THREE.DataTexture(renderAlbedoPixels(), R.size, R.size, THREE.RGBAFormat);
  t.name = 'render-albedo'; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = R.anisotropy;
  t.needsUpdate = true;
  return (albedoTexture = t);
}

/** A render material: `params` as before (colour, side…), `roughness` the previous roughness. */
export function renderMaterial({ roughness = 0.95, color = 0xffffff, ...params } = {}) {
  const surface = renderSurfaceTexture();
  return new THREE.MeshStandardMaterial({ ...params, map: renderAlbedoTexture(), color: new THREE.Color(color).multiplyScalar(1 / renderAlbedoMean()),
    roughness: roughness / renderMeanRoughness(), bumpMap: surface, bumpScale: R.bump, roughnessMap: surface, vertexColors: true });
}

/** Bake world-projected UVs (metres / `tile`) on each triangle's dominant plane: walls u along the wall, v up; flat faces x/z.
 * Positions/index untouched; adds a white `color` if there is none. Returns the same geometry. */
export function renderUV(g) {
  const P = g.attributes.position, idx = g.index?.array, count = idx ? idx.length : P.count, s = 1 / R.tile;
  const uv = new Float32Array(P.count * 2), v = [0, 0, 0];
  for (let t = 0; t + 2 < count; t += 3) {
    for (let j = 0; j < 3; j++) v[j] = idx ? idx[t + j] : t + j;
    const ax = P.getX(v[0]), ay = P.getY(v[0]), az = P.getZ(v[0]), bx = P.getX(v[1]) - ax, by = P.getY(v[1]) - ay, bz = P.getZ(v[1]) - az, cx = P.getX(v[2]) - ax, cy = P.getY(v[2]) - ay, cz = P.getZ(v[2]) - az;
    const nx = Math.abs(by * cz - bz * cy), ny = Math.abs(bz * cx - bx * cz), nz = Math.abs(bx * cy - by * cx);
    for (const i of v) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      if (ny >= nx && ny >= nz) { uv[i * 2] = x * s; uv[i * 2 + 1] = z * s; } else if (nx > nz) { uv[i * 2] = z * s; uv[i * 2 + 1] = y * s; } else { uv[i * 2] = x * s; uv[i * 2 + 1] = y * s; }
    }
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return whiteColor(g);
}
/** Every vertex on the neutral texel: no bump, the mean roughness (frames sharing a render material). */
export function plainUV(g) {
  const c = 0.5 / R.size;
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2).fill(c), 2));
  return whiteColor(g);
}
function whiteColor(g) {
  if (!g.attributes.color) g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  return g;
}

let patchSeed = 0;
/** A faint dirt strip on a vertical render wall from (ax, az) to (bx, bz) (the wall's face line), facing (nx, nz), y0…y1,
 * `off` m in front of the face. kind 'sill': dark at the top (under a sill), streaks fading downwards and to both sides,
 * strongest under the sill ends; 'plinth': a splash band dark at the bottom, fading upwards. A grid of columns (`step` m)
 * × 3 rows with vertex colours (1 = no dirt) — the same material as the wall, so the strip's bottom/top edge is invisible.
 * Non-indexed; UVs are baked by renderUV like the wall's. `seed` picks the column pattern (deterministic per call order
 * if omitted). Returns null for a strip too small to matter. */
export function dirtPatch(ax, az, bx, bz, nx, nz, y0, y1, kind = 'sill', seed = patchSeed++) {
  const K = R[kind], len = Math.hypot(bx - ax, bz - az);
  if (len < 0.05 || y1 - y0 < 0.03) return null;
  const cols = Math.max(2, Math.ceil(len / K.step)), sill = kind === 'sill', T = R.tint;
  const rows = sill ? [y1, y1 - (y1 - y0) * 0.4, y0] : [y0, y0 + (y1 - y0) * 0.4, y1];
  const dark = [], mid = [];
  for (let i = 0; i <= cols; i++) {
    let d = K.dark * (0.35 + 0.65 * hash(seed * 997 + i, 7));
    if (sill) { if (i === 0 || i === cols) d = 0; else if (i === 1 || i === cols - 1) d = Math.min(K.dark, d * K.ends); }
    dark.push(d); mid.push(d * K.mid * (0.4 + 1.2 * hash(seed * 991 + i, 8)));
  }
  const ox = nx * K.off, oz = nz * K.off, pos = [], col = [], nor = [];
  const vert = (i, r) => {
    const t = i / cols, d = r === 0 ? dark[i] : r === 1 ? mid[i] : 0;
    pos.push(ax + (bx - ax) * t + ox, rows[r], az + (bz - az) * t + oz); nor.push(nx, 0, nz);
    col.push(1 - d * T[0], 1 - d * T[1], 1 - d * T[2]);
  };
  // wind each quad to face (nx, nz): A B C has the normal dy · (along × up) = dy · (−uz, 0, ux), dy = the row step's sign
  const ux = (bx - ax) / len, uz = (bz - az) / len, keep = (rows[1] - rows[0]) * (-uz * nx + ux * nz) > 0;
  for (let i = 0; i < cols; i++) for (let r = 0; r < 2; r++) {
    const A = [i, r], B = [i + 1, r], C = [i + 1, r + 1], D = [i, r + 1];
    for (const [c, rr] of keep ? [A, B, C, A, C, D] : [A, C, B, A, D, C]) vert(c, rr);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
