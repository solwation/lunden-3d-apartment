// #2088: one small shared roof map (seams, strips, weathering) and fall-line UVs for the roof batches.
// Startup-only: the map is drawn once, UVs are baked before merging. No per-frame work, no extra draws.
import * as THREE from 'three';
import { ROOF_SURFACE as R } from './config.js';

const hash = (i, salt) => { let h = (Math.imul(i + 1, 374761393) ^ Math.imul(salt + R.seed, 668265263)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const smooth = (t) => t * t * (3 - 2 * t);
/** Periodic 1D/2D value noise in [-1, 1]: `cells` across the tile, so the map wraps without a visible edge. */
const noise1 = (t, cells, salt) => { const f = t * cells, i = Math.floor(f), k = smooth(f - i), a = hash(((i % cells) + cells) % cells, salt), b = hash((((i + 1) % cells) + cells) % cells, salt); return (a + (b - a) * k) * 2 - 1; };
const noise2 = (x, y, cells, salt) => {
  const fx = x * cells, fy = y * cells, ix = Math.floor(fx), iy = Math.floor(fy), kx = smooth(fx - ix), ky = smooth(fy - iy);
  const at = (i, j) => hash((((i % cells) + cells) % cells) + (((j % cells) + cells) % cells) * cells, salt);
  const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * kx, bottom = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * kx;
  return (top + (bottom - top) * ky) * 2 - 1;
};

let pixels = null, mean = 0, texture = null;
/** The map's grey values (one byte per texel, row-major; x across the fall line, y along it). Deterministic. */
export function roofMapPixels() {
  if (pixels) return pixels;
  const n = R.size, pw = n / R.panels, out = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const px = x % pw, strip = Math.floor(x / pw), u = x / n, v = y / n;
    let k = R.base + (hash(strip, 1) - .5) * 2 * R.strip;                                   // each strip its own slight shade
    if (px === 0) k -= R.seamShadow; else if (px === 1) k += R.seamLip; else if (px === pw - 1) k -= R.seamBack; // the raised seam
    k += R.mottle * (noise2(u, v, R.mottleCells, 2) * .7 + noise2(u, v, R.mottleCells * 2, 3) * .3); // weathered, uneven matt
    k += R.streak * noise1(u, R.streakCells, 4) * (.65 + .35 * noise1(v, 2, 5));           // faint rain streaks down the fall line
    out[y * n + x] = Math.max(0, Math.min(255, Math.round(k)));
  }
  let sum = 0; for (const k of out) sum += new THREE.Color().setRGB(k / 255, 0, 0, THREE.SRGBColorSpace).r;
  mean = sum / out.length; return (pixels = out);
}
/** Linear mean of the map: materials divide by it, so a roof's average colour is unchanged. */
export const roofMapMean = () => (roofMapPixels(), mean);
/** A roof material colour: `hex` (or white for vertex-coloured batches) at the same average brightness as before.
 * `level` is the previous map's linear mean for a batch that already had one (the school's seam map). */
export const roofColor = (hex = 0xffffff, level = 1) => new THREE.Color(hex).multiplyScalar(level / roofMapMean());

/** The shared texture, created on first use (browser only). */
export function roofMap() {
  if (texture) return texture;
  const n = R.size, c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'), img = g.createImageData(n, n), p = roofMapPixels();
  for (let i = 0; i < p.length; i++) { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = p[i]; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  texture = new THREE.CanvasTexture(c); texture.name = 'roof-surface'; texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = R.anisotropy;
  return texture;
}

/** Bake UVs so the seams run down each face's own fall line (from the triangle's normal; flat faces: along world x, *guess*).
 * Positions, index and every other attribute stay untouched; returns the same geometry. */
export function roofUV(g, kind = 'metal') {
  const K = R.kinds[kind], P = g.attributes.position, idx = g.index?.array, count = idx ? idx.length : P.count;
  const uv = new Float32Array(P.count * 2), su = 1 / (K.seam * R.panels), sv = 1 / K.length, v = [0, 0, 0];
  for (let t = 0; t + 2 < count; t += 3) {
    for (let j = 0; j < 3; j++) v[j] = idx ? idx[t + j] : t + j;
    const ax = P.getX(v[0]), ay = P.getY(v[0]), az = P.getZ(v[0]), bx = P.getX(v[1]) - ax, by = P.getY(v[1]) - ay, bz = P.getZ(v[1]) - az, cx = P.getX(v[2]) - ax, cy = P.getY(v[2]) - ay, cz = P.getZ(v[2]) - az;
    let nx = by * cz - bz * cy, ny = bz * cx - bx * cz, nz = bx * cy - by * cx; const len = Math.hypot(nx, ny, nz);
    if (!len) continue;
    if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; } // double-sided roofs: the upper side decides the fall
    nx /= len; ny /= len; nz /= len;
    const h = Math.hypot(nx, nz), [fx, fz] = h > R.flat ? [nx / h, nz / h] : [1, 0];
    for (const i of v) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i); uv[i * 2] = (fx * z - fz * x) * su; uv[i * 2 + 1] = (fx * ny * x - h * y + fz * ny * z) * sv; }
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
