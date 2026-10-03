import * as THREE from 'three';
import { MOCCAMASTER as C } from './config.js';
import { sfx } from './audio.js';

// The Moccamaster on the kitchen worktop (#59): black base with the hot plate, the water tank
// column at the back on the right, the arm with the filter basket over a glass jug with a black lid.
// E starts brewing: the power switch glows red (own emissive material, no light), it sounds like
// brewing and the jug fills if it stands on the plate (it can be taken, cups.js #141); after C.brewSeconds it clicks off. E while brewing switches it off.
// Built facing −x (the east kitchen run, worktop top at `y0`).

const black = new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.35 });
const tankMat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.15, transparent: true, opacity: 0.75 });
const glass = new THREE.MeshStandardMaterial({ color: 0xdfe8ec, roughness: 0.05, transparent: true, opacity: 0.3, depthWrite: false });
const coffee = new THREE.MeshStandardMaterial({ color: 0x2a1408, roughness: 0.3 });
const steel = new THREE.MeshStandardMaterial({ color: 0xb9bdc0, roughness: 0.3, metalness: 0.5 });

const mesh = (geo, m, x, y, z) => {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = o.receiveShadow = m !== glass;
  return o;
};

export class Moccamaster {
  constructor(y0) {
    Object.assign(this, { name: 'kaffebryggaren', kind: 'coffee', isOpen: false, t: 0, fill: 0, sound: null, done: 0 });
    const g = new THREE.Group();
    // local frame: x = depth (0 = front … d = back), z = width (−w/2 = viewer's left = north)
    const { w, d, h } = C;
    g.add(mesh(new THREE.BoxGeometry(d, 0.045, w), black, d / 2, 0.0225, 0));                       // base
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.006, 24), steel, d * 0.45, 0.048, -w * 0.18)); // hot plate
    g.add(mesh(new THREE.BoxGeometry(0.11, h - 0.045, 0.12), tankMat, d - 0.06, 0.045 + (h - 0.045) / 2, w * 0.27)); // tank
    g.add(mesh(new THREE.BoxGeometry(0.115, 0.03, 0.125), black, d - 0.06, h - 0.015, w * 0.27));     // tank lid
    g.add(mesh(new THREE.BoxGeometry(0.05, 0.025, w * 0.5), black, d - 0.07, h - 0.06, 0));          // arm
    g.add(mesh(new THREE.CylinderGeometry(0.07, 0.035, 0.11, 24), black, d * 0.45, h - 0.12, -w * 0.18)); // filter basket
    // glass jug with coffee that rises while brewing, black lid and handle: its own group on the hot plate
    // (cups.js turns it into a Jug you can take, #141); local origin = the bottom centre of the jug
    const jugH = 0.15, jy = 0.0;
    const jug = new THREE.Group();
    jug.position.set(d * 0.45, 0.051, -w * 0.18);
    jug.add(mesh(new THREE.CylinderGeometry(0.066, 0.07, jugH, 28, 1, true), glass, 0, jugH / 2, 0));
    jug.add(mesh(new THREE.CircleGeometry(0.07, 28).rotateX(-Math.PI / 2), glass, 0, 0.002, 0));
    this.coffee = mesh(new THREE.CylinderGeometry(0.063, 0.067, 1, 24), coffee, 0, jy, 0);
    this.coffee.visible = false;
    this.jugH = jugH; this.jy = jy;
    jug.add(this.coffee);
    jug.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.025, 24), black, 0, jugH + 0.012, 0));
    jug.add(mesh(new THREE.BoxGeometry(0.018, 0.1, 0.02), black, 0, jugH * 0.5, 0.09)); // handle (towards the viewer's right)
    jug.add(mesh(new THREE.BoxGeometry(0.018, 0.016, 0.03), black, 0, jugH * 0.82, 0.075), mesh(new THREE.BoxGeometry(0.018, 0.016, 0.03), black, 0, jugH * 0.2, 0.075));
    g.add(jug);
    this.jug = jug; // replaced by the Jug (cups.js) once it exists; `jugHome` says whether it stands on the plate
    // power switch on the front of the base, right side
    this.led = new THREE.MeshStandardMaterial({ color: 0x5a1010, emissive: 0xff2010, emissiveIntensity: 0, roughness: 0.3 });
    g.add(mesh(new THREE.BoxGeometry(0.006, 0.018, 0.03), this.led, -0.002, 0.024, w * 0.33));
    g.position.set(C.back - d, y0, C.z);
    g.rotation.y = 0; // front faces −x already
    g.traverse((m) => { m.userData.door = this; });
    this.object = g;
    this.pickable = g;
    this.setFill(0);
  }

  get verb() { return this.isOpen ? 'stänga av' : 'sätta på'; }

  setFill(f) {
    this.fill = f;
    this.coffee.visible = f > 0.01;
    const hgt = Math.max(0.001, f * (this.jugH - 0.03));
    this.coffee.scale.y = hgt;
    this.coffee.position.y = this.jy + hgt / 2;
  }

  toggle() {
    this.isOpen = !this.isOpen;
    const p = this.object.getWorldPosition(new THREE.Vector3());
    sfx.click(p);
    if (this.isOpen) {
      this.t = 0;
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
    if (!this.isOpen) return;
    this.t += dt;
    // the jug starts filling after a couple of seconds of heating — if it is there; never empties it
    if (this.jugHome) this.setFill(Math.max(this.fill, THREE.MathUtils.clamp((this.t - 2.5) / (C.brewSeconds - 3), 0, 1)));
    if (this.t >= C.brewSeconds) { // done: click off, the coffee stays in the jug
      this.isOpen = false;
      this.sound = null;
      this.led.emissiveIntensity = 0;
      this.done++;
      this.onBrewed?.(); // statistics and points
      sfx.click(this.object.getWorldPosition(new THREE.Vector3()));
    }
  }
}
