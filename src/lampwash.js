import * as THREE from 'three';
import { LEVELS, LIGHTING } from './config.js';

// The lamps' light wherever the visitor is (#276, #294, #295). The pool of point lights only lights the few lamps that
// matter to the visitor (constant light count), so a lit room you had walked out of went dark around its glowing
// shade. So every lamp (the small ones and the ceiling lamps, every pool-light anchor) ALSO lights everything inside
// the flat in the shaders of the lit materials themselves (onBeforeCompile on every MeshStandard/Lambert/Phong material,
// no extra mesh or draw call): exactly as its pool light would (three's point-light fall-off with the same range,
// Lambert on the surface's own diffuse colour, no specular), summed in linear with the rest of the lighting, and only
// where the lamp sees the point: its visibility polygon in plan (rays to the walls, closed doors and the façade line,
// built once) is one row of a float texture, the distance along each ray. Lamp data (position, range, colour ×
// intensity, how much of it shows, its level) is a small float texture updated when it changes.
// Per lamp this light shows k × (1 − pool) (k = how far on it is, pool = how much of its pool light it has now) and
// the pool light k × pool, so a lit lamp lights its room the same whether the visitor stands next to it, across the
// room, in another room, on the other floor or outside (#294). Only the pool light adds specular glints near it.

const W = LIGHTING.wash;

/** Nearest hit of the ray (ox, oz) + t·(dx, dz) on a segment: { t, i } (i = the segment's index), t ≤ max. */
function cast(segs, ox, oz, dx, dz, max) {
  let best = { t: max, i: -1 };
  segs.forEach(([ax, az, bx, bz], i) => {
    const ex = bx - ax, ez = bz - az, den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-12) return;
    const t = ((ax - ox) * ez - (az - oz) * ex) / den;
    const u = ((ax - ox) * dz - (az - oz) * dx) / den;
    if (t > 1e-4 && t < best.t && u >= 0 && u <= 1) best = { t, i };
  });
  return best;
}

/** The GLSL added to a lit material: declarations (after <common>) and the light (after <lights_fragment_end>). */
function chunks(n, box) {
  const head = /* glsl */ `
    uniform highp sampler2D uLampData; // per lamp (x): row 0 x y z range, row 1 colour × intensity and how much shows, row 2 ray origin x z, level
    uniform highp sampler2D uLampVis;  // per lamp (row): the distance along each of LW_RAYS rays to what stops it
    #define LW_COUNT ${n}
    #define LW_RAYS ${W.rays}.0
    vec3 lampWash(vec3 viewPos, vec3 viewNormal) {
      mat3 rt = transpose(mat3(viewMatrix));
      vec3 p = rt * (viewPos - viewMatrix[3].xyz), nw = rt * viewNormal;
      vec3 sum = vec3(0.0);
      if (p.x < ${box.x0.toFixed(3)} || p.x > ${box.x1.toFixed(3)} || p.z < ${box.z0.toFixed(3)} || p.z > ${box.z1.toFixed(3)} || p.y < ${box.y0.toFixed(3)} || p.y > ${box.y1.toFixed(3)}) return sum;
      float level = p.y > ${box.split.toFixed(3)} ? 1.0 : 0.0;
      for (int i = 0; i < LW_COUNT; i++) {
        vec4 b = texelFetch(uLampData, ivec2(i, 1), 0);
        if (b.w < 0.002) continue;
        vec4 c = texelFetch(uLampData, ivec2(i, 2), 0);
        if (abs(c.z - level) > 0.5) continue;
        vec4 a = texelFetch(uLampData, ivec2(i, 0), 0);
        vec3 d = a.xyz - p;
        float r2 = dot(d, d);
        if (r2 > a.w * a.w) continue;
        float r = sqrt(r2), cosT = dot(nw, d / r);
        if (cosT <= 0.0) continue;
        // inside the lamp's visibility polygon? (the distance along the ray towards this point, between two rays)
        vec2 o = p.xz - c.xy;
        float t = fract(atan(o.y, o.x) / 6.2831853 + 1.0) * LW_RAYS;
        float t0 = min(floor(t), LW_RAYS - 1.0);
        int r0 = int(t0), r1 = int(mod(t0 + 1.0, LW_RAYS));
        float reach = mix(texelFetch(uLampVis, ivec2(r0, i), 0).r, texelFetch(uLampVis, ivec2(r1, i), 0).r, t - t0);
        if (length(o) > reach + 0.05) continue;
        float q = clamp(1.0 - pow(r / a.w, 4.0), 0.0, 1.0);
        sum += b.rgb * (b.w * cosT * q * q / max(r2, 0.01));
      }
      return sum;
    }`;
  const body = /* glsl */ `
    reflectedLight.directDiffuse += lampWash(-vViewPosition, normal) * BRDF_Lambert(material.diffuseColor);`;
  return { head, body };
}

/**
 * Set up the lamps' light for `entries` ([{ owner, lamp, k }]: lamp = a pool-light anchor { pos, color, intensity, range,
 * level }, k = how strong it is, 1 = like its pool light). Returns a LampWashes: entries[i]'s on-ness and pool share
 * are set with set(i, k, pool) and commit() (Lights.update), patch(scene) adds the light to the scene's materials.
 */
export function buildLampWashes(scene, world, entries) {
  const used = entries.filter((e) => e.k);
  const n = Math.max(1, used.length), RAYS = W.rays;
  const { x: SX, z: SZ } = world.size, [zN, zS] = W.facade;
  const levelOf = (d) => (d.object.position.y > LEVELS[0].floor + 1.6 ? 1 : 0);
  const vis = new Float32Array(n * RAYS), data = new Float32Array(n * 3 * 4);
  used.forEach((e, i) => {
    const { lamp, k } = e, level = lamp.level;
    const segs = [...world.levels[level].wallSegments,
      ...world.doors.filter((d) => levelOf(d) === level).map((d) => d.segment()), // closed doors stop it
      [0, 0, SX, 0], [SX, 0, SX, SZ], [SX, SZ, 0, SZ], [0, SZ, 0, 0]];         // the outer faces: out through a window to its glass
    // a lamp on a window board stands in the window's niche: its rays start just inside the room
    const ox = lamp.pos.x, oz = Math.min(Math.max(lamp.pos.z, zN + 0.05), zS - 0.05);
    for (let r = 0; r < RAYS; r++) {
      const a = (r / RAYS) * Math.PI * 2;
      vis[i * RAYS + r] = cast(segs, ox, oz, Math.cos(a), Math.sin(a), lamp.range).t;
    }
    const c = new THREE.Color(lamp.color).multiplyScalar(k * lamp.intensity); // what the pool light uploads (colour × intensity)
    data.set([lamp.pos.x, lamp.pos.y, lamp.pos.z, lamp.range], (0 * n + i) * 4);
    data.set([c.r, c.g, c.b, 0], (1 * n + i) * 4);
    data.set([ox, oz, level, 0], (2 * n + i) * 4);
  });
  const tex = (arr, w, h, format) => {
    const t = new THREE.DataTexture(arr, w, h, format, THREE.FloatType);
    t.minFilter = t.magFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return t;
  };
  const top = LEVELS[1].floor + LEVELS[1].ceiling;
  const box = { x0: -0.05, x1: SX + 0.05, z0: -0.05, z1: SZ + 0.05, y0: LEVELS[0].floor - 0.1, y1: top + 0.1, split: LEVELS[1].floor - 0.1 };
  return new LampWashes(used, n, data, tex(data, n, 3, THREE.RGBAFormat), tex(vis, RAYS, n, THREE.RedFormat), chunks(n, box));
}

/** The lamps' light: per entry k (how far on) and pool (how much its pool light shows), the textures the shaders read. */
class LampWashes {
  constructor(entries, n, data, dataTex, visTex, glsl) {
    Object.assign(this, { entries, n, data, glsl, patched: new WeakSet(), dirty: false });
    this.uniforms = { uLampData: { value: dataTex }, uLampVis: { value: visTex } };
    this.k = entries.map(() => 0);
    this.pool = entries.map(() => 0);
  }

  /** How far lamp i is on and how much of it its pool light shows (the shaders show k × (1 − pool)). */
  set(i, k, pool) {
    this.k[i] = k; this.pool[i] = pool;
    const w = k * (1 - pool), at = (this.n + i) * 4 + 3;
    if (Math.abs(this.data[at] - w) > 1e-4 || (w === 0) !== (this.data[at] === 0)) { this.data[at] = w; this.dirty = true; }
  }

  /** After a frame's set() calls: upload what changed. */
  commit() {
    if (!this.dirty) return;
    this.dirty = false;
    this.uniforms.uLampData.value.needsUpdate = true;
  }

  /** What lamp i shows through the shaders now (tests). */
  shown(i) { return this.data[(this.n + i) * 4 + 3]; }

  /** Give every lit material under `root` the lamps' light (once per material; a compiled one is recompiled). */
  patch(root) {
    const { head, body } = this.glsl, uniforms = this.uniforms;
    root.traverse((o) => {
      if (!o.material) return;
      for (const m of [o.material].flat()) {
        if (!m || this.patched.has(m) || !(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial)) continue;
        this.patched.add(m);
        const before = m.onBeforeCompile, key = m.customProgramCacheKey;
        m.onBeforeCompile = function (shader, renderer) {
          before.call(this, shader, renderer);
          Object.assign(shader.uniforms, uniforms);
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\n${head}`)
            .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${body}`);
        };
        const base = key === THREE.Material.prototype.customProgramCacheKey ? () => before.toString() : key; // (the default keys on onBeforeCompile's source: now ours)
        m.customProgramCacheKey = function () { return `${base.call(this)}|lampwash`; };
        m.needsUpdate = true;
      }
    });
  }
}
