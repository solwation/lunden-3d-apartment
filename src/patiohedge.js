import * as THREE from 'three';
import { PATIO, SITE } from './config.js';
import { leafTexture } from './boxwood.js';
import { hedgeBody, hedgeMaterial } from './hedgeform.js';

// The entrance and patio hedges reuse the same 256 px leaf atlas; larger UV repeats read as broader leaves.
export function patioHedgeMaterial() {
  const map = leafTexture(SITE.life.strip.hedge), spec = PATIO.hedge;
  const material = hedgeMaterial(new THREE.MeshStandardMaterial({color: spec.color, map, bumpMap: map,
    bumpScale: spec.bump, roughness: spec.roughness}));
  material.name = 'patio-hedge';
  return material;
}

// Rounded, dented clipped foliage (#680, #1143: hedgeform.js), narrowed only inside the existing footprint;
// collision remains the original rectangle.
export function patioHedgeGeometry(rect, offsetX = 0) {
  const spec = PATIO.hedge, width = rect.x1 - rect.x0, depth = rect.z1 - rect.z0;
  const cx = offsetX + (rect.x0 + rect.x1) / 2, cz = (rect.z0 + rect.z1) / 2;
  // Continuous waves (world x/z) along the top, as before.
  const wave = (x, z) => spec.topNoise * (.65 * Math.sin(x / spec.waveLength * Math.PI * 2)
    + .35 * Math.sin(x / spec.waveLength * Math.PI * 3 + z));
  return hedgeBody(spec, cx, cz, width, depth, wave);
}
