import * as THREE from 'three';
import { HEDGE } from './config.js';

// Shared clipped-hedge form (#1143) for the patio hedges (patiohedge.js) and the entrance boxwood (boxwood.js):
// a subdivided box, rounded at its edges, dented by smooth world-space noise, darker and thinner at the foot and
// varied in tone through vertex colours. One geometry per run, merged by the callers: no extra draws.

// Smooth 3D value noise in 0..1, deterministic: identical positions (the box's duplicated seam vertices) agree.
const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
const fade = (t) => t * t * (3 - 2 * t);
function noise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = fade(x - ix), fy = fade(y - iy), fz = fade(z - iz);
  const l = (a, b, t) => a + (b - a) * t, c = (dx, dy, dz) => hash(ix + dx, iy + dy, iz + dz);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), fx), l(c(0, 1, 0), c(1, 1, 0), fx), fy),
    l(l(c(0, 0, 1), c(1, 0, 1), fx), l(c(0, 1, 1), c(1, 1, 1), fx), fy), fz);
}

const key = (x, y, z) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;

/**
 * A clipped hedge body in world coordinates, standing on y = 0.
 * spec: height, rounding, cell (grid size m), dent (m, relief depth), footScale (depth at the foot, 1 = straight),
 * topWave(x, z) optional extra height on the top (patio's ±3 cm waves), texturePeriod (m per leaf-atlas tile).
 */
export function hedgeBody(spec, cx, cz, width, depth, topWave = null) {
  const h = spec.height, r = Math.min(spec.rounding, width / 2, depth / 2, h / 2);
  const nx = Math.max(2, Math.ceil(width / spec.cell)), ny = Math.max(2, Math.ceil(h / spec.cell)), nz = Math.max(2, Math.ceil(depth / spec.cell));
  const box = new THREE.BoxGeometry(width, h, depth, nx, ny, nz);
  // Drop the never-seen bottom face (BoxGeometry group 3, −y).
  const bottom = box.groups[3], src = box.index.array, kept = [];
  for (let i = 0; i < src.length; i++) if (i < bottom.start || i >= bottom.start + bottom.count) kept.push(src[i]);
  box.setIndex(kept); box.clearGroups();
  const pos = box.attributes.position, uv = box.attributes.uv, n = pos.count;
  const colors = new Float32Array(n * 3), low = new Float32Array(n);
  const hx = width / 2, hy = h / 2, hz = depth / 2, p = new THREE.Vector3(), inner = new THREE.Vector3(), dir = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    // round the edges: project onto a sphere of radius r around the shrunken core (continuous across face seams)
    inner.set(THREE.MathUtils.clamp(p.x, -hx + r, hx - r), THREE.MathUtils.clamp(p.y, -hy + r, hy - r), THREE.MathUtils.clamp(p.z, -hz + r, hz - r));
    dir.subVectors(p, inner); if (dir.lengthSq() < 1e-12) dir.set(0, 1, 0); dir.normalize();
    p.copy(inner).addScaledVector(dir, r);
    // Unwrapped leaf UVs (m): the long sides run up into the top and round the ends without a seam on the long edges.
    const ax = Math.abs(dir.x), ay = Math.abs(dir.y), az = Math.abs(dir.z), edgeIn = hz - Math.abs(p.z);
    const tu = ax > ay && ax > az ? cx + Math.sign(p.x) * (hx + edgeIn) : cx + p.x, tv = ay > ax && ay > az ? h + edgeIn : p.y + hy;
    uv.setXY(i, tu / spec.texturePeriod, tv / spec.texturePeriod);
    const t = (p.y + hy) / h, wx = cx + p.x, wz = cz + p.z, wy = p.y + hy; // t: 0 foot → 1 top
    // dents: two octaves of smooth noise, mostly inward so the clipped outline stays inside the footprint
    const m = .65 * noise(wx / HEDGE.bumpScale, wy / HEDGE.bumpScale, wz / HEDGE.bumpScale)
      + .35 * noise(wx / HEDGE.fineScale + 7.3, wy / HEDGE.fineScale, wz / HEDGE.fineScale - 2.1);
    const d = spec.dent * (m - HEDGE.outward);
    p.addScaledVector(dir, d);
    // the foot: thinner (stems show) only across the hedge's depth
    const foot = THREE.MathUtils.smoothstep(t, 0, HEDGE.footRise);
    const taper = (spec.footScale ?? 1) + (1 - (spec.footScale ?? 1)) * t, pinch = 1 - HEDGE.footPinch * (1 - foot);
    const wave = topWave ? topWave(wx, wz) * t * t : 0;
    pos.setXYZ(i, wx, wy + wave, cz + p.z * taper * pinch);
    // tone: per-hedge (slow) and per-patch variation, a darker foot, darker dents and a fresher top
    const tone = 1 + HEDGE.tone * (noise(wx / HEDGE.toneScale + 3.1, 0, wz / HEDGE.toneScale) - .5)
      + HEDGE.patch * (noise(wx / .5, wy / .5 + 11, wz / .5) - .5);
    const shade = (HEDGE.footDark + (1 - HEDGE.footDark) * THREE.MathUtils.smoothstep(t, 0, HEDGE.footShade))
      * (1 + HEDGE.dentShade * (m - .5)) * (dir.y > .5 ? HEDGE.topLight : 1);
    const k = tone * shade;
    colors[i * 3] = k * (dir.y > .5 ? HEDGE.topWarm : 1); colors[i * 3 + 1] = k; colors[i * 3 + 2] = k * .96;
    low[i] = 1 - THREE.MathUtils.smoothstep(t, 0, HEDGE.stemRise);
  }
  box.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  box.setAttribute('hedgeLow', new THREE.BufferAttribute(low, 1));
  // normals over welded positions: the face seams stay smooth after rounding and denting
  const sum = new Map(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), f = new THREE.Vector3();
  const idx = box.index.array;
  for (let i = 0; i < idx.length; i += 3) {
    a.fromBufferAttribute(pos, idx[i]); b.fromBufferAttribute(pos, idx[i + 1]); c.fromBufferAttribute(pos, idx[i + 2]);
    f.subVectors(c, b).cross(a.clone().sub(b));
    for (const v of [idx[i], idx[i + 1], idx[i + 2]]) {
      const k = key(pos.getX(v), pos.getY(v), pos.getZ(v)), s = sum.get(k);
      if (s) s.add(f); else sum.set(k, f.clone());
    }
  }
  const normal = box.attributes.normal;
  for (let i = 0; i < n; i++) {
    const s = sum.get(key(pos.getX(i), pos.getY(i), pos.getZ(i)));
    if (s) a.copy(s).normalize(); else a.set(0, -1, 0); // unused bottom-face vertices
    normal.setXYZ(i, a.x, a.y, a.z);
  }
  box.computeBoundingBox(); box.computeBoundingSphere();
  return box;
}

// Material patch: vertex colours, plus brown (applied after the vertex colours, so the dark foot keeps them visible) stem/branch glimpses in the leaf gaps near the foot (map's dark texels).
export function hedgeMaterial(material) {
  material.vertexColors = true;
  const stem = new THREE.Color(HEDGE.stemColor);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.hedgeStem = { value: stem };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float hedgeLow;\nvarying float vHedgeLow;\nvarying vec3 vHedgePos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHedgeLow = hedgeLow;\nvHedgePos = position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 hedgeStem;\nvarying float vHedgeLow;\nvarying vec3 vHedgePos;')
      .replace('#include <color_fragment>', `#include <color_fragment>
#ifdef USE_MAP
{
  // thin, slightly crooked near-vertical stems along the run, with a few forks; only where the leaves leave a gap
  float u = vHedgePos.x + vHedgePos.z;
  float w = u * ${HEDGE.stemDensity.toFixed(2)} + 0.35 * sin(vHedgePos.y * 17.0 + u * 3.1) + 0.6 * sin(u * 1.7);
  float line = 1.0 - abs(fract(w) * 2.0 - 1.0);
  float fork = 1.0 - abs(fract(u * ${(HEDGE.stemDensity * .5).toFixed(2)} + vHedgePos.y * 2.3) * 2.0 - 1.0);
  float s = max(smoothstep(0.74, 0.92, line), smoothstep(0.86, 0.97, fork) * 0.8);
  float gap = 1.0 - smoothstep(0.1, 0.22, sampledDiffuseColor.g);
  diffuseColor.rgb = mix(diffuseColor.rgb, hedgeStem, clamp(s * gap * vHedgeLow * 1.6, 0.0, 0.9));
}
#endif`);
  };
  material.customProgramCacheKey = () => 'hedge-form-1143';
  return material;
}
