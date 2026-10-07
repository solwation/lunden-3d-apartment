import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CLEANING as C, LEVELS, HOLD } from './config.js';
import { Pack } from './contents.js';
import { Holdable, handBusy } from './holdable.js';
import { sfx } from './audio.js';

// The stick vacuum in the Klk under the stair on Entréplan (#338, #389, LIFE-025).
// When docked: stands in its dock under the stair (`CLEANING.vacuum` at x: 4.20, z: 6.609, dock: 1.18) with a blue
// charging LED. The Klk door (door 4 on level 0) must be open to take or dock it.
// Taking it puts it in "vacuum mode": held in front with its floor head resting on the floor.
// Can be placed on the floor with E (leans/lies on the floor) and picked up again.
// E at the dock puts it back and resumes charging (blue LED).

const purple = 0x7a4fa0, nickel = 0xa8abb0;

/** Plain stick vacuum model. Origin is at the dock's resting position (V.x, V.dock, V.z). */
export function buildVacuumModel() {
  const g = new THREE.Group();
  const P = new Pack();
  const V = C.vacuum;
  const vy = V.dock;
  const out = (d) => V.z - d;

  // The components modelled relative to world coordinates of the docked vacuum,
  // shifted so that local origin (0, 0, 0) is at (V.x, 0, V.z).
  // This preserves exact relative offsets while making the model self-contained.
  const dx = -V.x, dz = -V.z;

  P.cyl(0.05, 0.05, 0.13, V.x + dx, vy - 0.06, out(0.13) + dz, nickel, { gloss: true, seg: 18 });         // cyclones
  P.cyl(0.02, 0.05, 0.05, V.x + dx, vy + 0.03, out(0.13) + dz, purple, { gloss: true, seg: 18 });          // their cone
  P.cyl(0.042, 0.042, 0.12, V.x + dx, vy - 0.03, out(0.055) + dz, purple, { gloss: true, seg: 16 });      // the motor
  P.box(0.03, 0.16, 0.035, V.x + dx, vy - 0.16, out(0.04) + dz, 0x3b3f42, { r: [0.25, 0, 0] });          // the handle
  P.box(0.05, 0.09, 0.06, V.x + dx, vy - 0.27, out(0.07) + dz, 0x3b3f42, { gloss: true });                // the battery
  P.box(0.012, 0.03, 0.008, V.x + dx, vy - 0.07, out(0.12) + dz, 0xd9822b);                               // the trigger
  P.cyl(0.018, 0.018, 0.08, V.x + dx, vy - 0.32, out(0.13) + dz, purple, { gloss: true });                 // the wand's socket
  P.cyl(0.016, 0.016, vy - 0.43, V.x + dx, 0.06 + (vy - 0.43) / 2, out(0.13) + dz, purple, { gloss: true }); // the wand
  P.cyl(0.02, 0.02, 0.06, V.x + dx, 0.08, out(0.13) + dz, 0x3b3f42);                                      // the neck
  P.box(0.25, 0.045, 0.08, V.x + dx, 0.035, out(0.15) + dz, 0x3b3f42, { gloss: true });                   // the floor head
  P.cyl(0.026, 0.026, 0.24, V.x + dx, 0.028, out(0.19) + dz, 0xb08ad0, { r: [0, 0, Math.PI / 2], seg: 14 }); // its roller
  P.cyl(0.012, 0.012, 0.16, V.x - 0.075 + dx, vy - 0.08, out(0.03) + dz, 0x3b3f42);                       // a crevice tool
  P.box(0.05, 0.05, 0.04, V.x + 0.075 + dx, vy - 0.1, out(0.035) + dz, 0x3b3f42);                         // a brush tool
  for (const m of P.meshes()) { m.castShadow = true; g.add(m); }

  // Clear dust bin
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.15, 20).translate(V.x + dx, vy - 0.2, out(0.13) + dz),
    new THREE.MeshStandardMaterial({ color: 0xdfe6ea, roughness: 0.1, transparent: true, opacity: 0.4, depthWrite: false }));
  g.add(glass);

  return g;
}

export class Vacuum extends Holdable {
  constructor(scene, camera, world, klkDoor) {
    const V = C.vacuum;
    const model = buildVacuumModel();
    const homePos = new THREE.Vector3(V.x, 0, V.z);
    const homeRot = new THREE.Euler(0, 0, 0);

    // Blue charging LED at the dock: stands on the dock plate, lights when the vacuum is docked
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x2a6bff, emissive: 0x3a8cff, emissiveIntensity: 2.5 }));
    led.position.set(V.x, V.dock - 0.25, V.z - 0.101);
    scene.add(led);

    // Dock pick box
    const pickPos = new THREE.Vector3(V.x, V.dock / 2, V.z - 0.1);
    const pickSize = [0.35, V.dock + 0.1, 0.35];

    // Held pose in vacuum mode: held in front with floor head resting on floor
    // Eye height is ~1.62m over floor. In camera space:
    // head is on floor (y ≈ -1.58, z ≈ -1.15), wand angles up to hand grip at (x ≈ 0.18, y ≈ -0.70, z ≈ -0.64)
    // Rotation pitch ~30° forward
    const heldPose = {
      pos: new THREE.Vector3(0.18, -1.58, -1.15),
      rot: new THREE.Euler(0.52, -0.05, 0.02),
    };

    super(scene, camera, {
      name: 'dammsugaren',
      verb: 'ta',
      backName: 'laddstationen',
      backVerb: 'docka dammsugaren i',
      placeVerb: 'ställa ner',
      model,
      home: { pos: homePos, rot: homeRot },
      heldPose,
      pick: { pos: pickPos, size: pickSize },
      cooldown: 0.3,
      useLabel: 'Starta',
    });

    this.world = world;
    this.klkDoor = klkDoor;
    this.led = led;
    this.isVacuum = true;
    this.floorOnly = true;
    this.running = false;
    this.grip = [0, V.dock - 0.16, -0.04]; // handle position

    const self = this;
    // Overwrite blocked check on takeTarget & backTarget to ensure Klk door must be open
    Object.defineProperties(this.takeTarget, {
      blocked: {
        get() {
          if (handBusy(self)) return true;
          if (self.isAtDock && !self.doorOpen) return true;
          return false;
        },
        configurable: true,
      },
      blockedText: {
        get() {
          if (handBusy(self)) return undefined;
          if (self.isAtDock && !self.doorOpen) return 'Öppna förrådsdörren först';
          return undefined;
        },
        configurable: true,
      },
    });

    Object.defineProperties(this.backTarget, {
      blocked: {
        get() {
          if (!self.doorOpen) return true;
          return false;
        },
        configurable: true,
      },
      blockedText: {
        get() {
          if (!self.doorOpen) return 'Öppna förrådsdörren först';
          return undefined;
        },
        configurable: true,
      },
    });
  }

  get doorOpen() {
    if (!this.klkDoor) return true;
    return (this.klkDoor.isOpen || this.klkDoor.t > 0.5) && this.klkDoor.t > 0.05;
  }

  get isAtDock() {
    return !this.held && !this.placed;
  }

  onTake() {
    this.led.visible = false;
    sfx.click?.(this.where());
  }

  onPut() {
    this.led.visible = false;
    sfx.click?.(this.where());
  }

  goHome() {
    super.goHome();
    if (this.led) this.led.visible = true;
  }

  putBack() {
    if (!this.doorOpen) return;
    super.putBack();
  }

  take() {
    if (this.isAtDock && !this.doorOpen) return;
    super.take();
  }
}
