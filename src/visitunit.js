import * as THREE from 'three';
import { LEVELS, UNIT_TOP, STAIR, STANDARD } from './config.js';
import { stairHeight, stairUnderside } from './stairs.js';

// A flat you can walk into besides ours (#574, VISIT_UNITS in config). world.js builds it like ours — from its floor plan,
// in a group of its own placed at its slot in Hus L (`ox` along x; same storeys) — in Peab's standard finish, empty. This
// class is the rest: its collision in world coordinates, its doors / windows / lids as E targets, its rooms, its stair
// and its slabs. The visitor's own systems (player.js, main.js) ask `world.unitAt(x, z)`; everything of L1007's (the
// saved home, the cat, the lights, the life sim, the score) never sees it: its things are not in world.doors / lids.
// Nothing about it is saved: on every visit it is the same empty flat, every door and window shut.

const shift = (s, ox) => [s[0] + ox, s[1], s[2] + ox, s[3]];

export class VisitUnit {
  /** { id, ox, size: { x, z }, object (the group, at x = ox), levels: buildLevel's results (plan coordinates), doors,
   *  lids (doors and the rest that open: windows, the letter box, toilet lids), roomMaps (plan coordinates) } */
  /** `shell`: the materials of what it shows from afar (walls, ceilings, floors, window frames) */
  constructor({ id, ox, size, object, levels, doors, lids, roomMaps, shell = [] }) {
    Object.assign(this, { id, ox, size, object, roomMaps, top: UNIT_TOP, bottom: LEVELS[0].floor });
    // fixed walls / windows / fittings and the walls alone (line of sight), per level, in world coordinates
    this.fixed = levels.map((l) => l.segments.map((s) => shift(s, ox)));
    this.walls = levels.map((l) => l.wallSegments.map((s) => shift(s, ox)));
    this.doors = doors;
    this.lids = lids;
    this.doorLevel = new Map(doors.map((d) => [d, d.object.position.y < LEVELS[0].floor + 1.6 ? 0 : 1]));
    for (const d of doors) { // the leaf's collision and its doorway in world coordinates (sounds, the visitor's tests)
      const seg = d.segment.bind(d), at = d.segmentAt.bind(d), opening = d.opening.bind(d);
      d.segment = () => shift(seg(), ox);
      d.segmentAt = (t) => shift(at(t), ox);
      d.opening = () => { const o = opening(); return { ...o, center: [o.center[0] + ox, o.center[1]] }; };
    }
    for (const t of [...doors, ...lids]) t.visit = this; // (main.js: no score, no cat, nothing kept)
    this.targets = [...doors, ...lids];
    // draw calls (#574): from afar only its shell is drawn; from inside our flat or under the ground none of it
    const S = new Set(shell);
    this.detail = object.children.filter((o) => !(o.isMesh && S.has(o.material)));
    this.shown = 'all';
  }

  /** What is drawn for a camera at `p` (main.js, every frame): 'none' when `away` (in our flat or down in the garage: none
   * of it can be seen from there), 'shell' farther than STANDARD.detail m from its footprint, else 'all'. */
  cull(p, away) {
    const dx = Math.max(this.ox - p.x, 0, p.x - this.ox - this.size.x), dz = Math.max(-p.z, 0, p.z - this.size.z);
    const want = away ? 'none' : Math.hypot(dx, dz) > STANDARD.detail ? 'shell' : 'all';
    if (want === this.shown) return;
    this.shown = want;
    this.object.visible = want !== 'none';
    for (const o of this.detail) o.visible = want === 'all';
  }

  /** Is (x, z) inside its footprint (plan view)? */
  contains(x, z) { return x > this.ox && x < this.ox + this.size.x && z > 0 && z < this.size.z; }

  /** Its level at feet height y (0 Entréplan, 1 Övre plan). */
  levelAt(y) { return y > LEVELS[0].floor + 1.6 ? 1 : 0; }

  inHole(x, z) { const h = STAIR.hole, lx = x - this.ox; return lx > h.x0 && lx < h.x1 && z > h.z0 && z < h.z1; }

  /** The stair's walking height / its treads' underside at (x, z), or null (the shared sheet: our stair, stairs.js). */
  stairHeight(x, z) { return this.contains(x, z) ? stairHeight(x - this.ox, z) : null; }
  stairUnderside(x, z) { return this.contains(x, z) ? stairUnderside(x - this.ox, z) : null; }

  /** The floors one can stand on at (x, z): Entréplan, Övre plan (not over the stair's opening), the stair. */
  floors(x, z) {
    const out = [LEVELS[0].floor];
    if (!this.inHole(x, z)) out.push(LEVELS[1].floor);
    const s = this.stairHeight(x, z);
    if (s !== null) out.push(s);
    return out;
  }

  /** The leaves' collision on `level` now. */
  doorSegments(level) { return this.doors.filter((d) => this.doorLevel.get(d) === level).map((d) => d.segment()); }

  /** Does the line a → b pass through one of its slabs (outside the stair's opening)? (E through a floor, #446) */
  throughSlab(a, b) {
    for (let i = 0; i < LEVELS.length; i++) {
      const L = LEVELS[i];
      for (const y of [L.floor + L.ceiling, L.top]) {
        if ((a.y - y) * (b.y - y) >= 0) continue;
        const t = (y - a.y) / (b.y - a.y), x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        if (!this.contains(x, z)) continue;
        if (i === 0 && this.inHole(x, z)) continue;
        return true;
      }
    }
    return false;
  }

  /** The room at a plan point on a level (world coordinates), or null. */
  roomAt(level, x, z) { return this.roomMaps[level]?.at(x - this.ox, z) ?? null; }

  /** Its level's name and room for the HUD. */
  label(level, x, z) {
    const room = this.roomAt(level, x, z);
    return `${this.id} · ${LEVELS[level].name}${room ? ` · ${room}` : ''}`;
  }

  update(dt) { for (const t of this.targets) t.update?.(dt); }

  /** The flat's centre (world), for the sun's shadow box. */
  get centre() { return new THREE.Vector3(this.ox + this.size.x / 2, 0, this.size.z / 2); }
}
