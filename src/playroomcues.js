import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLAYROOM as R } from './config.js';
import { Holdable, heldItem, setHeld, handBusy } from './holdable.js';
import { clubhouseSurface, FINISH } from './clubhousematerials.js';
import { sfx } from './audio.js';
import { inPlayroom } from './playroom.js';

// #1661: wall-mounted billiard cue rack and holdable billiard cues in the clubhouse playroom.
// Cues hang on the right wall (biljE, x = 2.94) next to the billiard table. A cue is taken with E,
// held in first-person, used to aim and shoot at the table, placed on the floor/table or put back into
// any free slot in the rack. When all cues are gone from the rack, room and hands, the rack replenishes.

const paint = (g, hex, finish = FINISH.wood) => clubhouseSurface(g, hex, finish);

/** Builds one cue model (butt at origin, tip at +1.2m along +y). */
export function buildCueGeometry(cueLength = R.billiards?.cueLength ?? 1.2) {
  const tipLen = cueLength * 0.04;
  const tipGeo = paint(new THREE.CylinderGeometry(0.004, 0.004, tipLen, 8).translate(0, cueLength - tipLen / 2, 0), 0xe9dfc4);
  const shaftGeo = paint(new THREE.CylinderGeometry(0.004, 0.009, cueLength - tipLen, 8).translate(0, (cueLength - tipLen) / 2, 0), 0x976333);
  return mergeGeometries([tipGeo, shaftGeo]);
}

/** A single holdable billiard cue (#1661). */
export class BilliardCue extends Holdable {
  constructor(scene, camera, rack, index, slotPos, slotRot, material) {
    const geo = buildCueGeometry();
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = `billiard-cue-${index}`;

    super(scene, camera, {
      name: 'biljardkö',
      verb: 'ta',
      backName: 'kökstället',
      backVerb: 'ställa tillbaka kön i',
      model: mesh,
      home: { pos: slotPos.clone(), rot: slotRot.clone() },
      heldPose: {
        pos: new THREE.Vector3(0.22, -0.32, -0.42),
        rot: new THREE.Euler(-Math.PI / 2 + 0.15, 0.05, 0) // pointing forward-down
      },
      pick: { pos: slotPos.clone().add(new THREE.Vector3(0, 0.6, 0)), size: [0.12, 1.25, 0.12] },
      cooldown: 0.3,
      useLabel: 'Stöt'
    });

    this.isBilliardCue = true;
    this.rack = rack;
    this.cueIndex = index;
    this.slotIndex = index;
    this.inRack = true;
    this.billiards = null;

    // Enhance takeTarget to allow returning the currently held cue if one is already in hand
    const self = this;
    const origTake = this.takeTarget.toggle;
    this.takeTarget.toggle = () => {
      if (heldItem()?.isBilliardCue) {
        self.rack.returnHeldCue(heldItem());
      } else {
        origTake.call(self.takeTarget);
      }
    };
    Object.defineProperty(this.takeTarget, 'verb', {
      get() {
        return heldItem()?.isBilliardCue ? 'ställa tillbaka kön i kökstället' : 'ta';
      }
    });
    Object.defineProperty(this.takeTarget, 'blocked', {
      get() {
        return !!heldItem() && !heldItem().isBilliardCue;
      }
    });
    Object.defineProperty(this.takeTarget, 'blockedText', {
      get() {
        return 'Lägg ifrån dig det du håller först';
      }
    });
  }

  take() {
    if (handBusy(this)) return;
    if (this.inRack && this.slotIndex !== null) {
      this.rack.vacateSlot(this.slotIndex);
      this.slotIndex = null;
      this.inRack = false;
    }
    super.take();
    sfx.click?.(this.where());
  }

  placeAt(p, yaw) {
    if (!this.held) return;
    super.placeAt(p, yaw);
    if (inPlayroom(p.x, p.z)) {
      this.rack.group.add(this.model);
    }
  }

  putInRack(slotIndex) {
    if (this.held) {
      this.held = false;
      if (heldItem() === this) setHeld(null);
    }
    this.placed = false;
    this.inRack = true;
    this.slotIndex = slotIndex;
    const pose = this.rack.slotPose(slotIndex);
    this.home.pos.copy(pose.pos);
    this.home.rot.copy(pose.rot);
    this.holder.position.copy(pose.pos);
    this.holder.rotation.copy(pose.rot);
    this.rack.occupySlot(slotIndex, this);
    this.goHome();
    this.rack.group.add(this.model);
    sfx.click?.(this.where());
  }

  putBack() {
    if (!this.held) return;
    const free = this.rack.nextFreeSlot();
    if (free !== null) {
      this.putInRack(free);
    } else {
      super.putBack();
    }
  }

  tick(dt, speed) {
    // Hide first-person held cue model while aiming at billiard table (the table cue renders instead)
    if (this.held && this.billiards?.cue?.visible) {
      this.model.visible = false;
    } else if (this.held) {
      this.model.visible = true;
    }
  }
}

/** Wall-mounted cue rack holding 4 cues (#1661). */
export class PlayroomCueRack {
  constructor(group, furMat) {
    this.group = group;
    this.furMat = furMat;
    const C = R.billiards?.cueRack ?? {
      wall: 'biljE', x: 2.94, z: -2.75, y: 1.15, w: 0.40, h: 1.30, d: 0.08, count: 4, spacing: 0.08
    };
    this.c = C;
    this.slots = new Array(C.count).fill(null);
    this.cues = [];

    const OX = R.x + C.x, OZ = R.z + C.z;
    this.worldPos = new THREE.Vector3(OX, C.y, OZ);

    // Build the rack wooden frame: backboard, bottom shelf with 4 rests, top bracket with 4 clips
    const geos = [];
    const hw = C.w / 2; // 0.20 m
    // Backboard against east wall: x from OX - 0.018 to OX, y from 0.55 to 1.75, z from OZ - hw to OZ + hw
    const backGeo = paint(new THREE.BoxGeometry(0.018, C.h, C.w).translate(OX - 0.009, C.y, OZ), 0x553b35);
    geos.push(backGeo);

    // Bottom shelf: x from OX - 0.065 to OX, y from 0.55 to 0.58, z from OZ - hw to OZ + hw
    const bottomGeo = paint(new THREE.BoxGeometry(0.065, 0.03, C.w).translate(OX - 0.0325, 0.565, OZ), 0x553b35);
    geos.push(bottomGeo);

    // Top clip bar: x from OX - 0.065 to OX, y from 1.45 to 1.48, z from OZ - hw to OZ + hw
    const topGeo = paint(new THREE.BoxGeometry(0.065, 0.03, C.w).translate(OX - 0.0325, 1.465, OZ), 0x553b35);
    geos.push(topGeo);

    // Brass detail trims (metal finish)
    const brassTrim = paint(new THREE.BoxGeometry(0.005, 0.01, C.w + 0.01).translate(OX - 0.065, 0.575, OZ), 0xb8874d, FINISH.metal);
    const topTrim = paint(new THREE.BoxGeometry(0.005, 0.01, C.w + 0.01).translate(OX - 0.065, 1.475, OZ), 0xb8874d, FINISH.metal);
    geos.push(brassTrim, topTrim);

    this.mesh = new THREE.Mesh(mergeGeometries(geos), furMat);
    this.mesh.name = 'playroom-cue-rack';
    group.add(this.mesh);

    // Pick box for putting back held cue into rack
    const self = this;
    this.target = {
      kind: 'playroomCueRack',
      name: 'kökstället',
      get verb() {
        return heldItem()?.isBilliardCue ? 'ställa tillbaka kön i' : 'ta en kö ur';
      },
      get blocked() {
        if (heldItem()?.isBilliardCue) return self.nextFreeSlot() === null;
        if (!heldItem()) return self.firstAvailableCue() === null;
        return true;
      },
      get blockedText() {
        if (heldItem()?.isBilliardCue) return 'Kökstället är fullt';
        if (!heldItem()) return 'Kökstället är tomt';
        return 'Lägg ifrån dig det du håller först';
      },
      toggle: () => {
        if (heldItem()?.isBilliardCue) {
          self.returnHeldCue(heldItem());
        } else if (!heldItem()) {
          const cue = self.firstAvailableCue();
          if (cue) cue.take();
        }
      }
    };

    const pickGeo = new THREE.BoxGeometry(0.18, C.h + 0.1, C.w + 0.06);
    this.pickable = new THREE.Mesh(pickGeo, new THREE.MeshBasicMaterial({ visible: false }));
    this.pickable.position.set(OX - 0.05, C.y, OZ);
    this.pickable.userData.door = this.target;
    this.target.pickable = this.pickable;
    group.add(this.pickable);
  }

  slotPose(index) {
    const C = this.c;
    const offsets = [-1.5, -0.5, 0.5, 1.5].map((k) => k * C.spacing);
    const zOffset = offsets[index] ?? 0;
    const pos = new THREE.Vector3(R.x + C.x - 0.045, 0.58, R.z + C.z + zOffset);
    const rot = new THREE.Euler(0, 0, 0);
    return { pos, rot };
  }

  nextFreeSlot() {
    for (let i = 0; i < this.slots.length; i++) {
      if (this.slots[i] === null) return i;
    }
    return null;
  }

  occupySlot(index, cue) {
    if (index >= 0 && index < this.slots.length) {
      this.slots[index] = cue;
    }
  }

  vacateSlot(index) {
    if (index >= 0 && index < this.slots.length) {
      this.slots[index] = null;
    }
  }

  firstAvailableCue() {
    return this.slots.find((c) => c !== null) ?? null;
  }

  returnHeldCue(cue) {
    if (!cue?.isBilliardCue) return false;
    const slot = this.nextFreeSlot();
    if (slot === null) return false;
    cue.putInRack(slot);
    return true;
  }

  makeCues(scene, camera, billiards) {
    const mat = this.furMat;
    const cues = [];
    for (let i = 0; i < this.c.count; i++) {
      const pose = this.slotPose(i);
      const cue = new BilliardCue(scene, camera, this, i, pose.pos, pose.rot, mat);
      cue.billiards = billiards;
      this.slots[i] = cue;
      this.group.add(cue.model);
      cues.push(cue);
    }
    this.cues = cues;
    return cues;
  }

  allCuesGone() {
    if (this.slots.some((s) => s !== null)) return false;
    if (heldItem()?.isBilliardCue) return false;
    if (this.cues.some((c) => c.placed && inPlayroom(c.model.position.x, c.model.position.z))) return false;
    return true;
  }

  replenishAll() {
    for (let i = 0; i < this.cues.length; i++) {
      const cue = this.cues[i];
      cue.putInRack(i);
    }
  }

  update(dt) {
    if (this.cues.length > 0 && this.allCuesGone()) {
      this.replenishAll();
    }
  }

  setInside(on) {
    // Child meshes in this.group toggle visibility with the group
  }
}
