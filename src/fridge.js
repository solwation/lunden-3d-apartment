import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { sfx } from './audio.js';

// The fridge (Electrolux LRT7ME39X, stainless): hollow cabinet with a lit white liner, glass
// shelves and a door that swings open with E. On the middle shelf: a roast chicken, smoking
// while the door is open. Kept out of world.doors so the cat logic never uses it.
// The freezer beside it (#161) is the same class with `freezer: true`: frosty liner, shelves + drawers.

const steel = new THREE.MeshStandardMaterial({ color: 0xc3c7ca, roughness: 0.32, metalness: 0.35 });
const steelDark = new THREE.MeshStandardMaterial({ color: 0x8f9497, roughness: 0.35, metalness: 0.35 });
const fridgeLiner = new THREE.MeshStandardMaterial({ color: 0xf6f8f8, roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0.18 });
const fridgeLamp = new THREE.MeshBasicMaterial({ color: 0xffffff });
const frost = new THREE.MeshStandardMaterial({ color: 0xeaf4fb, roughness: 0.85, emissive: 0xcfe6ff, emissiveIntensity: 0.22 });
const coldLamp = new THREE.MeshBasicMaterial({ color: 0xdcecff });
const basket = new THREE.MeshStandardMaterial({ color: 0xe4f1f8, transparent: true, opacity: 0.55, roughness: 0.3, depthWrite: false });
const glass = new THREE.MeshStandardMaterial({ color: 0xdff0f4, transparent: true, opacity: 0.35, roughness: 0.05, depthWrite: false });
const skin = new THREE.MeshStandardMaterial({ color: 0xb8662a, roughness: 0.35 });
const skinDark = new THREE.MeshStandardMaterial({ color: 0x8e4a1c, roughness: 0.4 });
const bone = new THREE.MeshStandardMaterial({ color: 0xf1e7d2, roughness: 0.6 });
const plate = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15 });
const milk = new THREE.MeshStandardMaterial({ color: 0x3f7fd0, roughness: 0.6 });
const juice = new THREE.MeshStandardMaterial({ color: 0xf2a33a, roughness: 0.5 });

function box(sx, sy, sz, x, y, z, m, r = 0) {
  const geo = r ? new RoundedBoxGeometry(sx, sy, sz, 2, r) : new THREE.BoxGeometry(sx, sy, sz);
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

function blob(m, sx, sy, sz, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), m);
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

/** Roast chicken on a plate, ~26 cm long, legs towards +z (the door). */
function chicken() {
  const g = new THREE.Group();
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.015, 32), plate);
  p.position.y = 0.0075;
  g.add(p);
  g.add(blob(skin, 0.1, 0.07, 0.13, 0, 0.075, 0));          // body
  g.add(blob(skinDark, 0.08, 0.03, 0.1, 0, 0.13, -0.01));   // browned breast top
  for (const s of [-1, 1]) {
    const thigh = blob(skin, 0.045, 0.04, 0.07, s * 0.075, 0.06, 0.07);
    thigh.rotation.y = s * 0.3;
    g.add(thigh);
    const end = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.012, 0.05, 8), bone);
    end.rotation.x = Math.PI / 2 - 0.4;
    end.position.set(s * 0.08, 0.08, 0.14);
    g.add(end);
    g.add(blob(bone, 0.013, 0.013, 0.013, s * 0.08, 0.09, 0.165));
    const wing = blob(skinDark, 0.035, 0.022, 0.06, s * 0.1, 0.09, -0.06);
    wing.rotation.z = s * 0.5;
    g.add(wing);
  }
  return g;
}

function smokeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,0.9)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Fridge {
  /**
   * x0..x1 across the front, zFront = front face of the cabinet (door outside it, towards −z),
   * zBack, floor y0, height h. `hinge` 'x0' (the fridge: the handle is by x1, where the freezer is) or
   * 'x1' (the freezer, #161: its handle by the fridge). `freezer` = frosty liner, cold light, shelves and
   * drawers instead of food. `max` = the door's stop in degrees (#116).
   */
  constructor({ x0, x1, zFront, zBack, y0, h, hinge = 'x0', freezer = false, max = 105, name = 'kylskåpet' }) {
    Object.assign(this, { name, kind: 'fridge', isOpen: false, t: 0, freezer, max });
    const g = new THREE.Group();
    const w = x1 - x0, d = zBack - zFront, cx = (x0 + x1) / 2, cz = (zFront + zBack) / 2;
    const wall = 0.04;
    const liner = freezer ? frost : fridgeLiner, lamp = freezer ? coldLamp : fridgeLamp;
    // stainless shell (sides, top, bottom, back) and the white liner inside
    g.add(box(wall, h, d, x0 + wall / 2, y0 + h / 2, cz, steel));
    g.add(box(wall, h, d, x1 - wall / 2, y0 + h / 2, cz, steel));
    g.add(box(w, wall, d, cx, y0 + h - wall / 2, cz, steel));
    g.add(box(w, 0.08, d, cx, y0 + 0.04, cz, steel));
    g.add(box(w, h, wall, cx, y0 + h / 2, zBack - wall / 2, steel));
    const iw = w - 2 * wall, ih = h - wall - 0.08, iy = y0 + 0.08 + ih / 2;
    for (const s of [-1, 1]) g.add(box(0.004, ih, d - wall, cx + s * (iw / 2 - 0.002), iy, cz - wall / 2 + 0.002, liner));
    g.add(box(iw, ih, 0.004, cx, iy, zBack - wall - 0.002, liner));
    g.add(box(iw, 0.004, d - wall, cx, y0 + 0.082, cz - wall / 2, liner));
    g.add(box(iw, 0.004, d - wall, cx, y0 + h - wall - 0.002, cz - wall / 2, liner));
    g.add(box(iw * 0.5, 0.01, 0.05, cx, y0 + h - wall - 0.01, zBack - 0.15, lamp)); // light
    this.inside = { cx, cz, iw, depth: d - wall, y0 };
    if (freezer) {
      // frost along the back, two open shelves at the top (the fish fingers go there, #162) and see-through
      // drawers (baskets) with frozen things in them below, each with a grip on its front edge
      g.add(box(iw - 0.01, 0.02, 0.02, cx, y0 + h - wall - 0.05, zBack - wall - 0.012, liner));
      this.shelves = [1.32, 1.6].map((y) => y0 + y + 0.004); // the shelves' top faces (world y)
      for (const y of [1.32, 1.6]) g.add(box(iw - 0.01, 0.008, d - wall - 0.03, cx, y0 + y, cz - 0.015, glass));
      const bz0 = zFront + 0.03, bz1 = zBack - wall - 0.03, bw = iw - 0.03, bzc = (bz0 + bz1) / 2;
      for (const [yb, yt] of [[0.1, 0.4], [0.42, 0.72], [0.74, 1.0], [1.02, 1.28]]) {
        const bh = yt - yb;
        g.add(box(bw, bh - 0.02, 0.006, cx, y0 + yb + bh / 2, bz0, basket));                                    // front
        g.add(box(bw, 0.006, bz1 - bz0, cx, y0 + yb + 0.003, bzc, basket));                                    // bottom
        for (const s of [-1, 1]) g.add(box(0.006, bh * 0.7, bz1 - bz0, cx + s * bw / 2, y0 + yb + bh * 0.35, bzc, basket));
        g.add(box(bw * 0.4, 0.02, 0.012, cx, y0 + yt - 0.035, bz0 - 0.006, liner));                            // grip
        g.add(box(bw * 0.7, bh * 0.35, (bz1 - bz0) * 0.6, cx, y0 + yb + 0.006 + bh * 0.175, bzc + 0.02, liner)); // frozen bags
      }
    } else {
      // glass shelves + a crisper drawer at the bottom
      for (const y of [0.45, 0.82, 1.2, 1.52]) g.add(box(iw - 0.01, 0.006, d - wall - 0.04, cx, y0 + y, cz - 0.01, glass));
      g.add(box(iw - 0.02, 0.22, d - wall - 0.08, cx, y0 + 0.2, cz, glass));
      // the chicken on the middle shelf, a juice and milk on the top shelf
      const ch = chicken();
      ch.position.set(cx, y0 + 0.823, cz - 0.03);
      g.add(ch);
      this.chicken = ch;
      g.add(box(0.07, 0.2, 0.07, cx - 0.12, y0 + 1.31, cz, milk, 0.008), box(0.07, 0.18, 0.07, cx + 0.1, y0 + 1.3, cz + 0.02, juice, 0.008));
    }

    // door: pivot on the hinge edge, panel in front of the cabinet (s = which way it runs from the hinge)
    const s = hinge === 'x0' ? 1 : -1;
    this.sign = s;
    this.door = new THREE.Group();
    this.door.position.set(hinge === 'x0' ? x0 : x1, y0, zFront);
    const dt = 0.055;
    this.door.add(box(w, h - 0.01, dt, s * w / 2, h / 2, -dt / 2, steel));
    this.door.add(box(w - 0.06, h - 0.1, 0.004, s * w / 2, h / 2, -0.002 + 0.002, liner)); // inner face
    this.door.add(box(0.02, 0.95, 0.03, s * (w - 0.05), 1.22, -dt - 0.015, steelDark));     // handle
    if (freezer) this.door.add(box(w - 0.08, h - 0.16, 0.012, s * w / 2, h / 2, 0.008, liner)); // the flat inner door inside its gasket
    else {
      for (const y of [0.4, 0.85, 1.3]) this.door.add(box(w - 0.1, 0.08, 0.07, s * w / 2, y, 0.035, glass)); // door bins
      this.door.add(box(0.07, 0.24, 0.07, s * w * 0.3, 0.56, 0.035, juice, 0.01));
    }
    this.door.traverse((m) => { m.userData.door = this; });
    g.add(this.door);
    this.pickable = this.door;

    // smoke from the chicken, drifting out of the open door
    const mat = new THREE.SpriteMaterial({ map: smokeTexture(), color: 0xb9bcc0, transparent: true, depthWrite: false, opacity: 0 });
    this.smoke = freezer ? [] : [...Array(10)].map((_, i) => {
      const s = new THREE.Sprite(mat.clone());
      s.userData.phase = i / 10;
      g.add(s);
      return s;
    });
    this.smokeFrom = new THREE.Vector3(cx, y0 + 0.95, cz - 0.03);
    this.object = g;
  }

  toggle() {
    this.isOpen = !this.isOpen;
    const p = this.door.position;
    sfx.fridge({ x: p.x, y: p.y + 1.2, z: p.z }, this.isOpen);
  }

  update(dt) {
    const target = this.isOpen ? 1 : 0;
    this.t += Math.sign(target - this.t) * Math.min(Math.abs(target - this.t), dt * 1.6);
    const e = this.t * this.t * (3 - 2 * this.t);
    this.door.rotation.y = this.sign * e * THREE.MathUtils.degToRad(this.max);
    this.clock = (this.clock ?? 0) + dt;
    for (const s of this.smoke) {
      const k = (this.clock / 3 + s.userData.phase) % 1; // 0 → 1 over 3 s
      s.position.copy(this.smokeFrom).add(new THREE.Vector3(Math.sin((k + s.userData.phase) * 9) * 0.04, k * 0.75, -k * 0.5));
      s.scale.setScalar(0.08 + k * 0.22);
      s.material.opacity = e * 0.6 * Math.sin(Math.PI * k);
      s.visible = e > 0.05;
    }
  }
}
