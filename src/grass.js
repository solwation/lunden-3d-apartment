import * as THREE from 'three';
import { GRASS as G, SEASON } from './config.js';
import { registerSeasonal, registerSnow } from './seasons.js';
import { applyGrassPatches, grassBlendGLSL, grassTufts, linearMean } from './grassdetail.js';
import { leafLitter } from './leaflitter.js';

let texture;
/** One shared small seamless detail map; neutral straw/leaf tones are tinted by each lawn's seasonal colour. */
export function grassTexture() {
  if (texture) return texture;
  const n = G.textureSize, canvas = document.createElement('canvas'); canvas.width = canvas.height = n;
  // #1695: grassMeanColor() reads this canvas back; a CPU-backed canvas keeps getImageData reliable (a GPU-backed one can return all zeros under memory pressure -> black far ground).
  const ctx = canvas.getContext('2d', { willReadFrequently: true }), pixels = ctx.createImageData(n, n);
  let seed = G.seed;
  const rand = () => ((seed = seed * 16807 % 2147483647) / 2147483647);
  for (let i = 0; i < n * n; i++) {
    const v = G.detailRange[1] - rand() * G.detailNoise;
    pixels.data.set([v, v, v * G.strawTint, 255], i * 4);
  }
  ctx.putImageData(pixels, 0, 0);
  // Short irregular strokes rather than a directional grid. Copies across both seams keep the tile continuous.
  for (let i = 0; i < G.blades; i++) {
    const x = rand() * n, y = rand() * n, a = rand() * Math.PI * 2;
    const len = G.bladeLength[0] + rand() * (G.bladeLength[1] - G.bladeLength[0]);
    const v = G.detailRange[0] + rand() * (G.detailRange[1] - G.detailRange[0]);
    ctx.strokeStyle = `rgb(${v},${v},${v * G.bladeTint})`; ctx.lineWidth = G.strokeWidth;
    for (const dx of [-n, 0, n]) for (const dy of [-n, 0, n]) {
      ctx.beginPath(); ctx.moveTo(x + dx, y + dy);
      ctx.lineTo(x + dx + Math.cos(a) * len, y + dy + Math.sin(a) * len); ctx.stroke();
    }
  }
  // #2086: tussocks and soft dry / lush patches on top; the old blade layer's linear mean is kept (grassMeanColor, far ground).
  const target = linearMean(ctx.getImageData(0, 0, n, n).data), T = G.tufts;
  for (const t of grassTufts(n, T)) for (const dx of [-n, 0, n]) for (const dy of [-n, 0, n]) {
    const x = t.x + dx, y = t.y + dy;
    if (x < -t.r * 1.3 || y < -t.r * 1.3 || x > n + t.r * 1.3 || y > n + t.r * 1.3) continue;
    const shade = ctx.createRadialGradient(x, y, 0, x, y, t.r * 0.8);
    shade.addColorStop(0, `rgba(0,0,0,${T.shade})`); shade.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shade; ctx.beginPath(); ctx.arc(x, y, t.r * 0.8, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = T.width;
    for (const b of t.blades) {
      const sx = x + b.x0, sy = y + b.y0, ex = sx + Math.cos(b.a) * b.len, ey = sy + Math.sin(b.a) * b.len;
      ctx.strokeStyle = `rgb(${b.v},${b.v},${Math.round(b.v * G.bladeTint)})`; ctx.beginPath(); ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo((sx + ex) / 2 - Math.sin(b.a) * b.len * b.bend, (sy + ey) / 2 + Math.cos(b.a) * b.len * b.bend, ex, ey); ctx.stroke();
    }
  }
  const detail = ctx.getImageData(0, 0, n, n);
  applyGrassPatches(detail.data, n, target, G.detailPatches); ctx.putImageData(detail, 0, 0);
  texture = new THREE.CanvasTexture(canvas);
  texture.name = 'shared-grass-detail';
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.repeat.setScalar(1 / G.tile); texture.anisotropy = 4;
  return texture;
}

/** Geometry is already in world coordinates. Meter UVs keep terrain, street strips and flat plates aligned. */
export function grassUV(geometry) {
  const p = geometry.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i); uv[i * 2 + 1] = p.getZ(i); }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

/** #1552: the colour the summer lawn really shows at distance (its colour x the detail map's mean x the patches' mean warmth), for flat vertex-coloured ground that must meet the grass mesh without a visible step. */
export function grassMeanColor(color = G.summer) {
  const c = new THREE.Color(color), px = grassTexture().image.getContext('2d').getImageData(0, 0, G.textureSize, G.textureSize).data, sum = [0, 0, 0];
  for (let i = 0; i < px.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += (px[i + k] / 255 < 0.04045 ? px[i + k] / 255 / 12.92 : ((px[i + k] / 255 + 0.055) / 1.055) ** 2.4);
  if (!px.some((v) => v > 0)) return c.multiplyScalar(0.8); // failed readback: never paint the far ground black (rough detail-map mean, *guess*)
  const n = px.length / 4;
  return c.setRGB(c.r * sum[0] / n, c.g * sum[1] / n, c.b * sum[2] / n * (1 - 0.5 * G.patchWarmth));
}

/** Broad irregular tone patches use meter UVs too: no extra geometry, texture, lighting or render pass.
 * #2091: <map_fragment> is replaced by two lookups of the same map (one rotated / scaled) switched in soft world-space blobs.
 * #1945: with `bed` ({ color }) the geometry's `bedMud` attribute (0 … 1 per vertex, surroundings.js) mixes that mud / sand tone in instead of
 * the grass (and instead of the snow): the river bed under the water. A program variant of its own, so the other lawns are untouched. */
export function grassMaterial(color = G.summer, bed = null) {
  const material = new THREE.MeshStandardMaterial({ color, map: grassTexture(), roughness: 1 });
  material.name = 'seasonal-grass';
  const base = material.color.clone(), autumn = new THREE.Color(G.autumn), snow = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.grassSnow = snow;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\nvarying vec2 grassMeters;${bed ? '\nattribute float bedMud;\nvarying float grassBed;' : ''}`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>\ngrassMeters = uv;${bed ? '\ngrassBed = bedMud;' : ''}`);
    const mud = bed && new THREE.Color(bed.color); // (linear, as diffuseColor)
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec2 grassMeters;\nuniform float grassSnow;${bed ? '\nvarying float grassBed;' : ''}`)
      .replace('#include <map_fragment>', `${grassBlendGLSL(G.tile, G.detailBlend)}
        if (grassSnow < 0.5) {
          vec2 p = grassMeters * ${G.patchScale.toFixed(4)};
          float grassPatch = sin(p.x + sin(p.y * ${G.patchFrequencies[0].toFixed(4)})) * sin(p.y * ${G.patchFrequencies[1].toFixed(4)} - p.x * ${G.patchFrequencies[2].toFixed(4)});
          diffuseColor.rgb *= 1.0 + grassPatch * ${G.patchStrength.toFixed(4)};
          diffuseColor.b *= 1.0 - (grassPatch * 0.5 + 0.5) * ${G.patchWarmth.toFixed(4)};
        }${bed ? `
        if (grassBed > 0.0) { // broad lighter / darker patches of sand and mud
          float bedTone = 0.88 + 0.12 * sin(grassMeters.x * 2.9 + sin(grassMeters.y * 1.7)) * sin(grassMeters.y * 3.3 - grassMeters.x * 0.6);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${mud.r.toFixed(4)}, ${mud.g.toFixed(4)}, ${mud.b.toFixed(4)}) * bedTone, grassBed);
        }` : ''}`);
  };
  material.customProgramCacheKey = () => (bed ? `grass-patches-688-bed-${bed.color}` : 'grass-patches-688');
  leafLitter(material, 'grass', bed ? '1.0 - grassBed' : ''); // #2105: fallen autumn leaves on the lawns (not on the river bed's mud)
  registerSnow(material, SEASON.snow.ground); // seasons removes/reinstates the shared detail map under snow
  registerSeasonal((month) => {
    snow.value = SEASON.snowMonths.includes(month) ? 1 : 0;
    if (!snow.value) material.color.copy(base).lerp(autumn, G.autumnMix[month] ?? 0);
  });
  return material;
}
