// #2016 (part of #2009): the avatars' fingers close round what they hold. A small set of grip shapes (a cylinder grip, a pistol grip,
// a pinch and a flat hand) is chosen from the held item's category (heldcategory.js `hi`, or a weapon's `h`), blended smoothly on pick-up
// and release. The hand has no finger bones (the 15-bone rig stays): each finger is two capsules (proximal, distal) on the hand bone and the
// avatar's vertex shader bends them about their joints from `uFing` (one vec2 per finger: knuckle and middle-joint angle).
// Pure data and logic (plus the capsule geometry) so tools/avatargriptest.mjs can check it under node.
import * as THREE from 'three';
import { AVATAR_GRIP as G } from './config.js';

/** Finger order in every table: 0-3 = little … index by z in the hand's frame (as bodyParts built them), 4 = the thumb. */
export const FINGER_COUNT = 5;

/** The grip shapes: per finger [knuckle, middle joint] bend in rad towards the palm (0 = straight), config.js AVATAR_GRIP.shapes. */
export const GRIPS = G.shapes;
export const gripNames = () => Object.keys(GRIPS);

/** A held category (`hi`, heldcategory.js) or a weapon (`h`, COMBAT.weapons) to a grip name. Anything unknown: the relaxed hand. */
export function gripFor(category = '', weapon = '') {
  if (weapon && G.byWeapon[weapon]) return G.byWeapon[weapon];
  return (category && G.byCategory[category]) || 'relaxed';
}

/** The ten numbers (finger × [knuckle, middle joint]) of grip `name`, finger order as above, thumb last. */
export function gripAngles(name, out = new Float32Array(FINGER_COUNT * 2)) {
  const s = GRIPS[name] ?? GRIPS.relaxed;
  for (let f = 0; f < 4; f++) { out[f * 2] = s.fingers[f][0]; out[f * 2 + 1] = s.fingers[f][1]; }
  out[8] = s.thumb[0]; out[9] = s.thumb[1];
  return out;
}

/** Eases `current` (ten numbers) towards grip `name` over `dt` seconds (exponential, G.ease per second); true when anything changed. */
export function easeGrip(current, name, dt, target = gripAngles(name, new Float32Array(FINGER_COUNT * 2))) {
  const k = 1 - Math.exp(-G.ease * Math.max(0, dt));
  let changed = false;
  for (let i = 0; i < current.length; i++) {
    const d = target[i] - current[i];
    if (!d) continue;
    current[i] = Math.abs(d) < 0.002 ? target[i] : current[i] + d * k; changed = true;
  }
  return changed;
}

/** Where the middle of a held thing goes relative to the hand bone, in the hand's frame, for grip `name` and side sx (+1 left, -1 right):
 * out from the palm side, so the curled fingers close round it instead of through it. */
export function gripPoint(name, sx, out = [0, 0, 0]) {
  const o = (GRIPS[name] ?? GRIPS.relaxed).point;
  out[0] = -sx * o[0]; out[1] = o[1]; out[2] = o[2];
  return out;
}

// --- the hand's finger geometry (the hand bone's frame: the wrist at the bone, the fingers down -y, the thumb towards +z) ------------------
const TILT = 0.3, THUMB_TILT = 0.25; // as bodyParts' fingers were built (rad, towards the palm)
const LENS = [0.026, 0.033, 0.036, 0.032]; // the cylinder part of each finger (as before #2016: little … index)
const FINGER_R = 0.0074, FINGER_TOP = -0.056;

/** One finger's joints for hand side sx: knuckle `m`, middle joint `p`, tip `t` (hand-bone frame, before the bone's own bind offset),
 * the radius of each segment and the unit bend axis (positive angle = towards the palm). Finger 4 = the thumb. */
export function fingerJoints(f, sx) {
  // The joints are the CENTRES of the capsules' end spheres: a segment runs from joint to joint with a rounded end of its radius about each, so the
  // spheres of neighbouring segments coincide and no gap opens when the distal bends about the shared joint. The base sinks into the palm.
  if (f === 4) {
    const r = [0.0088, 0.0078], base = new THREE.Vector3(-sx * 0.006, -0.012, 0.022);
    const u = new THREE.Vector3(0, -0.85, 0.52).applyAxisAngle(new THREE.Vector3(0, 0, 1), -sx * THUMB_TILT * 0.5).normalize();
    const p = base.clone().addScaledVector(u, G.thumb.prox), t = p.clone().addScaledVector(u, G.thumb.dist);
    const palm = new THREE.Vector3(-sx, 0, 0), axis = new THREE.Vector3().crossVectors(u, palm).normalize();
    return { m: base, p, t, r, axis };
  }
  const len = LENS[f], total = len + 2 * FINGER_R, z = (f - 1.5) * 0.0165, r = [FINGER_R, FINGER_R * 0.9];
  const d = new THREE.Vector3(Math.sin(-sx * TILT), -Math.cos(-sx * TILT), 0);
  const centre = new THREE.Vector3(-sx * 0.006, FINGER_TOP - len / 2, z);
  const top = centre.clone().addScaledVector(d, -total / 2), run = total - G.sink; // the finger's length from the sunk knuckle centre to the tip
  const m = top.clone().addScaledVector(d, r[0] - G.sink), p = m.clone().addScaledVector(d, run * G.split), t = top.clone().addScaledVector(d, total - r[1]);
  return { m, p, t, r, axis: new THREE.Vector3(0, 0, -sx) };
}

/** The two capsules (proximal, distal) of finger `f` as [geometry, centre-in-hand-frame] with the geometry already oriented; bodyParts adds
 * them on the hand bone with the part ids `FACE_PART.finger + side * 10 + f * 2 + segment`. `capsule(radius, cylinderLength, segment)`. */
export function fingerSegments(f, sx, capsule) {
  const j = fingerJoints(f, sx), out = [];
  [[j.m, j.p, j.r[0]], [j.p, j.t, j.r[1]]].forEach(([a, b, r], seg) => {
    const dir = b.clone().sub(a), h = dir.length(), mid = a.clone().add(b).multiplyScalar(0.5);
    const g = capsule(r, Math.max(0.001, h), seg);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
    out.push([g, mid.toArray()]);
  });
  return out;
}

/** GLSL: the finger bend. `uFing[10]` per hand side: index = side * 5 + finger; the tables hold each finger's knuckle, middle joint and bend axis
 * (bind-pose coordinates of the avatar, i.e. including the hand bone's offset `bind` for each side). */
export function fingerGLSL(bindL, bindR, partBase) {
  const f = (v) => v.toFixed(5), rows = [];
  for (const [side, bind] of [bindL, bindR].entries()) for (let i = 0; i < FINGER_COUNT; i++) {
    const j = fingerJoints(i, side === 0 ? 1 : -1);
    rows.push({ m: j.m.clone().add(bind), p: j.p.clone().add(bind), a: j.axis });
  }
  const arr = (name, key) => `const vec3 ${name}[10] = vec3[10](${rows.map((r) => `vec3(${f(r[key].x)}, ${f(r[key].y)}, ${f(r[key].z)})`).join(', ')});`;
  return {
    decl: `uniform vec2 uFing[10];\n${arr('FING_M', 'm')}\n${arr('FING_P', 'p')}\n${arr('FING_A', 'a')}
vec3 fingRot(vec3 p, vec3 c, vec3 a, float t) { vec3 v = p - c; return c + v * cos(t) + cross(a, v) * sin(t) + a * dot(a, v) * (1.0 - cos(t)); }
// finger i of 0..9 (side * 5 + finger): segment 0 bends at the knuckle; segment 1 first at the middle joint, then with the knuckle's bend
vec3 fingBend(vec3 p, int i, int seg) {
  vec3 m = FING_M[i], a = FING_A[i];
  if (seg == 1) p = fingRot(p, FING_P[i], a, uFing[i].y);
  return fingRot(p, m, a, uFing[i].x);
}`,
    body: `{ // #2016: a finger segment, bent about its joints by the grip
        int fi = int(floor(facePart - ${partBase}.0 + 0.5)); int seg = fi - (fi / 2) * 2; fi = fi / 2; // = side * 5 + finger
        transformed = fingBend(transformed, fi, seg);
      }`,
  };
}
