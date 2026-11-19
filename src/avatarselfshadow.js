// #2143: analytic sun self-shadowing of an avatar, in its own material (no shadow map, no extra draw, no texture).
// The sun's ray from a surface point is tested against six capsules (head, torso, upper arms, forearms: from the bones' world positions,
// once per update) and the cap's peak / hat's brim (an ellipse in the head's frame); the result dims the SUN light only (directional light
// whose direction matches the uniform's), sky and ambient stay. The GLSL below and the JS functions (headless tests,
// tools/avatarselfshadowtest.mjs) are the same arithmetic. Per avatar and frame: 6 capsules x 2 vec4 + one mat4 + 3 small uniforms,
// about 7 matrixWorld reads, one 4x4 inverse and ~60 multiplies on the CPU; in the fragment ~6 capsule tests + the brim.
import * as THREE from 'three';
import { AVATAR_SELF_SHADOW as C, AVATAR_HAT as HAT, AVATAR_HAIR as HAIR, PVP_RIFLE_HEAD as RH } from './config.js';

export const CAPSULES = Object.keys(C.capsules); // head, torso, upperL, upperR, foreL, foreR (the uniform order)
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Where a point's sun ray meets a capsule, as shadow 0 … 1: p the surface point, sun the unit direction TOWARDS the sun, cap { a, b, r }
 * (inner proxy radius r). Fragments sitting on the capsule's own surface (distance < skin x r from the axis) are not shaded by it. */
export function capsuleOcclusion(p, sun, cap) {
  const d2 = sub(cap.b, cap.a), r = sub(p, cap.a), e = dot(d2, d2) || 1e-9, f = dot(d2, r);
  const tp = clamp(f / e, 0, 1), own = Math.hypot(r[0] - d2[0] * tp, r[1] - d2[1] * tp, r[2] - d2[2] * tp); // p's distance from the axis
  const b = dot(sun, d2), c = dot(sun, r), den = e - b * b;
  let s = den > 1e-9 ? Math.max(0, (b * f - c * e) / den) : 0, t = clamp((b * s + f) / e, 0, 1);
  s = Math.max(0, b * t - c);
  const q = [r[0] + sun[0] * s - d2[0] * t, r[1] + sun[1] * s - d2[1] * t, r[2] + sun[2] * s - d2[2] * t], dist = Math.hypot(q[0], q[1], q[2]);
  const w = cap.r * C.soft + s * C.pen;
  return (1 - smooth(cap.r - w, cap.r + w, dist)) * smooth(cap.r * C.skin[0], cap.r * C.skin[1], own) * smooth(0.0, 0.03, s);
}

/** The brim's shadow 0 … 1: p / sun already in the head's frame (sun = the direction towards the sun scaled by the same map), brim { y, cz, rx, rz } or null. */
export function brimOcclusion(p, sun, brim) {
  if (!brim || !(brim.rz > 0) || !(sun[1] > 1e-4)) return 0;
  const t = (brim.y - p[1]) / sun[1];
  if (!(t > 0)) return 0;
  const x = (p[0] + sun[0] * t) / brim.rx, z = (p[2] + sun[2] * t - brim.cz) / brim.rz, n = Math.hypot(x, z);
  return (1 - smooth(1 - C.brimSoft, 1 + C.brimSoft, n)) * smooth(0.004, 0.025, t);
}

/** The whole figure's shadow on a point, 0 … C.max (before the strength k): caps = [{ a, b, r }], pHead / sunHead for the brim. */
export function selfOcclusion(p, sun, caps, brim, pHead, sunHead) {
  let lit = 1;
  for (const c of caps) lit *= 1 - capsuleOcclusion(p, sun, c);
  if (brim && pHead) lit *= 1 - brimOcclusion(pHead, sunHead, brim);
  return (1 - lit) * C.max;
}

/** The head-frame ellipse of headwear kind (HAT.names index: 1 cap forwards, 2 cap backwards, 4 hat; others null): { y, cz, rx, rz }. *Guess* from the skull. */
export function brimShape(kind) {
  const S = RH.skull, c = HAIR.centre, deg = Math.PI / 180, [crown, side] = HAT.lift, lift = (e) => side + (crown - side) * smooth(10, 70, e);
  const at = (a, e, extra = 0) => { const d = [Math.sin(a * deg) * Math.cos(e * deg), Math.sin(e * deg), Math.cos(a * deg) * Math.cos(e * deg)], L = lift(e) + extra; return [0, 1, 2].map((i) => c[i] + d[i] * (S.radius * S.scale[i] + L) + (S.centre[i] - c[i])); };
  if (kind === 1 || kind === 2) {
    const e = HAT.edge.cap[0][1], p = at(0, e), side52 = at(52, HAT.edge.cap[1][1]), sg = kind === 1 ? 1 : -1, depth = HAT.peak + 0.01;
    return { y: p[1] - C.brimDrop, cz: sg * (Math.abs(p[2]) - 0.01 + depth / 2) * (sg > 0 ? 1 : 1), rx: Math.abs(side52[0]) * 1.05, rz: depth / 2 };
  }
  if (kind === 4) {
    const p = at(0, HAT.edge.hat[0][1], 0.012), side90 = at(90, HAT.edge.hat[1][1], 0.012);
    return { y: p[1] - C.brimDrop, cz: S.centre[2], rx: Math.abs(side90[0]) + HAT.brim, rz: Math.abs(p[2] - S.centre[2]) + HAT.brim };
  }
  return null;
}

// ---- the material ---------------------------------------------------------------------------------------------------------------
/** The material's uniforms (avatar.js makeMaterial). uSelfK: 0 = off (the branch costs nothing). */
export const selfShadowUniforms = () => ({ uSelfK: { value: 0 }, uSelfSun: { value: new THREE.Vector3(0, 1, 0) }, uSelfSunHead: { value: new THREE.Vector3(0, 1, 0) },
  uSelfA: { value: Array.from({ length: CAPSULES.length }, () => new THREE.Vector4()) }, uSelfB: { value: Array.from({ length: CAPSULES.length }, () => new THREE.Vector3()) },
  uSelfHead: { value: new THREE.Matrix4() }, uSelfBrim: { value: new THREE.Vector4(0, 0, 1, 0) } });

export const SELF_VDECL = 'varying vec3 vSelfWorld;';
/** Vertex, after project_vertex (`transformed` is the skinned, shaped position in the mesh's frame). */
export const SELF_VCODE = 'vSelfWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;';
export const SELF_FDECL = `varying vec3 vSelfWorld; uniform float uSelfK; uniform vec3 uSelfSun, uSelfSunHead, uSelfB[${CAPSULES.length}]; uniform vec4 uSelfA[${CAPSULES.length}], uSelfBrim; uniform mat4 uSelfHead;
float selfCap(vec3 p, vec3 sun, vec3 a, vec3 bb, float rad) {
  vec3 d2 = bb - a, r = p - a; float e = max(dot(d2, d2), 1e-9), f = dot(d2, r);
  float tp = clamp(f / e, 0.0, 1.0), own = length(r - d2 * tp);
  float b = dot(sun, d2), c = dot(sun, r), den = e - b * b;
  float s = den > 1e-9 ? max(0.0, (b * f - c * e) / den) : 0.0, t = clamp((b * s + f) / e, 0.0, 1.0);
  s = max(0.0, b * t - c);
  float dist = length(r + sun * s - d2 * t), w = rad * ${C.soft.toFixed(3)} + s * ${C.pen.toFixed(3)};
  return (1.0 - smoothstep(rad - w, rad + w, dist)) * smoothstep(rad * ${C.skin[0].toFixed(3)}, rad * ${C.skin[1].toFixed(3)}, own) * smoothstep(0.0, 0.03, s);
}
float selfShadow(vec3 p) {
  float lit = 1.0;
  for (int i = 0; i < ${CAPSULES.length}; i++) lit *= 1.0 - selfCap(p, uSelfSun, uSelfA[i].xyz, uSelfB[i], uSelfA[i].w);
  if (uSelfBrim.w > 0.0 && uSelfSunHead.y > 0.0001) {
    vec3 ph = (uSelfHead * vec4(p, 1.0)).xyz; float t = (uSelfBrim.x - ph.y) / uSelfSunHead.y;
    if (t > 0.0) { vec2 q = vec2((ph.x + uSelfSunHead.x * t) / uSelfBrim.z, (ph.z + uSelfSunHead.z * t - uSelfBrim.y) / uSelfBrim.w);
      lit *= 1.0 - (1.0 - smoothstep(${(1 - C.brimSoft).toFixed(3)}, ${(1 + C.brimSoft).toFixed(3)}, length(q))) * smoothstep(0.004, 0.025, t); }
  }
  return (1.0 - lit) * ${C.max.toFixed(3)};
}`;
/** Fragment: replaces the directional-light loop's light-info line so the sun alone is dimmed. (Declares selfOcc before the lights chunk.) */
export function selfLightsChunk() {
  const src = THREE.ShaderChunk.lights_fragment_begin, key = 'getDirectionalLightInfo( directionalLight, directLight );';
  if (!src.includes(key)) return '#include <lights_fragment_begin>'; // (a three.js version without it: no self shadow, nothing breaks)
  return 'float selfOcc = 0.0; vec3 selfSunV = vec3(0.0);\nif (uSelfK > 0.0) { selfOcc = uSelfK * selfShadow(vSelfWorld); selfSunV = normalize((viewMatrix * vec4(uSelfSun, 0.0)).xyz); }\n'
    + src.replace(key, `${key}\n\t\tif (selfOcc > 0.0 && dot(directionalLight.direction, selfSunV) > 0.98) directLight.color *= 1.0 - selfOcc; // #2143`);
}
export const selfShadowKey = () => '-self2143';

/** Per-frame CPU side: from the bones' world matrices (read once per update, last frame's pose) to the uniforms. */
export class SelfShadow {
  constructor(u) { this.u = u; this.k = 0; this.kNow = 0; this.sun = new THREE.Vector3(0, 1, 0); this.kind = 0; this.brim = null; this.inv = new THREE.Matrix4(); this.v = [new THREE.Vector3(), new THREE.Vector3()]; }
  /** The sun's direction (world, towards it) and strength 0 … 1 (zone, weather, daylight: AvatarLight). */
  setSun(dir, k) { this.k = k > C.minK ? Math.min(1, k) : 0; if (dir) this.sun.copy(dir).normalize(); }
  setHat(kind) { if (kind !== this.kind) { this.kind = kind; this.brim = brimShape(kind); } }
  /** bones: the avatar's { name: Bone }; scale: the figure's world scale (radii are in metres of a 1.0 figure). */
  update(bones, scale = 1, dt = 0.016) {
    const u = this.u;
    this.kNow += (this.k - this.kNow) * Math.min(1, dt * C.ease); // (a step into / out of the shade fades over ~0.3 s)
    if (this.kNow < C.minK || !bones?.head) { if (!this.k) this.kNow = 0; u.uSelfK.value = 0; return; }
    const [p, q] = this.v, A = u.uSelfA.value, B = u.uSelfB.value;
    u.uSelfK.value = this.kNow; u.uSelfSun.value.copy(this.sun);
    CAPSULES.forEach((name, i) => {
      const c = C.capsules[name], bone = bones[c.bone]; if (!bone) return;
      const e = bone.matrixWorld.elements, sy = Math.hypot(e[4], e[5], e[6]);
      if (c.to) { p.setFromMatrixPosition(bone.matrixWorld); q.setFromMatrixPosition(bones[c.to].matrixWorld); }
      else { p.set(e[12] + e[4] * c.a, e[13] + e[5] * c.a, e[14] + e[6] * c.a); q.set(e[12] + e[4] * c.b, e[13] + e[5] * c.b, e[14] + e[6] * c.b); }
      A[i].set(p.x, p.y, p.z, c.r * (c.bone === 'head' ? sy : scale)); B[i].copy(q);
    });
    const brim = this.brim, h = bones.head.matrixWorld;
    if (brim) {
      this.inv.copy(h).invert(); u.uSelfHead.value.copy(this.inv);
      u.uSelfSunHead.value.copy(this.sun).transformDirection(this.inv); // (transformDirection normalises: the plane test only needs the direction)
      u.uSelfBrim.value.set(brim.y, brim.cz, brim.rx, brim.rz);
    } else u.uSelfBrim.value.w = 0;
  }
}
