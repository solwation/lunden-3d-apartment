import * as THREE from 'three';

// Things you can take down and hold (#78, #86, #87, #89): the lightsaber, the Nerf blasters, the magic
// wands, the flashlight. Each has a home (hooks, a rack, a shelf) with an invisible pick box, a model
// that sits there, and a pose in the view while it is held (a child of the camera). E on it takes it;
// E on its home puts it back, E on a table top / worktop / the floor puts it down there (#102), and it is
// taken again with E on it. One thing in the hand at a time: while you hold something, other things
// can't be taken (their target is `blocked`). "Use" = a click, the touch action button when nothing else
// is aimed at, and — for things you swing — looking around fast. Subclasses fill in onTake / onPut /
// onUse / tick. The cups (cups.js) share setHeld / placeAt.

let current = null;
/** The item in the visitor's hand, or null. */
export const heldItem = () => current;
/** Take `item` into the hand (null = empty hand); anything still held goes home (cups, #90). */
export function setHeld(item) {
  const prev = current;
  current = item; // first, so the previous item's putBack does not come back here for itself
  if (prev && prev !== item) prev.putBack();
}
/** Is the hand busy with something other than `item`? (#102: put that down first) */
export const handBusy = (item) => !!current && current !== item;

const tmpBox = new THREE.Box3();
/**
 * How a thing lies on a surface (#102), from its own shape: the longest side along the surface, the
 * shortest straight up. Returns { q, lift }: the rest rotation and how far its origin sits above the top.
 */
export function restPose(model) {
  const parent = model.parent, pos = model.position.clone(), quat = model.quaternion.clone();
  model.removeFromParent();
  model.position.set(0, 0, 0); model.quaternion.identity(); model.updateMatrixWorld(true);
  const size = tmpBox.setFromObject(model).getSize(new THREE.Vector3());
  const up = [0, 1, 2].sort((a, b) => size.getComponent(a) - size.getComponent(b))[0];
  const q = new THREE.Quaternion();
  if (up === 0) q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);      // x → y
  else if (up === 2) q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2); // z → y
  model.quaternion.copy(q); model.updateMatrixWorld(true);
  const lift = -tmpBox.setFromObject(model).min.y;
  model.position.copy(pos); model.quaternion.copy(quat);
  parent?.add(model);
  return { q, lift };
}

export class Holdable {
  /**
   * opts: { name, verb, backName, backVerb, model (Object3D), home: { pos, rot }, heldPose: { pos, rot },
   *   pick: { pos, size } (the home's E box, world), parts (Object3D[] of the home: hooks …), swing
   *   (rad/s of looking that counts as a use, or 0), cooldown (s), useLabel (touch button text) }
   */
  constructor(scene, camera, opts) {
    Object.assign(this, { scene, camera, held: false, t: 0, uses: 0, cool: 0, lastYaw: 0, lastPitch: 0, ...opts });
    this.holder = new THREE.Group();
    for (const p of opts.parts ?? []) this.holder.add(p);
    const pick = new THREE.Mesh(new THREE.BoxGeometry(...opts.pick.size), new THREE.MeshBasicMaterial());
    pick.position.copy(opts.pick.pos);
    pick.visible = false;
    this.holder.add(pick);
    scene.add(this.holder);
    const self = this;
    this.takeTarget = { name: opts.name, kind: 'holdable', verb: opts.verb ?? 'ta', pickable: this.model, item: this, get blocked() { return handBusy(self); }, toggle: () => this.take() };
    this.backTarget = { name: opts.backName, kind: 'holdable', verb: opts.backVerb, pickable: pick, toggle: () => this.putBack() };
    this.model.traverse((m) => { m.userData.door = this.takeTarget; });
    pick.userData.door = this.backTarget;
    this.goHome();
  }

  /** The E target now: the thing at home, or its empty home while it is held. */
  get target() { return this.held ? this.backTarget : this.takeTarget; }

  goHome() {
    this.placed = false;
    this.scene.add(this.model);
    this.model.position.copy(this.home.pos);
    this.model.rotation.copy(this.home.rot);
  }

  /** Put it down at world point `p` on a horizontal surface (#102): lying on its side, a random turn. */
  placeAt(p) {
    if (!this.held) return;
    this.held = false;
    if (current === this) current = null;
    this.onPut?.();
    this.rest ??= restPose(this.model);
    this.scene.add(this.model);
    this.model.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2).multiply(this.rest.q);
    this.model.position.set(p.x, p.y + this.rest.lift + 0.001, p.z);
    this.placed = true;
  }

  take() {
    if (handBusy(this)) return; // one thing at a time (#102)
    setHeld(this);
    this.held = true;
    this.placed = false;
    if (!this.camera.parent) this.scene.add(this.camera); // children of the camera only render in the scene
    this.camera.add(this.model);
    this.model.position.copy(this.heldPose.pos);
    this.model.rotation.copy(this.heldPose.rot);
    this.t = 0;
    this.lastYaw = this.camera.rotation.y; this.lastPitch = this.camera.rotation.x;
    this.onTake?.();
  }

  putBack() {
    if (!this.held) return;
    this.held = false;
    if (current === this) current = null;
    this.onPut?.();
    this.goHome();
  }

  /** Click / touch button / a fast look. */
  use(speed = 0) {
    if (!this.held || this.cool > 0) return;
    this.cool = this.cooldown ?? 0.3;
    this.uses++;
    this.onUse?.(speed);
  }

  /** The model's position in the world (sounds, particles). */
  where(out = new THREE.Vector3()) { return this.model.getWorldPosition(out); }

  update(dt) {
    this.cool -= dt;
    if (!this.held) { this.idle?.(dt); return; }
    this.t += dt;
    let speed = 0;
    if (dt > 0) {
      let dy = this.camera.rotation.y - this.lastYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      speed = Math.hypot(dy, this.camera.rotation.x - this.lastPitch) / dt;
      if (this.swing && speed > this.swing) this.use(speed);
    }
    this.lastYaw = this.camera.rotation.y; this.lastPitch = this.camera.rotation.x;
    this.tick?.(dt, speed);
  }
}
