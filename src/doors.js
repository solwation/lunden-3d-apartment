import * as THREE from 'three';
import { DOOR_HEIGHT, DOOR_TRIM } from './config.js';

const SPEED = 3.0; // open/close animation, fraction per second
const handleMat = new THREE.MeshStandardMaterial({ color: 0xc9cdd0, metalness: 0.5, roughness: 0.28 });

const ease = (t) => t * t * (3 - 2 * t);

/** Hinged door. Open pose = the leaf as drawn on the plan, closed = across the gap. */
export class SwingDoor {
  constructor({ hinge, tip, wall }, y0, material, open, { glazed = false, glass, frame } = {}) {
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
    // the leaf fills the opening: world.js already leaves DOOR_TRIM.gap at hinge and latch
    const H = DOOR_HEIGHT - DOOR_TRIM.gap, L = this.len;
    // local frame: x = leaf thickness, y = up, z = from hinge along the leaf
    const part = (sx, sy, sz, px, py, pz, m) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
      mesh.position.set(px, py, pz);
      mesh.castShadow = m !== glass;
      mesh.receiveShadow = true;
      mesh.userData.door = this;
      this.object.add(mesh);
      return mesh;
    };
    if (glazed) {
      // aluminium-clad glazed door: frame + one glass pane (like the patio door in Peab's render)
      // slim aluminium frame, almost the whole leaf is clear glass
      const f = 0.07, b = 0.1;
      part(0.05, H, f, 0, H / 2, f / 2, frame);
      part(0.05, H, f, 0, H / 2, L - f / 2, frame);
      part(0.05, f, L, 0, H - f / 2, L / 2, frame);
      part(0.05, b, L, 0, b / 2, L / 2, frame);
      part(0.012, H - f - b, L - 2 * f, 0, b + (H - f - b) / 2, L / 2, glass);
    } else {
      part(0.04, H, L, 0, H / 2, L / 2, material);
    }
    // lever handle on both faces (Innerdörrshandtag Hoppe Stockholm, satin chrome): round rose,
    // neck, lever pointing towards the hinge
    const z = L - 0.065, y = 1.0;
    for (const s of [-1, 1]) {
      const rose = part(0.012, 0.052, 0.052, s * 0.026, y, z, handleMat);
      rose.geometry.dispose();
      rose.geometry = new THREE.CylinderGeometry(0.026, 0.026, 0.012, 20).rotateZ(Math.PI / 2);
      part(0.04, 0.016, 0.016, s * 0.05, y, z, handleMat);
      part(0.018, 0.018, 0.125, s * 0.07, y, z - 0.055, handleMat);
    }
    this.pickable = this.object;

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

  /** Centre of the doorway and its normal (plan x/z), from the closed pose. */
  opening() {
    const dx = Math.sin(this.closedAngle), dz = Math.cos(this.closedAngle);
    return { center: [this.hinge[0] + dx * this.len / 2, this.hinge[1] + dz * this.len / 2], normal: [dz, -dx] };
  }

  /** Collision segment of the leaf in its current pose. */
  segment() { return this.segAngle(this.angle); }

  /** Segment at animation state t (0 = closed, 1 = open). */
  segmentAt(t) { return this.segAngle(this.closedAngle + (this.openAngle - this.closedAngle) * t); }

  segAngle(a) {
    const [hx, hz] = this.hinge;
    return [hx, hz, hx + Math.sin(a) * this.len, hz + Math.cos(a) * this.len];
  }
}

/** A panel that slides along x or z between two positions (doors, wardrobe fronts). */
class Slider {
  constructor({ along, face, y, height, len, thickness = 0.04, closedPos, openPos, material, open = false }) {
    const geo = along
      ? new THREE.BoxGeometry(len, height, thickness)
      : new THREE.BoxGeometry(thickness, height, len);
    this.panel = new THREE.Mesh(geo, material);
    this.panel.castShadow = this.panel.receiveShadow = true;
    this.object = this.panel;
    this.pickable = this.panel;
    this.panel.userData.door = this;
    Object.assign(this, { along, face, y, len, closedPos, openPos });
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

  opening() {
    return this.along
      ? { center: [this.closedPos, this.face], normal: [0, 1] }
      : { center: [this.face, this.closedPos], normal: [1, 0] };
  }

  segment() { return this.segAt(this.pos); }

  segmentAt(t) { return this.segAt(this.closedPos + (this.openPos - this.closedPos) * t); }

  segAt(pos) {
    const h = this.len / 2;
    return this.along
      ? [pos - h, this.face, pos + h, this.face]
      : [this.face, pos - h, this.face, pos + h];
  }
}

/** Sliding door in a wall gap: runs on the face the plan arrow is drawn on, sliding `slideDir`. */
export class SlidingDoor extends Slider {
  constructor(gap, arrow, y0, material, open, slideDir, maxTravel = Infinity) {
    const along = gap.axis === 'x';
    const len = gap.hi - gap.lo + 0.06;
    const c = (gap.p0 + gap.p1) / 2;
    const arrowPerp = arrow ? (along ? arrow.head[1] : arrow.head[0]) : c + 1;
    const dir = slideDir ?? (arrow
      ? Math.sign(along ? arrow.head[0] - arrow.tail[0] : arrow.head[1] - arrow.tail[1]) || 1
      : 1);
    const mid = (gap.lo + gap.hi) / 2;
    super({
      along, len, material, open,
      face: arrowPerp > c ? gap.p1 + 0.03 : gap.p0 - 0.03,
      y: y0 + DOOR_HEIGHT / 2,
      height: DOOR_HEIGHT - 0.02,
      closedPos: mid,
      openPos: mid + dir * Math.min(len - 0.1, maxTravel),
    });
    this.kind = 'sliding';
  }
}

/**
 * Wardrobe front with two sliding panels on separate tracks. Opening a panel slides it
 * over the other one, like a real skjutdörrsgarderob.
 */
export function wardrobeDoors({ along, front, back, outward, a, b, y0, height, material }) {
  const half = (b - a) / 2;
  const len = half + 0.02;
  const mk = (track, closed, open) => {
    const door = new Slider({
      along, len, material, thickness: 0.02,
      face: front + outward * (0.015 + track * 0.025),
      y: y0 + height / 2, height: height - 0.02,
      closedPos: closed, openPos: open,
    });
    door.kind = 'wardrobe';
    door.name = 'garderobsdörren';
    door.wardrobe = { along, outward, back, y0 };
    return door;
  };
  const m0 = a + half / 2, m1 = b - half / 2;
  const pair = [mk(1, m0, m1), mk(0, m1, m0)];
  // only one side open at a time: opening one panel slides the other back
  pair.forEach((d, i) => {
    const other = pair[1 - i];
    d.toggle = () => {
      if (d.target === 0 && other.target === 1) other.target = 0;
      d.target = d.target === 1 ? 0 : 1;
    };
  });
  return pair;
}
