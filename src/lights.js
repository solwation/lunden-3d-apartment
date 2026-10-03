import * as THREE from 'three';
import { LEVELS, SOFFITS, LIGHTING as L, DOOR_TRIM, STAIR } from './config.js';
import { lampMaterials, lampGlows } from './interior.js';
import { sfx } from './audio.js';
import { stairHeight } from './stairs.js';

// Room lights: a switch by every room's door (E) turns the room's lamps on and off — a ceiling
// lamp per room (spots / globe / LED strips where interior.js built those) — and floor lamps
// toggle on their own and switch themselves with the dusk (#234). Light comes from a small pool of shadowless point
// lights given to the lit lamps on the visitor's level that matter most, so the shader light count never changes.

const plateMat = new THREE.MeshStandardMaterial({ color: 0xf6f6f3, roughness: 0.5 });
const rockerMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 });

function ceilingAt(level, x, z) {
  const s = SOFFITS.find((s) => s.level === level && x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1);
  return LEVELS[level].floor + (s ? s.height : LEVELS[level].ceiling);
}

/** Emissive bits that show a lamp is on: on = warm glow, off = plain white plastic/glass. */
function setGlow(material, on) {
  const lit = material.userData.lit; // own colours when lit (e.g. the dark string shade, #174)
  if (lit) { material.emissive.setHex(on ? lit.emissive : 0x000000); material.emissiveIntensity = on ? lit.intensity : 0; return; }
  if (material.userData.glow) { material.opacity = on ? material.userData.glow : 0; material.visible = on; return; }
  material.emissive.setHex(on ? 0xfff2dc : 0x000000);
  material.emissiveIntensity = on ? 1.2 : 0;
  material.color.setHex(on ? 0xffffff : 0xe9e9e6);
}

/** A pleated paper lamp shade (Le Klint style, #134): `rows` rings of `n` points, every other ring turned half
 * a step and pulled in a little, so the facets between them fold into diamonds. Open at the top and bottom;
 * bottom at y 0, height h, widest radius r. Non-indexed, for flat shading. */
function pleatedShade(r, h, n = 20, rows = 7) {
  const ring = (j) => {
    const t = j / rows, rad = r * (0.7 + 0.3 * Math.sin(Math.PI * t)) * (j % 2 ? 0.94 : 1);
    return [...Array(n + 1)].map((_, i) => { const u = (i + (j % 2) * 0.5) / n, a = u * Math.PI * 2; return { p: [Math.cos(a) * rad, t * h, Math.sin(a) * rad], uv: [u, t] }; });
  };
  const pos = [], uv = [];
  const tri = (...vs) => { for (const v of vs) { pos.push(...v.p); uv.push(...v.uv); } };
  for (let j = 0; j < rows; j++) {
    const A = ring(j), B = ring(j + 1);
    for (let i = 0; i < n; i++) {
      if (j % 2 === 0) tri(A[i], B[i], A[i + 1], A[i + 1], B[i], B[i + 1]); // ring j+1 is turned +½ step
      else tri(A[i], B[i + 1], A[i + 1], A[i], B[i], B[i + 1]);             // ring j is turned +½ step
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  // the folds as faint lines on the paper (they show through when it is lit): the facet edges in uv space
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = 'rgba(150,140,125,0.55)'; ctx.lineWidth = 2;
  for (let k = 0; k < pos.length / 9; k++) for (let e = 0; e < 3; e++) {
    const q0 = (k * 3 + e) * 2, q1 = (k * 3 + (e + 1) % 3) * 2;
    if (Math.abs(uv[q0 + 1] - uv[q1 + 1]) < 1e-6) continue; // only the slanted folds: they make the diamonds
    ctx.beginPath(); ctx.moveTo(uv[q0] * c.width, (1 - uv[q0 + 1]) * c.height); ctx.lineTo(uv[q1] * c.width, (1 - uv[q1 + 1]) * c.height); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  g.userData.folds = tex;
  return g;
}

/** Colour map of `n` vertical black strings round a shade, a little uneven (the shade itself is see-through). */
function stringTexture(n) {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 8;
  const g = c.getContext('2d');
  g.fillStyle = '#2c2a28'; g.fillRect(0, 0, c.width, c.height);
  const w = c.width / n;
  for (let i = 0; i < n; i++) { const k = 6 + ((i * 7919) % 11); g.fillStyle = `rgb(${k},${k},${k})`; g.fillRect(i * w, 0, w * 0.6, c.height); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
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

/** A small lamp (floor/work/reading lamp, BESTÅ spots, bench light, mirror LED … from world.lamps): E on it toggles it;
 * unless its spec says `auto: false` it also switches itself with the dusk (#234, Lights.updateAuto). `room.on` is
 * where it is going, `k` how far on it is (a fade when it switches itself, at once by hand). */
class FloorLamp {
  constructor(spec) {
    Object.assign(this, { kind: 'lamp', name: spec.name ?? 'golvlampan', on: false, spec, auto: spec.auto !== false, k: 0 });
    this.room = { on: false, lamps: [], mats: [spec.shade] };
    const p = spec.object.getWorldPosition(new THREE.Vector3());
    const [ox, oz] = spec.offset ?? [0, 0];
    this.room.lamps.push({ pos: new THREE.Vector3(p.x + ox, p.y + spec.height, p.z + oz), ...L.floorLamp, ...(spec.light ?? {}), level: spec.level, owner: this });
    spec.object.traverse((m) => { m.userData.door = this; });
    this.pickable = spec.object;
    this.set(false);
  }

  get isOpen() { return this.room.on; }
  get verb() { return this.room.on ? 'släcka' : 'tända'; }

  /** On or off at once (E, &lights, tests). */
  set(on) {
    this.room.on = on;
    this.k = on ? 1 : 0;
    this.show();
  }

  /** Fade towards `room.on` (called every frame). */
  update(dt) {
    const goal = this.room.on ? 1 : 0;
    if (this.k === goal) return;
    this.k += Math.sign(goal - this.k) * Math.min(Math.abs(goal - this.k), dt / L.auto.fade);
    this.show();
  }

  show() {
    const k = this.k;
    this.spec.shade.emissiveIntensity = 0.04 + 0.86 * k;
    for (const m of this.spec.glows ?? []) { m.opacity = k * (m.userData.on ?? m.userData.glow); m.visible = k > 0.001; } // additive washes (#221)
  }

  toggle() {
    this.set(!this.room.on);
    sfx.click(this.room.lamps[0].pos);
  }
}

/** Does the line a → b (plan x/z) cross one of the wall outline segments? (the ends just short of b don't count) */
function blocked(segs, ax, az, bx, bz) {
  for (const [cx, cz, dx, dz] of segs) {
    const d = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
    if (Math.abs(d) < 1e-9) continue;
    const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / d;
    if (t <= 0 || t >= 0.97) continue;
    const u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / d;
    if (u > 0 && u < 1) return true;
  }
  return false;
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
        let underStair = false;
        // a region centre under the stair opening has no ceiling (#88): move the lamp just outside the
        // opening, to the nearest spot that still belongs to the room
        if (level === 0) {
          const h = STAIR.hole, m = 0.35;
          if (r.x > h.x0 - m && r.x < h.x1 + m && r.z > h.z0 - m && r.z < h.z1 + m) {
            const cands = [[h.x0 - m, r.z], [h.x1 + m, r.z], [r.x, h.z0 - m], [r.x, h.z1 + m]]
              .sort((a, b) => Math.hypot(a[0] - r.x, a[1] - r.z) - Math.hypot(b[0] - r.x, b[1] - r.z));
            const ok = cands.find(([x, z]) => map.exact(x, z) === r.name);
            if (ok) [r.x, r.z] = ok;
            else underStair = true; // a room under the stair (the Klk): its ceiling is the stair's underside
          }
        }
        let y = ceilingAt(level, r.x, r.z);
        if (underStair) {
          let best = null;
          for (let x = STAIR.hole.x0 + 0.1; x < STAIR.hole.x1; x += 0.1) for (let z = STAIR.hole.z0 + 0.1; z < STAIR.hole.z1; z += 0.1) {
            const sh = stairHeight(x, z);
            if (sh !== null && map.exact(x, z) === r.name && (!best || sh > best[2])) best = [x, z, sh];
          }
          if (best) { [r.x, r.z] = best; y = best[2] - 0.28; } // under the highest tread above the Klk, below its slab
        }
        const spec = L.wetRooms.includes(r.name) ? L.spots : L.ceiling;
        if (own && !R.mats.includes(own)) R.mats.push(own);
        for (const m of lampGlows.get(key) ?? []) if (!R.mats.includes(m)) R.mats.push(m);
        if (L.pendants.some((p) => p.replaces && p.level === level && p.room === r.name)) continue; // its own pendant instead (#134)
        R.lamps.push({ pos: new THREE.Vector3(r.x, y - 0.25, r.z), ...spec, level });
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
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, p.drop, 6), new THREE.MeshStandardMaterial({ color: p.cord ?? 0x222222 }));
      cord.position.set(p.x, y - p.drop / 2, p.z);
      if (p.style === 'string') {
        // black string shade on a short ceiling cup (#174): a truncated cone of vertical strings you see through,
        // a clear filament globe inside; the strings glow faintly warm when it is lit
        const black = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.5 });
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(p.plate / 2, p.plate / 2, 0.008, 24), new THREE.MeshStandardMaterial({ color: 0xf2f2f0, roughness: 0.6 }));
        plate.position.set(p.x, y - 0.004, p.z);
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(p.cupTop / 2, p.cupBottom / 2, p.cup, 20), black);
        cup.position.set(p.x, y - 0.008 - p.cup / 2, p.z);
        const top = y - 0.008 - p.cup, mid = top - p.h / 2;
        Object.assign(shade, { color: new THREE.Color(0xffffff), roughness: 0.9, map: stringTexture(p.strings), transparent: true, opacity: p.opacity, depthWrite: false });
        shade.userData.lit = { emissive: 0x4a2c14, intensity: 0.5 };
        const cone = new THREE.Mesh(new THREE.CylinderGeometry(p.top / 2, p.bottom / 2, p.h, 64, 1, true), shade);
        cone.position.set(p.x, mid, p.z);
        cone.castShadow = false;
        const rims = [[p.top / 2, top], [p.bottom / 2, top - p.h]].map(([r, ry]) => {
          const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.004, 4, 48), black); m.rotation.x = Math.PI / 2; m.position.set(p.x, ry, p.z); return m;
        });
        const bulbMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.15, metalness: 0.2 });
        bulbMat.userData.lit = { emissive: 0xffb45a, intensity: 2.2 };
        R.mats.push(bulbMat);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(p.bulb / 2, 16, 12), bulbMat);
        bulb.position.set(p.x, top - p.bulbDrop, p.z);
        const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, p.bulbDrop - p.bulb / 2, 10), black);
        holder.position.set(p.x, top - (p.bulbDrop - p.bulb / 2) / 2, p.z);
        scene.add(plate, cup, cone, ...rims, bulb, holder);
        R.lamps.push({ pos: new THREE.Vector3(p.x, top - p.bulbDrop, p.z), ...L.pendant, level: p.level });
        continue;
      }
      if (p.style === 'paper') {
        // folded white paper shade (#134): a barrel of staggered rings → diamond pleats, lit from inside
        shade.flatShading = true;
        const geo = pleatedShade(p.w / 2, p.h);
        shade.map = shade.emissiveMap = geo.userData.folds;
        const lamp = new THREE.Mesh(geo, shade);
        lamp.position.set(p.x, y - p.drop - p.h, p.z);
        const hook = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0025, 6, 12), cord.material);
        hook.position.set(p.x, y - 0.014, p.z);
        scene.add(cord, lamp, hook);
        R.lamps.push({ pos: new THREE.Vector3(p.x, y - p.drop - p.h / 2, p.z), ...L.pendant, level: p.level });
        continue;
      }
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
    this.extra = []; // self-switching lamps: { pos, intensity, range, color, level, k }

    // the light pool
    this.pool = [...Array(L.pool)].map(() => {
      const l = new THREE.PointLight(0xffe2b8, 0, 6, 2);
      scene.add(l);
      return l;
    });
    this.slots = this.pool.map(() => ({ lamp: null, f: 0 })); // which lamp each pool light serves, how far faded in
    this.roomMaps = world.roomMaps;
    this.levels = world.levels;
    this.doors = world.doors.map((d) => ({ door: d, level: levelOf(d) }));
  }

  addSwitch(R, x, y, z, normal, scene) {
    const s = new Switch(R, x, y, z, normal);
    scene.add(s.object);
    this.switches.push(s);
  }

  get targets() { return [...this.switches, ...this.floorLamps]; }

  /** All rooms (and small lamps) on or off. */
  setAll(on) {
    for (const R of this.rooms.values()) if (R.on !== on) R.toggle();
    for (const s of this.switches) s.update();
    for (const f of this.floorLamps) f.set(on);
  }

  /** The small lamps follow the dusk (#234): on below LIGHTING.auto.on daylight, off above .off. Only a change of
   * that state switches them, so a lamp toggled by hand stays as it is until the next dusk / dawn. The first call
   * sets them at once; later changes fade. `forced` (&lights) keeps everything on. */
  updateAuto(daylight, dt) {
    const A = L.auto, first = this.dark === undefined;
    const dark = first ? daylight < (A.on + A.off) / 2 : this.dark ? daylight < A.off : daylight < A.on;
    if (dark !== this.dark) {
      this.dark = dark;
      if (!this.forced) for (const f of this.floorLamps) if (f.auto) { if (first) f.set(dark); else f.room.on = dark; }
    }
    for (const f of this.floorLamps) f.update(dt);
  }

  /** Is anything lit in room `name` on `level`: its ceiling lamp or a small lamp standing in it (the blinds' glow, #273)? */
  roomLit(level, name) {
    if (this.rooms.get(`${level}:${name}`)?.on) return true;
    return this.floorLamps.some((f) => f.room.on && f.room.lamps[0]?.level === level && this.lampRoom(f.room.lamps[0]) === name);
  }

  /** The room a lamp is in (cached; lamps on a window board are just outside the room map: the room in front). */
  lampRoom(lamp) {
    if (lamp.roomName === undefined) {
      const map = this.roomMaps[lamp.level];
      lamp.roomName = [[0, 0], [0, 0.35], [0, -0.35], [0.35, 0], [-0.35, 0], [0, 0.7], [0, -0.7]]
        .map(([dx, dz]) => map?.at(lamp.pos.x + dx, lamp.pos.z + dz)).find(Boolean) ?? null;
    }
    return lamp.roomName;
  }

  /**
   * Hand the pool lights to the lit lamps on `level` that matter most to the visitor at `pos` (call every frame):
   * the nearest, but lamps in the visitor's own room and in line of sight first (#234), and a lamp keeps its pool
   * light until another is clearly nearer. A pool light that moves fades out and the next lamp fades in
   * (LIGHTING.poolFade) instead of jumping — a lit room no longer seems to go dark when you walk out of it.
   */
  update(level, pos, dt = 1 / 60) {
    const on = new Set(), cands = [];
    // small lamps hidden with the furniture (F) give no light
    const shown = (f) => { for (let p = f.spec.object.parent; p; p = p.parent) if (!p.visible) return false; return true; };
    for (const R of this.rooms.values()) if (R.on) for (const lamp of R.lamps) { on.add(lamp); if (lamp.level === level) cands.push([lamp, 1, R.name]); }
    for (const f of this.floorLamps) {
      if (f.k <= 0.001 || !shown(f)) continue;
      for (const lamp of f.room.lamps) { on.add(lamp); if (lamp.level === level) cands.push([lamp, f.k, this.lampRoom(lamp)]); }
    }
    // extra lamps that switch themselves (the patio string lights, #81): k = how far on they are
    for (const lamp of this.extra) if (lamp.k > 0.01) { on.add(lamp); if (lamp.level === level) cands.push([lamp, lamp.k, null]); }
    const P = L.poolPick, here = this.roomMaps[level]?.at(pos.x, pos.z) ?? null;
    const segs = [...(this.levels[level]?.wallSegments ?? []), ...this.doors.filter((d) => d.level === level).map((d) => d.door.segment())]; // walls + door leaves
    const held = new Set(this.slots.map((s) => s.lamp));
    const score = new Map();
    for (const [lamp, , room] of cands) {
      let d = Math.hypot(lamp.pos.x - pos.x, lamp.pos.z - pos.z, (lamp.pos.y - pos.y) * 0.5);
      const own = here && room === here, hidden = blocked(segs, pos.x, pos.z, lamp.pos.x, lamp.pos.z);
      if (hidden && !own) continue; // a lamp in another room behind a wall: its light would only shine through the wall
      if (!own) d *= P.otherRoom;
      if (hidden) d *= P.hidden;
      if (held.has(lamp)) d /= P.stick;
      score.set(lamp, d);
    }
    this.scores = score; // (tests and debugging)
    const k = new Map(cands.map(([lamp, kk]) => [lamp, kk]));
    const ranked = cands.filter((c) => score.has(c[0])).sort((a, b) => score.get(a[0]) - score.get(b[0]));
    const want = new Set(ranked.slice(0, this.slots.length).map((c) => c[0]));
    const step = this.primed ? dt / L.poolFade : 1; // (the first frame: at once)
    this.primed = true;
    for (const s of this.slots) {
      if (!s.lamp) continue;
      if (!on.has(s.lamp)) { s.lamp = null; s.f = 0; continue; } // switched off: its glow went at once, so does its light
      s.f = want.has(s.lamp) ? Math.min(1, s.f + step) : s.f - step;
      if (s.f <= 0) { s.lamp = null; s.f = 0; }
    }
    const placed = new Set(this.slots.map((s) => s.lamp));
    for (const lamp of want) {
      if (placed.has(lamp)) continue;
      const s = this.slots.find((x) => !x.lamp);
      if (!s) break;
      Object.assign(s, { lamp, f: Math.min(1, step) });
    }
    this.slots.forEach((s, i) => {
      const l = this.pool[i], lamp = s.lamp;
      l.intensity = lamp ? lamp.intensity * (k.get(lamp) ?? 0) * s.f : 0;
      if (!lamp) return;
      l.position.copy(lamp.pos);
      l.color.setHex(lamp.color);
      l.distance = lamp.range;
    });
  }
}
