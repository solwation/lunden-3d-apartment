import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { OLOF as O, REST } from './config.js';

// Olof (#586): a figure that now and then turns up in the sofa or the armchair with a can of beer, the way the cats turn up
// (src/cat.js) — never where the visitor can see the seat. He sips now and then; look at him and the action is "Vinka till
// Olof": he waves back, gets up, takes a step and fades away, and the wave scores (SCORE `olof`). While he sits there the
// seat is taken (rest.js `taken`) and the cat does not pick it (cat.js `seatTaken`).
//
// The figure is low-poly like the neighbours (src/people.js) but one SkinnedMesh — one draw call (+ one in the shadow
// map) — with a rigid skeleton (every vertex follows one bone): hips, torso, head, two arms (shoulder, elbow, hand) and
// two legs (hip, knee). Poses are solved each frame by two-bone IK from a few target points (the feet on the floor, the
// hands on the thighs / the can at the mouth / waving), so the same figure can sit in any seat (and in the car's driving
// seat, #599). Colours are vertex colours on one material.

const C = O.colors;
const X = new THREE.Vector3(1, 0, 0), DOWN = new THREE.Vector3(0, -1, 0);
// the bind pose (m): standing, facing +z, the origin on the floor between the feet; lengths as the neighbours' (people.js)
const HIP = 0.9, THIGH = 0.44, SHIN = 0.41, UPPER = 0.28, FORE = 0.25, HAND = 0.04, SH = [0.2, 0.55], NECK = 0.64;
const BONES = { hips: [null, 0, HIP, 0], torso: ['hips', 0, 0, 0], head: ['torso', 0, NECK, 0],
  shoulderL: ['torso', SH[0], SH[1], 0], elbowL: ['shoulderL', 0, -UPPER, 0], handL: ['elbowL', 0, -FORE - HAND, 0],
  shoulderR: ['torso', -SH[0], SH[1], 0], elbowR: ['shoulderR', 0, -UPPER, 0], handR: ['elbowR', 0, -FORE - HAND, 0],
  thighL: ['hips', 0.085, 0, 0], kneeL: ['thighL', 0, -THIGH, 0], thighR: ['hips', -0.085, 0, 0], kneeR: ['thighR', 0, -THIGH, 0] };
const NAMES = Object.keys(BONES);

// bind-pose world position of a bone
const bindAt = (name) => { let x = 0, y = 0, z = 0; for (let b = name; b; b = BONES[b][0]) { x += BONES[b][1]; y += BONES[b][2]; z += BONES[b][3]; } return new THREE.Vector3(x, y, z); };

const lathe = (pts, seg = 12) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg); // bottom to top
const TORSO = [[0, 0], [0.13, 0.0], [0.155, 0.04], [0.16, 0.12], [0.142, 0.26], [0.155, 0.4], [0.17, 0.5], [0.16, 0.57],
  [0.11, 0.62], [0.05, 0.64], [0.045, 0.7], [0, 0.71]]; // people.js's torso (hip at 0), scaled 1.15 × 1 × 0.7 below
const torsoR = (y) => { for (let i = 1; i < TORSO.length; i++) { const [r0, y0] = TORSO[i - 1], [r1, y1] = TORSO[i]; if (y <= y1) return r0 + (r1 - r0) * (y - y0) / Math.max(1e-6, y1 - y0); } return 0; };

/** The parts in the bind pose: [geometry (bone-local, moved to the bone's bind position here), colour, bone]. */
function parts() {
  const P = [];
  const add = (g, color, bone, [x = 0, y = 0, z = 0] = []) => { const b = bindAt(bone); g.translate(b.x + x, b.y + y, b.z + z); P.push([g, color, bone]); };
  const sphere = (r, w = 12, h = 8, ...a) => new THREE.SphereGeometry(r, w, h, ...a);
  // hips: the jeans' seat; torso: the hoodie, its ribbed hem, the open zip with the grey T-shirt in the neck, the hood
  add(lathe([[0, -0.11], [0.11, -0.1], [0.14, -0.04], [0.142, 0.03], [0, 0.05]]).scale(1.15, 1, 0.75), C.jeans, 'hips');
  add(lathe(TORSO).scale(1.15, 1, 0.7), C.hoodie, 'torso');
  add(lathe([[0.15, -0.005], [0.158, 0.06]], 14).scale(1.15, 1, 0.7), C.cuff, 'torso'); // (an open band)
  for (let y = 0.02; y < 0.47; y += 0.05) add(new THREE.BoxGeometry(0.011, 0.052, 0.006), C.zip, 'torso', [0, y + 0.025, torsoR(y + 0.025) * 0.7 + 0.002]);
  add(new THREE.ConeGeometry(0.055, 0.13, 3).rotateZ(Math.PI).rotateY(Math.PI / 6).scale(1, 1, 0.25), C.tee, 'torso', [0, 0.55, torsoR(0.55) * 0.7 - 0.006]); // the T-shirt in the open zip: a V
  add(new THREE.TorusGeometry(0.1, 0.035, 6, 14, Math.PI).rotateX(-Math.PI / 2).scale(1.3, 1, 1.1), C.hoodie, 'torso', [0, 0.6, -0.005]);
  add(sphere(0.09, 10, 6).scale(1.35, 0.85, 0.45), C.hoodie, 'torso', [0, 0.5, -0.115]); // the hood lying on the back
  // head (the bone at the neck): neck, head, ears, eyes, nose; ash-blond hair swept back with a side part, short at the
  // sides (a cap tipped back: a high forehead), a grey full beard and moustache
  const H = 0.1; // the head's centre above the neck bone (the neighbours': hip + 0.74)
  add(new THREE.CylinderGeometry(0.05, 0.055, 0.12, 10), C.skin, 'head', [0, 0.02, 0]);
  add(sphere(0.11, 16, 12).scale(0.92, 1.08, 1), C.skin, 'head', [0, H, 0.01]);
  for (const s of [-1, 1]) {
    add(sphere(0.026, 8, 6).scale(0.45, 1, 0.75), C.skin, 'head', [s * 0.1, H - 0.005, 0]);
    add(sphere(0.012, 8, 6), C.eye, 'head', [s * 0.036, H + 0.018, 0.1]);
    add(new THREE.BoxGeometry(0.03, 0.007, 0.01).rotateZ(s * -0.12), C.hair, 'head', [s * 0.037, H + 0.042, 0.103]); // brows
  }
  add(sphere(0.019, 8, 6).scale(0.8, 1, 1.15), C.skin, 'head', [0, H - 0.008, 0.113]);
  add(sphere(0.12, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5).rotateX(-0.62).scale(0.96, 1.02, 1.04), C.hair, 'head', [0, H + 0.012, -0.004]);
  add(sphere(0.075, 12, 6).scale(1.0, 0.42, 1.35).rotateY(0.18), C.hair, 'head', [0.018, H + 0.112, -0.005]); // the swept-back top
  add(sphere(0.114, 14, 8, Math.PI / 2 - 1.5, 3.0, Math.PI * 0.53, Math.PI * 0.37).scale(0.95, 1.1, 1.03), C.beard, 'head', [0, H, 0.012]);
  add(new THREE.CapsuleGeometry(0.011, 0.045, 3, 6).rotateZ(Math.PI / 2), C.beard, 'head', [0, H - 0.04, 0.108]);
  // arms: hoodie sleeves with darker cuffs, the hands; the right hand holds the can (on the hand bone, so it can tilt)
  for (const s of ['L', 'R']) {
    add(lathe([[0, -UPPER - 0.01], [0.044, -UPPER], [0.048, -0.15], [0.052, -0.02], [0.035, 0.03], [0, 0.04]], 10), C.hoodie, 'shoulder' + s);
    add(sphere(0.045, 10, 6), C.hoodie, 'elbow' + s);
    add(lathe([[0, -0.215], [0.036, -0.21], [0.04, -0.15], [0.043, 0], [0, 0.01]], 10), C.hoodie, 'elbow' + s);
    add(lathe([[0.039, -0.235], [0.042, -0.17]], 10), C.cuff, 'elbow' + s);
    add(sphere(0.04, 10, 8).scale(0.72, 1.05, 0.95), C.skin, 'hand' + s);
  }
  const can = [0, 0.015, 0.04]; // in the right hand's frame (y: the can's axis, z: out of the fist)
  add(new THREE.CylinderGeometry(0.033, 0.033, 0.122, 14), C.can, 'handR', can);
  add(new THREE.CylinderGeometry(0.0335, 0.0335, 0.06, 14), C.canBand, 'handR', [can[0], can[1] + 0.005, can[2]]);
  add(new THREE.CylinderGeometry(0.028, 0.031, 0.008, 14), C.canTop, 'handR', [can[0], can[1] + 0.064, can[2]]);
  // legs: jeans, the shoes on the shins (as people.js)
  for (const s of ['L', 'R']) {
    add(lathe([[0, -0.48], [0.04, -0.47], [0.056, -0.44], [0.07, -0.3], [0.079, -0.04], [0.06, 0.03], [0, 0.04]], 10), C.jeans, 'thigh' + s);
    add(lathe([[0, -0.42], [0.034, -0.41], [0.04, -0.36], [0.052, -0.1], [0.054, -0.01], [0.042, 0.04], [0, 0.05]], 10), C.jeans, 'knee' + s);
    add(new RoundedBoxGeometry(0.1, 0.075, 0.26, 2, 0.032).translate(0, -SHIN, 0.05), C.shoe, 'knee' + s);
  }
  return P;
}

/** The skinned figure: { object (a Group: put it where he is), mesh, bones, pick, material }. */
export function buildOlof() {
  const geos = parts().map(([g0, color, bone]) => {
    const g = g0.index ? g0.toNonIndexed() : g0; // (mergeGeometries needs them all alike; RoundedBox comes unindexed)
    const n = g.attributes.position.count, c = new THREE.Color(color), k = NAMES.indexOf(bone);
    const col = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; si[i * 4] = k; sw[i * 4] = 1; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color', 'skinIndex', 'skinWeight'].includes(a)) g.deleteAttribute(a);
    return g;
  });
  const geometry = mergeGeometries(geos);

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, transparent: true }); // (fades out)
  const mesh = new THREE.SkinnedMesh(geometry, material);
  const bones = {};
  for (const name of NAMES) {
    const b = (bones[name] = new THREE.Bone()), [parent, x, y, z] = BONES[name];
    b.name = name; b.position.set(x, y, z);
    (parent ? bones[parent] : mesh).add(b);
  }
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(NAMES.map((n) => bones[n])));
  mesh.castShadow = true;
  mesh.frustumCulled = false; // (the bind pose's bounds would not follow the pose)
  const object = new THREE.Group();
  object.name = 'olof';
  object.add(mesh);
  // what the look ray hits: an invisible box round the seated figure (the raycaster ignores `visible`)
  const pick = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.15, 0.75), new THREE.MeshBasicMaterial());
  pick.position.set(0, 0.78, 0.2);
  pick.visible = false;
  object.add(pick);
  object.userData.moving = true;   // detail.js: judged every update (he moves while the visitor stands still)
  object.userData.detailUnit = true; // … as one thing
  return { object, mesh, bones, pick, material, head: new THREE.Vector3() };
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
 * can: [x, y, z] the can's axis (the right hand), or null to keep the hand straight on.
 */
export function poseOlof(fig, { hip, lean = 0, head = 0, turn = 0, feet, hands, can }) {
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
    ik(B['thigh' + s], B['knee' + s], I, S.set(sx * 0.085, 0, 0), T.set(fx, fy - hy, fz - hz), THIGH, SHIN, P.set(0, 0.25, 1), out);
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

/** The look that sees a seat: (world point) => true when the visitor would see it (main.js). */
export class Olof {
  /** `world`: World (its furnitureTargets); `rand`: random numbers (tests). */
  constructor(world, rand = Math.random) {
    Object.assign(this, { world, rand });
    this.fig = buildOlof();
    this.object = this.fig.object;
    this.object.visible = false;
    this.state = 'away'; // away / sit / wave / rise / go
    this.wait = O.first;
    this.t = 0;
    this.drink = 0;      // 0 … 1 the can at the mouth
    this.nextSip = this.sipWait();
    this.sipT = -1;
    this.spot = null; this.target = null; this.seat = 0;
    this.interact = { name: 'Olof', kind: 'olof', verb: 'vinka till', pickable: this.fig.pick };
    this.fig.pick.userData.door = this.interact;
    this.canSee = () => false;      // (world point) => the visitor would see it (main.js: in view and not behind a wall)
    this.catAt = () => null;        // () => where the cat is, or null
    this.visitorSeat = () => null;  // () => the spot the visitor sits in, or null
    this.enabled = () => true;      // () => the furniture is shown (F)
    this.onSay = null;              // (line) => {} his line in a speech bubble (main.js → greet.js)
  }

  sipWait() { return O.sip[0] + this.rand() * (O.sip[1] - O.sip[0]); }

  /** The seats he can sit in: the sofa's three, the armchair's one (OLOF.seats), as { target, spot }. */
  seats() {
    const out = [];
    for (const t of this.world.furnitureTargets ?? []) {
      if (t.kind !== 'rest' || t.rest !== 'sit' || !O.seats.includes(t.name)) continue;
      t.spots.forEach((sp, i) => { if (t.name !== 'soffan' || i < O.sofaSpots) out.push({ target: t, spot: sp }); });
    }
    return out;
  }

  /** Free for him: not the visitor's seat, no cat on it, not already taken. */
  free({ spot }) {
    const me = this.visitorSeat(), cat = this.catAt();
    if (me && Math.hypot(me.x - spot.pos.x, me.z - spot.pos.z) < 0.4) return false;
    if (cat && Math.hypot(cat.x - spot.pos.x, cat.z - spot.pos.z) < 0.5 && Math.abs(cat.y - spot.pos.y) < 1.2) return false;
    return !spot.taken?.();
  }

  /** Is he in (or getting up from) the seat at (x, z)? (cat.js: not where he sits; rest.js `taken`.) */
  sitsNear(x, z, r = 0.4) { return this.state !== 'away' && !!this.spot && Math.hypot(this.spot.pos.x - x, this.spot.pos.z - z) < r; }

  /** Turn up now in seat `pick` (index into `seats()`), or a random free one out of sight (`force`: even in sight). */
  appear(pick = null, force = false) {
    if (this.state !== 'away') return false;
    const all = this.seats();
    let cands = pick != null ? [all[pick]].filter(Boolean) : all.filter((s) => this.free(s) && (force || !this.canSee(s.spot.pos)));
    if (!cands.length) return false;
    const { target, spot } = cands[Math.floor(this.rand() * cands.length)];
    this.target = target; this.spot = spot; this.seat = spot.y; this.spotAt = spot.pos.clone();
    const prev = spot.taken, self = this;
    spot.taken = function () { return (self.spot === spot && self.state !== 'away') || !!prev?.(); }; // nobody sits on his lap
    this.restore = () => { spot.taken = prev; };
    const floor = spot.pos.y - REST.sitEye - spot.y;
    this.object.position.set(spot.pos.x, floor, spot.pos.z);
    this.object.rotation.set(0, spot.yaw + Math.PI, 0); // (the spot's yaw is the camera's: facing the other way round)
    this.fig.material.opacity = 1;
    this.object.visible = true;
    this.state = 'sit'; this.t = 0; this.drink = 0; this.sipT = -1; this.nextSip = 1 + this.sipWait() * 0.5;
    this.pose();
    return true;
  }

  /** Gone (out of sight, the seat free again); `wait` s until he may turn up again. */
  hide(wait = O.away) {
    if (this.state === 'away') return;
    this.restore?.(); this.restore = null;
    this.state = 'away'; this.spot = null; this.target = null;
    this.object.visible = false;
    this.wait = wait;
  }

  /** Can he be waved to now (sitting there)? */
  get waveable() { return this.state === 'sit' && this.object.visible; }

  /** The visitor waves (E on him): he waves back, says goodbye, gets up and goes. True if it counted. */
  wave() {
    if (!this.waveable) return false;
    this.state = 'wave'; this.t = 0; this.said = false;
    return true;
  }

  pose() {
    const s = this.state, t = this.t;
    const wave = s === 'wave' ? Math.min(1, t / 0.4) * (t > O.waveTime - 0.3 ? Math.max(0, (O.waveTime - t) / 0.3) : 1) : 0;
    const up = s === 'rise' ? t / O.riseTime : s === 'go' ? 1 : 0;
    const p = seatedPose(this.seat, { w: this.drink, wave, ph: t * 9, up, fwd: O.forward[this.target?.name] ?? 0 });
    if (s === 'go') { // a couple of steps sideways along the seat's front, turning; fading meanwhile
      const k = Math.min(1, t / O.goTime), step = Math.sin(t * 9) * 0.16;
      p.hip = [HIP - 0.02, 0];
      p.feet = [[0.11, 0.05 + Math.max(0, step) * 0.25, step], [-0.11, 0.05 + Math.max(0, -step) * 0.25, -step]];
      p.hands[0].at = [0.2, HIP - 0.05, 0.08 - step * 0.5]; p.hands[0].pole = [0.3, -0.3, -1];
      p.hands[1].at = [-0.2, HIP - 0.05, 0.12 + step * 0.5];
      p.lean = 0.04;
      this.object.rotation.y = this.yaw0 + k * Math.PI / 2;
      this.object.position.copy(this.go0).addScaledVector(this.goDir, k * 0.7);
    }
    poseOlof(this.fig, p);
  }

  update(dt) {
    if (this.state === 'away') {
      if (!this.enabled()) return;
      this.wait -= dt;
      if (this.wait <= 0) { this.wait = O.every; if (this.rand() < O.chance) this.appear(); }
      return;
    }
    if (!this.enabled()) { this.hide(O.every); return; }
    // the seat was moved away (rearranging, #—): he is gone
    if (this.state === 'sit' && (!this.world.furnitureTargets?.includes(this.target) || this.spot.pos.distanceTo(this.spotAt) > 0.05)) { this.hide(O.every); return; }
    this.t += dt;
    // sipping: up to the mouth, a moment, down again
    if (this.state === 'sit') {
      if (this.sipT < 0 && (this.nextSip -= dt) <= 0) this.sipT = 0;
      if (this.sipT >= 0) { this.sipT += dt; if (this.sipT > O.sipTime) { this.sipT = -1; this.nextSip = this.sipWait(); } }
    } else this.sipT = -1;
    const want = this.sipT >= 0 && this.sipT < O.sipTime - 0.7 ? 1 : 0;
    this.drink += THREE.MathUtils.clamp(want - this.drink, -dt / 0.6, dt / 0.7);
    if (this.state === 'wave') {
      if (!this.said && this.t > 0.5) { this.said = true; this.onSay?.(O.bye[Math.floor(this.rand() * O.bye.length)]); }
      if (this.t >= O.waveTime) { this.state = 'rise'; this.t = 0; }
    } else if (this.state === 'rise' && this.t >= O.riseTime) {
      this.state = 'go'; this.t = 0;
      this.yaw0 = this.object.rotation.y;
      this.go0 = this.object.position.clone().add(new THREE.Vector3(Math.sin(this.yaw0), 0, Math.cos(this.yaw0)).multiplyScalar(0.5 + (O.forward[this.target?.name] ?? 0))); // where he stands
      this.goDir = new THREE.Vector3(Math.cos(this.yaw0), 0, -Math.sin(this.yaw0)); // his left (+x in his own frame)
    } else if (this.state === 'go') {
      this.fig.material.opacity = Math.max(0, 1 - this.t / O.goTime);
      if (this.t >= O.goTime) { this.hide(); return; }
    }
    this.pose();
  }
}
