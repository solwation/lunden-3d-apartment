import * as THREE from 'three';
import { AO } from './config.js';

// Baked ambient occlusion: soft darkening of floors (and ceilings) along walls and fixed
// cabinets, from a distance field over the plan. Drawn as one multiply-blended overlay plane
// per surface, so it works on parquet and tiles alike and costs a single draw call.

const CELL = 0.025;

/** Distance (m) from every cell to the nearest blocker, two-pass chamfer transform. */
function distanceField(nx, nz, rects) {
  const INF = 1e9, d = new Float32Array(nx * nz).fill(INF);
  for (const r of rects) {
    const i0 = Math.max(0, Math.floor(r.x0 / CELL)), i1 = Math.min(nx - 1, Math.ceil(r.x1 / CELL) - 1);
    const k0 = Math.max(0, Math.floor(r.z0 / CELL)), k1 = Math.min(nz - 1, Math.ceil(r.z1 / CELL) - 1);
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) d[k * nx + i] = 0;
  }
  const a = 1, b = Math.SQRT2;
  const relax = (c, n, w) => { if (d[n] + w < d[c]) d[c] = d[n] + w; };
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    const c = k * nx + i;
    if (i > 0) relax(c, c - 1, a);
    if (k > 0) {
      relax(c, c - nx, a);
      if (i > 0) relax(c, c - nx - 1, b);
      if (i < nx - 1) relax(c, c - nx + 1, b);
    }
  }
  for (let k = nz - 1; k >= 0; k--) for (let i = nx - 1; i >= 0; i--) {
    const c = k * nx + i;
    if (i < nx - 1) relax(c, c + 1, a);
    if (k < nz - 1) {
      relax(c, c + nx, a);
      if (i < nx - 1) relax(c, c + nx + 1, b);
      if (i > 0) relax(c, c + nx - 1, b);
    }
  }
  for (let c = 0; c < d.length; c++) d[c] *= CELL;
  return d;
}

function aoTexture(size, rects, strength, radius, hole) {
  const nx = Math.ceil(size.x / CELL), nz = Math.ceil(size.z / CELL);
  const dist = distanceField(nx, nz, rects);
  const c = document.createElement('canvas');
  c.width = nx; c.height = nz;
  const g = c.getContext('2d');
  const img = g.createImageData(nx, nz);
  for (let i = 0; i < dist.length; i++) {
    // inside a blocker the overlay is hidden anyway; keep it neutral there
    const x = ((i % nx) + 0.5) * CELL, z = (Math.floor(i / nx) + 0.5) * CELL;
    const inHole = hole && x > hole.x0 && x < hole.x1 && z > hole.z0 && z < hole.z1;
    const v = dist[i] === 0 || inHole ? 255 : 255 * (1 - strength * Math.exp(-dist[i] / radius));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; // round-trips, so the blend multiplies by the canvas value
  return tex;
}

const multiply = (map) => new THREE.MeshBasicMaterial({
  map, transparent: true, depthWrite: false, fog: false, toneMapped: false,
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
  blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
});

/**
 * Overlays for one level. floorRects block the floor (walls, cabinets), ceilRects the ceiling
 * (walls only). The holes (stair opening) are left neutral.
 */
export function buildAO(size, y0, yC, floorRects, ceilRects, { floorHole, ceilHole } = {}) {
  const group = new THREE.Group();
  for (const [rects, y, down, s, hole] of [
    [floorRects, y0 + 0.007, false, AO.floor, floorHole], [ceilRects, yC - 0.007, true, AO.ceiling, ceilHole],
  ]) {
    const geo = new THREE.PlaneGeometry(size.x, size.z);
    geo.rotateX(down ? Math.PI / 2 : -Math.PI / 2);
    // canvas row 0 = z 0 (north); keep the texture unflipped and map u = x / W, v = z / D
    const tex = aoTexture(size, rects, s.strength, s.radius, hole);
    tex.flipY = false;
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / size.x + 0.5, p.getZ(i) / size.z + 0.5);
    geo.translate(size.x / 2, y, size.z / 2);
    const mesh = new THREE.Mesh(geo, multiply(tex));
    mesh.renderOrder = 1;
    group.add(mesh);
  }
  return group;
}
