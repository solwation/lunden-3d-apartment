import * as THREE from 'three';
import { sfx } from './audio.js';

// The oven and the microwave in the tall kitchen unit open with E (#58). The doors are their own
// objects (the rest of the kitchen stays one merged mesh per material in interior.js); they live in
// world.lids, so the cat logic and the door tests never see them. A small lamp inside lights up
// while a door is open (own emissive material, no extra lights).
//
// Built for a front facing −x (the east kitchen run): `f` = x of the front face, the doors swing
// out towards −x.

const black = new THREE.MeshStandardMaterial({ color: 0x141516, roughness: 0.18 });
const glass = new THREE.MeshStandardMaterial({ color: 0x050606, roughness: 0.08 });
const steel = new THREE.MeshStandardMaterial({ color: 0xc3c7ca, roughness: 0.32, metalness: 0.35 });

const box = (sx, sy, sz, x, y, z, m) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
};

class ApplianceDoor {
  constructor({ name, pivot, hinge, maxAngle, lamp, sound }) {
    Object.assign(this, { name, kind: 'appliance', isOpen: false, t: 0, hinge, maxAngle, lamp, sound });
    this.door = new THREE.Group();
    this.door.position.copy(pivot);
    this.object = this.door;
    this.pickable = this.door;
  }

  /** Tag every part of the door as the E target (call after adding the parts). */
  tag() { this.door.traverse((m) => { m.userData.door = this; }); }

  toggle() {
    this.isOpen = !this.isOpen;
    this.sound(this.door.getWorldPosition(new THREE.Vector3()), this.isOpen);
  }

  update(dt) {
    const target = this.isOpen ? 1 : 0;
    this.t += Math.sign(target - this.t) * Math.min(Math.abs(target - this.t), dt * 2.2);
    const e = this.t * this.t * (3 - 2 * this.t);
    if (this.hinge === 'bottom') this.door.rotation.z = e * this.maxAngle; // top falls towards −x
    else this.door.rotation.y = -e * this.maxAngle;                          // free edge swings to −x
    this.lamp.emissiveIntensity = this.t > 0.05 ? 1.1 : 0;
  }
}

/**
 * Oven + microwave doors. f: x of the front face; z0..z1 the unit's width along z; yOven..yMicro the
 * oven, yMicro..yGrille the microwave (its door covers z0 … z0 + microW, a control panel the rest).
 * Returns { doors, parts } — parts (Object3D) are static and go into the scene as they are.
 */
export function buildOvens({ f, z0, z1, yOven, yMicro, yGrille, microW }) {
  const parts = new THREE.Group();
  const ovenLamp = new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffd9a0, emissiveIntensity: 0 });
  const microLamp = new THREE.MeshStandardMaterial({ color: 0xfff6e6, emissive: 0xfff0d0, emissiveIntensity: 0 });
  const t = 0.024; // door thickness (front face at f, inside towards +x)

  // oven: drop-down door, hinged at its bottom edge
  const ovenH = yMicro - yOven - 0.01, ovenW = z1 - z0 - 0.02, zc = (z0 + z1) / 2;
  const oven = new ApplianceDoor({ name: 'ugnen', pivot: new THREE.Vector3(f - 0.004, yOven + 0.005, zc), hinge: 'bottom',
    maxAngle: THREE.MathUtils.degToRad(88), lamp: ovenLamp, sound: (p, o) => sfx.ovenDoor(p, o) });
  oven.door.add(
    box(t, ovenH, ovenW, t / 2, ovenH / 2, 0, black),
    box(0.003, ovenH - 0.22, ovenW - 0.14, -0.0015, ovenH / 2 + 0.01, 0, glass),           // window
    box(0.015, 0.015, ovenW - 0.12, -0.03, ovenH - 0.06, 0, steel),                          // handle bar
    box(0.03, 0.012, 0.012, -0.015, ovenH - 0.06, -(ovenW - 0.16) / 2, steel),
    box(0.03, 0.012, 0.012, -0.015, ovenH - 0.06, (ovenW - 0.16) / 2, steel),
  );
  oven.tag();
  oven.handle = new THREE.Vector3(-0.03, ovenH - 0.06, 0); // the handle bar in the door's frame (a kitchen towel hangs on it, #437)

  // microwave: side-hinged door on the left (north, −z) as you face it, control panel on the right
  const microH = yGrille - yMicro - 0.01, doorW = microW;
  const micro = new ApplianceDoor({ name: 'mikron', pivot: new THREE.Vector3(f - 0.004, yMicro + 0.005, z0 + 0.01), hinge: 'side',
    // the hinge is beside the north wall: stop at 85° so the door stays clear of it
    maxAngle: THREE.MathUtils.degToRad(85), lamp: microLamp, sound: (p, o) => sfx.microDoor(p, o) });
  micro.door.add(
    box(t, microH, doorW, t / 2, microH / 2, doorW / 2, black),
    box(0.003, microH - 0.12, doorW - 0.08, -0.0015, microH / 2, doorW / 2, glass),
    box(0.012, microH - 0.1, 0.02, -0.01, microH / 2, doorW - 0.025, steel),                 // grip
  );
  micro.tag();
  // the control panel beside the door (static), with a few buttons
  const panelW = z1 - 0.01 - (z0 + 0.01 + doorW);
  const pz = z0 + 0.01 + doorW + panelW / 2;
  parts.add(box(t, microH, panelW - 0.002, f - 0.004 + t / 2, yMicro + 0.005 + microH / 2, pz, black));
  for (let i = 0; i < 4; i++) parts.add(box(0.004, 0.012, 0.03, f - 0.006, yGrille - 0.06 - i * 0.04, pz, steel));

  // hollow insides: enamel oven with a rack and a tray, light grey microwave with a turntable
  const enamel = new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.4 });
  const liner = new THREE.MeshStandardMaterial({ color: 0xd8dbde, roughness: 0.5 });
  const cavity = (x0, x1, ya, yb, za, zb, m, lamp) => {
    const w = 0.012;
    parts.add(
      box(x1 - x0, w, zb - za, (x0 + x1) / 2, ya + w / 2, (za + zb) / 2, m),
      box(x1 - x0, w, zb - za, (x0 + x1) / 2, yb - w / 2, (za + zb) / 2, m),
      box(x1 - x0, yb - ya, w, (x0 + x1) / 2, (ya + yb) / 2, za + w / 2, m),
      box(x1 - x0, yb - ya, w, (x0 + x1) / 2, (ya + yb) / 2, zb - w / 2, m),
      box(w, yb - ya, zb - za, x1 - w / 2, (ya + yb) / 2, (za + zb) / 2, m),
      box(0.01, 0.03, 0.06, x1 - 0.02, yb - 0.03, zb - 0.06, lamp),                          // lamp
    );
  };
  const ox0 = f + t + 0.002, ox1 = f + 0.53;
  cavity(ox0, ox1, yOven + 0.03, yMicro - 0.03, z0 + 0.03, z1 - 0.03, enamel, ovenLamp);
  for (const y of [yOven + 0.2, yOven + 0.34]) { // rack (grid of rods) and a tray below it
    for (let k = 0; k < 9; k++) parts.add(box(ox1 - ox0 - 0.04, 0.005, 0.005, (ox0 + ox1) / 2, y, z0 + 0.06 + k * ((z1 - z0 - 0.12) / 8), steel));
  }
  parts.add(box(ox1 - ox0 - 0.04, 0.012, z1 - z0 - 0.1, (ox0 + ox1) / 2, yOven + 0.12, zc, enamel));
  const mx1 = f + 0.38, mz1 = z0 + 0.01 + doorW - 0.01;
  cavity(ox0, mx1, yMicro + 0.03, yGrille - 0.03, z0 + 0.03, mz1, liner, microLamp);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.006, 32),
    new THREE.MeshStandardMaterial({ color: 0xe9eef0, roughness: 0.1 }));
  plate.position.set((ox0 + mx1) / 2, yMicro + 0.05, (z0 + 0.03 + mz1) / 2);
  parts.add(plate);
  // fill the rest of the carcass around the two cavities (behind and beside them)
  parts.add(box(f + 0.58 - ox1, yMicro - yOven, z1 - z0, (ox1 + f + 0.58) / 2, (yOven + yMicro) / 2, zc, black));
  parts.add(box(f + 0.58 - mx1, yGrille - yMicro, z1 - z0, (mx1 + f + 0.58) / 2, (yMicro + yGrille) / 2, zc, black));
  parts.add(box(mx1 - ox0, yGrille - yMicro, z1 - mz1, (ox0 + mx1) / 2, (yMicro + yGrille) / 2, (mz1 + z1) / 2, black));
  return { doors: [oven, micro], parts };
}
