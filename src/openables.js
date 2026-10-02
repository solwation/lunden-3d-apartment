import * as THREE from 'three';
import { sfx } from './audio.js';

// Things in the house that open with E (#103): cabinet doors, drawers, flaps. One shared helper instead of
// a solution per cabinet. An Openable moves its `object` (a pivot group whose origin is the hinge / the
// closed position) between closed and open:
//   'hinge'  — turns about the vertical axis through the origin, up to `max` degrees, `sign` ±1 = which way
//   'flap'   — turns about a horizontal axis (`axis`, local) through the origin (a door hinged at the bottom)
//   'drawer' — slides by the vector `out` (metres, the pivot's parent space)
// `max` is the stop: the door halts there, flat against whatever is next to it (#116), it never swings on
// through a neighbour. E targets are kind 'cabinet' (main.js toggles them; not world.doors, so the cat
// never turns up in a drawer).

const ease = (t) => t * t * (3 - 2 * t);

export class Openable {
  constructor({ name, object, mode = 'hinge', sign = 1, max = 95, axis = [1, 0, 0], out = [0, 0, 0], speed = 2.4 }) {
    Object.assign(this, { name, object, mode, sign, max, speed, kind: 'cabinet', isOpen: false, t: 0, pickable: object });
    this.axis = new THREE.Vector3(...axis).normalize();
    this.out = new THREE.Vector3(...out);
    this.home = object.position.clone();
    this.homeQ = object.quaternion.clone();
    object.traverse((m) => { m.userData.door = this; });
  }

  toggle() {
    this.isOpen = !this.isOpen;
    const p = this.object.getWorldPosition(new THREE.Vector3());
    if (this.mode === 'drawer') sfx.slide(p, { dur: 0.22 });
    else sfx.cupboard(p, this.isOpen);
  }

  /** Pose at opening fraction e (0 closed … 1 open). */
  pose(e) {
    const o = this.object;
    if (this.mode === 'drawer') o.position.copy(this.home).addScaledVector(this.out, e);
    else {
      const axis = this.mode === 'hinge' ? new THREE.Vector3(0, 1, 0) : this.axis;
      o.quaternion.copy(this.homeQ).multiply(new THREE.Quaternion().setFromAxisAngle(axis, this.sign * e * THREE.MathUtils.degToRad(this.max)));
    }
  }

  update(dt) {
    const goal = this.isOpen ? 1 : 0;
    if (this.t === goal) return;
    this.t += Math.sign(goal - this.t) * Math.min(Math.abs(goal - this.t), dt * this.speed);
    this.pose(ease(this.t));
    if (this.contents) this.contents.visible = this.t > 0; // what is inside is only drawn while it is open (#228)
  }
}

/**
 * Wrap meshes built in world space (e.g. a Batch's merged meshes) into a pivot at world point `at`, so that
 * an Openable can turn / slide them. Returns the pivot (add it to the scene graph where the meshes were).
 */
export function pivotAround(meshes, at) {
  const pivot = new THREE.Group();
  pivot.position.copy(at);
  for (const m of meshes) {
    m.geometry.translate(-at.x, -at.y, -at.z);
    m.geometry.computeBoundingSphere();
    pivot.add(m);
  }
  return pivot;
}
