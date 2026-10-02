import * as THREE from 'three';
import { COURTYARD, GRILL as G } from './config.js';
import { sfx } from './audio.js';

// The kettle grill on the courtyard (#204): E lights it and puts it out. Lit, the lid swings open at the back and big
// flames lick up out of the kettle (additive flickering sprites), the coals glow, sparks rise and a little smoke
// drifts off; it crackles and roars (synthesised, positional) and casts a warm light (a pool light via
// lights.extra). It goes out by itself after GRILL.burnSeconds. It belongs to the courtyard, so F keeps it.

function flameTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 92, 2, 32, 80, 60);
  r.addColorStop(0, 'rgba(255,250,210,1)'); r.addColorStop(0.25, 'rgba(255,190,60,0.95)');
  r.addColorStop(0.6, 'rgba(255,80,10,0.55)'); r.addColorStop(1, 'rgba(160,20,0,0)');
  g.fillStyle = r;
  g.beginPath(); // a tongue: round at the bottom, pointed at the top
  g.moveTo(32, 2); g.bezierCurveTo(60, 50, 62, 92, 32, 124); g.bezierCurveTo(2, 92, 4, 50, 32, 2); g.fill();
  return new THREE.CanvasTexture(c);
}
function softTexture(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, inner); r.addColorStop(1, outer);
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Grill {
  constructor() {
    const { x, z } = COURTYARD.grill;
    Object.assign(this, { name: 'grillen', kind: 'grill', on: false, t: 0, burn: 0, k: 0, lidK: 0, crackleT: 0, roar: null });
    this.object = new THREE.Group();
    this.top = new THREE.Vector3(x, 0.86, z);
    // the lid (taken out of the courtyard's merged metal so it can open): hinged at the kettle's back rim (+z)
    this.lid = new THREE.Group();
    this.lid.position.set(x, 0.86, z + 0.3);
    const lidMesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2.4).translate(0, 0, -0.3),
      new THREE.MeshStandardMaterial({ color: 0x1d1e20, roughness: 0.5, metalness: 0.4 }));
    lidMesh.castShadow = true;
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.04, 10), lidMesh.material);
    knob.position.set(0, 0.24, -0.3);
    this.lid.add(lidMesh, knob);
    // glowing coals in the kettle
    this.coalMat = new THREE.MeshBasicMaterial({ map: softTexture('rgba(255,200,90,1)', 'rgba(140,20,0,0.0)'), color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const coals = new THREE.Mesh(new THREE.CircleGeometry(0.26, 24).rotateX(-Math.PI / 2), this.coalMat);
    coals.position.set(x, 0.8, z);
    coals.raycast = () => {};
    // flames, smoke and sparks
    const fmat = new THREE.SpriteMaterial({ map: flameTexture(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 });
    this.flames = [...Array(G.flames)].map((_, i) => {
      const s = new THREE.Sprite(fmat.clone());
      s.userData = { a: (i / G.flames) * Math.PI * 2 + Math.random(), r: 0.05 + Math.random() * 0.15, ph: Math.random() * 10, f: 6 + Math.random() * 6 };
      s.raycast = () => {};
      return s;
    });
    const smat = new THREE.SpriteMaterial({ map: softTexture('rgba(255,255,255,0.8)', 'rgba(255,255,255,0)'), color: 0x8a8d90, transparent: true, depthWrite: false, opacity: 0 });
    this.smoke = [...Array(6)].map((_, i) => { const s = new THREE.Sprite(smat.clone()); s.userData.ph = i / 6; s.raycast = () => {}; return s; });
    const n = G.sparks;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.sparkMat = new THREE.PointsMaterial({ size: 0.035, color: 0xffb040, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.sparks = new THREE.Points(geo, this.sparkMat);
    this.sparks.frustumCulled = false;
    this.sparks.raycast = () => {};
    this.sparkSeeds = [...Array(n)].map(() => ({ ph: Math.random(), dx: (Math.random() - 0.5) * 0.4, dz: (Math.random() - 0.5) * 0.4, life: 1.2 + Math.random() * 1.5 }));
    // E box round the kettle
    const pick = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.7), new THREE.MeshBasicMaterial());
    pick.position.set(x, 0.55, z);
    pick.visible = false;
    this.object.add(this.lid, coals, ...this.flames, ...this.smoke, this.sparks, pick);
    pick.userData.door = lidMesh.userData.door = knob.userData.door = this;
    this.pickable = this.object;
    // the warm light: a pool light while it burns (lights.js)
    this.lamp = { pos: new THREE.Vector3(x, 1.4, z), intensity: G.light, range: 9, color: 0xff9a40, level: 0, k: 0 };
  }

  get isOpen() { return this.on; }
  get verb() { return this.on ? 'släcka' : 'tända'; }

  toggle() { this.set(!this.on); }

  set(on) {
    if (on === this.on) return;
    this.on = on;
    this.burn = on ? G.burnSeconds : 0;
    if (on) sfx.ignite(this.top);
    else sfx.lid(this.top, false);
    this.roar?.stop(); this.roar = on ? sfx.fire(this.top) : null;
  }

  update(dt) {
    this.t += dt;
    if (this.on && (this.burn -= dt) <= 0) this.set(false); // burnt out
    this.k += Math.sign((this.on ? 1 : 0) - this.k) * Math.min(Math.abs((this.on ? 1 : 0) - this.k), dt * (this.on ? 0.8 : 0.5));
    this.lidK += Math.sign((this.on ? 1 : 0) - this.lidK) * Math.min(Math.abs((this.on ? 1 : 0) - this.lidK), dt * 1.5);
    this.lid.rotation.x = this.lidK * this.lidK * (3 - 2 * this.lidK) * 1.9; // swings up and back
    const k = this.k, flick = 0.85 + 0.15 * Math.sin(this.t * 23) * Math.sin(this.t * 7.3);
    this.lamp.k = k * flick;
    this.coalMat.color.setRGB(k * (0.8 + 0.2 * Math.sin(this.t * 3)), k * 0.55, k * 0.3);
    for (const s of this.flames) {
      const u = s.userData, h = (0.35 + 0.35 * (0.5 + 0.5 * Math.sin(this.t * u.f + u.ph))) * G.height * k;
      s.position.set(this.top.x + Math.cos(u.a + this.t * 0.6) * u.r, 0.8 + h / 2, this.top.z + Math.sin(u.a + this.t * 0.6) * u.r);
      s.scale.set(0.22 + 0.08 * Math.sin(this.t * 9 + u.ph), Math.max(0.001, h), 1);
      s.material.opacity = k * (0.65 + 0.35 * Math.sin(this.t * 13 + u.ph));
      s.visible = k > 0.01;
    }
    for (const s of this.smoke) {
      const p = (this.t / 4 + s.userData.ph) % 1;
      s.position.set(this.top.x + Math.sin(p * 5 + s.userData.ph * 9) * 0.1 + p * 0.4, 1.3 + p * 1.8, this.top.z + p * 0.2);
      s.scale.setScalar(0.3 + p * 0.8);
      s.material.opacity = k * 0.35 * Math.sin(Math.PI * p);
      s.visible = k > 0.01;
    }
    const pos = this.sparks.geometry.attributes.position;
    this.sparkSeeds.forEach((sd, i) => {
      const p = ((this.t / sd.life) + sd.ph) % 1;
      pos.setXYZ(i, this.top.x + sd.dx * p + Math.sin(this.t * 3 + i) * 0.03, 0.9 + p * 1.6, this.top.z + sd.dz * p);
    });
    pos.needsUpdate = true;
    this.sparkMat.opacity = k;
    this.sparks.visible = k > 0.01;
    if (this.on && (this.crackleT -= dt) <= 0) { sfx.crackle(this.top); this.crackleT = 0.15 + Math.random() * 0.45; }
  }
}
