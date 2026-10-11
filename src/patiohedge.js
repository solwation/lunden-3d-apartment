import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PATIO, SITE } from './config.js';
import { leafTexture } from './boxwood.js';

// The entrance and patio hedges reuse the same 256 px leaf atlas; larger UV repeats read as broader leaves.
export function patioHedgeMaterial() {
  const map = leafTexture(SITE.life.strip.hedge), spec = PATIO.hedge;
  const material = new THREE.MeshStandardMaterial({color: spec.color, map, bumpMap: map,
    bumpScale: spec.bump, roughness: spec.roughness});
  material.name = 'patio-hedge';
  return material;
}

// Rounded clipped foliage, narrowed only inside the existing footprint; collision remains the original rectangle.
export function patioHedgeGeometry(rect, offsetX = 0) {
  const spec = PATIO.hedge, width = rect.x1 - rect.x0, depth = rect.z1 - rect.z0;
  const cx = offsetX + (rect.x0 + rect.x1) / 2, cz = (rect.z0 + rect.z1) / 2;
  const geometry = new RoundedBoxGeometry(width, spec.height, depth, spec.segments,
    Math.min(spec.rounding, width / 2, depth / 2));
  const pos = geometry.attributes.position, normal = geometry.attributes.normal, uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), height = (y + spec.height / 2) / spec.height;
    const worldX = cx + x, worldZ = cz + z;
    // Continuous waves, rather than per-vertex random values, keep duplicate corner vertices joined.
    const wave = spec.topNoise * (.65 * Math.sin(worldX / spec.waveLength * Math.PI * 2)
      + .35 * Math.sin(worldX / spec.waveLength * Math.PI * 3 + worldZ));
    pos.setXYZ(i, worldX, y + spec.height / 2 + wave * height * height, cz + z * (spec.footScale + (1 - spec.footScale) * height));
    const ax = Math.abs(normal.getX(i)), ay = Math.abs(normal.getY(i)), az = Math.abs(normal.getZ(i));
    uv.setXY(i, (ax > ay && ax > az ? worldZ : worldX) / spec.texturePeriod,
      (ay > ax && ay > az ? worldZ : y) / spec.texturePeriod);
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
