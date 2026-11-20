// #2198: curtains billow in the draught of an open window or balcony door. A vertex patch on the curtain's own cloth material (and one
// shared depth material, so the shadow moves with it): the hem swings into the room, the top stays on the rail, folds ripple along
// the cloth. Per frame only one strength uniform per curtain and the shared clock change (no geometry upload, no new draw, no
// pass). Strength = how far the nearest windows / balcony doors are open x the site wind (src/sitewind.js `siteWind.power`, #2101),
// so a closed window means a still curtain. Helpers are pure (tools/curtainwindtest.mjs); `curtainSway` mirrors the shader.
import * as THREE from 'three';
import { CURTAIN_WIND as C } from './config.js';
import { rememberBoundedVertexCompile } from './vertexcompile.js';

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const num = (v) => (Number.isInteger(v) ? `${v}.0` : `${v}`);
const time = { value: 0 }; // shared clock

/** 0…1 draught strength from the widest open window `open` 0…1 and the site wind `power` 0…1: a closed window is exactly 0. */
export function curtainWindStrength(open, power) {
  const o = clamp01(open);
  return o <= 0.005 ? 0 : o * (C.calm + (1 - C.calm) * clamp01(power));
}

/** The widest opening (Openable `t` 0…1) among `openings` whose pivot lies in front of this curtain; see `windowsFor`. */
export function curtainOpenness(openings) {
  let v = 0; for (const o of openings) v = Math.max(v, clamp01(o.t ?? 0)); return v;
}

/** Which openings (items with a world `pos`, a `kind`) feed a curtain: same level, within `C.reachZ` of its rail and in x within its glass ± reach. */
export function windowsFor(spec, floorY, items) {
  const [g0, g1] = spec.glass;
  return items.filter((w) => Math.abs(w.pos.z - spec.z) < C.reachZ && w.pos.x > g0 - (w.kind === 'door' ? C.reachDoor : C.reachX) && w.pos.x < g1 + (w.kind === 'door' ? C.reachDoor : C.reachX)
    && w.pos.y > floorY - 0.2 && w.pos.y < floorY + 3.6);
}

/** Inward (room-side) displacement in metres of a cloth point: `h` 0 (rail) … 1 (hem), `x` along the rail, `len` the drop in m. Mirrors the GLSL. */
export function curtainSway(t, strength, h, x, len) {
  if (!(strength > 0)) return { z: 0, x: 0 };
  const gust = 0.55 + 0.45 * Math.sin(t * C.gustFreq + x * 0.35) * Math.sin(t * C.gustFreq * 0.57 + 1.3);
  const w = Math.pow(clamp01(h), 1.5) * Math.min(1, len / C.fullDrop);
  const swell = 0.75 * gust + 0.25 * Math.sin(t * C.freq + x * 0.9) - C.suck;
  const ripple = C.ripple * Math.sin(t * C.freq * 2.1 + x * 5 + h * 2.2);
  const z = strength * C.amp * w * (swell + ripple);
  return { z, x: strength * C.amp * 0.25 * w * Math.sin(t * C.freq * 0.8 + x * 0.6 + 1.7) };
}

const HEAD = /* glsl */`
uniform float uCtTime;
uniform float uCtWind;
uniform vec3 uCtSpan; // x: rail y, y: drop length, z: room direction along z
vec3 curtainWindOffset(vec3 p) {
  if (uCtWind <= 0.0) return vec3(0.0);
  float h = clamp((uCtSpan.x - p.y) / uCtSpan.y, 0.0, 1.0);
  float w = pow(h, 1.5) * min(1.0, uCtSpan.y / ${num(C.fullDrop)});
  float t = uCtTime;
  float gust = 0.55 + 0.45 * sin(t * ${num(C.gustFreq)} + p.x * 0.35) * sin(t * ${num(C.gustFreq * 0.57)} + 1.3);
  float swell = 0.75 * gust + 0.25 * sin(t * ${num(C.freq)} + p.x * 0.9) - ${num(C.suck)};
  float ripple = ${num(C.ripple)} * sin(t * ${num(C.freq * 2.1)} + p.x * 5.0 + h * 2.2);
  float a = uCtWind * ${num(C.amp)} * w;
  return vec3(a * 0.25 * sin(t * ${num(C.freq * 0.8)} + p.x * 0.6 + 1.7), 0.0, uCtSpan.z * a * (swell + ripple));
}
`;

/** Make `material` (cloth or depth) billow with this curtain's `uniforms` ({ uCtWind, uCtSpan }); chains an existing onBeforeCompile. */
export function patchCurtainWind(material, uniforms) {
  const before = material.onBeforeCompile, key = material.customProgramCacheKey;
  const base = key === THREE.Material.prototype.customProgramCacheKey ? () => before.toString() : () => key.call(material);
  const patched = function (shader, renderer) {
    before.call(this, shader, renderer);
    Object.assign(shader.uniforms, uniforms, { uCtTime: time });
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${HEAD}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += curtainWindOffset(transformed);');
  };
  material.onBeforeCompile = patched;
  material.customProgramCacheKey = function () { return `${base.call(this)}|curtain-wind-v1`; };
  rememberBoundedVertexCompile(patched, before, C.amp * (1 + C.ripple));
  material.userData.curtainWind = true;
  return material;
}

/** One curtain's draught: uniforms, a depth material for its shadow, and the openings that feed it. */
export class CurtainDraught {
  constructor(curtain, yTop, drop) {
    this.curtain = curtain; this.openings = []; this.strength = 0;
    this.uniforms = { uCtWind: { value: 0 }, uCtSpan: { value: new THREE.Vector3(yTop, drop, -curtain.out) } };
    this.depth = patchCurtainWind(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide }), this.uniforms);
    for (const p of curtain.panels) {
      p.mesh.customDepthMaterial = this.depth;
      const bb = p.mesh.geometry.boundingBox, r = C.amp * (1 + C.ripple);
      bb.min.z -= r; bb.max.z += r; p.mesh.geometry.boundingSphere = bb.getBoundingSphere(new THREE.Sphere());
    }
    patchCurtainWind(curtain.mat, this.uniforms);
  }
  /** For cloth variants (#991/#997): same draught on a cloned material. */
  patch(mat) { return patchCurtainWind(mat, this.uniforms); }
  update(sitePower) {
    this.strength = curtainWindStrength(curtainOpenness(this.openings), sitePower);
    this.uniforms.uCtWind.value = this.strength;
  }
}

/** All curtains' draughts; `world` supplies the openable windows (`lids`) and exterior doors. */
export class CurtainWind {
  constructor(curtains, world, LEVELS) {
    const items = [];
    const add = (o, kind) => { const obj = o.object; if (!obj) return; obj.updateWorldMatrix(true, false); items.push({ o, kind, pos: new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld) }); };
    for (const o of world.lids) if (o.name === 'fönstret') add(o, 'window');
    for (const o of world.doors) if (o.exterior) add(o, 'door');
    this.draughts = curtains.map((c) => {
      const fl = LEVELS[c.spec.level].floor, d = c.draught; // (made by the Curtain itself; only the feeding openings are found here)
      d.openings = windowsFor(c.spec, fl, items).map((w) => w.o);
      c.draught = d; return d;
    });
  }
  update(dt, siteWind) {
    if (!(dt >= 0 && Number.isFinite(dt))) return;
    time.value = siteWind.time;
    for (const d of this.draughts) d.update(siteWind.power);
  }
}
