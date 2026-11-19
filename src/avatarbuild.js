// #2141: the body build (Kroppsbyggnad) as a body shape. Before, the build slider scaled the whole figure sideways and in depth
// (Avatar's object scale x/z), so the head, the hands and the feet grew with the belly and a heavy woman differed from a heavy man
// only by the shared torso profile. Now the object scale is the height alone and the build is:
//  - per-region radial offsets in the vertex shader on the bind pose before skinning (a continuous field of the bind position,
//    weighted by the vertex's own skin weights, so coincident seam vertices — which share weights or skinning would tear them —
//    move together): the trunk's sideways / depth scale at the hips, waist, chest and shoulders, a forward belly and bust bump,
//    and the upper arm, forearm, thigh and calf thickness about their bone axes. Head-, hand- and foot-weighted vertices never
//    move (long hair and a necklace below the neck follow the trunk, so they stay outside it);
//  - a joint spread: the shoulder and thigh bones move out / in (poseOlof's IK reads the same factors) and the resting hands'
//    sideways target follows the hips, so the hanging arms clear a wider body.
// Gender adds a small base shape at every build (a narrower waist and rounder hips / a broader chest and shoulders). The old look
// codes keep their slider step (the same gain), so an old build draws as its nearest equivalent. Pure helpers here (no three.js,
// headless-testable: tools/avatarbuildtest.mjs; numbers: AVATAR_BODY_SHAPE in config.js). CPU raycasts see the bones' spread
// but not the shader's offsets (as with #2108's breathing); the head boxes are independent of the build (rifleBoxPose).
import { AVATAR_BODY_SHAPE as S, avatarBuildWidth } from './config.js';

const HIP_Y = 0.9, SHOULDER_X = 0.2, THIGH_X = 0.085; // olof.js's bind pose (HIP, SH[0], the thigh bones' x)
// bone indices of olof.js NAMES: hips 0, torso 1, head 2, shoulderL 3, elbowL 4, handL 5, shoulderR 6, elbowR 7, handR 8,
// thighL 9, kneeL 10, thighR 11, kneeR 12, footL 13, footR 14
const BONE = { trunk: [0, 1], head: [2], upper: [3, 6], fore: [4, 7], thigh: [9, 11], calf: [10, 12] };

const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const lin = (a, b, t) => a + (b - a) * t;

/** The look's figure: 1 female, 0 male (avatar.js's `gender ?? figure`). */
export const isFemaleLook = (look) => (Number(look?.gender ?? look?.figure) || 0) === 1;

/** The look's signed build gain: avatarBuildWidth − 1 (−0.14 slim … 0 medium … +0.16 heavy; old seeded builds −0.07 / 0 / +0.08). */
export const buildGain = (look) => avatarBuildWidth(look) - 1;

/** The look's body shape: { g, female, x[4], z[4] (trunk gains at AVATAR_BODY_SHAPE.knots), belly, bust (m forward),
 * limb[4] (upper arm, forearm, thigh, calf gains), spread { shoulder, hip, hand } (joint x factors) }. */
export function bodyShape(look) {
  const g = buildGain(look), female = isFemaleLook(look), G = female ? S.female : S.male;
  const amp = ([base, slim, heavy]) => base + (g < 0 ? slim : heavy) * g, lin1 = ([base, slope]) => base + slope * g;
  return {
    g, female,
    x: G.x.map(lin1), z: G.z.map(lin1),
    belly: amp(G.bellyAmp), bust: amp(G.bustAmp),
    limb: G.limb.map((k) => k * g),
    spread: { shoulder: 1 + amp(G.spread.shoulder), hip: 1 + amp(G.spread.hip), hand: 1 + amp(G.spread.hand) },
  };
}

/** The trunk's sideways / depth gain at torso-local height `ty` (m above the hips bone) for the knot gains `k` (4). */
export function trunkGain(k, ty) {
  const K = S.knots;
  let v;
  if (ty <= K[0]) v = k[0];
  else if (ty >= K[3]) v = k[3];
  else { let i = 0; while (ty > K[i + 1]) i++; v = lin(k[i], k[i + 1], (ty - K[i]) / (K[i + 1] - K[i])); }
  return v * (1 - smooth(S.fade[0], S.fade[1], ty));
}

const bump = ([cy, bx, by], x, ty) => Math.exp(-((x / bx) ** 2 + ((ty - cy) / by) ** 2));

/** The class weights of a vertex from its skin indices / weights (4 each): { trunk, upper, fore, thigh, calf } (head, hands and feet: none).
 * `y` is its bind height: head-weighted vertices below the neck (long hair, a necklace) count as trunk. */
export function classWeights(index, weight, y) {
  const sum = (list) => { let s = 0; for (let i = 0; i < 4; i++) if (list.includes(index[i])) s += weight[i]; return s; };
  const below = smooth(S.headBelow[0], S.headBelow[1], y - HIP_Y);
  return { trunk: sum(BONE.trunk) + below * sum(BONE.head), upper: sum(BONE.upper), fore: sum(BONE.fore), thigh: sum(BONE.thigh), calf: sum(BONE.calf) };
}

/** The limb's radial gain at bind height `y` along the bind-pose arm (`arm` true) or leg: the upper arm / thigh gain above the elbow /
 * knee, the forearm / calf gain below, faded to 0 at the shoulder cap (the trunk's) and at the wrist / ankle (the hands and feet keep their size). */
export function limbGain(sh, arm, y) {
  const A = S.arm, L = S.leg;
  if (arm) return lin(sh.limb[1], sh.limb[0], smooth(A.elbow[1], A.elbow[0], y)) * (1 - smooth(A.top[1], A.top[0], y)) * smooth(A.wrist[1], A.wrist[0], y);
  return lin(sh.limb[3], sh.limb[2], smooth(L.knee[1], L.knee[0], y)) * smooth(L.ankle[1], L.ankle[0], y);
}

/** The bind-pose offset [dx, dy, dz] (m) of a vertex at bind position `p` with class weights `w` (classWeights) for the shape `sh`
 * (bodyShape). The JS mirror of buildGLSL (the same formula, for tests and CPU measurements). */
export function bodyOffset(p, w, sh) {
  const [x, y, z] = p, ty = y - HIP_Y, out = [0, 0, 0];
  if (w.trunk > 0) {
    const gx = trunkGain(sh.x, ty), gz = trunkGain(sh.z, ty), front = smooth(S.front[0], S.front[1], z);
    out[0] += w.trunk * x * gx;
    out[2] += w.trunk * (z * gz + front * (sh.belly * bump(S.belly, x, ty) + sh.bust * bump(S.bust, x, ty)));
  }
  const side = x < 0 ? -1 : 1, arm = w.upper + w.fore, leg = w.thigh + w.calf;
  if (arm > 0) {
    const k = arm * limbGain(sh, true, y);
    out[0] += (x - side * SHOULDER_X) * k; out[2] += z * k;
  }
  if (leg > 0) {
    const k = leg * limbGain(sh, false, y);
    out[0] += (x - side * THIGH_X) * k; out[2] += z * k * (z > 0 ? S.leg.front : 1);
  }
  return out;
}

// --- the shader -------------------------------------------------------------------------------------------------------------
/** The uniforms (added to the avatar material's): trunk x / z gains at the knots, (belly, bust, on, 0), limb gains. Medium male = 0 offsets
 * only where the base shape is 0; `on` 0 skips the snippet (no look applied yet). */
export const buildUniforms = () => ({ uBodyX: { value: [0, 0, 0, 0] }, uBodyZ: { value: [0, 0, 0, 0] }, uBodyBump: { value: [0, 0, 0, 0] }, uBodyLimb: { value: [0, 0, 0, 0] } });
export const BUILD_DECL = 'uniform vec4 uBodyX, uBodyZ, uBodyBump, uBodyLimb;';
/** The program-cache key suffix (avatar.js chains every splice's key). */
export const buildKey = () => '-build2141';

/** Writes the look's shape into the material uniforms `u`; returns the shape. */
export function applyBodyShape(u, look) {
  const sh = bodyShape(look);
  u.uBodyX.value = sh.x.slice(); u.uBodyZ.value = sh.z.slice();
  u.uBodyBump.value = [sh.belly, sh.bust, 1, 0]; u.uBodyLimb.value = sh.limb.slice();
  return sh;
}

/** Moves the shoulder and thigh bones of a freshly bound skeleton out / in by the shape's spread (poseOlof reads `fig.spread`). */
export function spreadBones(bones, sh) {
  if (!bones) return;
  for (const [name, x] of [['shoulderL', SHOULDER_X], ['shoulderR', -SHOULDER_X]]) if (bones[name]) bones[name].position.x = x * sh.spread.shoulder;
  for (const [name, x] of [['thighL', THIGH_X], ['thighR', -THIGH_X]]) if (bones[name]) bones[name].position.x = x * sh.spread.hip;
}

const f = (v) => (+v).toFixed(4);
/** Vertex code on `transformed` (bind pose, after the face shape, before skinning). Mirrors bodyOffset. */
export function buildGLSL() {
  const K = S.knots, A = S.arm, L = S.leg, [z0, z1] = S.front;
  const range = (list) => list.map((b) => `step(${f(b - 0.5)}, skinIndex) * step(skinIndex, vec4(${f(b + 0.5)}))`).join(' + ');
  const gauss = ([cy, bx, by], q) => `exp(-((${q}.x / ${f(bx)}) * (${q}.x / ${f(bx)}) + ((${q}.y - ${f(cy)}) / ${f(by)}) * ((${q}.y - ${f(cy)}) / ${f(by)})))`;
  const trunk = (k) => `(ty <= ${f(K[0])} ? ${k}.x : ty <= ${f(K[1])} ? mix(${k}.x, ${k}.y, (ty - ${f(K[0])}) / ${f(K[1] - K[0])}) : ty <= ${f(K[2])} ? mix(${k}.y, ${k}.z, (ty - ${f(K[1])}) / ${f(K[2] - K[1])}) : ty <= ${f(K[3])} ? mix(${k}.z, ${k}.w, (ty - ${f(K[2])}) / ${f(K[3] - K[2])}) : ${k}.w) * fadeN`;
  return `
#ifdef USE_SKINNING
if (uBodyBump.z > 0.5) { // #2141: the body build's shape (src/avatarbuild.js)
  vec3 bq = transformed; float ty = bq.y - ${f(HIP_Y)};
  float wTrunk = dot(skinWeight, ${range(BONE.trunk)}) + smoothstep(${f(S.headBelow[0])}, ${f(S.headBelow[1])}, ty) * dot(skinWeight, ${range(BONE.head)});
  float wUp = dot(skinWeight, ${range(BONE.upper)}), wFo = dot(skinWeight, ${range(BONE.fore)});
  float wTh = dot(skinWeight, ${range(BONE.thigh)}), wCa = dot(skinWeight, ${range(BONE.calf)});
  float fadeN = 1.0 - smoothstep(${f(S.fade[0])}, ${f(S.fade[1])}, ty);
  vec3 bo = vec3(0.0);
  if (wTrunk > 0.0) {
    vec2 bt = vec2(bq.x, ty);
    float front = smoothstep(${f(z0)}, ${f(z1)}, bq.z);
    bo.x += wTrunk * bq.x * ${trunk('uBodyX')};
    bo.z += wTrunk * (bq.z * ${trunk('uBodyZ')} + front * (uBodyBump.x * ${gauss(S.belly, 'bt')} + uBodyBump.y * ${gauss(S.bust, 'bt')}));
  }
  float bside = bq.x < 0.0 ? -1.0 : 1.0;
  if (wUp + wFo > 0.0) {
    float y = bq.y, k = (wUp + wFo) * mix(uBodyLimb.y, uBodyLimb.x, smoothstep(${f(A.elbow[1])}, ${f(A.elbow[0])}, y))
      * (1.0 - smoothstep(${f(A.top[1])}, ${f(A.top[0])}, y)) * smoothstep(${f(A.wrist[1])}, ${f(A.wrist[0])}, y);
    bo.x += (bq.x - bside * ${f(SHOULDER_X)}) * k; bo.z += bq.z * k;
  }
  if (wTh + wCa > 0.0) {
    float y = bq.y, kl = mix(uBodyLimb.w, uBodyLimb.z, smoothstep(${f(L.knee[1])}, ${f(L.knee[0])}, y)) * smoothstep(${f(L.ankle[1])}, ${f(L.ankle[0])}, y);
    float k = (wTh + wCa) * kl;
    bo.x += (bq.x - bside * ${f(THIGH_X)}) * k; bo.z += bq.z * k * (bq.z > 0.0 ? ${f(L.front)} : 1.0);
  }
  transformed += bo;
}
#endif`;
}
