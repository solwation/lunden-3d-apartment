import * as THREE from 'three';
import { Holdable, handBusy } from './holdable.js';
import { sfx } from './audio.js';
import { badge, bump } from './stats.js';
import { cleanRoomName } from './vacuum.js';

// The dishcloth by the kitchen sink (#391, LIFE-027).
// Lying on the Delaware stone worktop north of the kitchen sink.
// Taking it puts it in the hand (Holdable).
// E on a worktop or table wipes crumbs and smears within ~0.35 m.
// Becomes dirty after N wipes (turns grimy and refuses further wiping).
// Rinsing at the sink with the tap running (köksblandaren) washes it clean.

const CLEAN_COLOR = 0xf5e67a; // yellow Swedish Wettex cloth
const DIRTY_COLOR = 0x766c54; // soiled grey/brown

export function buildClothModel() {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.16, 0.005, 0.14);
  const mat = new THREE.MeshStandardMaterial({
    color: CLEAN_COLOR,
    roughness: 0.85,
    metalness: 0.05,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'cloth-mesh';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return g;
}

export class Cloth extends Holdable {
  constructor(scene, camera, world, taps = []) {
    const model = buildClothModel();
    // Home position on worktop next to the sink
    const homePos = new THREE.Vector3(5.38, 0.903, 1.82);
    const homeRot = new THREE.Euler(0, 0.15, 0);

    const pickPos = new THREE.Vector3(5.38, 0.93, 1.82);
    const pickSize = [0.22, 0.1, 0.22];

    const heldPose = {
      pos: new THREE.Vector3(0.22, -0.25, -0.52),
      rot: new THREE.Euler(0.2, -0.25, 0.1),
    };

    super(scene, camera, {
      name: 'disktrasan',
      verb: 'ta',
      backName: 'diskbänken',
      backVerb: 'lägga tillbaka disktrasan vid diskhon',
      placeVerb: 'lägga ner',
      model,
      home: { pos: homePos, rot: homeRot },
      heldPose,
      pick: { pos: pickPos, size: pickSize },
      cooldown: 0.3,
      useLabel: 'Torka',
    });

    this.world = world;
    this.taps = taps;
    this.isCloth = true;
    this.wipes = 0;
    this.maxWipes = 5;
    this.mesh = this.model.getObjectByName('cloth-mesh');
    this.hadMessRooms = new Set();
  }

  get dirty() {
    return this.wipes >= this.maxWipes;
  }

  updateColor() {
    if (!this.mesh?.material) return;
    const k = Math.min(1, this.wipes / this.maxWipes);
    const col = new THREE.Color(CLEAN_COLOR).lerp(new THREE.Color(DIRTY_COLOR), k);
    this.mesh.material.color.copy(col);
  }

  onTake() {
    sfx.rustle?.(this.where());
  }

  onPut() {
    sfx.rustle?.(this.where());
  }

  wipe(point, surfName = 'bänken') {
    if (this.dirty) {
      badge('Disktrasan är smutsig – skölj den vid kranen först', false);
      return false;
    }

    this.wipes++;
    this.updateColor();
    sfx.rustle?.(point ?? this.where());

    if (this.mess && point) {
      const level = point.y > 2.0 ? 1 : 0;
      const res = this.mess.take(point.x, point.z, 0.35, {
        level,
        kinds: ['crumb', 'smear', 'dust'],
      });

      if (res && res.amount > 0) {
        for (const s of res.spots) {
          if (s.room) this.hadMessRooms.add(`${level}:${s.room}`);
        }

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
    }

    if (this.dirty) {
      badge('Disktrasan blev smutsig', false);
    }

    if (this.life) {
      this.life.emit('wipe', { point, surf: surfName });
    }

    return true;
  }

  rinse() {
    this.wipes = 0;
    this.updateColor();
    sfx.handwash?.(this.where(), 1.0);
    badge('Disktrasan sköljd', false);
    return true;
  }

  use() {
    // If used directly in hand without aiming at a surface:
    // try to wipe at the surface directly in front
    const p = this.where();
    this.wipe(p);
  }
}
