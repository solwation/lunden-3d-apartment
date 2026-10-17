import * as THREE from 'three';
import { OLOF as O, defaultFaceLook } from './config.js';
import { Avatar } from './avatar.js';

// Olof is only the driver of our car (#900). The skeleton and IK here are shared with the players' avatars (src/avatar.js).
//
// Since #1156 he is drawn with the players' Avatar (as detailed as theirs: face, hair, beard, body, the talking mouth) in a
// fixed look (OLOF.look + his colours, olofLook): one SkinnedMesh — one draw call, like one player avatar — on a rigid
// skeleton (every vertex follows one bone): hips, torso, head, two arms (shoulder, elbow, hand) and two legs (hip, knee,
// ankle). Poses are solved each frame by two-bone IK from a few target points (the feet at the pedals, the hands on the
// wheel / waving), so the same figure can sit in any seat (and in the car's driving seat, #599).

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0), KNEE = [0, 0.25, 1], qI = new THREE.Quaternion();
// the bind pose (m): standing, facing +z, the origin on the floor between the feet; lengths as the neighbours' (people.js)
const HIP = 0.9, THIGH = 0.44, SHIN = 0.41, UPPER = 0.28, FORE = 0.25, HAND = 0.04, SH = [0.2, 0.55], NECK = 0.64;
const BONES = { hips: [null, 0, HIP, 0], torso: ['hips', 0, 0, 0], head: ['torso', 0, NECK, 0],
  shoulderL: ['torso', SH[0], SH[1], 0], elbowL: ['shoulderL', 0, -UPPER, 0], handL: ['elbowL', 0, -FORE - HAND, 0],
  shoulderR: ['torso', -SH[0], SH[1], 0], elbowR: ['shoulderR', 0, -UPPER, 0], handR: ['elbowR', 0, -FORE - HAND, 0],
  thighL: ['hips', 0.085, 0, 0], kneeL: ['thighL', 0, -THIGH, 0], thighR: ['hips', -0.085, 0, 0], kneeR: ['thighR', 0, -THIGH, 0],
  footL: ['kneeL', 0, -SHIN, 0], footR: ['kneeR', 0, -SHIN, 0] }; // (#1149: the ankles; the avatars' shoes, kept flat when crouching)
const NAMES = Object.keys(BONES);
export { NAMES, HIP, THIGH, SHIN, UPPER, FORE, HAND, SH, NECK }; // (the player avatars, src/avatar.js, share the skeleton and its IK)

// bind-pose world position of a bone
export const bindAt = (name) => { let x = 0, y = 0, z = 0; for (let b = name; b; b = BONES[b][0]) { x += BONES[b][1]; y += BONES[b][2]; z += BONES[b][3]; } return new THREE.Vector3(x, y, z); };

export const lathe = (pts, seg = 12) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg); // bottom to top
const TORSO = [[0, 0], [0.13, 0.0], [0.155, 0.04], [0.16, 0.12], [0.142, 0.26], [0.155, 0.4], [0.17, 0.5], [0.16, 0.57],
  [0.11, 0.62], [0.05, 0.64], [0.045, 0.7], [0, 0.71]]; // people.js's torso (hip at 0); its users scale it 1.15 × 1 × 0.7
export const torsoR = (y) => { for (let i = 1; i < TORSO.length; i++) { const [r0, y0] = TORSO[i - 1], [r1, y1] = TORSO[i]; if (y <= y1) return r0 + (r1 - r0) * (y - y0) / Math.max(1e-6, y1 - y0); } return 0; };

/** Give a SkinnedMesh the figure's skeleton (bones as children of the mesh, bound in the bind pose); returns { name: Bone }. */
export function attachSkeleton(mesh) {
  const bones = {};
  for (const name of NAMES) {
    const b = (bones[name] = new THREE.Bone()), [parent, x, y, z] = BONES[name];
    b.name = name; b.position.set(x, y, z);
    (parent ? bones[parent] : mesh).add(b);
  }
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(NAMES.map((n) => bones[n])));
  return bones;
}

/** Olof's look (#1156): the Avatar look made from OLOF.look and his colours (the top is TOPS[10], his hoodie's colour). */
export function olofLook() {
  const C = O.colors;
  return { ...defaultFaceLook(), ...O.look, skin: C.skin, hair: C.hair, beard: C.beard, top: C.hoodie, pants: C.jeans, shoes: C.shoe };
}

/** The figure: the Avatar in Olof's look, { object (put it where he is), mesh, bones, pick, material, head, avatar }. */
export function buildOlof() {
  const avatar = new Avatar(olofLook()), object = avatar.object;
  object.name = 'olof';
  object.rotation.set(0, 0, 0); // (his own frame faces +z, as poseOlof's; the Avatar's faces −z for the ghosts)
  // what the look ray hits: an invisible box round the seated figure (the raycaster ignores `visible`)
  const pick = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.15, 0.75), new THREE.MeshBasicMaterial());
  pick.position.set(0, 0.78, 0.2);
  pick.visible = false;
  object.add(pick);
  return { object, mesh: avatar.mesh, bones: avatar.bones, pick, material: avatar.material, head: avatar.head, avatar };
}

// --- posing ------------------------------------------------------------------------------------------------------
const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), q3 = new THREE.Quaternion(), qT = new THREE.Quaternion();
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), m3 = new THREE.Matrix4();

/** Two-bone IK in one frame: `upper` (whose parent has rotation `parentQ` in that frame) starts at S and reaches with its
 * child `lower` (bone lengths a, b) for T, the joint bent towards `pole`. Sets both local rotations; returns the lower
 * bone's rotation in the frame (in `out`). */
function ik(upper, lower, parentQ, S, T, a, b, pole, out) {
  const u = v1.copy(T).sub(S); let d = u.length(); u.normalize();
  d = THREE.MathUtils.clamp(d, Math.abs(a - b) + 1e-3, a + b - 1e-4);
  const cosA = THREE.MathUtils.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  const p = v2.copy(pole).addScaledVector(u, -pole.dot(u)).normalize();
  const e = v3.copy(u).multiplyScalar(cosA).addScaledVector(p, sinA); // the upper bone's direction
  const qU = q1.setFromUnitVectors(DOWN, e);
  upper.quaternion.copy(q2.copy(parentQ).invert().multiply(qU));
  const f = v4.copy(u).multiplyScalar(d).addScaledVector(e, -a).normalize(); // from the joint to the (reachable) target
  out.setFromUnitVectors(DOWN, f);
  lower.quaternion.copy(q2.copy(qU).invert().multiply(out));
  return out;
}

const ease = (t) => { t = THREE.MathUtils.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const lerp3 = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);

/**
 * Pose the figure. Everything in the figure's own frame (the Group's: floor at y 0, facing +z):
 * hip [y, z] (the hip joints' height and how far forward), lean (torso back, rad), head (pitch back, rad), turn (the head
 * sideways, rad), feet: [[x, y, z] ×2] the ankles (L = +x), hands: [{ at: [x, y, z], pole: [x, y, z] } ×2] the wrists,
 * can: [x, y, z] the can's axis (the right hand), or null to keep the hand straight on. Optional (#1149): knee [x, y, z]
 * the knees' pole (x outward per side), flat 0 … 1 how far the feet are turned level on the floor (0: rigid with the shin)
 * and toes (rad) how far they then turn outward.
 */
export function poseOlof(fig, { hip, lean = 0, head = 0, turn = 0, feet, hands, can, knee = KNEE, flat = 0, toes = 0 }) {
  const B = fig.bones, hy = hip[0], hz = hip[1];
  B.hips.position.set(0, hy, hz);
  B.hips.quaternion.identity();
  const tq = q3.setFromAxisAngle(X, -lean);
  B.torso.quaternion.copy(tq);
  B.head.quaternion.setFromEuler(new THREE.Euler(-head, turn, 0, 'YXZ'));
  const I = qT.identity();
  const S = new THREE.Vector3(), T = new THREE.Vector3(), P = new THREE.Vector3(), out = new THREE.Quaternion();
  ['L', 'R'].forEach((s, i) => {
    const sx = i ? -1 : 1, [fx, fy, fz] = feet[i];
    ik(B['thigh' + s], B['knee' + s], I, S.set(sx * 0.085, 0, 0), T.set(fx, fy - hy, fz - hz), THIGH, SHIN, P.set(sx * knee[0], knee[1], knee[2]), out);
    const foot = B['foot' + s];
    if (foot) { // the shin's rotation undone (level, the toes turned out) as far as `flat`
      if (flat > 0) foot.quaternion.copy(q1.copy(out).invert().multiply(q2.setFromAxisAngle(Y, sx * toes))).slerp(qI, 1 - flat);
      else foot.quaternion.identity();
    }
    const h = hands[i];
    ik(B['shoulder' + s], B['elbow' + s], tq, S.set(sx * SH[0], SH[1], 0).applyQuaternion(tq), T.set(h.at[0], h.at[1] - hy, h.at[2] - hz),
      UPPER, FORE + HAND, P.set(...h.pole), out);
    const hand = B['hand' + s];
    if (i === 1 && can) { // the can's axis = the hand's y, the fist's front (z) along the forearm
      const y = v1.set(...can).normalize(), fwd = v2.set(0, -1, 0).applyQuaternion(out);
      const z = fwd.addScaledVector(y, -fwd.dot(y)).normalize(), x = v3.crossVectors(y, z);
      const want = q2.setFromRotationMatrix(m3.makeBasis(x, y, z));
      hand.quaternion.copy(q1.copy(out).invert().multiply(want));
    } else hand.quaternion.identity();
  });
  // where his head is (world), for the speech bubble
  fig.object.updateMatrixWorld(true);
  B.head.getWorldPosition(fig.head);
  fig.head.y += 0.1;
}

// --- the seated pose and its moves ---------------------------------------------------------------------------------
// In the seat's frame: the spot (where a visitor's eye would be, rest.js) is at x = z = 0, the floor at y 0, `seat` the seat's
// height. The hips sit a little forward of the spot, leaning back into the backrest; the feet on the floor in front.
/** The seated pose with a drink weight `w` (0 resting the can on the thigh … 1 at the mouth), waving `wave` (0 … 1, the left
 * hand up; `ph` the wave's phase) and standing up `up` (0 seated … 1 standing in front of the seat). */
export function seatedPose(seat, { w = 0, wave = 0, ph = 0, up = 0, fwd = 0 } = {}) {
  const sitHip = [seat + 0.075, 0.07 + fwd], standHip = [HIP - 0.02, 0.5 + fwd];
  const u = ease(up), hip = lerp3(sitHip, standHip, u);
  const lean = 0.1 * (1 - u) - 0.45 * Math.sin(Math.PI * u) - 0.22 * w; // forward to get up; head back a little to drink
  const feet = [[0.11, 0.05, 0.56 + fwd - 0.04 * u], [-0.11, 0.05, 0.56 + fwd - 0.04 * u]];
  // the right hand: the can on the thigh … at the mouth (the can's top at the lips, tipped up)
  const restR = [-0.15, hip[0] + 0.13, hip[1] + 0.3], mouthR = [-0.03, hip[0] + 0.66, hip[1] + 0.26];
  const handR = { at: lerp3(restR, mouthR, ease(w)), pole: lerp3([-0.4, -0.3, -1], [-1, -0.4, -0.2], ease(w)) };
  const can = lerp3([0, 1, 0.1], [0, -0.35, -1], ease(w));
  if (up > 0) { handR.at = lerp3(handR.at, [-0.2, hip[0] - 0.05, hip[1] + 0.22], u); }
  // the left hand on the thigh, or up waving
  const restL = [0.15, hip[0] + 0.1, hip[1] + 0.28];
  const waveL = [0.36 + 0.07 * Math.sin(ph), hip[0] + 0.95, hip[1] + 0.12];
  const handL = { at: lerp3(restL, waveL, ease(wave)), pole: lerp3([0.4, -0.3, -1], [1, -0.7, -0.1], ease(wave)) };
  return { hip, lean, head: 0.28 * ease(w), feet, hands: [handL, handR], can };
}

// --- Olof driving our car (#599) ----------------------------------------------------------------------------------
// When the car is called (the key in the hall) he sits in the driving seat (the figure above, child of the
// car's group so it drives with it): hands on the wheel, now and then a look sideways. Greet him while it is parked:
// "Hälsa på Olof" → your hello, a dad joke from OLOF.car.jokes in a bubble while he waves, then he sits on at the wheel
// (#658): greet him again for a new joke (points once per arrival), and the key sends the car off with him in it. He is
// always in the car while it is out (#663): opening a door or the visitor sitting down in the passenger seat changes nothing
// (the driver's seat is his, main.js `car.driverTaken`), a car restored arriving / parked / leaving has him too; his only
// absence is the car in its stall in the garage (and gone): the next call brings him again (the sitting itself is not saved).

/** The driving pose in the figure's frame (floor of the foot well at y 0): hips on the cushion, leaning into the backrest,
 * the feet at the pedals, both hands on the wheel (`wave`: the left hand up, waving). */
export function drivingPose({ seat, wheel, pedals, wave = 0, ph = 0, turn = 0 }) {
  const hip = [seat + 0.075, 0], [wx, wy, wz] = wheel, r = 0.15;
  const handR = { at: [wx - r, wy - 0.04, wz], pole: [-0.6, -0.8, -0.3] };
  const restL = [wx + r, wy - 0.04, wz], waveL = [0.3 + 0.05 * Math.sin(ph), hip[0] + 0.66, 0.2]; // (under the roof, by the window)
  const handL = { at: lerp3(restL, waveL, ease(wave)), pole: lerp3([0.6, -0.8, -0.3], [1, -0.7, -0.1], ease(wave)) };
  return { hip, lean: O.car.lean, head: 0, turn, feet: [[0.12, 0.06, pedals], [-0.12, 0.06, pedals]], hands: [handL, handR], can: null };
}

export class OlofDriver {
  /** `car`: Car (car.js; its group, built facing local +x, gets the figure). */
  constructor(car) {
    const D = O.car;
    this.car = car;
    this.fig = buildOlof();
    const o = this.fig.object;
    o.userData = {}; // (a part of the car: the car's own detail flags judge it)
    o.position.set(D.at[0], D.floor, D.at[1]);
    o.rotation.y = Math.PI / 2; // his +z along the car's +x
    o.visible = false;
    const B = D.box; // the pick box (his frame): his upper body and out through the driver's window, above the door's handle
    this.fig.pick.geometry.dispose();
    this.fig.pick.geometry = new THREE.BoxGeometry(B[3] - B[0], B[4] - B[1], B[5] - B[2]);
    this.fig.pick.position.set((B[0] + B[3]) / 2, (B[1] + B[4]) / 2, (B[2] + B[5]) / 2);
    car.object.add(o);
    this.interact = { name: 'Olof', kind: 'olofcar', verb: 'hälsa på', pickable: this.fig.pick };
    this.fig.pick.userData.door = this.interact;
    this.state = 'away'; // away / drive / joke
    this.t = 0; this.scored = false; this.waveK = 0; this.look = 0; this.lookT = 4;
    this.onSay = null; // (line, secs) => {} his joke in a bubble (main.js → greet.js)
  }

  /** The Avatar he is drawn with (#1156): greet.js moves its mouth with his line. */
  get avatar() { return this.fig.avatar; }

  get visible() { return this.state !== 'away'; }

  /** The car was called: he is at the wheel. */
  show() {
    this.state = 'drive'; this.t = 0; this.scored = false; this.waveK = 0;
    this.fig.material.opacity = 1;
    this.fig.object.visible = true;
    this.car.learnerSign.visible = this.carOut;
    this.pose();
  }

  hide() { this.state = 'away'; this.fig.object.visible = false; this.car.learnerSign.visible = false; }

  /** Can he be greeted now (the car parked, he at the wheel, the visitor not in the car)? */
  greetable(seatedInCar = false) { return this.state === 'drive' && this.car.parked && this.car.object.visible && !seatedInCar; }

  /** The visitor says hello: a dad joke and a wave, then he sits on. True if a joke started; `scored` (once per arrival)
   * tells main.js whether the greeting counts for points (#658, *guess*: no farming). */
  greet() {
    if (this.state !== 'drive') return false;
    this.state = 'joke'; this.t = 0; this.said = false;
    return true;
  }

  /** Is this greeting the first since he arrived (it scores)? Call once per greeting. */
  claimScore() { const first = !this.scored; this.scored = true; return first; }

  pose() {
    const D = O.car, wave = this.waveK;
    poseOlof(this.fig, drivingPose({ seat: D.seat, wheel: D.wheel, pedals: D.pedals, wave, ph: this.t * 9, turn: this.look }));
  }

  /** Is the car out (on its way, parked, leaving)? Then he is in it (#663); in its stall or gone, nobody is. */
  get carOut() { const c = this.car; return c.object.visible && c.state !== 'garage' && c.state !== 'gone'; }

  update(dt) {
    const c = this.car;
    if (this.state === 'away') { if (this.carOut) this.show(); return; } // (a car restored out on the road, #663)
    if (!this.carOut) { this.hide(); return; } // back home / driven off: nobody in it
    this.t += dt;
    this.waveK = this.state === 'joke' ? Math.min(1, this.t / 0.4) : Math.max(0, this.waveK - dt / 0.4); // (the hand comes down after the joke)
    // a glance to the side now and then (towards the house while parked)
    if ((this.lookT -= dt) <= 0) { this.lookT = 3 + Math.random() * 5; this.lookTo = this.lookTo ? 0 : (this.state === 'drive' && c.parked ? 0.7 : 0.35); }
    this.look += ((this.state === 'joke' ? 0.8 : this.lookTo ?? 0) - this.look) * Math.min(1, dt * 3);
    if (this.state === 'joke') {
      if (!this.said && this.t > 0.6) { this.said = true; this.onSay?.(O.car.jokes[Math.floor(Math.random() * O.car.jokes.length)], O.car.jokeTime); }
      if (this.t >= 0.6 + O.car.jokeTime) { this.state = 'drive'; this.t = 0; } // he sits on (#658)
    }
    this.fig.avatar.updateMouth(dt); // (#1156: his mouth goes with the joke)
    this.pose();
  }
}
