import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CLEANING as C, LEVELS, HOLD } from './config.js';
import { Pack } from './contents.js';
import { Holdable, handBusy } from './holdable.js';
import { sfx } from './audio.js';
import { bump, badge } from './stats.js';

// The stick vacuum in the Klk under the stair on Entréplan (#338, #389, LIFE-025, #390, LIFE-026).
// When docked: stands in its dock under the stair (`CLEANING.vacuum` at x: 4.20, z: 6.609, dock: 1.18) with a blue
// charging LED. The Klk door (door 4 on level 0) must be open to take or dock it.
// Taking it puts it in "vacuum mode": held in front with its floor head resting on the floor.
// Walking moves it: the floor head follows in front of the visitor on the floor.
// E / touch action button switches the motor on/off (synthesised motor whine).
// While running, crumbs and dust in front of the head within working radius are removed.
// Wall occlusion and floor level checks prevent suction through walls or between floors.
// Clean rooms emit score and toast ("Rent i köket!"). Stats track vacuumed m².
// Sonos ducks volume near the running motor. Cats run away meowing without counting as hurt.

const purple = 0x7a4fa0, nickel = 0xa8abb0;

export function cleanRoomName(room) {
  if (!room) return 'Rent i rummet!';
  if (/kök/i.test(room)) return 'Rent i köket!';
  if (/vardagsrum/i.test(room)) return 'Rent i vardagsrummet!';
  if (/hall/i.test(room)) return 'Rent i hallen!';
  if (/tvätt/i.test(room)) return 'Rent i tvättstugan!';
  if (/badrum/i.test(room) || /wc/i.test(room)) return 'Rent i badrummet!';
  if (/klk/i.test(room)) return 'Rent i klädkammaren!';
  if (/sovrum\s*(\d)/i.test(room)) {
    const m = room.match(/sovrum\s*(\d)/i);
    return `Rent i sovrum ${m[1]}!`;
  }
  return `Rent i ${room.toLowerCase()}!`;
}

function crosses(ax, az, bx, bz, [cx, cz, dx, dz]) {
  const d = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / d;
  const u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / d;
  return t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999;
}

function slurpTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  rg.addColorStop(0, 'rgba(235,225,205,0.9)');
  rg.addColorStop(0.5, 'rgba(180,160,140,0.5)');
  rg.addColorStop(1, 'rgba(180,160,140,0)');
  g.fillStyle = rg;
  g.beginPath(); g.arc(16, 16, 16, 0, Math.PI * 2); g.fill();
  return new THREE.CanvasTexture(c);
}

class SlurpParticles {
  constructor(scene) {
    const n = 24;
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
    this.pts = new THREE.Points(this.geo, new THREE.PointsMaterial({
      size: 0.045, map: slurpTexture(), vertexColors: true, transparent: true, depthWrite: false,
    }));
    this.pts.frustumCulled = false;
    this.pts.raycast = () => {};
    this.pts.visible = false;
    scene.add(this.pts);
    this.p = [...Array(n)].map(() => ({ pos: new THREE.Vector3(), target: new THREE.Vector3(), life: 0, maxLife: 0.25 }));
    this.next = 0;
  }

  burst(at) {
    for (let i = 0; i < 8; i++) {
      const q = this.p[this.next++ % this.p.length];
      const a = Math.random() * Math.PI * 2, r = 0.05 + Math.random() * 0.18;
      q.pos.set(at.x + Math.cos(a) * r, at.y + 0.01, at.z + Math.sin(a) * r);
      q.target.copy(at).setY(at.y + 0.06);
      q.life = q.maxLife = 0.2 + Math.random() * 0.12;
    }
    this.pts.visible = true;
  }

  update(dt) {
    if (!this.pts.visible) return;
    const pos = this.geo.attributes.position, col = this.geo.attributes.color;
    let any = false;
    this.p.forEach((q, i) => {
      if (q.life > 0) {
        q.life -= dt;
        const f = 1 - Math.max(0, q.life / q.maxLife);
        const cx = q.pos.x + (q.target.x - q.pos.x) * (f * 0.8);
        const cy = q.pos.y + (q.target.y - q.pos.y) * f;
        const cz = q.pos.z + (q.target.z - q.pos.z) * (f * 0.8);
        pos.setXYZ(i, cx, cy, cz);
        const alpha = Math.max(0, q.life / q.maxLife);
        col.setXYZW(i, 0.9, 0.85, 0.75, alpha);
        any = true;
      } else {
        col.setXYZW(i, 0, 0, 0, 0);
      }
    });
    pos.needsUpdate = col.needsUpdate = true;
    this.pts.visible = any;
  }
}

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

  // Vacuum head marker object (used to locate the head in world coordinates)
  const head = new THREE.Object3D();
  head.name = 'vacuum-head';
  head.position.set(V.x + dx, 0.035, out(0.15) + dz);
  g.add(head);

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

    this.head = this.model.getObjectByName('vacuum-head');
    this.slurpParticles = new SlurpParticles(scene);
    this.hadMessRooms = new Set();
    this.sound = null;
    this.lastHeadPos = null;
    this.dustAmount = 0;
    this.dustCapacity = V.dustCapacity;
    this.fullNotified = false;

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

  isFull() {
    return this.dustAmount >= this.dustCapacity;
  }

  updateHud() {
    const el = document.getElementById('vacuum-hud');
    if (!el) return;
    el.hidden = !this.held;
    const pct = Math.min(100, Math.round(this.dustAmount / this.dustCapacity * 100));
    const i = el.querySelector('i');
    if (i) i.style.width = `${pct}%`;
    el.classList.toggle('full', this.dustAmount >= this.dustCapacity);
  }

  emptyIntoBin(bin) {
    this.dustAmount = 0;
    this.fullNotified = false;
    this.updateHud();
  }

  onTake() {
    this.led.visible = false;
    this.updateHud();
    sfx.click?.(this.where());
  }

  onPut() {
    this.stopRunning();
    this.led.visible = false;
    this.updateHud();
    sfx.click?.(this.where());
  }

  goHome() {
    this.stopRunning();
    super.goHome();
    if (this.led) this.led.visible = true;
  }

  putBack() {
    if (!this.doorOpen) return;
    this.stopRunning();
    super.putBack();
  }

  take() {
    if (this.isAtDock && !this.doorOpen) return;
    super.take();
  }

  stopRunning() {
    if (this.running) {
      this.running = false;
      this.useLabel = 'Starta';
      this.sound?.stop?.();
      this.sound = null;
    }
  }

  use(speed = 0) {
    if (!this.held) return;
    this.running = !this.running;
    this.useLabel = this.running ? 'Stäng av' : 'Starta';
    sfx.click?.(this.where());
    if (this.running) {
      this.sound = sfx.vacuum?.(this.where());
    } else {
      this.sound?.stop?.();
      this.sound = null;
    }
  }

  nearSonos(sonos) {
    if (!this.running || !sonos?.speakers) return false;
    const p = this.where();
    return sonos.speakers.some((s) => s.pos && s.pos.distanceTo(p) < 6.0);
  }

  update(dt) {
    super.update(dt);
    this.slurpParticles?.update(dt);

    if (!this.held) {
      this.stopRunning();
      this.lastHeadPos = null;
      return;
    }

    const headPos = this.head ? this.head.getWorldPosition(new THREE.Vector3()) : this.where();

    if (this.running) {
      this.sound?.move?.(headPos);

      // Stats: vacuumed area m²
      if (this.lastHeadPos) {
        const d = headPos.distanceTo(this.lastHeadPos);
        const swept = Math.min(d, 3.0 * dt) * 0.25;
        if (swept > 0) bump('vacuumed', swept);
      }
      this.lastHeadPos = headPos.clone();

      const level = this.player?.level ?? (headPos.y > LEVELS[1].floor - 0.4 ? 1 : 0);
      const segs = this.world?.levels?.[level]?.wallSegments ?? [];

      // Scare cat if nearby
      if (this.cat && this.cat.visible && !this.cat.leaving && !this.cat.held) {
        const cp = this.cat.object.position;
        const dist = Math.hypot(cp.x - headPos.x, cp.z - headPos.z);
        if (Math.abs(cp.y - headPos.y) < 1.5 && dist < 3.2) {
          if (!segs.some((sg) => crosses(headPos.x, headPos.z, cp.x, cp.z, sg))) {
            this.cat.scare(headPos);
          }
        }
      }

      // Pick up crumbs and dust within working radius (~0.35m)
      if (this.mess) {
        if (this.dustAmount >= this.dustCapacity) {
          if (!this.fullNotified) {
            badge('Dammbehållaren är full', false);
            this.fullNotified = true;
          }
        } else {
          const capLeft = this.dustCapacity - this.dustAmount;
          // Mess.take's rate is per spot. Share the bin's remaining capacity across
          // all nearby spots so simultaneous crumbs + dust cannot overflow it (#485).
          const res = { amount: 0, spots: [] };
          for (const spot of [...this.mess.spots]) {
            if (res.amount >= capLeft) break;
            if (spot.level !== level || spot.surf !== 'floor' || !['crumb', 'dust'].includes(spot.kind)
              || Math.hypot(spot.x - headPos.x, spot.z - headPos.z) > 0.35
              || segs.some((sg) => crosses(headPos.x, headPos.z, spot.x, spot.z, sg))) continue;
            const taken = this.mess.take(headPos.x, headPos.z, 0.35, {
              level, rate: capLeft - res.amount, kinds: ['crumb', 'dust'], ok: (s) => s === spot,
            });
            res.amount += taken.amount;
            res.spots.push(...taken.spots);
          }

          if (res && res.amount > 0) {
            this.dustAmount = Math.min(this.dustCapacity, this.dustAmount + res.amount);
            this.updateHud();
            if (this.dustAmount >= this.dustCapacity && !this.fullNotified) {
              badge('Dammbehållaren är full', false);
              this.fullNotified = true;
            }
            sfx.vacuumSlurp?.(headPos);
            this.slurpParticles?.burst(headPos);
            if (this.life) {
              this.life.emit('vacuumed', { amount: res.amount, spots: res.spots, headPos: headPos.toArray() });
            }
            for (const s of res.spots) {
              if (s.room) this.hadMessRooms.add(`${level}:${s.room}`);
            }
          }
        }

        // Room cleaned score and feedback
        for (const rk of [...this.hadMessRooms]) {
          const [lvlStr, rm] = rk.split(':');
          const lvl = Number(lvlStr);
          if (this.mess.total({ room: rm, level: lvl }) === 0) {
            this.hadMessRooms.delete(rk);
            badge(cleanRoomName(rm), false);
            bump('cleanRoom', 1, rk);
          }
        }
      }
    } else {
      this.lastHeadPos = null;
    }
  }
}
