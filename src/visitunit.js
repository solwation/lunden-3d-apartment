import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { STANDARD } from './config.js';

// A flat you can walk into besides ours (#574, #573, VISIT_UNITS in config). world.js builds it like ours — from its floor
// plan, in a group of its own placed at its slot in Hus L (`ox` along x, `oz` along z: plan coordinates are the group's) —
// in Peab's standard finish, empty. This class is the rest: its collision in world coordinates, its doors / windows / lids
// as E targets, its rooms, its stair and its slabs. The visitor's own systems (player.js, main.js) ask
// `world.unitAt(x, z, y)`; everything of L1007's (the saved home, the cat, the lights, the life sim, the score) never sees
// it: its things are not in world.doors / lids. Nothing about it is saved: on every visit it is the same empty flat, every
// door and window shut.
//
// `levels`: per level { name, floor (absolute y), ceiling (RH), top (the next floor), rect (its footprint, plan
// coordinates), hole (the opening in its floor, plan coordinates) }; `stair` = { height(x, z), underside(x, z) } in plan
// coordinates (absolute y); `soffits`: its lowered ceilings (SOFFITS' shape, plan coordinates; the lamps hang below them, #620); `ground`: its Entréplan is on the street (L1004: its walls are level 0's, from outside too).

const shift = (s, ox, oz) => [s[0] + ox, s[1] + oz, s[2] + ox, s[3] + oz];
const inRect = (r, x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;

export class VisitUnit {
  /** { id, ox, oz, object (the group, at ox / oz), levels (above), built: buildLevel's results (plan coordinates), doors,
   *  lids (doors and the rest that open: windows, the letter box, toilet lids), roomMaps (plan coordinates), stair, ground,
   *  shell: the materials of what it shows from afar (walls, ceilings, floors, window frames) } */
  constructor({ id, ox, oz = 0, object, levels, built, doors, lids, roomMaps, stair, ground = false, shell = [], glass = null, soffits = [] }) {
    Object.assign(this, { id, ox, oz, object, levels, roomMaps, stair, ground, soffits });
    this.top = levels.at(-1).top;
    this.bottom = levels[0].floor;
    const r0 = levels[0].rect;
    this.size = { x: r0.x1 - r0.x0, z: r0.z1 - r0.z0 };
    this.box = { x0: ox + r0.x0, x1: ox + r0.x1, z0: oz + r0.z0, z1: oz + r0.z1 }; // its lowest level's footprint (world)
    // fixed walls / windows / fittings and the walls alone (line of sight), per level, in world coordinates
    this.fixed = built.map((l) => l.segments.map((s) => shift(s, ox, oz)));
    this.walls = built.map((l) => l.wallSegments.map((s) => shift(s, ox, oz)));
    this.doors = doors;
    this.lids = lids;
    this.doorLevel = new Map(doors.map((d) => [d, this.levelAt(d.object.position.y)]));
    for (const d of doors) { // the leaf's collision and its doorway in world coordinates (sounds, the visitor's tests)
      const seg = d.segment.bind(d), at = d.segmentAt.bind(d), opening = d.opening.bind(d);
      d.segment = () => shift(seg(), ox, oz);
      d.segmentAt = (t) => shift(at(t), ox, oz);
      d.opening = () => { const o = opening(); return { ...o, center: [o.center[0] + ox, o.center[1] + oz] }; };
    }
    for (const t of [...doors, ...lids]) t.visit = this; // (main.js: no score, no cat, nothing kept)
    this.targets = [...doors, ...lids];
    // draw calls (#574): from afar only its shell is drawn; from inside our flat or under the ground none of it
    // + a stand-in for its windows (the glass and the shut sashes merged into one mesh per material): no open holes from afar
    const S = new Set(shell), panes = lids.filter((l) => l.name === 'fönstret').map((l) => l.object);
    const outer = new Set(doors.filter((d) => d.exterior).map((d) => d.object)); // (its front / patio / terrace door: shut holes too)
    this.detail = object.children.filter((o) => !(o.isMesh && S.has(o.material)) && !outer.has(o));
    object.updateMatrixWorld(true);
    const inv = object.matrixWorld.clone().invert(), parts = new Map();
    const take = (m) => {
      if (!m.isMesh || !(m.material === glass || S.has(m.material))) return;
      let g = m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      if (g.index) g = g.toNonIndexed();
      for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n);
      if (!parts.has(m.material)) parts.set(m.material, []);
      parts.get(m.material).push(g);
    };
    for (const p of panes) p.traverse(take);
    for (const o of object.children) if (o.isMesh && o.material === glass) take(o);
    this.standIn = new THREE.Group();
    for (const [mat, geos] of parts) { const g = mergeGeometries(geos); if (g) this.standIn.add(new THREE.Mesh(g, mat)); }
    this.standIn.visible = false;
    object.add(this.standIn);
    this.shown = 'all';
  }

  /** What is drawn for a camera at `p` (main.js, every frame): 'none' when `away` (in our flat or down in the garage: none
   * of it can be seen from there), 'shell' farther than STANDARD.detail m from its footprint, else 'all'. */
  cull(p, away) {
    const b = this.box, dx = Math.max(b.x0 - p.x, 0, p.x - b.x1), dz = Math.max(b.z0 - p.z, 0, p.z - b.z1);
    const want = away ? 'none' : Math.hypot(dx, dz) > STANDARD.detail ? 'shell' : 'all';
    if (want === this.shown) return;
    this.shown = want;
    this.object.visible = want !== 'none';
    for (const o of this.detail) o.visible = want === 'all';
    this.standIn.visible = want === 'shell';
  }

  /** Its level at feet height y (0 its entrance floor, 1 the floor above). */
  levelAt(y) { return y > this.levels[0].floor + 1.6 ? 1 : 0; }

  /** Is (x, z) inside it (plan view; with feet height `y`: in its rooms, not on its roof or a terrace in front of it)? */
  contains(x, z, y) {
    const lx = x - this.ox, lz = z - this.oz;
    if (!inRect(this.levels[0].rect, lx, lz)) return false;
    if (y === undefined) return true;
    if (y < this.bottom - 1 || y > this.top - 0.3) return false;
    const up = this.levels[1];
    return !up || y < up.floor - 0.3 || inRect(up.rect, lx, lz) || this.stair.height(lx, lz) !== null;
  }

  inHole(x, z) { const h = this.levels[1]?.hole, lx = x - this.ox, lz = z - this.oz; return !!h && inRect(h, lx, lz); }

  /** The stair's walking height / its treads' underside at (x, z), or null. */
  stairHeight(x, z) { return this.contains(x, z) ? this.stair.height(x - this.ox, z - this.oz) : null; }
  stairUnderside(x, z) { return this.contains(x, z) ? this.stair.underside(x - this.ox, z - this.oz) : null; }

  /** The floors one can stand on at (x, z): its entrance floor, the floor above (where there is one: not over its
   * opening, not beyond its footprint), the stair. */
  floors(x, z) {
    const out = [this.levels[0].floor], up = this.levels[1];
    if (up && inRect(up.rect, x - this.ox, z - this.oz) && !this.inHole(x, z)) out.push(up.floor);
    const s = this.stairHeight(x, z);
    if (s !== null) out.push(s);
    return out;
  }

  /** The leaves' collision on `level` now. */
  doorSegments(level) { return this.doors.filter((d) => this.doorLevel.get(d) === level).map((d) => d.segment()); }

  /** Its doors at feet height y (from outside: the loftgång, a terrace, #573). */
  doorSegmentsAt(y) { return this.doors.filter((d) => Math.abs(d.object.position.y - y) < 0.5).map((d) => d.segment()); }

  /** Does the line a → b pass through one of its slabs (outside the opening)? (E through a floor, #446) */
  throughSlab(a, b) {
    for (let i = 0; i < this.levels.length; i++) {
      const L = this.levels[i];
      for (const y of [L.floor + L.ceiling, L.top]) {
        if ((a.y - y) * (b.y - y) >= 0) continue;
        const t = (y - a.y) / (b.y - a.y), x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        if (!inRect(L.rect, x - this.ox, z - this.oz)) continue;
        if (i === 0 && this.inHole(x, z)) continue;
        return true;
      }
    }
    return false;
  }

  /** The room at a plan point on a level (world coordinates), or null. */
  roomAt(level, x, z) { return this.roomMaps[level]?.at(x - this.ox, z - this.oz) ?? null; }

  /** Its level's name and room for the HUD. */
  label(level, x, z) {
    const room = this.roomAt(level, x, z);
    return `${this.id} · ${this.levels[level].name}${room ? ` · ${room}` : ''}`;
  }

  update(dt) { for (const t of this.targets) t.update?.(dt); }

  /** The flat's centre (world), for the sun's shadow box. */
  get centre() { return new THREE.Vector3((this.box.x0 + this.box.x1) / 2, 0, (this.box.z0 + this.box.z1) / 2); }
}
