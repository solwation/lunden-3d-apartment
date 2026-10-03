import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { HAND as H } from './config.js';

// The visitor's right arm and hand (#195, #238), children of the camera, in the lower right of the view. Hidden
// while the hand is empty. Holding something (holdable.js, a cup), the hand closes round the held thing's grip
// point — `grip` ([x, y, z] in the thing's own frame) if it has one, else round the right edge of its box — or, for a
// thing with `handPose: 'palm'` (the basketball), carries it on an open palm turned up; `handPose: 'hug'` (Pingping, #269):
// both arms round it, the hands on its sides at its `hugGrips` (right, left; the left arm is the right one mirrored); it follows the thing as it
// swings, tips or is drunk from. Petting the cat with an empty hand, the palm strokes its head and back (#242). E on a door, a cabinet, a tap, a switch …: the arm reaches out towards it (~0.35 s)
// with the fingers opening, and back.
// The hand is one mesh: a palm, a thumb and four fingers of three joints each (capsules, soft normals) and the bare
// wrist, built in three poses that are its morph targets (relaxed | closed round a handle | spread for a reach).
// The sleeve is a tapering tube from the shoulder with a cuff at the wrist. Three meshes, no shadows.

const skin = new THREE.MeshStandardMaterial({ color: H.skin, roughness: 0.62, emissive: H.skinGlow, emissiveIntensity: 1 });
const sleeve = new THREE.MeshStandardMaterial({ color: H.sleeve, roughness: 0.85 });

// The hand's frame: the wrist at the origin, the fingers towards +z, the palm facing +x, the thumb on top (+y) —
// a right hand with its palm to the left, as it comes from the shoulder in the lower right of the view.
const FINGERS = [ // knuckle (y, z), radius, length — index to little finger
  { y: 0.029, z: 0.097, r: 0.0094, l: 0.074 },
  { y: 0.0095, z: 0.1, r: 0.0097, l: 0.082 },
  { y: -0.0095, z: 0.097, r: 0.0092, l: 0.076 },
  { y: -0.028, z: 0.089, r: 0.0082, l: 0.06 },
];
const PHALANX = [0.45, 0.31, 0.24]; // share of a finger's length per joint
const POSES = {
  // fingers: bend at the three joints (rad, towards the palm); spread: fan (rad about x, + = towards the little finger)
  // thumb: base turn up / towards the palm, then its two joints
  relaxed: { fingers: [0.22, 0.28, 0.16], spread: [-0.05, -0.01, 0.03, 0.07], thumb: { up: 0.62, in: 0.42, bend: [0.18, 0.15] } },
  grip: { fingers: [1.15, 1.45, 0.9], spread: [0, 0, 0, 0], thumb: { up: 0.28, in: 0.95, bend: [0.4, 0.55] } },
  spread: { fingers: [0.04, 0.05, 0.02], spread: [-0.17, -0.05, 0.07, 0.19], thumb: { up: 0.85, in: 0.12, bend: [0.02, 0.0] } },
};

const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);

/** A capsule of radius r from the origin `len` along +z, then placed by matrix `m`. */
function bone(r0, len, m) {
  const g = new THREE.CapsuleGeometry(r0, Math.max(0.001, len - r0), 3, 10).rotateX(Math.PI / 2).translate(0, 0, (len - r0) / 2 + r0 * 0.5);
  return g.applyMatrix4(m);
}

/** A chain of joints from `start` (position, quaternion), bending by `bends` about the local y axis (towards +x). */
function chain(parts, start, q0, lens, radii, bends) {
  const p = start.clone(), q = q0.clone(), m = new THREE.Matrix4();
  lens.forEach((len, k) => {
    q.multiply(new THREE.Quaternion().setFromAxisAngle(Y, bends[k]));
    parts.push(bone(radii[k], len, m.compose(p, q, new THREE.Vector3(1, 1, 1))));
    p.add(Z.clone().applyQuaternion(q).multiplyScalar(len - radii[k] * 0.35)); // the next joint overlaps a little
  });
}

/** The hand in one pose: every pose has the same vertices in the same order (they are morph targets). */
function handGeometry(pose) {
  const parts = [];
  const palm = new RoundedBoxGeometry(0.03, 0.08, 0.098, 3, 0.013).translate(0.001, 0, 0.05);
  parts.push(palm);
  // the ball of the thumb and the heel of the hand on the palm side
  parts.push(new THREE.SphereGeometry(0.02, 12, 8).scale(0.62, 1.05, 1.45).translate(0.008, 0.019, 0.034));
  parts.push(new THREE.SphereGeometry(0.018, 10, 8).scale(0.6, 1.1, 1.2).translate(0.008, -0.02, 0.03));
  // the wrist and the bare forearm back to the cuff, a little flatter than wide
  parts.push(new THREE.CylinderGeometry(0.026, 0.031, 0.1, 16, 1, true).rotateX(Math.PI / 2).scale(0.72, 1, 1).translate(0, -0.002, -0.045));
  FINGERS.forEach((f, i) => {
    const q = new THREE.Quaternion().setFromAxisAngle(X, pose.spread[i]);
    chain(parts, new THREE.Vector3(0.002, f.y, f.z - 0.006), q, PHALANX.map((s) => s * f.l), [f.r, f.r * 0.93, f.r * 0.86], pose.fingers);
  });
  // the thumb: from the wrist end of the palm, turned up (+y) and in towards the palm (+x), its metacarpal included
  const t = pose.thumb;
  const q = new THREE.Quaternion().setFromAxisAngle(X, -t.up).multiply(new THREE.Quaternion().setFromAxisAngle(Y, t.in));
  chain(parts, new THREE.Vector3(0.006, 0.026, 0.02), q, [0.045, 0.034, 0.028], [0.0125, 0.0108, 0.0098], [0, ...t.bend]);
  const geo = mergeGeometries(parts.map((g) => { g.deleteAttribute('uv'); return g.index ? g.toNonIndexed() : g; }));
  return geo.scale(H.size, H.size, H.size);
}

function buildHand() {
  const base = handGeometry(POSES.relaxed), grip = handGeometry(POSES.grip), spread = handGeometry(POSES.spread);
  base.morphAttributes.position = [grip.getAttribute('position'), spread.getAttribute('position')];
  base.morphAttributes.normal = [grip.getAttribute('normal'), spread.getAttribute('normal')];
  base.computeBoundingSphere();
  return base;
}

/** The sleeve, length 1 along +z (scaled to the shoulder–cuff distance), wider at the shoulder. */
function sleeveGeometry() {
  return new THREE.CylinderGeometry(0.036, 0.05, 1, 14, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);
}
/** The cuff: a rolled edge round the end of the sleeve (at z 0, the sleeve goes on towards −z). */
function cuffGeometry() {
  const parts = [
    new THREE.TorusGeometry(0.035, 0.0055, 6, 18).scale(0.85, 1, 1),
    new THREE.CylinderGeometry(0.036, 0.038, 0.035, 18, 1, true).rotateX(Math.PI / 2).scale(0.85, 1, 1).translate(0, 0, -0.017),
  ];
  return mergeGeometries(parts.map((g) => { g.deleteAttribute('uv'); return g.index ? g.toNonIndexed() : g; }));
}

const tmpBox = new THREE.Box3(), tmpM = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0), rollQ = new THREE.Quaternion();
// where the held thing touches the hand, in the hand's frame (before its size): inside the closed fingers, or on the palm
const CONTACT = { grip: new THREE.Vector3(0.03, 0.002, 0.07), palm: new THREE.Vector3(0.024, 0, 0.06) };

export class Hand {
  constructor(camera, scene) {
    this.camera = camera;
    if (!camera.parent) scene.add(camera); // children of the camera only render in the scene
    this.hand = new THREE.Mesh(buildHand(), skin);
    this.hand.morphTargetInfluences = [0, 0];
    this.cuff = new THREE.Mesh(cuffGeometry(), sleeve);
    this.arm = new THREE.Mesh(sleeveGeometry(), sleeve); // length 1 along +z
    for (const m of [this.hand, this.arm, this.cuff]) { m.visible = false; m.castShadow = false; m.renderOrder = 1; m.raycast = () => {}; m.frustumCulled = false; camera.add(m); }
    this.right = { hand: this.hand, arm: this.arm, cuff: this.cuff };
    // the left arm (#269, only for a hug): the same meshes in a mirrored frame (x → −x), posed like the right one
    this.mirror = new THREE.Group();
    this.mirror.scale.x = -1;
    camera.add(this.mirror);
    this.left = { hand: new THREE.Mesh(this.hand.geometry, skin), arm: new THREE.Mesh(this.arm.geometry, sleeve), cuff: new THREE.Mesh(this.cuff.geometry, sleeve) };
    this.left.hand.morphTargetInfluences = [0, 0];
    for (const m of Object.values(this.left)) { m.visible = false; m.castShadow = false; m.renderOrder = 1; m.raycast = () => {}; m.frustumCulled = false; this.mirror.add(m); }
    this.shoulder = new THREE.Vector3(...H.shoulder);
    this.rest = new THREE.Vector3(...H.rest);
    this.low = this.rest.clone().add(new THREE.Vector3(0.05, -0.25, 0.12)); // below the view
    this.reachT = 1;
    this.reachTo = new THREE.Vector3();
    this.grips = new WeakMap();
  }

  get visible() { return this.hand.visible; }

  /** The grip of a held thing, in its model's frame: its own `grip`, or round the right edge of its box, low. */
  gripOf(item) {
    if (this.grips.has(item)) return this.grips.get(item);
    let g;
    if (item.grip) g = new THREE.Vector3(...item.grip);
    else {
      const m = item.model, parent = m.parent, pos = m.position.clone(), q = m.quaternion.clone();
      m.removeFromParent(); m.position.set(0, 0, 0); m.quaternion.identity(); m.updateMatrixWorld(true);
      tmpBox.setFromObject(m);
      const c = tmpBox.getCenter(new THREE.Vector3()), s = tmpBox.getSize(new THREE.Vector3());
      g = new THREE.Vector3(c.x + Math.min(Math.max(0, s.x / 2 - 0.02), 0.05), tmpBox.min.y + Math.min(s.y * 0.35, 0.08), c.z + 0.01); // the fingers round its right edge, low
      m.position.copy(pos); m.quaternion.copy(q); parent?.add(m); m.updateMatrixWorld(true);
    }
    this.grips.set(item, g);
    return g;
  }

  /** E on something out there (world point `p`): reach towards it and back. */
  reach(p) {
    if (!p) return;
    this.camera.updateMatrixWorld();
    const local = this.camera.worldToLocal(p.clone());
    const d = local.clone().sub(this.rest);
    if (d.length() > H.reach) d.setLength(H.reach);
    this.reachTo.copy(this.rest).add(d);
    this.reachT = 0;
  }

  /** Place the hand so that its contact point (`mode` 'grip' / 'palm' / 'reach' / 'pet' / 'hug') is at `at` (camera space,
   * or the mirrored frame for the left side), the arm coming from the shoulder. 'palm' turns the palm up. */
  pose(at, mode = 'grip', side = this.right) {
    const { hand, cuff: cuffM, arm: armM } = side;
    const dir = at.clone().sub(this.shoulder).normalize();
    tmpM.lookAt(at.clone().add(dir), at, up); // its z axis = eye − target = along the arm
    hand.quaternion.setFromRotationMatrix(tmpM);
    if (mode === 'palm') hand.quaternion.multiply(rollQ.setFromAxisAngle(Z, Math.PI / 2)); // the palm up, the thumb out
    else if (mode === 'pet') hand.quaternion.multiply(rollQ.setFromAxisAngle(Z, -Math.PI / 2)); // the palm down on the cat
    const contact = (mode === 'palm' || mode === 'pet' || mode === 'hug' ? CONTACT.palm : mode === 'grip' ? CONTACT.grip : new THREE.Vector3(0.01, 0, 0.06)).clone().multiplyScalar(H.size);
    hand.position.copy(at).sub(contact.applyQuaternion(hand.quaternion)); // the wrist
    const cuff = new THREE.Vector3(0, 0, -H.cuff * H.size).applyQuaternion(hand.quaternion).add(hand.position);
    cuffM.position.copy(cuff);
    cuffM.quaternion.copy(hand.quaternion);
    const arm = cuff.clone().sub(this.shoulder), len = arm.length();
    tmpM.lookAt(cuff.clone().add(arm), cuff, up);
    armM.position.copy(this.shoulder);
    armM.quaternion.setFromRotationMatrix(tmpM);
    armM.scale.set(1, 1, Math.max(0.05, len - 0.012));
  }

  /** `item`: the held thing (or null); `pet`: a world point on the cat being petted with the empty hand (#242), or null. */
  update(dt, item, pet = null) {
    const held = item?.held && item.model?.parent === this.camera;
    let show = false, grip = 0, spread = 0, hug = false;
    if (held && item.handPose === 'hug') { // both arms round it, a hand on each side (#269)
      item.model.updateMatrix();
      const [r, l] = item.hugGrips;
      this.pose(new THREE.Vector3(...r).applyMatrix4(item.model.matrix), 'hug');
      const pl = new THREE.Vector3(...l).applyMatrix4(item.model.matrix);
      pl.x = -pl.x; // into the mirrored frame
      this.pose(pl, 'hug', this.left);
      grip = H.hugCurl;
      show = hug = true;
      this.reachT = 1;
    } else if (held) {
      item.model.updateMatrix();
      const palm = item.handPose === 'palm';
      this.pose(this.gripOf(item).clone().applyMatrix4(item.model.matrix), palm ? 'palm' : 'grip');
      grip = item.handCurl ?? (palm ? H.palmCurl : item.grip ? 1 : H.boxCurl); // round a handle; a little cupped under a ball
      show = true;
      this.reachT = 1;
    } else if (pet) { // stroking the cat: the palm down on its head and back, the fingers relaxed
      this.camera.updateMatrixWorld();
      this.pose(this.camera.worldToLocal(pet.clone()), 'pet');
      grip = H.petCurl;
      show = true;
      this.reachT = 1;
    } else if (this.reachT < 1) {
      this.reachT = Math.min(1, this.reachT + dt / H.reachTime);
      const k = Math.sin(Math.PI * this.reachT);
      this.pose(this.low.clone().lerp(this.reachTo, k), 'reach'); // up from out of view, out to it and back
      spread = Math.min(1, k * 1.6); // the fingers open on the way out
      show = this.reachT < 1;
    }
    // the fingers ease towards the pose (closing round a thing just taken, opening for a reach)
    const inf = this.hand.morphTargetInfluences, a = Math.min(1, dt * 14);
    inf[0] += ((show ? grip : 0) - inf[0]) * a;
    inf[1] = spread;
    this.hand.visible = this.arm.visible = this.cuff.visible = show;
    const lInf = this.left.hand.morphTargetInfluences;
    lInf[0] = inf[0]; lInf[1] = inf[1];
    for (const m of Object.values(this.left)) m.visible = hug;
  }
}
