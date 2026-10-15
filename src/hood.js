import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sfx } from './audio.js';
import { SMOKE_ALARM as A, KITCHEN } from './config.js';

let finishes;
function hoodFinishes() {
  if (finishes) return finishes;
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const brushed = canvas(256, 128), b = brushed.getContext('2d');
  b.fillStyle = '#c2c7cb'; b.fillRect(0, 0, 256, 128);
  for (let y = 0; y < 128; y++) {
    b.fillStyle = `rgba(${y % 3 ? '255,255,255' : '45,55,64'},${0.025 + (Math.sin(y * 17) + 1) * 0.025})`;
    b.fillRect(0, y, 256, 1);
  }
  const filter = canvas(256, 256), f = filter.getContext('2d');
  f.fillStyle = '#777e83'; f.fillRect(0, 0, 256, 256);
  f.strokeStyle = '#b5bec3'; f.lineWidth = 1;
  // Fine woven metal is one repeating texture, not hundreds of tiny wire meshes.
  for (let x = -256; x < 512; x += 4) {
    f.beginPath(); f.moveTo(x, 0); f.lineTo(x + 256, 256); f.stroke();
    f.beginPath(); f.moveTo(x, 0); f.lineTo(x - 256, 256); f.stroke();
  }
  const texture = c => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  finishes = {
    steel: new THREE.MeshStandardMaterial({ map: texture(brushed), roughness: 0.38, metalness: 0.55 }),
    filter: new THREE.MeshStandardMaterial({ map: texture(filter), roughness: 0.6, metalness: 0.35 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x151b20, roughness: 0.14, metalness: 0.25 }),
  };
  return finishes;
}

// The cooker hood (Spiskåpa Tango, #194) and the smoke alarm in the kitchen ceiling. E on the hood switches the fan
// on and off: a low whoosh and a green LED. Its light is separate, like on a real hood (#221): a second button on the
// front (`lampButton`) is a lamp of its own (interior.js puts it in world.lamps; lights.js switches it). The chicken's smoke (chicken.js) is drawn up into the
// hood while it runs. If something smokes for more than SMOKE_ALARM.delay s without the hood running over it, the
// alarm goes off — a loud beeping and a blinking red LED — until the smoke is gone or the hood is switched on.

export class Hood {
  /** x0..x1 (wall cabinet depth), z0..z1 (over the hob), y0 = its underside, y1 = its top. */
  constructor({ x0, x1, z0, z1, y0, y1, lampMaterial }) {
    Object.assign(this, { name: 'köksfläkten', kind: 'hood', on: false, sound: null });
    this.object = new THREE.Group();
    const D = KITCHEN.hoodDetail, M = hoodFinishes(), midZ = (z0 + z1) / 2;
    const steel = [new THREE.BoxGeometry(x1 - x0 - 0.02, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, midZ)];
    const filters = [], spots = [];
    for (const [a, b] of [[z0 + D.rim, midZ - D.filterGap / 2], [midZ + D.filterGap / 2, z1 - D.rim]]) {
      const p = new THREE.PlaneGeometry(x1 - x0 - 2 * D.rim, b - a).rotateX(Math.PI / 2).translate((x0 + x1) / 2, y0 - 0.0005, (a + b) / 2);
      filters.push(p);
    }
    for (const z of [z0 + D.spotInset, z1 - D.spotInset]) {
      const x = x0 + D.spotInset;
      // Recessed warm diffusers share the original switchable hood-lamp material.
      steel.push(new THREE.CylinderGeometry(D.spotRadius + 0.004, D.spotRadius + 0.004, 0.003, 20).translate(x, y0 - 0.0015, z));
      spots.push(new THREE.CircleGeometry(D.spotRadius, 20).rotateX(Math.PI / 2).translate(x, y0 - 0.0031, z));
    }
    const merged = geos => { const parts = geos.map(g => g.index ? g.toNonIndexed() : g); const result = mergeGeometries(parts); for (const g of new Set([...parts, ...geos])) g.dispose(); return result; };
    const shell = new THREE.Mesh(merged(steel), M.steel);
    const meshFilter = new THREE.Mesh(merged(filters), M.filter);
    const diffusers = new THREE.Mesh(merged(spots), lampMaterial ?? new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2dc, emissiveIntensity: 0.04 }));
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.002, (y1 - y0) * 0.48, z1 - z0 - 2 * D.rim), M.glass);
    strip.position.set(x0 - 0.001, (y0 + y1) / 2, midZ);
    shell.receiveShadow = meshFilter.receiveShadow = strip.receiveShadow = true;
    this.object.add(shell, meshFilter, diffusers, strip);
    // a small control strip on the front edge with a green LED
    this.ledMat = new THREE.MeshBasicMaterial({ color: 0x1a2a1a });
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.012, 0.012), this.ledMat);
    led.position.set(x0 - 0.003, (y0 + y1) / 2, z1 - 0.18); // beside the fan button
    // the E box: the whole hood, a little bigger
    const pick = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0 + 0.06, z1 - z0), new THREE.MeshBasicMaterial()); // flush with the front: the light button stands out of it
    pick.position.set((x0 + x1) / 2 + 0.005, (y0 + y1) / 2, (z0 + z1) / 2);
    pick.visible = false;
    this.object.add(led, pick);
    this.object.traverse((m) => { m.userData.door = this; });
    // two buttons on the front edge: the fan (the whole hood is its target) and the light (its own lamp, #221)
    const btnMat = new THREE.MeshStandardMaterial({ color: 0x2a2b2d, roughness: 0.4 });
    const fanBtn = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.02, 0.03), btnMat);
    fanBtn.position.set(x0 - 0.004, (y0 + y1) / 2, z1 - 0.14);
    fanBtn.userData.door = this;
    this.object.add(fanBtn);
    this.lampButton = new THREE.Group();
    this.lampButton.position.set(x0 - 0.004, (y0 + y1) / 2, z1 - 0.08);
    const lampBtn = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.02, 0.03), new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.4 }));
    const lampPick = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.05), new THREE.MeshBasicMaterial());
    lampPick.position.x = -0.04;
    lampPick.visible = false;
    this.lampButton.add(lampBtn, lampPick);
    this.object.add(this.lampButton);
    this.pickable = this.object;
    this.intake = new THREE.Vector3((x0 + x1) / 2, y0, (z0 + z1) / 2); // where smoke goes
  }

  get isOpen() { return this.on; }
  get verb() { return this.on ? 'stänga av' : 'slå på'; }

  toggle() { this.set(!this.on); }

  set(on) {
    if (on === this.on) return;
    this.on = on;
    sfx.click(this.intake);
    this.sound?.stop(); this.sound = on ? sfx.fan(this.intake) : null;
    this.ledMat.color.setHex(on ? 0x30ff50 : 0x1a2a1a);
  }

  /** Is world point p (a smoking thing) under the running hood's draw? */
  draws(p) { return this.on && Math.hypot(p.x - this.intake.x, p.z - this.intake.z) < A.hoodReach && p.y < this.intake.y && p.y > this.intake.y - 1.2; }

  update() {}
}

export class SmokeAlarm {
  constructor() {
    Object.assign(this, { ringing: false, t: 0, smokyFor: 0, sound: null });
    this.object = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.065, 0.035, 24), new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.5 }));
    body.position.y = -0.0175;
    this.ledMat = new THREE.MeshBasicMaterial({ color: 0x401010 });
    const led = new THREE.Mesh(new THREE.CircleGeometry(0.006, 12).rotateX(Math.PI / 2), this.ledMat);
    led.position.set(0.03, -0.0352, 0);
    this.object.add(body, led);
    this.object.position.set(A.x, A.y, A.z);
    this.pos = new THREE.Vector3(A.x, A.y - 0.05, A.z);
  }

  /** `smoky` = something smokes without the hood drawing it away. */
  update(dt, smoky) {
    this.t += dt;
    this.smokyFor = smoky ? this.smokyFor + dt : 0;
    const ring = this.smokyFor > A.delay;
    if (ring !== this.ringing) {
      this.ringing = ring;
      this.sound?.stop(); this.sound = ring ? sfx.alarm(this.pos) : null;
      if (ring) this.onRing?.();
    }
    // a slow standby blink, fast red flashes while it rings
    const on = ring ? (this.t * 4) % 1 < 0.5 : (this.t % 40) < 0.08;
    this.ledMat.color.setHex(on ? 0xff2020 : 0x401010);
  }

  /** F / a fresh start: quiet. */
  reset() { this.smokyFor = 0; this.update(0, false); }
}
