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

function wettexTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
  for (let i = 0; i < 128; i += 8) {
    ctx.fillRect(i, 0, 1, 128);
    ctx.fillRect(0, i, 128, 1);
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.035)';
  for (let y = 2; y < 128; y += 8) {
    for (let x = 2; x < 128; x += 8) {
      ctx.fillRect(x, y, 4, 4);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

export function buildClothModel() {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  const T = 0.0035; // thickness
  const L_top = 0.075; // flat portion on counter (north)
  const L_hang = 0.055; // draped portion down into sink
  const r_in = 0.002;
  const r_out = r_in + T;

  s.moveTo(-L_top, T + 0.0005);
  s.lineTo(-r_out, T + 0.0005);
  s.quadraticCurveTo(T + 0.0005, T + 0.0005, T + 0.0005, -r_out);
  s.lineTo(T + 0.0005, -L_hang);
  s.lineTo(0.0005, -L_hang);
  s.lineTo(0.0005, -r_in);
  s.quadraticCurveTo(0.0005, 0.0005, -r_in, 0.0005);
  s.lineTo(-L_top, 0.0005);
  s.closePath();

  const W = 0.16;
  const geo = new THREE.ExtrudeGeometry(s, { depth: W, bevelEnabled: false, curveSegments: 8 });
  geo.translate(0, 0, -W / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const origZ = pos.getX(i);
    const origX = pos.getZ(i);
    pos.setX(i, origX);
    pos.setZ(i, origZ);
  }
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color: CLEAN_COLOR,
    roughness: 0.85,
    metalness: 0.02,
    map: wettexTexture(),
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
    // Home position on the worktop draped over the kitchen sink north rim (top y 0.930, rim z 1.847, center x 5.25)
    const homePos = new THREE.Vector3(5.25, 0.930, 1.847);
    const homeRot = new THREE.Euler(0, 0, 0);

    const pickPos = new THREE.Vector3(5.25, 0.92, 1.815);
    const pickSize = [0.24, 0.16, 0.22];

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
