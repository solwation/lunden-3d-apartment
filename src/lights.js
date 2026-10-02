import * as THREE from 'three';
import { LEVELS, SOFFITS, LIGHTING as L, DOOR_TRIM } from './config.js';
import { lampMaterials } from './interior.js';
import { sfx } from './audio.js';

// Room lights: a switch by every room's door (E) turns the room's lamps on and off — a ceiling
// lamp per room (spots / globe / LED strips where interior.js built those) — and floor lamps
// toggle on their own. Light comes from a small pool of shadowless point lights given to the
// nearest lit lamps on the visitor's level each frame, so the shader light count never changes.

const plateMat = new THREE.MeshStandardMaterial({ color: 0xf6f6f3, roughness: 0.5 });
const rockerMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 });

function ceilingAt(level, x, z) {
  const s = SOFFITS.find((s) => s.level === level && x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1);
  return LEVELS[level].floor + (s ? s.height : LEVELS[level].ceiling);
}

/** Emissive bits that show a lamp is on: on = warm glow, off = plain white plastic/glass. */
function setGlow(material, on) {
  material.emissive.setHex(on ? 0xfff2dc : 0x000000);
  material.emissiveIntensity = on ? 1.2 : 0;
  material.color.setHex(on ? 0xffffff : 0xe9e9e6);
}

class Room {
  constructor(level, name) {
    Object.assign(this, { level, name, on: false, lamps: [], mats: [] });
  }

  toggle() {
    this.on = !this.on;
    for (const m of this.mats) setGlow(m, this.on);
  }
}

/** Light switch on a wall: plate + rocker; looking at it + E toggles its room. */
/**
 * Distance from (x, z) along the room normal (nx, nz) to a wall face running along (ax, az) that
 * faces the room and covers ±HALF of a switch plate around the point; null when there is none
 * within 0.3 m.
 */
const HALF = 0.045; // the plate is 8.5 cm wide
function wallFace(segs, x, z, nx, nz, ax, az, inRoom) {
  let best = null;
  for (const [x0, z0, x1, z1] of segs) {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
    if (len < 2 * HALF || Math.abs((dx * nx + dz * nz) / len) > 0.05) continue; // must run along the wall
    const off = (x0 - x) * nx + (z0 - z) * nz; // distance of the face from the door line
    if (off < -0.005 || off > 0.3) continue;
    const t0 = (x0 - x) * ax + (z0 - z) * az, t1 = (x1 - x) * ax + (z1 - z) * az; // the segment along the wall
    if (Math.min(t0, t1) > -HALF || Math.max(t0, t1) < HALF) continue; // must cover the whole plate
    // the face of the wall that looks into this room: room in front of it, wall behind it
    if (!inRoom(x + nx * (off + 0.08), z + nz * (off + 0.08)) || inRoom(x + nx * (off - 0.03), z + nz * (off - 0.03))) continue; // room-map cells are coarse
    if (best === null || off < best) best = off;
  }
  return best;
}

class Switch {
  constructor(room, x, y, z, [nx, nz]) {
    Object.assign(this, { room, kind: 'switch', name: 'lampan' });
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.085, 0.012), plateMat));
    this.rocker = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.01), rockerMat);
    this.rocker.position.z = 0.009;
    g.add(this.rocker);
    g.position.set(x + nx * 0.006, y, z + nz * 0.006);
    g.rotation.y = Math.atan2(nx, nz);
    g.traverse((m) => { m.userData.door = this; });
    this.object = g;
    this.pickable = g;
    this.update();
  }

  get isOpen() { return this.room.on; }
  get verb() { return this.room.on ? 'släcka' : 'tända'; }

  toggle() {
    this.room.toggle();
    this.update();
    sfx.click(this.object.position);
  }

  update() { this.rocker.rotation.x = this.room.on ? 0.18 : -0.18; }
}

/** Floor lamp from furniture.js: E on the lamp toggles it. */
class FloorLamp {
  constructor(spec) {
    Object.assign(this, { kind: 'lamp', name: spec.name ?? 'golvlampan', on: false, spec });
    this.room = { on: false, lamps: [], mats: [spec.shade] };
    const p = spec.object.getWorldPosition(new THREE.Vector3());
    const [ox, oz] = spec.offset ?? [0, 0];
    this.room.lamps.push({ pos: new THREE.Vector3(p.x + ox, p.y + spec.height, p.z + oz), ...L.floorLamp, level: spec.level });
    spec.object.traverse((m) => { m.userData.door = this; });
    this.pickable = spec.object;
    this.set(false);
  }

  get isOpen() { return this.room.on; }
  get verb() { return this.room.on ? 'släcka' : 'tända'; }

  set(on) {
    this.room.on = on;
    this.spec.shade.emissiveIntensity = on ? 0.9 : 0.04;
  }

  toggle() {
    this.set(!this.room.on);
    sfx.click(this.room.lamps[0].pos);
  }
}

export class Lights {
  /** world: from buildWorld (roomMaps, doors, lamps); scene: where switches + fixtures go. */
  constructor(scene, world) {
    this.rooms = new Map();
    this.switches = [];
    const room = (level, name) => {
      const key = `${level}:${name}`;
      if (!this.rooms.has(key)) this.rooms.set(key, new Room(level, name));
      return this.rooms.get(key);
    };
    const fixtureMats = new Map();
    // a lamp at the centre of every labelled region; a ceiling fixture where interior.js
    // didn't build lights of its own (wet rooms have spots, Tvätt its globe)
    world.roomMaps.forEach((map, level) => {
      for (const r of map.regions()) {
        if (r.area < 0.6) continue;
        const R = room(level, r.name);
        const key = `${level}:${r.name}`;
        const own = lampMaterials.get(key);
        const y = ceilingAt(level, r.x, r.z);
        const spec = L.wetRooms.includes(r.name) ? L.spots : L.ceiling;
        R.lamps.push({ pos: new THREE.Vector3(r.x, y - 0.25, r.z), ...spec, level });
        if (own && !R.mats.includes(own)) R.mats.push(own);
        if (!L.wetRooms.includes(r.name) && r.name !== 'Tvätt') {
          if (!fixtureMats.has(key)) fixtureMats.set(key, new THREE.MeshStandardMaterial({ color: 0xe9e9e6, roughness: 0.4 }));
          const m = fixtureMats.get(key);
          if (!R.mats.includes(m)) R.mats.push(m);
          // flat opal dome ceiling lamp, 30 cm
          const dome = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), m);
          dome.scale.y = 0.5;
          dome.rotation.x = Math.PI;
          dome.position.set(r.x, y - 0.002, r.z);
          scene.add(dome);
        }
      }
    });
    // extra pendants (over the dining table)
    for (const p of L.pendants) {
      const R = room(p.level, p.room);
      const y = ceilingAt(p.level, p.x, p.z);
      const shade = new THREE.MeshStandardMaterial({ color: 0xe9e9e6, roughness: 0.6, side: THREE.DoubleSide });
      R.mats.push(shade);
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, p.drop, 6), new THREE.MeshStandardMaterial({ color: 0x222222 }));
      cord.position.set(p.x, y - p.drop / 2, p.z);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.22, 32, 1, true), shade);
      cone.position.set(p.x, y - p.drop - 0.05, p.z);
      scene.add(cord, cone);
      R.lamps.push({ pos: new THREE.Vector3(p.x, y - p.drop - 0.2, p.z), ...L.pendant, level: p.level });
    }
    for (const R of this.rooms.values()) for (const m of R.mats) setGlow(m, false);

    // switches: by the latch side of every interior swing door (room side), plus the manual ones
    const levelOf = (d) => (d.object.position.y > LEVELS[0].floor + 1.6 ? 1 : 0);
    for (const d of world.doors) {
      if (d.kind !== 'swing' || d.name === 'ytterdörren') continue;
      const level = levelOf(d), map = world.roomMaps[level];
      const { center: [cx, cz], normal: [nx, nz] } = d.opening();
      for (const side of [1, -1]) {
        const name = map.at(cx + nx * side * 0.35, cz + nz * side * 0.35);
        if (!name || L.manual.some((m) => m.level === level && m.room === name)) continue;
        // on the wall past the latch end of the closed leaf, just beyond the architrave (else beside
        // the hinge): snap onto the real wall face found in the level's wall outlines — a wall segment
        // running along the door line, facing this room, that covers the whole switch plate (#76: the
        // raster room map put one in the air beside a short wall stub in WC/dusch)
        const ax = Math.sin(d.closedAngle), az = Math.cos(d.closedAngle), tw = DOOR_TRIM.width;
        const segs = world.levels[level].wallSegments;
        for (const along of [0.06, 0.05, 0.08, 0.1].map((k) => d.len + tw + k).concat([-(tw + 0.06), -(tw + 0.1)])) {
          const lx = d.hinge[0] + ax * along, lz = d.hinge[1] + az * along;
          const face = wallFace(segs, lx, lz, nx * side, nz * side, ax, az, (px, pz) => map.exact(px, pz) === name);
          if (face === null) continue;
          this.addSwitch(room(level, name), lx + nx * side * face, LEVELS[level].floor + L.switchHeight, lz + nz * side * face, [nx * side, nz * side], scene);
          break;
        }
      }
    }
    for (const m of L.manual) {
      this.addSwitch(room(m.level, m.room), m.x, LEVELS[m.level].floor + L.switchHeight, m.z, m.normal, scene);
    }
    this.floorLamps = world.lamps.map((spec) => new FloorLamp(spec));

    // the light pool
    this.pool = [...Array(L.pool)].map(() => {
      const l = new THREE.PointLight(0xffe2b8, 0, 6, 2);
      scene.add(l);
      return l;
    });
  }

  addSwitch(R, x, y, z, normal, scene) {
    const s = new Switch(R, x, y, z, normal);
    scene.add(s.object);
    this.switches.push(s);
  }

  get targets() { return [...this.switches, ...this.floorLamps]; }

  /** All rooms (and floor lamps) on or off. */
  setAll(on) {
    for (const R of this.rooms.values()) if (R.on !== on) R.toggle();
    for (const s of this.switches) s.update();
    for (const f of this.floorLamps) f.set(on);
  }

  /** Give the pool lights to the nearest lit lamps on `level` (call every frame). */
  update(level, pos) {
    const lit = [];
    // floor / bedside lamps hidden with the furniture (F) give no light
    const shownLamps = this.floorLamps.filter((f) => { for (let p = f.spec.object.parent; p; p = p.parent) if (!p.visible) return false; return true; });
    for (const R of [...this.rooms.values(), ...shownLamps.map((f) => f.room)]) {
      if (!R.on) continue;
      for (const lamp of R.lamps) if (lamp.level === level) lit.push(lamp);
    }
    lit.sort((a, b) => a.pos.distanceToSquared(pos) - b.pos.distanceToSquared(pos));
    this.pool.forEach((l, i) => {
      const lamp = lit[i];
      l.intensity = lamp ? lamp.intensity : 0;
      if (!lamp) return;
      l.position.copy(lamp.pos);
      l.color.setHex(lamp.color);
      l.distance = lamp.range;
    });
  }
}
