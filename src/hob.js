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
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#090b0d'; g.fillRect(0, 0, 512, 512);
  // Correct the printed circles for the rectangular glass; cooking anchors stay exact.
  const aspect = KITCHEN.hob.w / KITCHEN.hob.d;
  g.strokeStyle = 'rgba(210,216,220,0.6)'; g.lineWidth = 1.5;
  for (const [a, b, r] of zones) {
    g.beginPath(); g.ellipse(a * 512, b * 512, r * 512 * aspect, r * 512, 0, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(a * 512 - 5, b * 512); g.lineTo(a * 512 + 5, b * 512);
    g.moveTo(a * 512, b * 512 - 5); g.lineTo(a * 512, b * 512 + 5); g.stroke();
  }
  // Printed touch strip: fine slider marks, minus/plus, and a power symbol. The live 9 stays a separate overlay.
  g.strokeStyle = 'rgba(192,204,212,0.5)'; g.lineWidth = 2;
  for (let i = 0; i < 9; i++) { const b = 110 + i * 30; g.beginPath(); g.moveTo(30, b); g.lineTo(36, b); g.stroke(); }
  g.beginPath(); g.moveTo(33, 82); g.lineTo(33, 94); g.moveTo(27, 378); g.lineTo(39, 378);
  g.moveTo(33, 372); g.lineTo(33, 384); g.stroke();
  g.save(); g.translate(33, 436); g.rotate(Math.PI / 2); // upright when seen from the front (−x)
  g.beginPath(); g.arc(0, 0, 11, -.35 * Math.PI, 1.35 * Math.PI); g.stroke();
  g.beginPath(); g.moveTo(0, -16); g.lineTo(0, -1); g.stroke(); g.restore();
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
    const b = H.bevel, edge = new THREE.Shape();
    edge.moveTo(b, -w / 2 + b); edge.lineTo(d - b, -w / 2 + b);
    edge.lineTo(d - b, w / 2 - b); edge.lineTo(b, w / 2 - b); edge.closePath();
    const bodyGeometry = new THREE.ExtrudeGeometry(edge, { depth: H.t - 2 * b, steps: 1, bevelEnabled: true, bevelSegments: 1, bevelSize: b, bevelThickness: b });
    bodyGeometry.rotateX(-Math.PI / 2); bodyGeometry.translate(0, b, 0);
    const body = new THREE.Mesh(bodyGeometry, new THREE.MeshStandardMaterial({ color: 0x262c31, roughness: 0.18, metalness: 0.15 }));
    body.receiveShadow = true; // like the glass top: no sun through the house (#607)
    const topGeometry = new THREE.PlaneGeometry(d - 2 * b, w - 2 * b);
    const uv = topGeometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, b / d + uv.getX(i) * (1 - 2 * b / d), b / w + uv.getY(i) * (1 - 2 * b / w));
    const top = new THREE.Mesh(topGeometry, new THREE.MeshStandardMaterial({ map: glassTexture(H.zones), roughness: 0.14, metalness: 0.1 }));
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
    digit.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); // upright from the front (−x)
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
