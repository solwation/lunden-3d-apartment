import * as THREE from 'three';
import { sfx } from './audio.js';
import { KITCHEN } from './config.js';

// The induction hob (#158, Peab's EH60KB6BF): E switches it on and off. On, the big front zone glows red and
// the touch display shows "9"; a faint hum plays from it. It lives in world.lids (kept out of mergeStatic) and
// stays with F (Peab's kitchen), but F switches it off. `world.hob` = this: `zone` (the front zone's centre on
// the glass, world space) and `on` for the pan (#159) and the chicken (#160).
//
// Built for the east run (fronts facing −x): x0 = the hob's front edge, z = its centre, y = the worktop's top.

// zones: [a, b, r] — a = 0 at the front edge … 1 at the back, b = 0 north … 1 south, r in fractions of the width
function glassTexture(zones) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#0b0b0c'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(210,210,210,0.5)'; g.lineWidth = 2;
  for (const [a, b, r] of zones) { g.beginPath(); g.arc(a * 256, b * 256, r * 256, 0, Math.PI * 2); g.stroke(); }
  g.fillStyle = 'rgba(200,200,200,0.55)'; // the touch controls along the front edge
  for (let i = 0; i < 9; i++) g.fillRect(12, 60 + i * 15, 3, 8);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// the glowing zone: concentric red coils, brighter towards the middle ring, dark in the very centre
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), img = g.createImageData(128, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const r = Math.hypot(x - 63.5, y - 63.5) / 63.5;
    const coil = 0.55 + 0.45 * Math.cos(r * Math.PI * 14);
    const a = r > 1 || r < 0.22 ? 0 : coil * Math.sin(Math.PI * (r - 0.22) / 0.78) ** 0.6;
    const k = (y * 128 + x) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = 255 * a; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

function digitTexture(text) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#ff2a12'; g.font = 'bold 52px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 32, 36);
  return new THREE.CanvasTexture(c);
}

export class Hob {
  constructor({ x0, z, y }) {
    const H = KITCHEN.hob, d = H.d, w = H.w;
    Object.assign(this, { name: 'hällen', kind: 'hob', on: false, hum: null });
    this.object = new THREE.Group();
    this.object.position.set(x0, y, z);
    const body = new THREE.Mesh(new THREE.BoxGeometry(d, H.t, w), new THREE.MeshStandardMaterial({ color: 0x111112, roughness: 0.3 }));
    body.position.set(d / 2, H.t / 2, 0);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(d, w), new THREE.MeshStandardMaterial({ map: glassTexture(H.zones), roughness: 0.25, metalness: 0.1 }));
    top.rotation.x = -Math.PI / 2; // u along +x (front → back), v along −z: canvas x = a, canvas y = b
    top.position.set(d / 2, H.t + 0.0004, 0);
    top.receiveShadow = true;
    this.object.add(body, top);
    // the zone that glows: the big front one (the first in KITCHEN.hob.zones)
    const [za, zb, zr] = H.zones[0];
    const zx = za * d, zz = (zb - 0.5) * w;
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xff3010, map: glowTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.CircleGeometry(zr * w, 48), this.glowMat);
    ring.rotation.x = -Math.PI / 2; ring.position.set(zx, H.t + 0.0008, zz);
    ring.raycast = () => {};
    this.object.add(ring);
    this.digitMat = new THREE.MeshBasicMaterial({ map: digitTexture('9'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const digit = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.03), this.digitMat);
    digit.rotation.set(-Math.PI / 2, 0, Math.PI / 2); // read from the front (−x)
    digit.position.set(0.035, H.t + 0.0008, zz);
    digit.raycast = () => {};
    this.object.add(digit);
    this.object.traverse((m) => { m.userData.door = this; });
    this.pickable = this.object;
    this.zone = new THREE.Vector3(x0 + zx, y + H.t, z + zz);
  }

  get isOpen() { return this.on; }
  get verb() { return this.on ? 'stänga av' : 'slå på'; }

  toggle() { this.set(!this.on); }

  set(on) {
    if (on === this.on) return;
    this.on = on;
    sfx.click(this.zone);
    this.hum?.stop(); this.hum = on ? sfx.hobHum(this.zone) : null;
  }

  update(dt) { // the glow comes and goes over a second, like the real thing
    const goal = this.on ? 1 : 0, o = this.glowMat.opacity / 0.85;
    const k = o + Math.sign(goal - o) * Math.min(Math.abs(goal - o), dt * 1.2);
    this.glowMat.opacity = k * 0.85;
    this.digitMat.opacity = this.on ? 1 : 0;
  }
}
