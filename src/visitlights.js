import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LIGHTING as L, VISIT_LIGHTS as V } from './config.js';
import { buildLampWashes } from './lampwash.js';
import { Switch, switchSpots } from './lights.js';
import { sfx } from './audio.js';

// Lamps in the flats you can walk into (#620, VISIT_UNITS; visitunit.js): without them an empty flat is black at night. One
// ceiling lamp per room — a flat ceiling fitting in the kitchen and the wet rooms, a lamp outlet with a bare bulb on a short
// cord in the others (VISIT_LIGHTS, *guess*) — and a switch by the room's door, placed as ours (lights.js `switchSpots`).
// The light is only the shader wash (lampwash.js, a set of its own: its shader names carry the suffix `V`, so the same
// materials can carry L1007's lamps too, and their data stay out of L1007's lists): no pool light, no shadow, one more
// loop in the lit materials' shaders that stops at once outside the flats' boxes. Both flats' fittings are ONE merged mesh
// per flat (a draw call each; its lit state is a per-vertex value, written when a switch is thrown), the switches are
// two small meshes each like ours. Everything lives in the flat's own group (hidden with it by `VisitUnit.cull`).
// Like everything else in a visited flat nothing here is saved: every visit starts with the lamps off. A power cut
// (#604, `lights.supply`) puts them out and the crackle flickers them; the switches keep their position through it.

const SFX = 'V';
const ceilingAt = (unit, level, x, z) => {
  const s = unit.soffits.find((q) => q.level === level && x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1);
  return unit.levels[level].floor + (s ? s.height : unit.levels[level].ceiling);
};

/** One room's lamp: on / off by its switches (the state is the room's, a power cut only scales what it shows). */
class VisitRoom {
  constructor(unit, level, name, lamp, first, count) {
    Object.assign(this, { unit, level, name, lamp, on: false, k: 0, first, count });
  }

  toggle() { this.on = !this.on; }
}

/** The regions of one room name on a level, thrown together by its switches. */
class RoomGroup {
  constructor(unit, list) { Object.assign(this, { unit, list }); }

  get on() { return this.list.some((r) => r.on); }

  toggle() { const on = !this.on; for (const r of this.list) r.on = on; }
}

/** A room switch of a visited flat: as ours, but placed in the flat's group (local coordinates) and sounding where it is. */
class VisitSwitch extends Switch {
  constructor(room, x, y, z, normal, at) {
    super(room, x, y, z, normal);
    this.unit = room.unit; // (main.js: a visited flat's lamps score nothing)
    this.at = at;
  }

  toggle() { this.room.toggle(); this.update(); sfx.click(this.at); }
}

/** The lit parts of the fittings: a per-vertex value `lampOn` (0 … 1) added to the emissive colour. */
function fittingMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xf2f2ef, roughness: 0.4 });
  m.userData.lamp = true; // (never culled as a small far-away detail, detail.js)
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float lampOn;\nvarying float vLampOn;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLampOn = lampOn;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLampOn;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(${new THREE.Color(V.glow.color).toArray().map((c) => c.toFixed(3)).join(', ')}) * (vLampOn * ${V.glow.intensity.toFixed(2)});`);
  };
  m.customProgramCacheKey = () => 'visitlamp';
  return m;
}

/** A fitting's parts as geometry in the flat's coordinates at (x, z) under a ceiling at y: [{ geo, lit }]. */
function fittingParts(kind, x, y, z) {
  if (kind === 'fitting') {
    const dome = new THREE.SphereGeometry(V.fitting.r, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.scale(1, V.fitting.h / V.fitting.r, 1); dome.rotateX(Math.PI); dome.translate(x, y - 0.002, z);
    return [{ geo: dome, lit: 1 }];
  }
  const { rose, roseH, cord, bulb } = V.outlet;
  const plate = new THREE.CylinderGeometry(rose, rose, roseH, 16); plate.translate(x, y - roseH / 2, z);
  const wire = new THREE.CylinderGeometry(0.003, 0.003, cord, 6); wire.translate(x, y - roseH - cord / 2, z);
  const glass = new THREE.SphereGeometry(bulb, 14, 10); glass.translate(x, y - roseH - cord - bulb * 0.8, z);
  return [{ geo: plate, lit: 0 }, { geo: wire, lit: 0 }, { geo: glass, lit: 1 }];
}

export class VisitLights {
  /** `units`: world.units (VisitUnit); `scene` is only what the wash patches. */
  constructor(scene, units) {
    Object.assign(this, { scene, units, rooms: [], switches: [], meshes: [], patchIn: 0 });
    const entries = [], boxes = [], material = fittingMaterial();
    for (const unit of units) {
      const parts = [], litMask = [], byRoom = [];
      for (let level = 0; level < unit.levels.length; level++) {
        const map = unit.roomMaps[level], upper = unit.levels[1];
        const outer = unit.levels[level].rect;
        const segs = [...unit.walls[level], ...unit.doorSegments(level),         // (closed doors stop it, as ours)
          [unit.ox + outer.x0, unit.oz + outer.z0, unit.ox + outer.x1, unit.oz + outer.z0], [unit.ox + outer.x1, unit.oz + outer.z0, unit.ox + outer.x1, unit.oz + outer.z1],
          [unit.ox + outer.x1, unit.oz + outer.z1, unit.ox + outer.x0, unit.oz + outer.z1], [unit.ox + outer.x0, unit.oz + outer.z1, unit.ox + outer.x0, unit.oz + outer.z0]];
        for (const r of map.regions()) {
          if (r.area < 0.6 || V.skip.includes(r.name)) continue;
          let { x, z } = r, y = ceilingAt(unit, level, x, z);
          // a centre under the stair's opening has no ceiling (lights.js, #88): beside the opening, or under the stair above (the Klk)
          const h = level === 0 ? upper?.hole : null;
          if (h && x > h.x0 - 0.35 && x < h.x1 + 0.35 && z > h.z0 - 0.35 && z < h.z1 + 0.35) {
            const ok = [[h.x0 - 0.35, z], [h.x1 + 0.35, z], [x, h.z0 - 0.35], [x, h.z1 + 0.35]]
              .sort((a, b) => Math.hypot(a[0] - x, a[1] - z) - Math.hypot(b[0] - x, b[1] - z)).find(([px, pz]) => map.exact(px, pz) === r.name);
            if (ok) [x, z] = ok;
            else {
              let best = null;
              for (let px = h.x0 + 0.1; px < h.x1; px += 0.1) for (let pz = h.z0 + 0.1; pz < h.z1; pz += 0.1) {
                const sh = unit.stair.height(px, pz);
                if (sh !== null && map.exact(px, pz) === r.name && (!best || sh > best[2])) best = [px, pz, sh];
              }
              if (!best) continue;
              [x, z] = best; y = best[2] - 0.28;
            }
          }
          const kind = V.fittings.includes(r.name) ? 'fitting' : 'outlet', first = litMask.length;
          for (const { geo, lit } of fittingParts(kind, x, y, z)) {
            const g = geo.index ? geo.toNonIndexed() : geo; // (one kind of geometry to merge; only position and normal kept)
            for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n);
            parts.push(g); litMask.push(...new Array(g.attributes.position.count).fill(lit));
          }
          const spec = L.wetRooms.includes(r.name) ? L.spots : L.ceiling;
          const lamp = { pos: new THREE.Vector3(unit.ox + x, y - V.below, unit.oz + z), ...spec, level, split: upper ? upper.floor - 0.1 : 1e9, segs };
          const room = new VisitRoom(unit, level, r.name, lamp, first, litMask.length - first);
          this.rooms.push(room); byRoom.push(room);
          entries.push({ owner: room, lamp, k: 1 });
        }
      }
      // the fittings of this flat: one mesh
      if (parts.length) {
        const geo = mergeGeometries(parts);
        geo.setAttribute('lampOn', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count), 1).setUsage(THREE.DynamicDrawUsage));
        const mesh = new THREE.Mesh(geo, material);
        mesh.name = `taklampor ${unit.id}`; mesh.raycast = () => {};
        unit.object.add(mesh); unit.detail.push(mesh);
        Object.assign(mesh.userData, { mask: Float32Array.from(litMask) });
        this.meshes.push(mesh);
        for (const r of byRoom) r.mesh = mesh;
      }
      // the switches: where ours go, by the doors of the flat's rooms
      // (a name can be two regions — the plan's Hall is two: one switch for all of them)
      const rooms = new Map();
      for (const r of byRoom) { const k = `${r.level}:${r.name}`; if (!rooms.has(k)) rooms.set(k, new RoomGroup(unit, [])); rooms.get(k).list.push(r); }
      const maps = unit.roomMaps.map((m, li) => ({ at: (x, z) => unit.roomAt(li, x, z), exact: (x, z) => m.exact(x - unit.ox, z - unit.oz) }));
      const doors = unit.doors.filter((d) => !d.exterior);
      const own = V.manual[unit.id] ?? [], manual = [...(V.manualShared.includes(unit.id) ? L.manual.filter((m) => !own.some((o) => o.level === m.level && o.room === m.room)) : []), ...own]; // (the rooms without a door of their own: no door switch for them)
      const spots = [...switchSpots(doors, (d) => unit.doorLevel.get(d), maps, unit.walls, [unit.ox, unit.oz], manual),
        ...manual.map((m) => ({ level: m.level, name: m.room, x: unit.ox + m.x, z: unit.oz + m.z, normal: m.normal }))];
      for (const sp of spots) {
        const room = rooms.get(`${sp.level}:${sp.name}`);
        if (!room) continue;
        const y = unit.levels[sp.level].floor + L.switchHeight;
        const sw = new VisitSwitch(room, sp.x - unit.ox, y, sp.z - unit.oz, sp.normal, new THREE.Vector3(sp.x, y, sp.z));
        unit.object.add(sw.object); unit.detail.push(sw.object);
        this.switches.push(sw);
      }
      const r0 = unit.levels[0].rect;
      boxes.push({ x0: unit.ox + r0.x0 - 0.05, x1: unit.ox + r0.x1 + 0.05, z0: unit.oz + r0.z0 - 0.05, z1: unit.oz + r0.z1 + 0.05, y0: unit.bottom - 0.1, y1: unit.top + 0.1 });
    }
    this.wash = entries.length ? buildLampWashes(scene, null, entries, { suffix: SFX, boxes }) : null;
    this.update(1);
    this.wash?.patch(scene);
  }

  get targets() { return this.switches; }

  /** All the flats' lamps on or off (&lights, tests). */
  setAll(on) {
    for (const r of this.rooms) r.on = on;
    for (const s of this.switches) s.update();
  }

  /** Every frame: `supply` = the mains (lights.supply, #604: 1 = power, 0 = cut, between = the fuse box crackling). */
  update(supply) {
    const touched = new Set();
    this.rooms.forEach((r, i) => {
      const k = r.on ? supply : 0;
      if (Math.abs(k - r.k) < 1e-4 && (k === 0) === (r.k === 0)) return;
      r.k = k;
      this.wash.set(i, k, 0);
      if (r.mesh) {
        const a = r.mesh.geometry.attributes.lampOn, m = r.mesh.userData.mask;
        for (let v = r.first; v < r.first + r.count; v++) a.array[v] = m[v] * k;
        touched.add(a);
      }
    });
    for (const a of touched) a.needsUpdate = true;
    if (!this.wash) return;
    this.wash.commit();
    if (--this.patchIn <= 0) { this.patchIn = 120; this.wash.patch(this.scene); } // (things built later: cups, cat coats …)
  }
}
