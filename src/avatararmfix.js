// #2022: pose-driven shoulder/armpit corrective inside the 15-bone rig (replaces #2013's static follow weights). Each frame
// the upper arm's elevation in the torso frame gives a per-side `lift` (0 hanging, forward or in a rifle hold; 1 at
// horizontal and above). A lifted arm moves a falling share of the torso weight around its armhole to the shoulder bone
// (the fabric rides up with the arm instead of stretching the armpit) and re-blends the sewn shoulder rows; a lowered arm
// keeps the plain rig weights, so a forward hold pays nothing for the lift. The same formula runs in the vertex shader
// (one vec2 uniform; no new attribute, bone or draw call) and on the CPU (`SkinnedMesh.applyBoneTransform`), so
// tools/avatarshouldervolume.mjs and every other CPU reader measure what is drawn. Values: AVATAR_SURFACE.body.armFix.
import * as THREE from 'three';
import { AVATAR_SURFACE as SURFACE } from './config.js';
import { NAMES, bindAt } from './olof.js';

// (lazy: olof.js and avatar.js import each other)
let TORSO, SHOULDER, ELBOW, PIVOT;
const rig = () => { if (PIVOT) return; TORSO = NAMES.indexOf('torso'); SHOULDER = [NAMES.indexOf('shoulderL'), NAMES.indexOf('shoulderR')];
  ELBOW = [NAMES.indexOf('elbowL'), NAMES.indexOf('elbowR')]; PIVOT = [bindAt('shoulderL'), bindAt('shoulderR')]; };
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const _m = new THREE.Matrix4(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

/** The per-side lift [L, R] from the skeleton's current world matrices (the upper arm's direction in the torso frame). */
export function armFixSignal(bones, out = new THREE.Vector2()) {
  rig();
  const F = SURFACE.body.armFix, inv = _m.copy(bones[TORSO].matrixWorld).invert();
  for (let k = 0; k < 2; k++) {
    const a = _a.setFromMatrixPosition(bones[SHOULDER[k]].matrixWorld).applyMatrix4(inv);
    const d = _b.setFromMatrixPosition(bones[ELBOW[k]].matrixWorld).applyMatrix4(inv).sub(a).normalize();
    out.setComponent(k, smooth(F.lift[0], F.lift[1], d.y));
  }
  return out;
}

/** Weight share moved from the torso to the side's shoulder bone (negative: back) for a bind-pose vertex at lift `sig`. */
export function armFixDelta(x, y, z, si, sw, pumpX, sig) {
  rig();
  const F = SURFACE.body.armFix, k = x < 0 ? 1 : 0, p = PIVOT[k], on = sig.getComponent(k);
  let torso = 0;
  for (let j = 0; j < 4; j++) if (si[j] === TORSO) torso += sw[j];
  if (torso <= 0 || on <= 0) return 0;
  const dy = y - p.y, rest = Math.max(0, 1 - torso);
  if (pumpX === 0) { // the torso grid (no arm-pump centre): a follow share falling off around the pivot, less below it
    const reach = Math.hypot(x - p.x, dy * F.tall, z - p.z);
    return on * torso * F.share * (1 - smooth(F.radius[0], F.radius[1], reach)) * (F.low + (1 - F.low) * smooth(-F.blend, F.blend, dy));
  }
  // the sewn shoulder rows and arm rings: their shoulder share s = 1 - τ re-blends as s^rows
  const rows = F.rows[0] + (F.rows[1] - F.rows[0]) * smooth(-F.rows[3], F.rows[3], dy - F.rows[2]);
  return on * (Math.pow(rest, rows) - rest);
}

/** GLSL: the declaration and the three skinning chunks with the corrective added to the bone blend (same formula). */
export function armFixShader() {
  rig();
  const F = SURFACE.body.armFix, f = v => (+v).toFixed(5), [L, R] = PIVOT;
  return {
    decl: `uniform vec2 uArmFix; // #2022
float armFixD() {
  bool right = position.x < 0.0; vec3 p = right ? vec3(${f(R.x)}, ${f(R.y)}, ${f(R.z)}) : vec3(${f(L.x)}, ${f(L.y)}, ${f(L.z)});
  float on = right ? uArmFix.y : uArmFix.x, torso = dot(skinWeight, vec4(equal(skinIndex, vec4(${TORSO}.0))));
  if (torso <= 0.0 || on <= 0.0) return 0.0;
  float dy = position.y - p.y, rest = max(0.0, 1.0 - torso);
  if (armPump.x == 0.0) return on * torso * ${f(F.share)} * (1.0 - smoothstep(${f(F.radius[0])}, ${f(F.radius[1])}, length(vec3(position.x - p.x, dy * ${f(F.tall)}, position.z - p.z))))
    * (${f(F.low)} + ${f(1 - F.low)} * smoothstep(${f(-F.blend)}, ${f(F.blend)}, dy));
  return on * (pow(rest, mix(${f(F.rows[0])}, ${f(F.rows[1])}, smoothstep(${f(-F.rows[3])}, ${f(F.rows[3])}, dy - (${f(F.rows[2])})))) - rest);
}`,
    base: `#include <skinbase_vertex>
float armFix = armFixD(); mat4 armFixM = mat4(0.0);
if (armFix != 0.0) armFixM = armFix * (getBoneMatrix(position.x < 0.0 ? ${SHOULDER[1]}.0 : ${SHOULDER[0]}.0) - getBoneMatrix(${TORSO}.0));`,
    normal: '#include <skinnormal_vertex>\nobjectNormal += (bindMatrixInverse * armFixM * bindMatrix * vec4(objectNormal, 0.0)).xyz; // #2022 (first order)',
    skin: '#include <skinning_vertex>\ntransformed += (bindMatrixInverse * (armFixM * skinVertex)).xyz; // #2022',
  };
}

/** Drive `uniform` (the material's uArmFix) from `mesh`'s skeleton and add the same corrective to its CPU skinning. */
export function installArmFix(mesh, uniform) {
  rig();
  const skeleton = mesh.skeleton, update = skeleton.update.bind(skeleton), apply = mesh.applyBoneTransform.bind(mesh);
  skeleton.update = () => { update(); armFixSignal(skeleton.bones, uniform.value); };
  const si = [0, 0, 0, 0], sw = [0, 0, 0, 0], bind = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), M = new THREE.Matrix4(), N = new THREE.Matrix4();
  mesh.applyBoneTransform = (index, vector) => {
    bind.copy(vector); apply(index, vector);
    const g = mesh.geometry.attributes;
    for (let j = 0; j < 4; j++) { si[j] = g.skinIndex.getComponent(index, j); sw[j] = g.skinWeight.getComponent(index, j); }
    const d = armFixDelta(bind.x, bind.y, bind.z, si, sw, g.armPump ? g.armPump.getX(index) : 1, uniform.value);
    if (d === 0) return vector;
    const bm = skeleton.boneMatrices;
    a.copy(bind).applyMatrix4(mesh.bindMatrix);
    b.copy(a).applyMatrix4(M.fromArray(bm, SHOULDER[bind.x < 0 ? 1 : 0] * 16)).sub(a.applyMatrix4(M.fromArray(bm, TORSO * 16)));
    return vector.add(b.multiplyScalar(d).applyMatrix4(N.copy(mesh.bindMatrixInverse).setPosition(0, 0, 0)));
  };
}
