import * as THREE from 'three';
import { sfx } from './audio.js';

// Running water: every tap and shower outlet (world.taps, from interior.js) can be turned on
// with E. A tap pours a thin stream into its basin, a shower sprays a cone onto the floor,
// with a splash ring and a positional hiss until it is turned off.

function streakTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(255,255,255,${0.4 + Math.random() * 0.6})`;
    g.fillRect(Math.random() * 64, Math.random() * 256, 1 + Math.random() * 2, 20 + Math.random() * 60);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const tex = streakTexture();
const waterMat = new THREE.MeshStandardMaterial({
  color: 0xd6ecf7, map: tex, transparent: true, opacity: 0.7, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide,
});
const splashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false });

export class Tap {
  constructor(spec) {
    Object.assign(this, { name: spec.name, kind: 'tap', isOpen: false, spec });
    const [x, y, z] = spec.pos, len = Math.max(0.05, y - spec.basin);
    this.object = new THREE.Group();
    this.object.position.set(x, y, z);
    // stream: thin column for taps, spray cone along `dir` for showers
    const geo = spec.shower
      ? new THREE.CylinderGeometry(spec.r * 0.9, spec.r * 0.9 + len * 0.35, len, 20, 1, true)
      : new THREE.CylinderGeometry(Math.max(spec.r, 0.009), Math.max(spec.r, 0.009) * 0.75, len, 10, 1, true);
    geo.translate(0, -len / 2, 0);
    const [dx, dy, dz] = spec.dir;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(dx, dy, dz).normalize());
    geo.applyQuaternion(q);
    this.stream = new THREE.Mesh(geo, waterMat);
    this.stream.renderOrder = 2;
    this.splash = new THREE.Mesh(new THREE.RingGeometry(0.01, spec.shower ? 0.2 : 0.03, 24).rotateX(-Math.PI / 2), splashMat);
    // where the stream lands
    const k = len / Math.max(0.2, -dy);
    this.splash.position.set(dx * k, -len + 0.003, dz * k);
    this.stream.visible = this.splash.visible = false;
    this.object.add(this.stream, this.splash);
    // invisible pick target on the mixer (raycasts ignore visibility)
    const pick = new THREE.Mesh(new THREE.SphereGeometry(spec.shower ? 0.12 : 0.07, 8, 6), new THREE.MeshBasicMaterial());
    pick.visible = false;
    const [px, py, pz] = spec.pick ?? spec.pos;
    pick.position.set(px - x, py - y + (spec.pick ? 0 : 0.05), pz - z);
    pick.userData.door = this;
    this.object.add(pick);
    this.pickable = pick;
    this.t = 0;
    this.sound = null;
  }

  get verb() { return this.isOpen ? 'stänga av' : 'sätta på'; }

  toggle() {
    this.isOpen = !this.isOpen;
    this.stream.visible = this.splash.visible = this.isOpen;
    const [x, y, z] = this.spec.pos;
    if (this.isOpen) this.sound = sfx.water({ x, y: this.spec.basin + 0.2, z }, this.spec.shower);
    else { this.sound?.stop(); this.sound = null; }
  }

  update(dt) {
    if (!this.isOpen) return;
    this.t += dt;
    const s = 1 + 0.15 * Math.sin(this.t * 23);
    this.splash.scale.set(s, 1, s);
  }
}

/** Scroll the shared water texture (call once per frame). */
export function animateWater(dt) {
  tex.offset.y -= dt * 2.2;
}
