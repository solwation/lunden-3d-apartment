import * as THREE from 'three';
import { DOOR_HEIGHT } from './config.js';

const SPEED = 3.0; // open/close animation, fraction per second

const ease = (t) => t * t * (3 - 2 * t);

/** Hinged door. Open pose = the leaf as drawn on the plan, closed = across the gap. */
export class SwingDoor {
  constructor({ hinge, tip, wall }, y0, material, open) {
    this.kind = 'swing';
    this.hinge = hinge;
    this.len = Math.hypot(tip[0] - hinge[0], tip[1] - hinge[1]);
    this.openAngle = Math.atan2(tip[0] - hinge[0], tip[1] - hinge[1]);
    let closed = Math.atan2(wall[0] - hinge[0], wall[1] - hinge[1]);
    // rotate the short way
    while (closed - this.openAngle > Math.PI) closed -= 2 * Math.PI;
    while (closed - this.openAngle < -Math.PI) closed += 2 * Math.PI;
    this.closedAngle = closed;

    this.object = new THREE.Group();
    this.object.position.set(hinge[0], y0, hinge[1]);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.04, DOOR_HEIGHT - 0.02, this.len - 0.01), material);
    leaf.position.set(0, DOOR_HEIGHT / 2, this.len / 2);
    leaf.castShadow = leaf.receiveShadow = true;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x9aa0a4, metalness: 0.8, roughness: 0.3 }));
    handle.position.set(0, 1.0, this.len - 0.1);
    this.object.add(leaf, handle);
    this.pickable = leaf;
    leaf.userData.door = this;

    this.t = open ? 1 : 0; // 0 = closed, 1 = open
    this.target = this.t;
    this.apply();
  }

  get isOpen() { return this.target === 1; }
  toggle() { this.target = this.target === 1 ? 0 : 1; }

  update(dt) {
    if (this.t === this.target) return;
    const step = SPEED * dt * 0.6;
    this.t = this.target > this.t ? Math.min(this.target, this.t + step) : Math.max(this.target, this.t - step);
    this.apply();
  }

  apply() {
    const a = this.closedAngle + (this.openAngle - this.closedAngle) * ease(this.t);
    this.angle = a;
    this.object.rotation.y = a;
  }

  /** Collision segment of the leaf in its current pose. */
  segment() {
    const [hx, hz] = this.hinge;
    return [hx, hz, hx + Math.sin(this.angle) * this.len, hz + Math.cos(this.angle) * this.len];
  }
}

/** Sliding door: a panel on one face of the wall that runs along it (direction from the plan arrow). */
export class SlidingDoor {
  constructor(gap, arrow, y0, material, open) {
    this.kind = 'sliding';
    const along = gap.axis === 'x';
    const len = gap.hi - gap.lo + 0.06;
    // which face: the side of the wall the plan arrow is drawn on
    const c = (gap.p0 + gap.p1) / 2;
    const arrowPerp = arrow ? (along ? arrow.head[1] : arrow.head[0]) : c + 1;
    const face = arrowPerp > c ? gap.p1 + 0.03 : gap.p0 - 0.03;
    const dir = arrow
      ? Math.sign(along ? arrow.head[0] - arrow.tail[0] : arrow.head[1] - arrow.tail[1]) || 1
      : 1;
    const mid = (gap.lo + gap.hi) / 2;

    const geo = along
      ? new THREE.BoxGeometry(len, DOOR_HEIGHT - 0.02, 0.04)
      : new THREE.BoxGeometry(0.04, DOOR_HEIGHT - 0.02, len);
    this.panel = new THREE.Mesh(geo, material);
    this.panel.castShadow = this.panel.receiveShadow = true;
    this.object = this.panel;
    this.pickable = this.panel;
    this.panel.userData.door = this;
    this.along = along;
    this.face = face;
    this.y = y0 + DOOR_HEIGHT / 2;
    this.closedPos = mid;
    this.openPos = mid + dir * (len - 0.1);
    this.len = len;

    this.t = open ? 1 : 0;
    this.target = this.t;
    this.apply();
  }

  get isOpen() { return this.target === 1; }
  toggle() { this.target = this.target === 1 ? 0 : 1; }

  update(dt) {
    if (this.t === this.target) return;
    const step = SPEED * dt * 0.7;
    this.t = this.target > this.t ? Math.min(this.target, this.t + step) : Math.max(this.target, this.t - step);
    this.apply();
  }

  apply() {
    this.pos = this.closedPos + (this.openPos - this.closedPos) * ease(this.t);
    if (this.along) this.panel.position.set(this.pos, this.y, this.face);
    else this.panel.position.set(this.face, this.y, this.pos);
  }

  segment() {
    const h = this.len / 2;
    return this.along
      ? [this.pos - h, this.face, this.pos + h, this.face]
      : [this.face, this.pos - h, this.face, this.pos + h];
  }
}
