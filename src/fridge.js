import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Openable, pivotAround } from './openables.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { sfx } from './audio.js';
import { FRIDGE_ALARM as AL, SCORE, COLD_DRAWERS as C } from './config.js';

// The fridge (Electrolux LRT7ME39X, stainless): hollow cabinet with a lit white liner, glass
// shelves and a door that swings open with E. The roast chicken on the middle shelf is a Holdable of its own
// (chicken.js, #160; `shelfSpot` = its place). Kept out of world.doors so the cat logic never uses it.
// The freezer beside it (#161) is the same class with `freezer: true`: frosty liner, shelves + drawers.
// The door alarm (#288): open longer than FRIDGE_ALARM.after s it beeps every `every` s and a red LED on the door's
// top blinks until it is shut; `onAlarm(longer)` (main.js: a deduction) when it starts and for each further `after` s
// (at most SCORE.penalties.fridgeMax of those); `paused` (main.js: the note on the freezer door is open) stops the timer.

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
export function chicken() {
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

export class Fridge {
  /**
   * x0..x1 across the front, zFront = front face of the cabinet (door outside it, towards −z),
   * zBack, floor y0, height h. `hinge` 'x0' (the fridge: the handle is by x1, where the freezer is) or
   * 'x1' (the freezer, #161: its handle by the fridge). `freezer` = frosty liner, cold light, shelves and
   * drawers instead of food. `max` = the door's stop in degrees (#116).
   */
  constructor({ x0, x1, zFront, zBack, y0, h, hinge = 'x0', freezer = false, max = 105, name = 'kylskåpet' }) {
    Object.assign(this, { name, kind: 'fridge', isOpen: false, t: 0, freezer, max, openFor: 0, alarming: false, beepT: 0, longer: 0, paused: false });
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
    this.drawers = [];
    const bz0 = zFront + C.endClearance, bz1 = zBack - wall - C.endClearance;
    const bw = iw - 2 * C.sideClearance, bd = bz1 - bz0, bzc = (bz0 + bz1) / 2;
    const makeDrawer = ([yb, yt], index) => {
      const bh = yt - yb, material = freezer ? basket : glass, parts = [
        box(bw, bh, C.wall, cx, y0 + yb + bh / 2, bz0, material),
        box(bw, bh, C.wall, cx, y0 + yb + bh / 2, bz1, material),
        box(bw, C.wall, bd, cx, y0 + yb + C.wall / 2, bzc, material),
        ...[-1, 1].map(sign => box(C.wall, bh, bd, cx + sign * bw / 2, y0 + yb + bh / 2, bzc, material)),
      ];
      for (const part of parts) { part.updateMatrix(); part.geometry.applyMatrix4(part.matrix); }
      const body = new THREE.Mesh(mergeGeometries(parts.map(part => part.geometry)), material);
      for (const part of parts) part.geometry.dispose();
      body.castShadow = body.receiveShadow = true;
      const grip = box(bw * 0.4, 0.02, 0.012, cx, y0 + yt - 0.035, bz0 - C.wall, liner);
      grip.updateMatrix(); grip.geometry.applyMatrix4(grip.matrix);
      const at = new THREE.Vector3(cx, y0 + yb, bz0);
      const drawer = new Openable({ name: freezer ? `fryslåda ${index + 1}` : 'grönsakslådan',
        object: pivotAround([body, new THREE.Mesh(grip.geometry, liner)], at), mode: 'drawer', out: [0, 0, -C.out], speed: C.speed });
      drawer.body = body;
      drawer.stock = 'own';
      drawer.coldDrawer = true; drawer.coldOwner = this;
      drawer.storeId = freezer ? `freezerDrawer${index + 1}` : 'fridgeDrawer';
      drawer.slotPoints = C.slotDepth.flatMap(dz => C.slotAcross.map(dx => new THREE.Vector3(cx + dx * bw, y0 + yb + C.wall + C.slotLift, bzc + dz * bd)));
      drawer.normal = new THREE.Vector3(0, 0, -1);
      drawer.bounds = new THREE.Box3(new THREE.Vector3(cx - bw / 2, y0 + yb, bz0), new THREE.Vector3(cx + bw / 2, y0 + yt, bz1));
      Object.defineProperties(drawer, {
        verb: { get: () => drawer.isOpen ? 'skjuta in' : 'dra ut' },
        blocked: { get: () => !this.isOpen || this.t < 1 },
        blockedText: { get: () => `Öppna ${this.freezer ? 'frysen' : 'kylen'} helt först` },
      });
      g.add(drawer.object); this.drawers.push(drawer);
    };
    if (freezer) {
      // frost along the back, two open shelves at the top (the fish fingers go there, #162) and see-through
      // empty storage drawers below, each with a grip on its front edge (#504)
      g.add(box(iw - 0.01, 0.02, 0.02, cx, y0 + h - wall - 0.05, zBack - wall - 0.012, liner));
      this.shelves = [1.32, 1.6].map((y) => y0 + y + 0.004); // the shelves' top faces (world y)
      for (const y of [1.32, 1.6]) g.add(box(iw - 0.01, 0.008, d - wall - 0.03, cx, y0 + y, cz - 0.015, glass));
      C.freezer.forEach(makeDrawer);
    } else {
      // glass shelves + a crisper drawer at the bottom
      for (const y of [0.45, 0.82, 1.2, 1.52]) g.add(box(iw - 0.01, 0.006, d - wall - 0.04, cx, y0 + y, cz - 0.01, glass));
      C.fridge.forEach(makeDrawer);
      // the chicken's place on the middle shelf (chicken.js) and the named milk carton above (#168)
      this.shelfSpot = new THREE.Vector3(cx, y0 + 0.823, cz - 0.03);
      this.milkAt = new THREE.Vector3(cx - 0.12, y0 + 1.203, cz); // the milk carton stands here (a Holdable, milk.js, #168)
    }

    // door: pivot on the hinge edge, panel in front of the cabinet (s = which way it runs from the hinge)
    const s = hinge === 'x0' ? 1 : -1;
    this.sign = s;
    this.door = new THREE.Group();
    this.door.position.set(hinge === 'x0' ? x0 : x1, y0, zFront);
    const dt = 0.055;
    this.size = { w, h, dt }; // the door (the TODO post-its, todo.js, #340)
    this.door.add(box(w, h - 0.01, dt, s * w / 2, h / 2, -dt / 2, steel));
    this.door.add(box(w - 0.06, h - 0.1, 0.004, s * w / 2, h / 2, -0.002 + 0.002, liner)); // inner face
    this.door.add(box(0.02, 0.95, 0.03, s * (w - 0.05), 1.22, -dt - 0.015, steelDark));     // handle
    if (freezer) this.door.add(box(w - 0.08, h - 0.16, 0.012, s * w / 2, h / 2, 0.008, liner)); // the flat inner door inside its gasket
    else {
      for (const y of [0.4, 0.85, 1.3]) this.door.add(box(w - 0.1, 0.08, 0.07, s * w / 2, y, 0.035, glass)); // door bins
    }
    // the door alarm's LED (#288): a small red dot on the door's front, near the top on the handle side
    this.ledMat = new THREE.MeshBasicMaterial({ color: 0x3a0c0c });
    const led = new THREE.Mesh(new THREE.CircleGeometry(0.005, 12), this.ledMat);
    led.rotation.y = Math.PI; // the door's front faces −z
    led.position.set(s * (w - 0.05), h - 0.08, -dt - 0.0005);
    this.door.add(led);
    this.door.traverse((m) => { m.userData.door = this; });
    g.add(this.door);
    this.pickable = this.door;

    this.object = g;
  }

  get blocked() { return this.isOpen && this.drawers.some(drawer => drawer.isOpen || drawer.t > 0); }
  get blockedText() { return 'Skjut in lådorna först'; }

  toggle() {
    if (this.blocked) return false;
    this.isOpen = !this.isOpen;
    const p = this.door.position;
    sfx.fridge({ x: p.x, y: p.y + 1.2, z: p.z }, this.isOpen);
  }

  update(dt) {
    const target = this.isOpen ? 1 : 0;
    this.t += Math.sign(target - this.t) * Math.min(Math.abs(target - this.t), dt * 1.6);
    const e = this.t * this.t * (3 - 2 * this.t);
    this.door.rotation.y = this.sign * e * THREE.MathUtils.degToRad(this.max);
    // the door alarm (#288)
    if (!this.isOpen) this.openFor = 0;
    else if (!this.paused) this.openFor += dt;
    const ring = this.isOpen && this.openFor > AL.after;
    if (ring && !this.alarming) { this.alarming = true; this.beepT = 0; this.longer = 0; this.onAlarm?.(false); }
    if (!ring && this.alarming) this.alarming = false;
    if (ring) {
      if ((this.beepT -= dt) <= 0) { this.beepT = AL.every; sfx.fridgeBeep(this.door.getWorldPosition(new THREE.Vector3()).setY(this.door.position.y + 1.7)); }
      if (this.longer < SCORE.penalties.fridgeMax && this.openFor > AL.after * (this.longer + 2)) { this.longer++; this.onAlarm?.(true); }
    }
    this.ledMat.color.setHex(ring && this.beepT > AL.every / 2 ? 0xff2a2a : 0x3a0c0c);
  }
}
