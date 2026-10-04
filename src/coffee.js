import * as THREE from 'three';
import { MOCCAMASTER as C, COFFEE, COFFEE_JAR } from './config.js';
import { sfx } from './audio.js';
import { mouths, cordToMouth, plugAt } from './sockets.js';

// The Moccamaster on the kitchen worktop (#59): black base with the hot plate, the water tank
// column at the back on the left (seen from the front, #315), the arm reaching right over the filter basket,
// a glass jug with a black lid on the hot plate on the right.
// E starts brewing: the power switch (base front, left, under the tank) glows red (own emissive material, no light), it sounds like
// brewing and the jug fills if it stands on the plate (it can be taken, cups.js #141); after C.brewSeconds it clicks off. E while brewing switches it off.
// #334: it only brews with water in the tank and coffee in the filter. The jug is filled at a running tap (`fillTarget`)
// and poured into the tank (`tankTarget`: the see-through tank's level rises); scoops from the jar (coffeejar.js) go into
// the open-topped filter basket (`filterTarget`: a puff, the grounds rise). Brewing drains the tank and leaves wet grounds
// (`spent`): the next pot needs both again. Without them the switch says what is missing (`blockedText`). `prime()` fills
// both (tests), `reset()` empties them (F).
// Built facing −x (the east kitchen run, worktop top at `y0`).

const black = new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.35 });
const tankMat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.15, transparent: true, opacity: 0.55, depthWrite: false }); // 0.75 → 0.55 (#334): the water shows
const waterMat = new THREE.MeshStandardMaterial({ color: 0xc4e2f0, roughness: 0.05, transparent: true, opacity: 0.5, depthWrite: false }); // in the tank and the jug (#334)
const basketMat = new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.35, side: THREE.DoubleSide }); // open at the top (#334)
const groundsMat = new THREE.MeshStandardMaterial({ color: COFFEE_JAR.ground, roughness: 0.95 });
const SPENT = new THREE.Color(0x120904), DRY = new THREE.Color(COFFEE_JAR.ground);
const glass = new THREE.MeshStandardMaterial({ color: 0xdfe8ec, roughness: 0.05, transparent: true, opacity: 0.2, depthWrite: false }); // 0.3 → 0.2 (#316): the dark coffee shows through
const coffee = new THREE.MeshStandardMaterial({ color: COFFEE.color, roughness: COFFEE.roughness }); // dark roast (#316)
const steel = new THREE.MeshStandardMaterial({ color: 0xb9bdc0, roughness: 0.3, metalness: 0.5 });

const mesh = (geo, m, x, y, z) => {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = o.receiveShadow = m !== glass && m !== waterMat && m !== tankMat;
  return o;
};

export class Moccamaster {
  constructor(y0) {
    Object.assign(this, { name: 'kaffebryggaren', kind: 'coffee', isOpen: false, t: 0, fill: 0, sound: null, done: 0,
      water: 0, grounds: 0, spent: false, jugWater: 0, water0: 0, shown: { water: 0, jug: 0, grounds: 0 }, puffT: 0 }); // #334
    const g = new THREE.Group();
    // local frame: x = depth (0 = front … d = back), z = width (−w/2 = viewer's left = north)
    const { w, d, h } = C;
    g.add(mesh(new THREE.BoxGeometry(d, 0.045, w), black, d / 2, 0.0225, 0));                       // base
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.006, 24), steel, d * 0.45, 0.048, w * 0.18)); // hot plate (right)
    g.add(mesh(new THREE.BoxGeometry(0.11, h - 0.045, 0.12), tankMat, d - 0.06, 0.045 + (h - 0.045) / 2, -w * 0.27)); // tank (left)
    g.add(mesh(new THREE.BoxGeometry(0.115, 0.03, 0.125), black, d - 0.06, h - 0.015, -w * 0.27));    // tank lid
    g.add(mesh(new THREE.BoxGeometry(0.05, 0.025, w * 0.5), black, d - 0.07, h - 0.06, 0));          // arm from the tank over the basket
    g.add(mesh(new THREE.CylinderGeometry(0.07, 0.035, 0.11, 24, 1, true), basketMat, d * 0.45, h - 0.12, w * 0.18)); // filter basket (right), open at the top (#334)
    // glass jug with coffee that rises while brewing, black lid and handle: its own group on the hot plate
    // (cups.js turns it into a Jug you can take, #141); local origin = the bottom centre of the jug
    const jugH = 0.15, jy = 0.0;
    const jug = new THREE.Group();
    jug.position.set(d * 0.45, 0.051, w * 0.18);
    jug.add(mesh(new THREE.CylinderGeometry(0.066, 0.07, jugH, 28, 1, true), glass, 0, jugH / 2, 0));
    jug.add(mesh(new THREE.CircleGeometry(0.07, 28).rotateX(-Math.PI / 2), glass, 0, 0.002, 0));
    this.coffee = mesh(new THREE.CylinderGeometry(0.063, 0.067, 1, 24), coffee, 0, jy, 0);
    this.coffee.visible = false;
    this.jugH = jugH; this.jy = jy;
    jug.add(this.coffee);
    this.jugWaterMesh = mesh(new THREE.CylinderGeometry(0.063, 0.067, 1, 24), waterMat, 0, jy, 0); // water from the tap (#334)
    this.jugWaterMesh.visible = false;
    this.jugWaterMesh.renderOrder = 1;
    jug.add(this.jugWaterMesh);
    jug.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.025, 24), black, 0, jugH + 0.012, 0));
    jug.add(mesh(new THREE.BoxGeometry(0.018, 0.1, 0.02), black, 0, jugH * 0.5, 0.09)); // handle (towards the viewer's right)
    jug.add(mesh(new THREE.BoxGeometry(0.018, 0.016, 0.03), black, 0, jugH * 0.82, 0.075), mesh(new THREE.BoxGeometry(0.018, 0.016, 0.03), black, 0, jugH * 0.2, 0.075));
    g.add(jug);
    this.jug = jug; // replaced by the Jug (cups.js) once it exists; `jugHome` says whether it stands on the plate
    // power switch on the front of the base, left side (under the tank, #315)
    this.led = new THREE.MeshStandardMaterial({ color: 0x5a1010, emissive: 0xff2010, emissiveIntensity: 0, roughness: 0.3 });
    g.add(mesh(new THREE.BoxGeometry(0.006, 0.018, 0.03), this.led, -0.002, 0.024, -w * 0.33));
    // #334 (added last: tests find the tank as children[2]): the water in the tank, the basket's floor, the grounds, a puff
    const tw = mesh(new THREE.BoxGeometry(0.1, 1, 0.11), waterMat, d - 0.06, 0.05, -w * 0.27);
    tw.renderOrder = 1;
    this.tankWater = tw; this.tankY = 0.05; this.tankH = h - 0.1;
    g.add(tw);
    g.add(mesh(new THREE.CircleGeometry(0.035, 20).rotateX(-Math.PI / 2), basketMat, d * 0.45, h - 0.174, w * 0.18));
    this.basket = { x: d * 0.45, z: w * 0.18, y0: h - 0.175, H: 0.11 }; // the cone: radius 0.035 at y0 → 0.07 at the top
    this.groundsMesh = mesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), groundsMat.clone(), this.basket.x, 0, this.basket.z);
    g.add(this.groundsMesh);
    const pn = 24, pp = new Float32Array(pn * 3);
    this.puff = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pp, 3)),
      new THREE.PointsMaterial({ color: COFFEE_JAR.ground, size: 0.006, transparent: true, opacity: 0, depthWrite: false }));
    this.puff.raycast = () => {};
    this.puff.frustumCulled = false;
    this.puffV = [...Array(pn)].map(() => new THREE.Vector3((Math.random() - 0.5) * 0.04, 0.02 + Math.random() * 0.06, (Math.random() - 0.5) * 0.04));
    this.puff.visible = false;
    g.add(this.puff);
    const self = this;
    // the E targets the ritual swaps in (coffeejar.js `aim`): never raycast themselves
    this.tankTarget = { name: 'vattentanken', kind: 'mocca', verb: 'hälla vattnet i', pickable: g,
      get blocked() { return self.isOpen || self.water > 0.97; }, get blockedText() { return self.isOpen ? 'Kaffet bryggs' : 'Vattentanken är full'; },
      toggle: () => this.pourWater() };
    this.filterTarget = { name: 'filtret', kind: 'mocca', verb: 'hälla kaffet i', pickable: g,
      get blocked() { return self.isOpen || (!self.spent && self.grounds >= C.maxScoops); }, get blockedText() { return self.isOpen ? 'Kaffet bryggs' : 'Filtret är fullt'; },
      toggle: () => this.addScoop() };
    this.fillTarget = { name: 'kannan med vatten', kind: 'mocca', verb: 'fylla', pickable: g, toggle: () => this.fillJug() };
    g.position.set(C.back - d, y0, C.z);
    g.rotation.y = 0; // front faces −x already
    { // its cord (#442): from the back, low on the right, up the splashback to the wall socket over it
      g.updateMatrixWorld(true);
      const m = mouths().find((o) => o.id === 'coffee-s');
      const pts = cordToMouth(g.localToWorld(new THREE.Vector3(d - 0.004, 0.025, w * 0.3)), m, y0).map((p) => g.worldToLocal(p));
      const cord = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.0032, 6), black);
      cord.raycast = () => {};
      g.add(cord, plugAt(g, m, black));
    }
    g.traverse((m) => { m.userData.door = this; });
    this.object = g;
    this.pickable = g;
    this.setFill(0);
    this.snap(); // (#334)
  }

  get verb() { return this.isOpen ? 'stänga av' : 'sätta på'; }

  /** What is missing before it can brew (#334), or null. */
  get missing() {
    if (this.isOpen) return null;
    const w = this.water > 0.05, c = this.grounds > 0 && !this.spent;
    return w && c ? null : !w && !c ? 'Fyll på vatten och kaffe' : !w ? 'Fyll på vatten först' : 'Häll i kaffe först';
  }
  get blocked() { return !!this.missing; }
  get blockedText() { return this.missing; }

  /** The held jug filled at a running tap (#334): any coffee left in it is rinsed out. */
  fillJug() {
    this.setFill(0);
    this.jugWater = 1;
    sfx.click(this.object.getWorldPosition(new THREE.Vector3()));
  }

  /** The water in the held jug into the tank (#334): it tips while it pours. */
  pourWater() {
    const amount = Math.min(this.jugWater, 1 - this.water);
    if (amount <= 0.01) return;
    this.water += amount; this.jugWater -= amount;
    if (this.jugHolder) this.jugHolder.tiltT = 1.2;
    sfx.pour(this.tankWater.getWorldPosition(new THREE.Vector3()), 1.2);
  }

  /** A scoop of coffee into the filter (#334): old wet grounds go first; a puff, a soft hiss. */
  addScoop(scoop = this.scoop) {
    if (this.spent) { this.grounds = 0; this.spent = false; this.shown.grounds = 0; }
    this.grounds = Math.min(C.maxScoops, this.grounds + 1);
    if (scoop) scoop.full = false;
    this.puffT = 0.7;
    const p = this.puff.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, this.basket.x + (Math.random() - 0.5) * 0.03, this.basket.y0 + this.basket.H + 0.02, this.basket.z + (Math.random() - 0.5) * 0.03);
    sfx.scoop(this.groundsMesh.getWorldPosition(new THREE.Vector3()));
  }

  /** Water and coffee for a full pot at once (tests, #334). */
  prime() { this.water = 1; this.grounds = C.scoops; this.spent = false; this.snap(); }
  /** F (#334): the tank empty, the filter clean (a brew going on stops). */
  reset() {
    if (this.isOpen) this.toggle();
    Object.assign(this, { water: 0, grounds: 0, spent: false, jugWater: 0 });
    this.snap();
  }
  /** The levels shown jump to the real ones (no rising). */
  snap() { Object.assign(this.shown, { water: this.water, jug: this.jugWater, grounds: this.grounds }); this.showLevels(); }

  showLevels() {
    const s = this.shown, tw = this.tankWater, jw = this.jugWaterMesh, gm = this.groundsMesh, b = this.basket;
    tw.visible = s.water > 0.01;
    tw.scale.y = Math.max(0.001, s.water * this.tankH); tw.position.y = this.tankY + tw.scale.y / 2;
    jw.visible = s.jug > 0.01;
    const jh = Math.max(0.001, s.jug * (this.jugH - 0.03));
    jw.scale.y = jh; jw.position.y = this.jy + jh / 2;
    gm.visible = this.grounds > 0;
    const y = b.y0 + 0.015 + 0.07 * Math.min(1, s.grounds / C.maxScoops), r = 0.035 + 0.035 * (y - b.y0) / b.H - 0.003;
    gm.position.y = y; gm.scale.set(r, 1, r);
    gm.material.color.copy(this.spent ? SPENT : DRY);
    gm.material.roughness = this.spent ? 0.5 : 0.95;
  }

  setFill(f) {
    this.fill = f;
    this.coffee.visible = f > 0.01;
    const hgt = Math.max(0.001, f * (this.jugH - 0.03));
    this.coffee.scale.y = hgt;
    this.coffee.position.y = this.jy + hgt / 2;
  }

  toggle() {
    const p = this.object.getWorldPosition(new THREE.Vector3());
    if (!this.isOpen && this.missing) { sfx.click(p); return; } // no water or no coffee: nothing happens (#334)
    if (this.isOpen && this.t > 2.5) { this.spent = true; this.water0 = 0; } // switched off mid-brew: the grounds are wet already
    this.isOpen = !this.isOpen;
    sfx.click(p);
    if (this.isOpen) {
      this.t = 0;
      this.water0 = this.water;
      if (this.jugHome) { this.jugWater = 0; this.shown.jug = 0; this.showLevels(); } // (a jug of water left on the plate: poured out)
      this.sound = sfx.brew(p, C.brewSeconds);
    } else {
      this.sound?.stop();
      this.sound = null;
    }
    this.led.emissiveIntensity = this.isOpen ? 2.2 : 0;
  }

  /** Is the jug on the hot plate? (Only then does brewing fill it, #141.) */
  get jugHome() { return this.jugHolder ? this.jugHolder.atHome : true; }

  update(dt) {
    // the levels shown follow the real ones (#334): the jug fills under the tap, the tank as it is poured
    const s = this.shown, k = Math.min(1, dt * 1.6);
    if (s.water !== this.water || s.jug !== this.jugWater || s.grounds !== this.grounds) {
      const ease = (a, b) => (Math.abs(b - a) < 0.004 ? b : a + (b - a) * k);
      s.water = this.isOpen ? this.water : ease(s.water, this.water); s.jug = ease(s.jug, this.jugWater); s.grounds = ease(s.grounds, this.grounds);
      this.showLevels();
    }
    if (this.puffT > 0) { // coffee dust off the scoop, falling into the basket
      this.puffT = Math.max(0, this.puffT - dt);
      const p = this.puff.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) { const v = this.puffV[i]; p.setXYZ(i, p.getX(i) + v.x * dt, p.getY(i) + (v.y - 0.3 * (0.7 - this.puffT)) * dt, p.getZ(i) + v.z * dt); }
      p.needsUpdate = true;
      this.puff.visible = this.puffT > 0;
      this.puff.material.opacity = Math.min(1, this.puffT * 2) * 0.8;
    }
    if (!this.isOpen) return;
    this.t += dt;
    this.water = this.water0 * (1 - THREE.MathUtils.clamp(this.t / (C.brewSeconds - 1), 0, 1)); // the tank drains (#334)
    // the jug starts filling after a couple of seconds of heating — if it is there; never empties it
    if (this.jugHome) this.setFill(Math.max(this.fill, THREE.MathUtils.clamp((this.t - 2.5) / (C.brewSeconds - 3), 0, 1)));
    if (this.t >= C.brewSeconds) { // done: click off, the coffee stays in the jug
      this.isOpen = false;
      this.sound = null;
      this.led.emissiveIntensity = 0;
      this.water = 0; this.spent = true; this.showLevels(); // used up: wet grounds left in the filter (#334)
      this.done++;
      this.onBrewed?.(); // statistics and points
      sfx.click(this.object.getWorldPosition(new THREE.Vector3()));
    }
  }
}
