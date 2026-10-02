import * as THREE from 'three';
import { Holdable } from './holdable.js';
import { sfx } from './audio.js';

// Small things in the living room you can take (#152): the wine bottles in the wine rack, the whisky bottles and
// glasses in the BESTÅ. Built by furniture.js (userData.things), turned into Holdables here: E takes one, E on a
// table top / worktop / the floor puts it down standing, E on its own place in the rack or cabinet puts it back.

const NAMES = { wine: 'vinflaskan', champagne: 'champagneflaskan', whisky: 'whiskyflaskan', glass: 'glaset' };
const HELD = {
  glass: { pos: [0.17, -0.2, -0.4], rot: [0.05, 0, 0] },
  bottle: { pos: [0.2, -0.32, -0.48], rot: [0.15, 0, -0.1] },
};

export class Thing extends Holdable {
  constructor(scene, camera, { model, kind, back }) {
    model.updateWorldMatrix(true, true);
    const pos = model.getWorldPosition(new THREE.Vector3());
    const rot = new THREE.Euler().setFromQuaternion(model.getWorldQuaternion(new THREE.Quaternion()));
    const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
    const held = HELD[kind === 'glass' ? 'glass' : 'bottle'];
    const name = NAMES[kind] ?? 'flaskan';
    super(scene, camera, {
      name, verb: 'ta', backName: back, backVerb: kind === 'glass' ? 'ställa tillbaka glaset i' : `lägga tillbaka ${name} i`, placeVerb: 'ställa ner', model,
      home: { pos, rot }, heldPose: { pos: new THREE.Vector3(...held.pos), rot: new THREE.Euler(...held.rot) },
      pick: { pos: mid, size: [size.x + 0.03, size.y + 0.03, size.z + 0.03] }, cooldown: 0.3,
    });
    Object.assign(this, { kind });
    this.rest = { q: new THREE.Quaternion(), lift: 0 }; // its origin is the bottom centre: put down standing
  }

  onTake() { sfx.click(this.where()); }
  onPut() { sfx.click(this.where()); }
}

/** Every bottle and glass furniture.js offers (world.things). */
export const buildThings = (scene, camera, list) => list.map((t) => new Thing(scene, camera, t));
