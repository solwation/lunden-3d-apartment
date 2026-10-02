import * as THREE from 'three';
import { RIFLE as R, LEVELS } from './config.js';
import { sfx } from './audio.js';
import { Trinket, KINDS } from './things.js';

// The AK-47 in the NORDLI chest in Sovrum 1's Klk (#196): a low-poly folding-stock AKMS (the stock folded so it fits
// the wide bottom drawer) — wooden handguard and grip, black steel, a curved magazine. A Trinket (things.js): it
// rides with its drawer while at home, E takes it, it can be put down like the other things. Click = one shot,
// held (mouse button / the touch button) = automatic fire at R.rpm; a short muzzle flash, a crack (sfx.gunshot).
// Shots are hitscan from the eye: a bullet hole where they land (marks.js 'hole'), the lawn target scores (#99),
// the cat meows. After R.mag shots the empty magazine is pulled out and dropped (it lies on the floor until F or
// R.magLife s), a fresh one clicks in; no shooting while reloading.

const steel = new THREE.MeshStandardMaterial({ color: 0x1d1e20, roughness: 0.45, metalness: 0.6 });
const wood = new THREE.MeshStandardMaterial({ color: 0x8a4b25, roughness: 0.6 });
const magMat = new THREE.MeshStandardMaterial({ color: 0x2a2624, roughness: 0.55, metalness: 0.3 });
const box = (sx, sy, sz, x, y, z, m, g) => { const o = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
const cyl = (r, h, x, y, z, m, g) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 10).rotateX(Math.PI / 2), m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };

/** A curved 30-round magazine: segments that bend forward as they go down (origin at the mag well). */
function magazine() {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const a = i * 0.11, seg = box(0.026, 0.04, 0.06, 0, 0, 0, magMat, g);
    seg.position.set(0, -0.02 - i * 0.034, -0.012 - Math.sin(a) * 0.05 * i * 0.4);
    seg.rotation.x = -a;
  }
  return g;
}

/** The rifle, built upright with the barrel along −z; origin in the middle of the receiver. */
export function rifleModel() {
  const g = new THREE.Group();
  box(0.034, 0.05, 0.24, 0, 0, 0, steel, g);                       // receiver
  box(0.03, 0.012, 0.22, 0, 0.03, 0.005, steel, g);                // dust cover
  box(0.04, 0.05, 0.17, 0, -0.004, -0.2, wood, g);                 // lower handguard
  box(0.032, 0.022, 0.15, 0, 0.034, -0.19, wood, g);               // upper handguard (over the gas tube)
  cyl(0.0085, 0.27, 0, 0.004, -0.39, steel, g);                    // barrel
  cyl(0.011, 0.04, 0, 0.004, -0.53, steel, g);                     // muzzle brake
  box(0.008, 0.035, 0.012, 0, 0.032, -0.48, steel, g);              // front sight post
  box(0.03, 0.02, 0.03, 0, 0.012, -0.47, steel, g);                // front sight block
  const grip = box(0.026, 0.09, 0.034, 0, -0.062, 0.09, wood, g); grip.rotation.x = -0.3; // pistol grip
  box(0.022, 0.006, 0.05, 0, -0.035, 0.045, steel, g);             // trigger guard
  box(0.006, 0.02, 0.006, 0, -0.03, 0.05, steel, g);               // trigger
  // the underfolding stock, folded: two struts along the underside and a shoulder plate under the handguard
  for (const s of [-1, 1]) box(0.006, 0.008, 0.26, s * 0.016, -0.035, -0.02, steel, g);
  box(0.034, 0.03, 0.008, 0, -0.04, -0.15, steel, g);
  const mag = magazine();
  mag.position.set(0, -0.026, -0.04);
  g.add(mag);
  // the muzzle flash: two crossed additive quads, hidden but for a frame or two per shot
  const flashTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), r = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,250,220,1)'); r.addColorStop(0.3, 'rgba(255,200,90,0.9)'); r.addColorStop(1, 'rgba(255,120,20,0)');
    x.fillStyle = r; x.beginPath();
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, rr = i % 2 ? 12 : 32; x.lineTo(32 + Math.cos(a) * rr, 32 + Math.sin(a) * rr); }
    x.fill();
    return new THREE.CanvasTexture(c);
  })();
  const fm = new THREE.MeshBasicMaterial({ map: flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const flash = new THREE.Group();
  for (const a of [0, Math.PI / 2]) { const q = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), fm); q.rotation.z = a; q.raycast = () => {}; flash.add(q); }
  const side = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.16), fm); side.rotation.x = Math.PI / 2; side.raycast = () => {}; flash.add(side);
  flash.position.set(0, 0.004, -0.6);
  flash.visible = false;
  g.add(flash);
  return { g, mag, flash };
}

export class Rifle extends Trinket {
  constructor(scene, camera, opts) {
    super(scene, camera, opts);
    const { mag, flash } = opts.parts;
    Object.assign(this, { isRifle: true, shoots: true, hitsTarget: true, useLabel: 'Skjut', mag, flash, ammo: R.mag, firing: false,
      fireT: 0, trigAt: -1e9, flashT: 0, kick: 0, reload: -1, drops: [], shots: 0, cooldown: 0 });
    this.heldPose = { pos: new THREE.Vector3(R.held.x, R.held.y, R.held.z), rot: new THREE.Euler(0.02, 0.03, 0) };
    this.rest = { q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2), lift: 0.022 }; // down on its side
    this.magHome = mag.position.clone();
    // the "put it back" box: round the gun itself (Trinket centres it on the origin, which pokes out of the drawer)
    flash.removeFromParent();
    this.model.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(this.model, true), inv = opts.homeParent.matrixWorld.clone().invert();
    this.model.add(flash);
    box.applyMatrix4(inv);
    const pick = this.backTarget.pickable;
    pick.geometry.dispose();
    pick.geometry = new THREE.BoxGeometry(...box.getSize(new THREE.Vector3()).toArray());
    box.getCenter(pick.position);
  }

  /** Mouse button / touch button down or up (main.js): automatic fire while it is held. */
  trigger(on) {
    if (!this.held) { this.firing = false; return; }
    if (on && !this.firing) { this.trigAt = performance.now(); if (this.fireT <= 1e-6) this.shoot(); }
    this.firing = on;
  }

  /** A click without a press (keyboard / a tap): one shot, unless the press already fired it. */
  use() {
    if (!this.held || performance.now() - this.trigAt < 400) return;
    this.shoot();
  }

  shoot() {
    if (this.reload >= 0 || this.ammo <= 0 || this.fireT > 1e-6) return;
    this.ammo--;
    this.shots++;
    this.fireT = Math.max(0, this.fireT) + 60 / R.rpm; // keeps the rate exact whatever the frame time
    this.flashT = 0.045;
    this.flash.rotation.z = Math.random() * Math.PI;
    this.kick = 1;
    sfx.gunshot(this.where());
    // hitscan from the eye along the view, with a little spread
    const cam = this.camera, from = cam.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3((Math.random() - 0.5) * R.spread, (Math.random() - 0.5) * R.spread, -1).normalize().applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()));
    const h = this.marks?.hit(from, from.clone().addScaledVector(dir, R.range));
    if (h) {
      if (h.cat) this.cat?.meowNow?.();
      else if (h.object.userData.target) { h.object.userData.target.hit(h.point, from); this.marks.add('hole', h, { force: true }); }
      else this.marks.add('hole', h, { force: true });
    }
    this.onShot?.();
    if (this.ammo === 0) this.reloadIn = R.reloadDelay;
  }

  /** The empty magazine falls out of the hand to the floor; it stays there a while. */
  dropMag() {
    this.mag.updateWorldMatrix(true, true);
    const m = magazine();
    this.mag.matrixWorld.decompose(m.position, m.quaternion, m.scale);
    const p = m.position;
    const floor = p.y > LEVELS[1].floor + 0.3 ? LEVELS[1].floor : LEVELS[0].floor;
    this.scene.add(m);
    this.drops.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 0.4, -0.3, (Math.random() - 0.5) * 0.4), spin: (Math.random() - 0.5) * 6, floor, age: 0, down: false });
    while (this.drops.length > R.maxDrops) this.drops.shift().m.removeFromParent();
    sfx.magOut(this.where());
  }

  /** F: the dropped magazines go, a full one in. */
  reset() {
    for (const d of this.drops) d.m.removeFromParent();
    this.drops = [];
    this.ammo = R.mag; this.reload = -1; this.reloadIn = 0; this.firing = false;
    this.mag.visible = true; this.mag.position.copy(this.magHome);
    this.flash.visible = false;
  }

  goHome() { super.goHome(); if (this.flash) { this.firing = false; this.flash.visible = false; } }

  idle(dt) { this.updateDrops(dt); }

  tick(dt) {
    this.fireT -= dt;
    if (this.firing && this.fireT <= 1e-6) this.shoot();
    if (!this.firing) this.fireT = Math.max(0, this.fireT);
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;
    this.kick = Math.max(0, this.kick - dt * 14);
    // reload (#196): when empty, a moment after the last shot — mag down and out, dropped, a new one up and in
    if (this.reloadIn > 0 && (this.reloadIn -= dt) <= 0) { this.reload = 0; this.firing = false; }
    if (this.reload >= 0) {
      const t0 = this.reload, t = (this.reload += dt);
      const out = Math.min(1, t / 0.35), back = Math.max(0, Math.min(1, (t - 0.75) / 0.45));
      if (t0 < 0.35 && t >= 0.35) { this.dropMag(); this.mag.visible = false; }
      if (t0 < 0.75 && t >= 0.75) { this.mag.visible = true; }
      this.mag.position.copy(this.magHome).add(new THREE.Vector3(0, t < 0.75 ? -0.09 * out : -0.12 * (1 - back), 0));
      if (t0 < 1.2 && t >= 1.2) { sfx.magIn(this.where()); this.ammo = R.mag; }
      if (t >= R.reloadSeconds) { this.reload = -1; this.mag.position.copy(this.magHome); }
    }
    // the hold: recoil kicks it back and up; tipped while reloading
    const r = this.reload >= 0 ? Math.sin(Math.min(1, this.reload / R.reloadSeconds) * Math.PI) : 0;
    this.model.position.set(R.held.x, R.held.y - 0.05 * r, R.held.z + 0.04 * this.kick);
    this.model.rotation.set(0.02 + 0.06 * this.kick + 0.35 * r, 0.03, 0.5 * r);
    this.updateDrops(dt);
  }

  updateDrops(dt) {
    for (const d of [...this.drops]) {
      d.age += dt;
      if (d.age > R.magLife) { d.m.removeFromParent(); this.drops.splice(this.drops.indexOf(d), 1); continue; }
      if (d.down) continue;
      d.v.y -= 9.8 * dt;
      d.m.position.addScaledVector(d.v, dt);
      d.m.rotation.z += d.spin * dt;
      if (d.m.position.y <= d.floor + 0.015) { // on the floor: lying flat on its side
        d.m.position.y = d.floor + 0.015; d.down = true;
        d.m.rotation.set(0, Math.random() * Math.PI * 2, Math.PI / 2);
        sfx.clatter(d.m.position);
      }
    }
  }
}

KINDS.rifle = Rifle; // furniture.js lists it in userData.things with kind 'rifle'
