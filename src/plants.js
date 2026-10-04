import * as THREE from 'three';
import { Holdable } from './holdable.js';
import { sfx } from './audio.js';
import { potModel } from './sillplants.js';

// The pots on the window boards can be lifted (#185). At home they are part of sillplants.js's few merged meshes;
// each also has a model of its own that is invisible there (its meshes hidden one by one: the raycaster still finds
// them, so E takes it). Taken, the merged meshes are rebuilt without it and its own model shows; put down elsewhere it
// stays its own small object; back home (E on its place, or F) it melts into the merged meshes again.

export class SillPot extends Holdable {
  constructor(scene, camera, pot, sillPlants, away) {
    const model = potModel(pot);
    const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3()).add(pot.base);
    super(scene, camera, {
      name: 'blomkrukan', verb: 'ta', backName: 'blomkrukan i fönstret', backVerb: 'ställa tillbaka', placeVerb: 'ställa ner', model,
      home: { pos: pot.base.clone(), rot: new THREE.Euler() },
      heldPose: { pos: new THREE.Vector3(0.16, -0.32, -0.5), rot: new THREE.Euler(0.1, 0, 0) },
      pick: { pos: mid, size: [size.x + 0.03, size.y + 0.03, size.z + 0.03] },
    });
    Object.assign(this, { pot, sillPlants, away });
    this.rest = { q: new THREE.Quaternion(), lift: 0 }; // its origin is the bottom of the pot: put down standing
    this.goHome();
  }

  /** Is this pot drawn by the merged meshes (at home, not held)? */
  setAway(away) {
    for (const m of this.model.children) m.visible = away; // the group itself is left alone (F toggles it)
    if (!this.away) return; // (the base constructor's goHome, before the rest is set up)
    if (away === this.away.has(this.pot)) return;
    if (away) this.away.add(this.pot); else this.away.delete(this.pot);
    this.sillPlants.userData.rebuild(this.away);
  }

  goHome() { super.goHome(); this.setAway(false); }
  take() { super.take(); if (this.held) { this.setAway(true); sfx.click(this.where()); } }
  placeAt(p, yaw) { super.placeAt(p, yaw); sfx.click(p); }
}

/** A SillPot for every pot on the window boards (world.sillPlants). */
export function buildSillPots(scene, camera, sillPlants) {
  const away = new Set();
  return sillPlants.userData.pots.map((p) => new SillPot(scene, camera, p, sillPlants, away));
}
