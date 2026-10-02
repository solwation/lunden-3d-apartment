import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CAR as C } from './config.js';
import { sfx } from './audio.js';

// Our car (#173): a white Renault Megane E-Tech, called by the key in the hall. State 'gone' → press → 'arriving'
// (east along our lane, in through the gap in the shrubs, slowing to a stop right outside our door, #208) →
// 'parked' (a collision box) → press → 'leaving' (round in the yard, out the same gap, west out of sight) → 'gone'. A press while it drives is
// ignored. It waits rather than drive into the visitor. Built facing local +x; y = 0 is the road.

/** Waypoints → a polyline with the corners rounded off (Chaikin, the ends kept) + cumulative lengths. */
function smooth(wp) {
  let pts = wp.map((p) => [...p]);
  for (let it = 0; it < 4; it++) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      if (i > 0) out.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25]);
      if (i < pts.length - 2) out.push([ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
    }
    out.push(pts.at(-1));
    pts = out;
  }
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, len };
}

function plateTexture(text) {
  const c = document.createElement('canvas'); c.width = 520; c.height = 110;
  const g = c.getContext('2d');
  g.fillStyle = '#fbfbf8'; g.fillRect(0, 0, 520, 110);
  g.fillStyle = '#1f3f9a'; g.fillRect(0, 0, 62, 110);       // the EU strip
  g.fillStyle = '#f2d21b'; for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.arc(31 + Math.cos(a) * 17, 36 + Math.sin(a) * 17, 3, 0, 7); g.fill(); }
  g.fillStyle = '#fff'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.fillText('S', 31, 96);
  g.fillStyle = '#111'; g.font = 'bold 82px "DejaVu Sans", Arial, sans-serif'; g.fillText(text, 290, 85);
  g.strokeStyle = '#111'; g.lineWidth = 6; g.strokeRect(3, 3, 514, 104);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export class Car {
  constructor() {
    const g = new THREE.Group(), L = C.l, W = C.w;
    const paint = new THREE.MeshStandardMaterial({ color: C.color, roughness: 0.25, metalness: 0.3 });
    const black = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.4 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x1b2430, roughness: 0.1, metalness: 0.5 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xd7dadc, roughness: 0.2, metalness: 0.8 });
    this.lightMat = new THREE.MeshStandardMaterial({ color: 0xf4f6ff, emissive: 0xeaf0ff, emissiveIntensity: 0.2 });
    this.tailMat = new THREE.MeshStandardMaterial({ color: 0x8a0f12, emissive: 0xff2020, emissiveIntensity: 0.15 });
    this.blinkMat = new THREE.MeshStandardMaterial({ color: 0xc87a10, emissive: 0xffa020, emissiveIntensity: 0 });
    const box = (sx, sy, sz, x, y, z, m, r = 0.04) => { const o = new THREE.Mesh(new RoundedBoxGeometry(sx, sy, sz, 3, Math.min(r, sx / 2, sy / 2, sz / 2)), m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
    box(L, 0.62, W, 0, 0.62, 0, paint, 0.16);                         // body
    box(L * 0.92, 0.12, W + 0.04, 0, 0.36, 0, black, 0.05);            // black sills / lower cladding
    box(L * 0.5, 0.44, W * 0.86, -0.35, 1.14, 0, glass, 0.12);         // cabin glass
    box(L * 0.48, 0.05, W * 0.84, -0.37, 1.37, 0, black, 0.025);       // black roof
    box(0.82, 0.05, W * 0.84, 0.6, 1.12, 0, glass, 0.02).rotation.z = -0.62; // raked windscreen down to the bonnet
    box(0.5, 0.05, W * 0.84, -1.55, 1.1, 0, glass, 0.02).rotation.z = 0.9;   // sloping tailgate glass
    for (const s of [-1, 1]) box(0.14, 0.08, 0.1, L * 0.14, 1.06, s * (W / 2 + 0.04), black, 0.03); // mirrors
    for (const s of [-1, 1]) box(0.04, 0.05, 0.5, L / 2 - 0.01, 0.82, s * 0.55, this.lightMat, 0.02); // slim LED headlights
    box(0.04, 0.06, W * 0.86, -L / 2 + 0.01, 0.92, 0, this.tailMat, 0.02);  // the light bar across the back
    for (const s of [-1, 1]) for (const x of [L / 2 - 0.05, -L / 2 + 0.05]) box(0.06, 0.04, 0.1, x, 0.75, s * (W / 2 - 0.08), this.blinkMat, 0.015);
    const logo = box(0.02, 0.12, 0.12, L / 2 + 0.01, 0.72, 0, chrome, 0.01); logo.rotation.x = Math.PI / 4; // the diamond
    const plate = new THREE.MeshStandardMaterial({ map: plateTexture(C.plate), roughness: 0.5 });
    this.plates = [];
    for (const [x, ry] of [[L / 2 + 0.03, Math.PI / 2], [-L / 2 - 0.03, -Math.PI / 2]]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.11), plate); p.position.set(x, 0.5, 0); p.rotation.y = ry; g.add(p); this.plates.push(p);
    }
    this.wheels = [];
    const tyre = new THREE.CylinderGeometry(0.36, 0.36, 0.24, 24).rotateX(Math.PI / 2), rim = new THREE.CylinderGeometry(0.24, 0.24, 0.25, 12).rotateX(Math.PI / 2);
    for (const x of [L * 0.32, -L * 0.32]) for (const s of [-1, 1]) {
      const w = new THREE.Group(); w.position.set(x, 0.36, s * (W / 2 - 0.12));
      w.add(new THREE.Mesh(tyre, black), new THREE.Mesh(rim, chrome));
      for (let k = 0; k < 5; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.4, 0.02), black); sp.rotation.z = (k / 5) * Math.PI; sp.position.z = s * 0.13; w.add(sp); } // spokes: they show it turning
      g.add(w); this.wheels.push(w);
      const arch = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 6, 16, Math.PI), black); arch.position.set(x, 0.38, s * (W / 2 + 0.005)); g.add(arch);
    }
    g.visible = false;
    this.object = g;
    Object.assign(this, { state: 'gone', d: 0, speed: 0, blinkT: 0, hum: null, path: null, plateText: C.plate });
  }

  /** The key was pressed. */
  call() {
    if (this.state === 'gone') { this.path = this.arrival(); this.d = 0; this.state = 'arriving'; this.speed = C.speed; this.object.visible = true; this.hum = sfx.evHum(this.object.position); }
    else if (this.state === 'parked') { this.path = this.departure(); this.d = 0; this.state = 'leaving'; this.speed = 0; this.blinkT = 1.2; this.hum = sfx.evHum(this.object.position); }
    this.place();
  }

  /** Parked in front of the house at once (&car, screenshots). */
  park() { this.path = this.arrival(); this.d = this.total(); this.state = 'parked'; this.object.visible = true; this.place(); }

  arrival() { return smooth(C.arrive); }
  departure() { return smooth(C.leave); }

  total() { return this.path.len.at(-1); }

  /** Position + heading at distance d along the path. */
  at(d) {
    const { pts, len } = this.path;
    let k = 1;
    while (k < pts.length - 1 && len[k] < d) k++;
    const [ax, az] = pts[k - 1], [bx, bz] = pts[k], u = Math.min(1, Math.max(0, (d - len[k - 1]) / (len[k] - len[k - 1] || 1)));
    return { x: ax + (bx - ax) * u, z: az + (bz - az) * u, yaw: Math.atan2(-(bz - az), bx - ax) }; // local +x along the way
  }

  place() {
    const p = this.at(this.d);
    this.object.position.set(p.x, 0, p.z);
    this.object.rotation.y = p.yaw;
  }

  /** Is the visitor standing in the way just ahead? */
  blocked(player) {
    if (!player) return false;
    const yaw = this.object.rotation.y, fx = Math.cos(yaw), fz = -Math.sin(yaw);
    const dx = player.pos.x - this.object.position.x, dz = player.pos.z - this.object.position.z;
    const ahead = dx * fx + dz * fz, side = Math.abs(-dx * fz + dz * fx);
    return ahead > 0 && ahead < C.l / 2 + 3 && side < C.w / 2 + 0.6;
  }

  update(dt, night, player) {
    this.blinkT = Math.max(0, this.blinkT - dt);
    this.blinkMat.emissiveIntensity = this.blinkT > 0 && Math.floor(this.blinkT * 3) % 2 === 0 ? 2.5 : 0;
    this.lightMat.emissiveIntensity = night ? 2.2 : 0.3;
    this.tailMat.emissiveIntensity = night ? 1.2 : 0.2;
    if (this.state !== 'arriving' && this.state !== 'leaving') return;
    const left = this.total() - this.d;
    let want = C.speed;
    if (this.state === 'arriving') want = Math.min(C.speed, Math.max(0.4, Math.sqrt(2 * C.brake * left)));
    if (this.blocked(player)) want = 0; // never into the visitor
    this.speed += Math.sign(want - this.speed) * Math.min(Math.abs(want - this.speed), C.brake * 1.5 * dt);
    this.d = Math.min(this.total(), this.d + this.speed * dt);
    for (const w of this.wheels) w.rotation.z -= (this.speed * dt) / 0.36;
    this.place();
    this.hum?.move(this.object.position, this.speed);
    if (this.d >= this.total() - 1e-6) {
      this.hum?.stop(); this.hum = null; this.speed = 0;
      if (this.state === 'arriving') { this.state = 'parked'; this.blinkT = 1.2; } // blinks twice as it stops
      else { this.state = 'gone'; this.object.visible = false; }
    }
  }

  /** Collision while parked (world segments, plan x/z). */
  segments() {
    if (this.state !== 'parked') return [];
    const { x, z } = this.object.position, hx = C.l / 2, hz = C.w / 2;
    const c = [[x - hx, z - hz], [x + hx, z - hz], [x + hx, z + hz], [x - hx, z + hz]];
    return c.map((p, i) => [...p, ...c[(i + 1) % 4]]);
  }
}
