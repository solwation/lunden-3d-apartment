import * as THREE from 'three';
import { Holdable } from './holdable.js';
import { sfx } from './audio.js';
import { PAN as P } from './config.js';

// The frying pan (#159), a Holdable that lives in the middle drawer under the hob: it rides with the drawer
// (a child of it), so it is only reachable with the drawer open. E on the hob with the pan in the hand stands
// it on the big front zone (main.js); it also goes down on worktops, tables and the floor, and back into its
// drawer with E there. `onHob` tells the chicken (#160) that it stands on the zone.

function panModel() {
  const g = new THREE.Group();
  const r = P.d / 2, black = new THREE.MeshStandardMaterial({ color: P.color, roughness: 0.45, metalness: 0.3, side: THREE.DoubleSide });
  const body = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [r - 0.025, 0], [r - 0.012, 0.004], [r - 0.004, P.h * 0.5], [r, P.h], [r - 0.004, P.h]].map(([x, y]) => new THREE.Vector2(x, y)), 40), black);
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, P.handle, 12).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: P.handleColor, roughness: 0.6 }));
  handle.position.set(r + P.handle / 2 - 0.01, P.h * 0.8, 0); handle.rotation.z = 0.12; // along +x, tipped up a little
  handle.castShadow = true;
  g.add(handle);
  return g;
}

export class Pan extends Holdable {
  /** drawer: the Openable it lives in (world.panDrawer); hob: world.hob. */
  constructor(scene, camera, drawer, hob) {
    const model = panModel();
    const n = drawer.normal; // the drawer's front faces this way; into the cabinet is −n
    const along = new THREE.Vector3(-n.z, 0, n.x);
    const home = new THREE.Vector3().addScaledVector(n, -P.home.in).addScaledVector(along, P.home.along).setY(0.03); // drawer-local
    const homeRot = new THREE.Euler(0, Math.atan2(-along.z, along.x), 0); // the handle along the run
    super(scene, camera, {
      name: 'stekpannan', verb: 'ta', backName: 'stekpannan i lådan', backVerb: 'lägga tillbaka',
      model, home: { pos: home, rot: homeRot },
      heldPose: { pos: new THREE.Vector3(P.held.x, P.held.y, P.held.z), rot: new THREE.Euler(0.55, -Math.PI / 2 + 0.35, 0, 'YXZ') }, // handle towards you, a little to the right
      pick: { pos: home.clone().setY(home.y + 0.04), size: [0.3, 0.1, 0.3] },
    });
    Object.assign(this, { drawer, hob, onHob: false, placeVerb: 'ställa ner' });
    this.goHome();
  }

  /** At home the pan is a child of the drawer (it slides out with it); the pick box follows the drawer too. */
  goHome() {
    this.placed = false; this.onHob = false;
    if (!this.drawer) return; // (called by the base constructor before the drawer is known)
    this.drawer.object.add(this.model);
    this.model.position.copy(this.home.pos);
    this.model.rotation.copy(this.home.rot);
  }

  placeAt(p) {
    if (!this.held) return;
    super.placeAt(p);
    this.model.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI); // upright, the handle towards the room (−x)
    this.onHob = !!this.hob && p.distanceTo(this.hob.zone) < 0.05;
    sfx.cupboard(p, false);
  }

  take() { super.take(); this.onHob = false; }

  update(dt) { // the pick box (in the scene) follows the drawer while it slides
    this.drawer.object.getWorldPosition(this.holder.position);
    super.update(dt);
  }
}
