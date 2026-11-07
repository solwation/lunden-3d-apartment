import * as THREE from 'three';
import { Holdable, handBusy } from './holdable.js';
import { sfx } from './audio.js';
import { OVEN_TRAY as T } from './config.js';

// #1887: the oven tray (ugnsplåt). Oven food lies on it, never straight on the rack (the user: "när man kör saker i ugnen
// behöver man en plåt"). A Holdable whose home is the oven's upper rack (ovens.js `rack`, a child of its static `parts`, where
// the chicken roasted in #1219): E on it in the open oven takes it out, it goes down on a worktop / table like any held thing,
// food is put on it there or in the open oven, and E into the open oven with it in the hand slides it back. Food on it is a
// child of its model (`spot` = the top of its floor in that frame), so it rides along in the hand and back into the oven.
// The food code (fishfingers.js, fries.js, cookstores.js, chicken.js, fishing.js) reads it as its "oven": `open` = food can go
// on / come off it, `cooking` = it is in the shut, powered oven (as the oven door was read before), `shut` = in the closed oven.
// Its place (in the oven, put down, in the hand) is kept like any held thing (keep.js `things`); what lies on it keeps its
// own record and lands on it again wherever it was restored.

const UP = new THREE.Vector3(0, 1, 0);

function trayModel() {
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: T.color, roughness: 0.35, metalness: 0.2 });
  const box = (sx, sy, sz, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; g.add(b); };
  const floor = 0.004, r = T.rim;
  box(T.d, floor, T.w, 0, floor / 2, 0); // x = into the oven, z = across it
  box(T.d, T.h, r * 0.5, 0, T.h / 2, -T.w / 2 + r * 0.25); box(T.d, T.h, r * 0.5, 0, T.h / 2, T.w / 2 - r * 0.25);
  box(r * 0.5, T.h, T.w, -T.d / 2 + r * 0.25, T.h / 2, 0); box(r * 0.5, T.h, T.w, T.d / 2 - r * 0.25, T.h / 2, 0);
  return { g, floor };
}

export class OvenTray extends Holdable {
  /** door: the oven door (ovens.js: `parts`, `rack`, `cavity`). */
  constructor(scene, camera, door) {
    const { g, floor } = trayModel();
    door.parts.updateWorldMatrix(true, false);
    const local = { pos: door.rack.clone(), rot: new THREE.Euler() };
    super(scene, camera, {
      name: 'ugnsplåten', verb: 'ta ut', backName: 'ugnsplåten i ugnen', backVerb: 'skjuta in', model: g, door,
      home: { pos: door.parts.localToWorld(door.rack.clone()), rot: new THREE.Euler() }, local, homeParent: door.parts,
      heldPose: { pos: new THREE.Vector3(T.held.x, T.held.y, T.held.z), rot: new THREE.Euler(0.15, Math.PI / 2, 0, 'YXZ') },
      pick: { pos: door.parts.localToWorld(door.rack.clone().add(new THREE.Vector3(0, 0.08, 0))), size: [0.5, 0.22, 0.52] },
    });
    Object.assign(this, { isOvenTray: true, placeVerb: 'ställa ner', spot: new THREE.Vector3(0, floor, 0), own: new Set() });
    g.traverse((o) => this.own.add(o));
    const self = this;
    Object.defineProperties(this.takeTarget, {
      blocked: { get: () => handBusy(self) || (self.inOven && !self.doorOpen) },
      blockedText: { get: () => (handBusy(self) ? undefined : 'Öppna ugnen först') },
    });
    Object.defineProperties(this.backTarget, {
      blocked: { get: () => !self.doorOpen },
      blockedText: { get: () => 'Öppna ugnen först' },
    });
  }

  get doorOpen() { return !!this.door?.isOpen && this.door.t > 0.9; }
  /** On the oven's rack (its home). */
  get inOven() { return !!this.door && !this.held && !this.placed && this.model.parent === this.door.parts; }
  /** Food can go on / be taken off: put down somewhere, or in the open oven (not in the hand). */
  get open() { return !this.held && (this.placed || (this.inOven && this.doorOpen)); }
  /** In the closed oven (nothing escapes it: no smoke, no steam). */
  get shut() { return this.inOven && !this.door.isOpen; }
  /** In the shut, powered oven: what lies on it cooks (#1219's rule for the chicken). */
  get cooking() { return this.inOven && !this.door.isOpen && this.door.t < 0.05 && this.door.powered !== false; }
  /** Is `obj` the tray or something lying on it? */
  holds(obj) { for (let o = obj; o; o = o.parent) if (o === this.model) return true; return false; }
  /** Does anything lie on it (a visible mesh that is not the tray's own)? */
  get loaded() { let any = false; this.model.traverse((o) => { if (!any && o.isMesh && o.visible && !this.own.has(o)) any = true; }); return any; }

  /** Home = on the oven's upper rack, a child of its static parts (so the food on it is in the oven's frame). */
  goHome() {
    this.placed = false;
    if (!this.door) return; // (called by the base constructor before `door` is known)
    this.door.parts.add(this.model);
    this.model.position.copy(this.local.pos);
    this.model.rotation.copy(this.local.rot);
  }

  /** Flat on the surface, turned `yaw` (its own rest pose would count the food on it). */
  poseAt(obj, p, yaw = 0) {
    obj.quaternion.setFromAxisAngle(UP, yaw);
    obj.position.set(p.x, p.y + 0.001, p.z);
  }

  take() { // (E is gated by takeTarget.blocked; keep.js restores a put-down / held tray through take() whatever the door)
    super.take();
    sfx.cupboard?.(this.where(), true);
  }

  putBack() {
    if (!this.held) return;
    super.putBack();
    sfx.cupboard?.(this.where(), false);
  }

  placeAt(p, yaw) {
    if (!this.held) return;
    super.placeAt(p, yaw);
    sfx.cupboard?.(p, false);
  }
}
