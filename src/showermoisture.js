// #2189: the bathroom after a warm shower. ONE moisture state per bathroom (keyed by its room rectangle; the taps of a shower carry
// `room`): `mist` (0 … 1) builds while the water runs and clears with the door open / the ventilation, `wet` (tiles) builds faster and
// dries slower. Three consumers, no light, no render pass, no new draw:
//  - steam: puffs into the avatars' shared pool (avatarbreath.js `sharedPuffs`, one draw call already), rate scaled by QUALITY.particles;
//  - the mirror: a fog term in the mirror's own shader (the reflector's and the plain glints material), cleared in running streaks;
//  - the tiles: a darker, glossier wall / floor in the shower zone (the existing wallTile / wetTile materials' fragment shader).
// The strongest bathroom drives the shared uniforms (`uMoistRoom` rectangle, `uMoistAt` shower position + floor y, `uMoist` mist / wet).
// Pure helpers first (tools/showermoisturetest.mjs).
import * as THREE from 'three';
import { SHOWER_MOIST as K } from './config.js';
import { sharedPuffs } from './avatarbreath.js';
import { rememberFragmentCompile } from './vertexcompile.js';

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** A fresh, dry bathroom. */
export const newMoisture = () => ({ mist: 0, wet: 0 });

/** Advances `m` by `dt` s: `on` = a shower runs, `door` 0 … 1 = how open the bathroom door is, `vent` = ventilation (0 = none). Returns `m`. */
export function stepMoisture(m, dt, { on = false, door = 0, vent = K.vent } = {}) {
  dt = Math.min(Math.max(Number(dt) || 0, 0), 1);
  door = clamp01(door);
  if (on) {
    m.mist += (1 - m.mist) * (1 - Math.exp(-dt / K.mistRise)) * (1 - K.doorRise * door);
    m.wet += (1 - m.wet) * (1 - Math.exp(-dt / K.wetRise));
  } else {
    const speed = 1 + K.door * door + Math.max(0, vent);
    m.mist = clamp01(m.mist - dt * speed / K.mistClear);
    m.wet = clamp01(m.wet - dt * speed / K.wetDry);
  }
  return m;
}

/** How much of the mirror at a pane column `col` (0 … 1, a hash of the column) is still misted at `mist`: columns clear one by one, so the
 * glass clears in running streaks; the same maths as `moistFog` in the shader. */
export const fogAmount = (mist, col) => smooth(col * K.streak, col * K.streak + K.streakSoft, mist) * smooth(0, 0.1, mist) * K.fogMax;

/** Seconds until a fogged mirror is clear again at the current `door` / `vent` (the time the steam takes to go). */
export const clearSeconds = (mist, door = 0, vent = K.vent) => mist * K.mistClear / (1 + K.door * clamp01(door) + Math.max(0, vent));

// ---- shared uniforms and shader hooks ----
export const moistUniforms = {
  uMoistRoom: { value: new THREE.Vector4(0, 0, 0, 0) }, // x0, z0, x1, z1 of the bathroom (empty: no effect anywhere)
  uMoistAt: { value: new THREE.Vector4(0, 0, 0, 0) },   // the shower's x, z, the floor's y
  uMoist: { value: new THREE.Vector3(0, 0, 0) },        // mist, wet
};
const f = (v) => (+v).toFixed(4);
const COMMON = `uniform vec4 uMoistRoom; uniform vec4 uMoistAt; uniform vec3 uMoist; varying vec3 vMoistW;
float moistInside(vec3 w) {
  float m = ${f(K.roomMargin)};
  return step(uMoistRoom.x - m, w.x) * step(w.x, uMoistRoom.z + m) * step(uMoistRoom.y - m, w.z) * step(w.z, uMoistRoom.w + m)
    * step(uMoistAt.z - 0.2, w.y) * step(w.y, uMoistAt.z + ${f(K.height)});
}
float moistFog(vec3 w) {
  float col = fract(sin(floor((w.z + w.x) * ${f(K.columns)}) * 91.7) * 4375.5);
  float h = uMoist.x;
  return moistInside(w) * smoothstep(col * ${f(K.streak)}, col * ${f(K.streak + K.streakSoft)}, h) * smoothstep(0.0, 0.1, h) * ${f(K.fogMax)};
}
float moistZone(vec3 w) { return moistInside(w) * (1.0 - smoothstep(${f(K.zoneNear)}, ${f(K.zoneFar)}, distance(w.xz, uMoistAt.xy))) * uMoist.y; }`;
const FOG = `vec3(${K.fogColor.map(f).join(',')})`;
const VERT_VARYING = 'varying vec3 vMoistW;';

function vertex(shader) {
  shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${VERT_VARYING}`)
    .replace('#include <project_vertex>', '#include <project_vertex>\n  vMoistW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
}
function uniforms(shader) { Object.assign(shader.uniforms, moistUniforms); }

const patched = (material, key, hook) => {
  const before = material.onBeforeCompile, beforeKey = material.customProgramCacheKey;
  const own = before === THREE.Material.prototype.onBeforeCompile;
  const compile = (shader, renderer) => { if (!own) before.call(material, shader, renderer); uniforms(shader); vertex(shader); hook(shader); };
  if (!own) rememberFragmentCompile(compile, before); else rememberFragmentCompile(compile);
  const base = beforeKey === THREE.Material.prototype.customProgramCacheKey ? '' : beforeKey.call(material) + '|';
  material.onBeforeCompile = compile;
  material.customProgramCacheKey = () => base + key;
  return material;
};

/** A tile material that darkens and glosses over in the shower zone while it is wet (walls: `dark` = K.wallDark, the floor: K.floorDark). */
export function wetTiles(material, dark = K.wallDark) {
  return patched(material, `moist-tiles-2189-${dark}`, (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\n${COMMON}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  { float mw = moistZone(vMoistW); diffuseColor.rgb *= 1.0 - ${f(dark)} * mw; roughnessFactor = mix(roughnessFactor, ${f(K.wetRough)}, mw); }`);
  });
}

/** A mirror glints material (MeshStandard) that fogs over: the fog colour replaces the glints and the glass turns matte. */
export function mistMirror(material) {
  return patched(material, 'moist-mirror-2189', (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\n${COMMON}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  { float fg = moistFog(vMoistW); diffuseColor.rgb = mix(diffuseColor.rgb, ${FOG}, fg); roughnessFactor = mix(roughnessFactor, 0.85, fg); totalEmissiveRadiance *= 1.0 - 0.6 * fg; }`);
  });
}

/** The same fog in a Reflector's own ShaderMaterial (reflections.js `addReflector` option `mist`). */
export function mistReflector(material) {
  Object.assign(material.uniforms, moistUniforms);
  material.vertexShader = material.vertexShader.replace('varying vec4 vUv;', `varying vec4 vUv;\n${VERT_VARYING}`)
    .replace('vUv = textureMatrix * vec4( position, 1.0 );', 'vUv = textureMatrix * vec4( position, 1.0 );\n\t\t\tvMoistW = ( modelMatrix * vec4( position, 1.0 ) ).xyz;');
  material.fragmentShader = material.fragmentShader.replace('varying vec4 vUv;', `varying vec4 vUv;\n${COMMON}`)
    .replace(/gl_FragColor = vec4\( (.*), 1\.0 \);/, (_, c) => `gl_FragColor = vec4( mix( ${c}, ${FOG}, moistFog( vMoistW ) ), 1.0 );`);
  material.name = 'mirror-mist';
  return material;
}

// ---- the simulation ----
const _p = new THREE.Vector3(), _d = new THREE.Vector3(0, 1, 0);
/** `taps`: every Tap (shower outlets carry `spec.room` [x0, z0, x1, z1]); `doors`: world.doors (a door in a bathroom's wall opens it);
 * `camera`: where the player is (steam only near it); `particles`: () => QUALITY.particles share 0 … 1. */
export class ShowerMoisture {
  constructor({ taps, doors = [], camera = null, particles = () => 1 } = {}) {
    this.camera = camera; this.particles = particles; this.rooms = new Map(); this.acc = 0;
    for (const t of taps) {
      const r = t.spec?.shower && t.spec.room;
      if (!r) continue;
      const key = r.join(',');
      if (!this.rooms.has(key)) this.rooms.set(key, { room: r, taps: [], doors: [], m: newMoisture(), at: t.spec.pos, y0: t.spec.basin, on: false });
      this.rooms.get(key).taps.push(t);
    }
    for (const e of this.rooms.values()) {
      const [x0, z0, x1, z1] = e.room;
      e.doors = doors.filter((d) => { // a door whose opening lies on the bathroom's boundary and at its level
        const c = d.opening?.().center;
        return c && c[0] > x0 - 0.4 && c[0] < x1 + 0.4 && c[1] > z0 - 0.4 && c[1] < z1 + 0.4 && !(c[0] > x0 + 0.4 && c[0] < x1 - 0.4 && c[1] > z0 + 0.4 && c[1] < z1 - 0.4) && Math.abs((d.object?.position.y ?? e.y0) - e.y0) < 1.5;
      });
    }
  }

  /** Once per frame. Steps every bathroom, points the shared uniforms at the dampest one and lets the water run's steam out. */
  update(dt) {
    let best = null, score = 0.0005;
    for (const e of this.rooms.values()) {
      e.on = e.taps.some((t) => t.isOpen);
      const door = e.doors.some((d) => d.isOpen) ? 1 : 0;
      if (!e.on && e.m.mist <= 0 && e.m.wet <= 0) continue;
      stepMoisture(e.m, dt, { on: e.on, door });
      const s = e.m.mist + e.m.wet;
      if (s > score) { score = s; best = e; }
    }
    const U = moistUniforms;
    if (!best) { U.uMoist.value.set(0, 0, 0); return; }
    U.uMoistRoom.value.set(...best.room);
    U.uMoistAt.value.set(best.at[0], best.at[2], best.y0, 0);
    U.uMoist.value.set(best.m.mist, best.m.wet, 0);
    this.steam(best, dt);
  }

  steam(e, dt) {
    const puffs = sharedPuffs(), q = this.particles();
    if (!puffs || !(q > 0) || !(e.m.mist > 0.05) || !(e.on || e.m.mist > 0.4)) return;
    const c = this.camera?.position;
    if (c && Math.hypot(c.x - e.at[0], c.z - e.at[2]) > K.steamRange) return;
    this.acc += dt * K.steamRate * q * (e.on ? 1 : (e.m.mist - 0.4) * 1.5) * e.m.mist;
    const [x0, z0, x1, z1] = e.room;
    while (this.acc >= 1) {
      this.acc -= 1;
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * K.steamSource;
      _p.set(Math.min(x1 - 0.1, Math.max(x0 + 0.1, e.at[0] + 0.55 + Math.cos(a) * r)), e.y0 + 0.9 + Math.random() * 0.8, Math.min(z1 - 0.1, Math.max(z0 + 0.1, e.at[2] + Math.sin(a) * r)));
      puffs.emit(_p, _d, K.steamAlpha * e.m.mist, 0.2, 1, K.steamScale, K.steamLife);
    }
  }
}
