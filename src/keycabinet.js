import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { HALL_WALL as H } from './config.js';
import { sfx } from './audio.js';
import { mirrorMaterial } from './mirror.js';
import { addReflector } from './reflections.js';

// The hall wall on the left as you come in: a round mirror, and a Solstickan key cabinet (white
// metal box with the matchbox boy, hinged on the left) that opens with E. Inside on a hook hangs
// the Renault Megane E-Tech key: E on it presses the lock button and the car answers beep beep.
// Built in a local frame with the wall at z = 0 and the front towards +z, then turned to face the hall.

const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.45, metalness: 0.2 });
const inside = new THREE.MeshStandardMaterial({ color: 0xe6e6e3, roughness: 0.6 });
const hookMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.3, metalness: 0.8 });
const fobMat = new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.35 });
const chrome = new THREE.MeshStandardMaterial({ color: 0xd9dde0, roughness: 0.2, metalness: 0.9 });
const brass = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.5, metalness: 0.4 });
const frameMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.45, side: THREE.DoubleSide }); // LINDBYN frame
const keyMat = new THREE.MeshStandardMaterial({ color: 0xc9a64a, roughness: 0.35, metalness: 0.3 });


const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
};

/** The Solstickan boy as a grey silhouette on white (the cabinet's front). */
function frontTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f4f2';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#a9adb0';
  g.strokeStyle = '#a9adb0';
  g.lineCap = 'round';
  const ell = (x, y, rx, ry, a = 0) => { g.beginPath(); g.ellipse(x, y, rx, ry, a, 0, Math.PI * 2); g.fill(); };
  ell(132, 78, 15, 17);          // head
  ell(140, 64, 14, 9, -0.3);     // tousled hair
  ell(126, 118, 16, 26, 0.15);   // body
  g.lineWidth = 10;
  const line = (pts) => { g.beginPath(); g.moveTo(...pts[0]); pts.slice(1).forEach((p) => g.lineTo(...p)); g.stroke(); };
  line([[120, 140], [104, 170], [86, 182]]);  // back leg
  line([[132, 140], [146, 168], [160, 182]]); // front leg
  g.lineWidth = 7;
  line([[118, 106], [104, 124]]);             // arms, walking
  line([[134, 106], [114, 130]]);
  g.lineWidth = 4;
  line([[142, 96], [166, 92]]);               // the scarf flying behind
  return new THREE.CanvasTexture(c);
}

export class CarKey {
  constructor(parent) {
    Object.assign(this, { name: 'bilnyckeln', kind: 'carkey', verb: 'trycka på', presses: 0, blink: 0 });
    const g = new THREE.Group();
    g.add(mesh(new THREE.TorusGeometry(0.009, 0.0015, 6, 16), hookMat, 0, -0.008, 0)); // key ring
    const fob = mesh(new RoundedBoxGeometry(0.034, 0.058, 0.012, 2, 0.006), fobMat, 0, -0.048, 0.002);
    g.add(fob);
    const logo = mesh(new THREE.PlaneGeometry(0.009, 0.009), chrome, 0, -0.034, 0.0085); // Renault diamond
    logo.rotation.z = Math.PI / 4;
    g.add(logo);
    for (const y of [-0.05, -0.064]) g.add(mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.002, 12).rotateX(Math.PI / 2), brass, 0, y, 0.009));
    this.led = mesh(new THREE.SphereGeometry(0.0018, 8, 6), new THREE.MeshBasicMaterial({ color: 0x401010 }), 0.011, -0.025, 0.008);
    g.add(this.led);
    g.traverse((m) => { m.userData.door = this; });
    parent.add(g);
    this.object = g;
    this.pickable = g;
  }

  press() {
    this.presses++;
    this.blink = 0.5;
    sfx.carBeep(this.object.getWorldPosition(new THREE.Vector3()));
  }

  update(dt) {
    this.blink = Math.max(0, this.blink - dt);
    this.led.material.color.setHex(this.blink > 0 ? 0xff3030 : 0x401010);
    this.object.rotation.z = Math.sin(this.swing = (this.swing ?? 0) + dt * 3) * 0.05 * this.blink; // jiggles when pressed
  }
}

export class KeyCabinet {
  constructor() {
    Object.assign(this, { name: 'nyckelskåpet', kind: 'keybox', isOpen: false, t: 0 });
    const { w, h, d } = H.cabinet, t = 0.004;
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(w, h, t), inside, 0, 0, t / 2));                        // back
    g.add(mesh(new THREE.BoxGeometry(t, h, d), white, -w / 2 + t / 2, 0, d / 2),
      mesh(new THREE.BoxGeometry(t, h, d), white, w / 2 - t / 2, 0, d / 2),
      mesh(new THREE.BoxGeometry(w, t, d), white, 0, h / 2 - t / 2, d / 2),
      mesh(new THREE.BoxGeometry(w, t, d), white, 0, -h / 2 + t / 2, d / 2));
    // a rail of six hooks; the house keys on two, the car key on the right one
    const hooks = [-0.06, -0.036, -0.012, 0.012, 0.036, 0.06];
    for (const x of hooks) g.add(mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.02, 6).rotateX(Math.PI / 2), hookMat, x, 0.045, t + 0.01));
    for (const x of [hooks[0], hooks[2]]) {
      const k = mesh(new THREE.BoxGeometry(0.012, 0.045, 0.002), keyMat, x, 0.012, t + 0.016);
      g.add(k, mesh(new THREE.TorusGeometry(0.008, 0.0015, 6, 14), keyMat, x, 0.04, t + 0.016));
    }
    const keyHolder = new THREE.Group();
    keyHolder.position.set(hooks[4], 0.045, t + 0.018);
    g.add(keyHolder);
    this.key = new CarKey(keyHolder);
    // door: pivot on the left edge, white front with the boy
    this.door = new THREE.Group();
    this.door.position.set(-w / 2, 0, d);
    const faces = [white, white, white, white, new THREE.MeshStandardMaterial({ map: frontTexture(), roughness: 0.45, metalness: 0.2 }), white];
    const panel = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.006), faces);
    panel.position.set(w / 2, 0, 0.003);
    panel.castShadow = true;
    this.door.add(panel, mesh(new THREE.BoxGeometry(0.004, 0.02, 0.006), white, w - 0.006, 0, 0.008)); // catch
    this.door.traverse((m) => { m.userData.door = this; });
    g.add(this.door);
    this.pickable = this.door;
    this.object = g;
  }

  /** The key can be used once the door is (nearly) open. */
  get keyReachable() { return this.t > 0.8; }

  toggle() {
    this.isOpen = !this.isOpen;
    sfx.lid(this.door.getWorldPosition(new THREE.Vector3()), this.isOpen);
  }

  update(dt) {
    const target = this.isOpen ? 1 : 0;
    this.t += Math.sign(target - this.t) * Math.min(Math.abs(target - this.t), dt * 2.5);
    const e = this.t * this.t * (3 - 2 * this.t);
    this.door.rotation.y = -e * THREE.MathUtils.degToRad(110);
    this.key.update(dt);
  }
}

/** Mirror (IKEA LINDBYN, black; in the living room since #205) + key cabinet on the hall wall. */
export function buildHallWall() {
  const group = new THREE.Group();
  const m = H.mirror;
  // LINDBYN: round glass in a slim black frame, standing m.depth off the wall
  const disc = mesh(new THREE.CircleGeometry(m.d / 2 - m.frame, 64), mirrorMaterial, 0, 0, m.depth);
  const rim = mesh(new THREE.CylinderGeometry(m.d / 2, m.d / 2, m.depth, 64, 1, true).rotateX(Math.PI / 2), frameMat, 0, 0, m.depth / 2);
  const face = mesh(new THREE.RingGeometry(m.d / 2 - m.frame, m.d / 2, 64), frameMat, 0, 0, m.depth + 0.0005);
  const mirror = new THREE.Group();
  mirror.add(disc, rim, face);
  mirror.position.set(m.x, m.y, m.z); // on the living-room wall behind the armchair (#205), local +z out of the wall
  mirror.rotation.y = m.rotY;
  addReflector(disc, new THREE.CircleGeometry(m.d / 2 - m.frame, 64), { level: 0 }); // mirror image (#50)
  // the key cabinet on its own wall (#123), local +z out of the wall
  const cabinet = new KeyCabinet();
  cabinet.object.position.set(H.cabinet.x, H.cabinet.y, H.cabinet.z);
  cabinet.object.rotation.y = H.cabinet.rotY;
  group.add(mirror, cabinet.object);
  return { object: group, cabinet, key: cabinet.key };
}
