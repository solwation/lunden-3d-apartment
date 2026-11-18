// #2070: shared ceramic surfaces; metric layout is independent of the colour grain.
import * as THREE from 'three';
import { TILE_SURFACE as S } from './config.js';

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
      for (let col = 0; col < nx; col++) for (const wrap of [-W, 0, W]) g.fillRect(col * tpx + shift + wrap - j / 2, r * tpy, j, tpy);
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


/** Distance from a sample to the nearest repeat boundary, in pixels. */
const edgeDistance = (p, span) => { const u = ((p % span) + span) % span; return Math.min(u, span - u); };

/** Packed height/roughness, sampled at texel centres. Only joint layout enters height: colour variation and speckle cannot emboss a tile. */
export function tileSurfaceData({ tw, th, nx = 1, ny = 1, bond = false, grout, joint = 0.003, ppm = 400 }, roughness) {
  const width = Math.round(tw * nx * ppm), height = Math.round(th * ny * ppm), data = new Uint8Array(width * height * 4);
  const tileW = width / nx, tileH = height / ny, halfJoint = Math.max(1, joint * ppm) / 2;
  const bevel = Math.max(S.minBevelPixels, S.bevel * ppm);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const row = Math.floor((y + 0.5) / tileH), shift = bond && row % 2 ? tileW / 2 : 0;
    const d = Math.min(edgeDistance(y + 0.5, tileH), edgeDistance(x + 0.5 - shift, tileW));
    const u = grout == null ? 1 : Math.max(0, Math.min(1, (d - halfJoint) / bevel)), tile = u * u * (3 - 2 * u);
    // Canvas colour upload flips Y; DataTexture rows are bottom-first. Keep half-bond rows registered.
    const i = ((height - 1 - y) * width + x) * 4;
    data[i] = Math.round(tile * 255);
    data[i + 1] = Math.round((S.groutRoughness + (roughness - S.groutRoughness) * tile) * 255);
    data[i + 2] = 0; data[i + 3] = 255;
  }
  return { data, width, height };
}

/** The original tile colour map, a shallow structural bump and matte grout; no new geometry, pass or frame update. */
export function tileMaterial(options, roughness) {
  const map = tileTexture(options), { data, width, height } = tileSurfaceData(options, roughness);
  const surface = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  surface.name = 'tile-height-roughness'; surface.colorSpace = THREE.NoColorSpace;
  surface.wrapS = surface.wrapT = THREE.RepeatWrapping;
  surface.repeat.copy(map.repeat); surface.anisotropy = map.anisotropy;
  surface.generateMipmaps = true; surface.minFilter = THREE.LinearMipmapLinearFilter; surface.magFilter = THREE.LinearFilter; surface.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, map, bumpMap: surface, bumpScale: S.depth, roughnessMap: surface, roughness: 1 });
  material.userData.tileSurface = { ...options, roughness, depth: S.depth };
  return material;
}
