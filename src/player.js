import * as THREE from 'three';
import { LEVELS, PLAYER, STAIR, UNIT_TOP, ROOFS } from './config.js';
import { stairHeight, stairUnderside } from './stairs.js';
import { groundY } from './surroundings.js';

const GRAVITY = 9.8;

/** Distance from (x, z) to a segment. */
export function segDist(x, z, [ax, az, bx, bz]) {
  const vx = bx - ax, vz = bz - az, l = vx * vx + vz * vz || 1, t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l));
  return Math.hypot(x - ax - vx * t, z - az - vz * t);
}
/** Is (x, z) inside the convex polygon `q` ([[x, z], ...], either winding)? */
export function inPoly(q, x, z) {
  let pos = 0, neg = 0;
  for (let i = 0; i < q.length; i++) {
    const [ax, az] = q[i], [bx, bz] = q[(i + 1) % q.length], c = (bx - ax) * (z - az) - (bz - az) * (x - ax);
    if (c > 0) pos++; else if (c < 0) neg++;
  }
  return !(pos && neg);
}
/** Does the segment a → b cross the segment s (strictly inside a → b)? */
export function crosses(ax, az, bx, bz, [cx, cz, dx, dz]) {
  const d = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / d, u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / d;
  return t > 0 && t < 1 && u >= 0 && u <= 1;
}

function pushOut(pos, r, [ax, az, bx, bz]) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz || 1e-9;
  const t = THREE.MathUtils.clamp(((pos.x - ax) * dx + (pos.z - az) * dz) / len2, 0, 1);
  const cx = ax + dx * t, cz = az + dz * t;
  let nx = pos.x - cx, nz = pos.z - cz;
  const d = Math.hypot(nx, nz);
  if (d >= r) return false;
  if (d < 1e-6) { nx = -dz; nz = dx; } // exactly on the line: push sideways
  const n = Math.hypot(nx, nz);
  pos.x = cx + (nx / n) * r;
  pos.z = cz + (nz / n) * r;
  return true;
}

export class Player {
  constructor(world, camera) {
    this.world = world;
    this.camera = camera;
    this.pos = new THREE.Vector3(); // feet position
    this.vy = 0;
    this.eyeY = 0;
    this.keys = new Set();
    this.analog = { x: 0, y: 0 }; // touch joystick, −1..1
    this.sprinting = false;
    this.crouch = false;   // wanted (Ctrl held / touch toggle)
    this.crouched = false; // actually down (stays down where there is no room to stand)
    this.kneel = false;    // down to pet a cat on the floor (#242), set by main.js
    this.fall = null;      // in the air (#361): { top, gap } = the highest feet and the deepest free drop under them
    this.onLand = null;    // (drop, gap) on landing — main.js → fall.js
  }

  spawn(x, z, yaw) {
    this.pos.set(x, this.groundAt(x, z, 0) ?? 0, z);
    this.vy = 0;
    this.glide = null; // (an unstick under way is for the old place, #314)
    this.fall = null; // (a teleport is no fall, #361)
    this.eyeY = this.pos.y + PLAYER.eye;
    this.camera.position.set(x, this.eyeY, z);
    this.camera.rotation.set(0, yaw, 0, 'YXZ');
  }

  /** Is (x, z) inside the flat's footprint (plan)? */
  inFootprint(x = this.pos.x, z = this.pos.z) {
    const { x: W, z: D } = this.world.size;
    return x > 0 && x < W && z > 0 && z < D;
  }

  /** Up on a roof, the loftgång or a terrace, or in the air outdoors (#360): over our flat above its top (the
   * loftgång and the upper units sit on it), elsewhere ROOFS.aloft m over the ground. Then the roofs' walls collide. */
  get aloft() {
    const p = this.pos;
    return this.inFootprint(p.x, p.z) ? p.y > UNIT_TOP - 0.3 : p.y > groundY(p.x, p.z) + ROOFS.aloft;
  }

  /** Outside the flat (street, lawn, patio, up on the roofs): the only place to sprint. */
  get outdoors() {
    return !this.inFootprint() || this.aloft;
  }

  /** The flat's level the visitor is on (0 outdoors, up on the roofs too). */
  get level() {
    if (!this.inFootprint() || this.aloft) return 0;
    return this.pos.y > LEVELS[0].floor + 1.6 ? 1 : 0;
  }

  /** Highest walkable surface at (x, z) that can be reached from feet height `feet`. */
  groundAt(x, z, feet) {
    const { x: W, z: D } = this.world.size;
    const inside = x > 0 && x < W && z > 0 && z < D;
    const h = STAIR.hole;
    const inHole = x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1;
    const cands = [inside ? LEVELS[0].floor : groundY(x, z)]; // outdoors: the terrain (the ramp by Hus L's east gable, #256)
    if (inside && !inHole) cands.push(LEVELS[1].floor);
    const s = stairHeight(x, z);
    if (s !== null) cands.push(s);
    const r = this.world.roofs?.under(x, z, feet, PLAYER.stepUp); // a roof, the loftgång, a terrace (#360)
    if (r) cands.push(r.y);
    let best = -Infinity;
    for (const c of cands) if (c <= feet + PLAYER.stepUp && c > best) best = c;
    return best;
  }

  /** Can the visitor stand up here? (Not under the underside of the upper flight / winders.) */
  roomToStand() {
    const { x, z, y } = this.pos;
    const u = stairUnderside(x, z);
    return !(u !== null && u > y + PLAYER.crouchEye && u < y + PLAYER.headroom);
  }

  /** True when the stair at (x, z) is a wall for someone standing at `feet`: its tread is too high to step up on and
   * its underside (not its top, #352) is lower than the head. */
  blockedByStair(x, z, feet) {
    const s = stairHeight(x, z);
    return s !== null && s > feet + PLAYER.stepUp && stairUnderside(x, z) < feet + PLAYER.headroom;
  }

  segments() {
    if (this.aloft) { // up on the roofs (#360): the walls that stand in the way of the body, feet + step … head
      const y = this.pos.y;
      return [this.world.roofs?.walls(y + PLAYER.stepUp, y + PLAYER.headroom) ?? [], []];
    }
    const lvl = this.world.levels[this.level];
    const doorSegs = this.world.doors
      .filter((d) => (d.object.position.y < LEVELS[0].floor + 1.6 ? 0 : 1) === this.level)
      .map((d) => d.segment());
    return [lvl.segments, [...doorSegs, ...(this.world.movingSegments?.(this.level) ?? [])]]; // + open furniture flaps (#118)
  }

  /**
   * Closed obstacles on `level` (#314): the furniture's footprints (#302) and closed moving boxes (our parked car, the
   * hoop's base) as convex polygons. Collision is segments only, so a visitor put inside one (getting up, F putting the
   * furniture back, a resume record, the car parking on you) could never get out.
   */
  obstacles(level = this.level) {
    if (this.aloft) return []; // (the flat's furniture and the car are far below, #360)
    return [...(this.world.levels[level]?.footprints ?? []), ...(this.world.movingPolys?.(level) ?? [])];
  }

  /** Can the visitor stand at (x, z) on `level` (#314)? Clear of every segment by the radius + `margin`, inside no obstacle. */
  isFree(x, z, level = this.level, margin = 0.02) {
    const lvl = this.world.levels[level];
    const doorSegs = this.world.doors.filter((d) => (d.object.position.y < LEVELS[0].floor + 1.6 ? 0 : 1) === level).map((d) => d.segment());
    const segs = [...lvl.segments, ...doorSegs, ...(this.world.movingSegments?.(level) ?? [])];
    if (segs.some((sg) => segDist(x, z, sg) < PLAYER.radius + margin)) return false;
    if (this.obstacles(level).some((q) => inPoly(q, x, z))) return false;
    if (level === 1) { const h = STAIR.hole; if (x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1) return false; }
    return true;
  }

  /** The nearest free spot to (x, z) reached through no wall, window or door (a spiral search), or null (#314). */
  nearestFree(x, z, level = this.level) {
    const walls = [...(this.world.levels[level]?.fixedSegments ?? this.world.levels[level].segments),
      ...this.world.doors.filter((d) => (d.object.position.y < LEVELS[0].floor + 1.6 ? 0 : 1) === level).map((d) => d.segment())];
    for (let r = 0.05; r < 3.01; r += 0.05) {
      const n = Math.max(8, Math.round(2 * Math.PI * r / 0.05));
      for (let i = 0; i < n; i++) {
        const a = i / n * 2 * Math.PI, px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
        if (this.isFree(px, pz, level) && !walls.some((sg) => crosses(x, z, px, pz, sg))) return { x: px, z: pz };
      }
    }
    return null;
  }

  /** Inside an obstacle (#314)? Then glide (or with `instant` jump) to the nearest free spot; true while it does. */
  unstick(dt, instant = false) {
    const p = this.pos;
    if (!this.glide) {
      if (!this.obstacles().some((q) => inPoly(q, p.x, p.z))) return false;
      const to = this.nearestFree(p.x, p.z);
      if (!to) return false;
      if (this.debug) console.log(`unstick (#314): (${p.x.toFixed(2)}, ${p.z.toFixed(2)}) → (${to.x.toFixed(2)}, ${to.z.toFixed(2)})`);
      this.unstuck = (this.unstuck ?? 0) + 1;
      this.glide = to;
    }
    const dx = this.glide.x - p.x, dz = this.glide.z - p.z, d = Math.hypot(dx, dz), step = instant ? d : PLAYER.unstick * dt;
    if (d <= step) { p.x = this.glide.x; p.z = this.glide.z; this.glide = null; }
    else { p.x += dx / d * step; p.z += dz / d * step; }
    this.camera.position.x = p.x; this.camera.position.z = p.z;
    return true;
  }

  update(dt) {
    if (this.unstick(dt)) return; // pushed out of a piece of furniture / the car first (#314)
    const k = this.keys;
    // ← → turn (useful when the touchpad is disabled while typing), ↑ ↓ walk
    const turn = (k.has('ArrowLeft') ? 1 : 0) - (k.has('ArrowRight') ? 1 : 0);
    if (turn) this.camera.rotation.y += turn * PLAYER.turnSpeed * dt;
    const keyFwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const keySide = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const fwd = keyFwd || this.analog.y;
    const side = keySide || this.analog.x;
    // analog stick: speed follows how far it's pushed; Shift or the stick pushed all the way out
    // sprints — outdoors only, inside it is just walking (no rushing through the flat, #43)
    const amount = keyFwd || keySide ? 1 : Math.min(1, Math.hypot(this.analog.x, this.analog.y));
    const wantsRun = k.has('ShiftLeft') || k.has('ShiftRight') || (!keyFwd && !keySide && amount > PLAYER.sprintStick);
    // crouch (#70): down at once, up only where there is head room (under the stair there may be none)
    this.crouched = this.crouch || this.kneel || (this.crouched && !this.roomToStand());
    this.sprinting = wantsRun && this.outdoors && !this.crouched && (keyFwd || keySide || amount > 0);
    const speed = (this.sprinting ? PLAYER.run : PLAYER.walk * amount) * (this.crouched ? PLAYER.crouchSpeed : 1) * (this.boost ?? 1); // boost: Kaffeturbo (#217)

    const yaw = this.camera.rotation.y;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    // right vector = (cos yaw, -sin yaw) in (x, z)
    let mx = fx * fwd + Math.cos(yaw) * side;
    let mz = fz * fwd - Math.sin(yaw) * side;
    const m = Math.hypot(mx, mz);
    if (m > 0) { mx = (mx / m) * speed * dt; mz = (mz / m) * speed * dt; }

    // move in small sub-steps so fast movement can't tunnel through thin walls
    const steps = Math.max(1, Math.ceil(Math.hypot(mx, mz) / 0.05));
    const [stat, dyn] = this.segments();
    for (let i = 0; i < steps; i++) {
      const prev = this.pos.clone();
      this.pos.x += mx / steps;
      this.pos.z += mz / steps;
      for (let it = 0; it < 3; it++) {
        let hit = false;
        for (const s of stat) hit = pushOut(this.pos, PLAYER.radius, s) || hit;
        for (const s of dyn) hit = pushOut(this.pos, PLAYER.radius, s) || hit;
        if (!hit) break;
      }
      if (this.blockedByStair(this.pos.x, this.pos.z, this.pos.y)) {
        // slide: try each axis separately
        const tryX = new THREE.Vector3(this.pos.x, prev.y, prev.z);
        const tryZ = new THREE.Vector3(prev.x, prev.y, this.pos.z);
        if (!this.blockedByStair(tryX.x, tryX.z, prev.y)) this.pos.copy(tryX);
        else if (!this.blockedByStair(tryZ.x, tryZ.z, prev.y)) this.pos.copy(tryZ);
        else this.pos.copy(prev);
      }
      const g = this.groundAt(this.pos.x, this.pos.z, this.pos.y);
      if (g >= this.pos.y) { this.pos.y = g; this.vy = 0; }
    }

    // gravity
    const g = this.groundAt(this.pos.x, this.pos.z, this.pos.y);
    if (this.pos.y > g) {
      const f = (this.fall ??= { top: this.pos.y, gap: 0 }); // falls (#361)
      f.top = Math.max(f.top, this.pos.y); f.gap = Math.max(f.gap, this.pos.y - g);
      this.vy -= GRAVITY * dt;
      this.pos.y = Math.max(g, this.pos.y + this.vy * dt);
      if (this.pos.y === g) this.vy = 0;
    }
    if (this.fall && this.pos.y <= g) { const f = this.fall; this.fall = null; this.onLand?.(f.top - this.pos.y, f.gap); } // landed

    // smooth the eye height over stair steps
    const target = this.pos.y + (this.crouched ? PLAYER.crouchEye : PLAYER.eye);
    this.eyeY += (target - this.eyeY) * Math.min(1, dt * 14);
    this.camera.position.set(this.pos.x, this.eyeY, this.pos.z);
  }
}
