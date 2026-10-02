import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HAND as H } from './config.js';

// The visitor's right arm and hand (#195): a low-poly sleeve and a skin-coloured hand, children of the camera,
// in the lower right of the view. Hidden while the hand is empty. Holding something (holdable.js, a cup), the
// palm sits against the held thing's grip point — `grip` ([x, y, z] in the thing's own frame) if it has one, else
// beside the middle of its box — and follows it as it swings, tips or is drunk from. E on a door, a cabinet, a
// tap, a switch …: the arm reaches out towards it (~0.35 s) and back. Two meshes, no shadows.

const skin = new THREE.MeshStandardMaterial({ color: H.skin, roughness: 0.7 });
const sleeve = new THREE.MeshStandardMaterial({ color: H.sleeve, roughness: 0.85 });

/** The hand: wrist at the origin, fingers towards +z, the palm facing −x (it holds things on its left). */
function handGeometry() {
  const parts = [];
  const box = (sx, sy, sz, x, y, z, rx = 0, ry = 0) => parts.push(new THREE.BoxGeometry(sx, sy, sz).rotateX(rx).rotateY(ry).translate(x, y, z));
  box(0.026, 0.075, 0.085, 0, 0, 0.05);                       // palm (thin in x)
  for (let i = 0; i < 4; i++) box(0.018, 0.016, 0.05, -0.016, 0.026 - i * 0.018, 0.105, 0, -0.55); // fingers curling round to −x
  box(0.018, 0.018, 0.045, -0.02, -0.042, 0.04, 0.5, -0.3);    // thumb, below
  return mergeGeometries(parts.map((g) => g.toNonIndexed())).scale(0.85, 0.85, 0.85).rotateZ(Math.PI); // (in Hand.pose the local −x ends up on the right: turned, the palm faces left and the thumb is on top)
}

const tmpBox = new THREE.Box3(), tmpM = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0);

export class Hand {
  constructor(camera, scene) {
    this.camera = camera;
    if (!camera.parent) scene.add(camera); // children of the camera only render in the scene
    this.hand = new THREE.Mesh(handGeometry(), skin);
    this.arm = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.046, 1, 9, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2), sleeve); // length 1 along +z
    for (const m of [this.hand, this.arm]) { m.visible = false; m.castShadow = false; m.renderOrder = 1; m.raycast = () => {}; m.frustumCulled = false; camera.add(m); }
    this.shoulder = new THREE.Vector3(...H.shoulder);
    this.rest = new THREE.Vector3(...H.rest);
    this.low = this.rest.clone().add(new THREE.Vector3(0.05, -0.25, 0.12)); // below the view
    this.reachT = 1;
    this.reachTo = new THREE.Vector3();
    this.grips = new WeakMap();
  }

  get visible() { return this.hand.visible; }

  /** The grip of a held thing, in its model's frame: its own `grip`, or beside the middle of its box. */
  gripOf(item) {
    if (this.grips.has(item)) return this.grips.get(item);
    let g;
    if (item.grip) g = new THREE.Vector3(...item.grip);
    else {
      const m = item.model, parent = m.parent, pos = m.position.clone(), q = m.quaternion.clone();
      m.removeFromParent(); m.position.set(0, 0, 0); m.quaternion.identity(); m.updateMatrixWorld(true);
      tmpBox.setFromObject(m);
      const c = tmpBox.getCenter(new THREE.Vector3()), s = tmpBox.getSize(new THREE.Vector3());
      g = new THREE.Vector3(c.x + Math.min(s.x / 2, 0.06) + 0.02, tmpBox.min.y + Math.min(s.y * 0.35, 0.08), c.z + 0.01); // just outside its right side, low
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

  /** Place the palm at `palm` (camera space) with the arm coming from the shoulder. */
  pose(palm) {
    const dir = palm.clone().sub(this.shoulder);
    const len = dir.length();
    dir.normalize();
    const wrist = palm.clone().addScaledVector(dir, -0.05);
    this.hand.position.copy(wrist);
    tmpM.lookAt(wrist.clone().add(dir), wrist, up); // its z axis = eye − target = along the arm
    this.hand.quaternion.setFromRotationMatrix(tmpM);
    this.arm.position.copy(this.shoulder);
    this.arm.quaternion.copy(this.hand.quaternion);
    this.arm.scale.set(1, 1, Math.max(0.05, len - 0.05));
  }

  update(dt, item) {
    const held = item?.held && item.model?.parent === this.camera;
    let show = false;
    if (held) {
      item.model.updateMatrix();
      this.pose(this.gripOf(item).clone().applyMatrix4(item.model.matrix));
      show = true;
      this.reachT = 1;
    } else if (this.reachT < 1) {
      this.reachT = Math.min(1, this.reachT + dt / H.reachTime);
      const k = Math.sin(Math.PI * this.reachT);
      this.pose(this.low.clone().lerp(this.reachTo, k)); // up from out of view, out to it and back
      show = this.reachT < 1;
    }
    this.hand.visible = this.arm.visible = show;
  }
}
