import * as THREE from 'three';

// Things you can take down and hold (#78, #86, #87, #89): the lightsaber, the Nerf blasters, the magic
// wands, the flashlight. Each has a home (hooks, a rack, a shelf) with an invisible pick box, a model
// that sits there, and a pose in the view while it is held (a child of the camera). E on it takes it
// (whatever else was held goes home first: one thing at a time); E on its home puts it back. "Use" =
// a click, the touch action button when nothing else is aimed at, and — for things you swing — looking
// around fast. Subclasses fill in onTake / onPut / onUse / tick.

let current = null;
/** The item in the visitor's hand, or null. */
export const heldItem = () => current;

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
    this.takeTarget = { name: opts.name, kind: 'holdable', verb: opts.verb ?? 'ta', pickable: this.model, toggle: () => this.take() };
    this.backTarget = { name: opts.backName, kind: 'holdable', verb: opts.backVerb, pickable: pick, toggle: () => this.putBack() };
    this.model.traverse((m) => { m.userData.door = this.takeTarget; });
    pick.userData.door = this.backTarget;
    this.goHome();
  }

  /** The E target now: the thing at home, or its empty home while it is held. */
  get target() { return this.held ? this.backTarget : this.takeTarget; }

  goHome() {
    this.scene.add(this.model);
    this.model.position.copy(this.home.pos);
    this.model.rotation.copy(this.home.rot);
  }

  take() {
    if (current && current !== this) current.putBack();
    current = this;
    this.held = true;
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
