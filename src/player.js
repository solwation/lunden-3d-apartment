import * as THREE from 'three';
import { LEVELS, PLAYER, STAIR, UNIT_TOP, ROOFS, GARAGE, JETPACK, SPIDER, SOFFITS } from './config.js';
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
    this.jet = null;       // the jetpack (#359, jetpack.js): `worn`, `lift(dt, grounded)` = m/s² of thrust (− = down faster)
    this.flying = false;   // in the air with the jetpack on
    this.jv = { x: 0, z: 0 }; // flying: the horizontal velocity (inertia)
    this.suit = null;      // the Spider-Man suit (#597, spidersuit.js): `worn` lets you hold on to outdoor façades
    this.climb = null;     // on a wall: { nx, nz } = the façade's outward normal
    this.swing = null;     // on a web strand (#600): { a: anchor, nx, nz: its façade's normal (0, 0: none), len, v, t, shot }
    this.fling = null;     // after letting go of a strand (#600): { x, z } m/s kept in the air until the landing
    this.spaceDown = false; // Space held last frame (a press = a jump / letting go, #600)
    this.jumpPress = false; // the touch jump button was pressed (#600, main.js)
    this.onJump = null;     // (suit: boolean) the feet left the ground on a jump (#636)
  }

  spawn(x, z, yaw) {
    this.pos.set(x, this.groundAt(x, z, 0) ?? 0, z);
    this.vy = 0;
    this.glide = null; // (an unstick under way is for the old place, #314)
    this.fall = null; // (a teleport is no fall, #361)
    this.flying = false; this.jv.x = this.jv.z = 0;
    this.climb = null; this.swing = null; this.fling = null;
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
    if (this.inCore) return false; // (Hus L's stairwell: its own walls, on every storey, #456)
    if (this.world.unitAt?.(p.x, p.z, p.y)) return false; // in a visited flat's rooms (#574, #573); over it / its terrace: up
    return this.inFootprint(p.x, p.z) ? p.y > UNIT_TOP - 0.3 : p.y > groundY(p.x, p.z) + ROOFS.aloft;
  }

  /** In a visited flat (#574, visitunit.js): that flat, else null. Its Entréplan counts as level 0 like the street (its
   * walls are among level 0's), its Övre plan has segments of its own. */
  get unit() {
    const p = this.pos;
    return this.world.unitAt?.(p.x, p.z, p.y) ?? null;
  }

  /** The visited flat's level the visitor is on (0 / 1), or -1 outside one (#574). */
  get unitLevel() { const u = this.unit; return u ? u.levelAt(this.pos.y) : -1; }

  /** The stair under (x, z): ours or a visited flat's (#574). */
  stairAt(x, z, y = this.pos.y) { const u = this.world.unitAt?.(x, z, y); return u ? u.stairHeight(x, z) : stairHeight(x, z); }
  stairUnder(x, z, y = this.pos.y) { const u = this.world.unitAt?.(x, z, y); return u ? u.stairUnderside(x, z) : stairUnderside(x, z); }

  /** Down in the garage, the förråd corridor or the lift lobby under the courtyard (#357, garage.js): its walls collide. */
  get below() {
    const p = this.pos;
    return !this.inCore && !!this.world.garage?.inside(p.x, p.z) && p.y < GARAGE.floor + 1.5;
  }

  /** In Hus L's stairwell, its lift or the passage from the portik (#415, core.js): its walls collide. */
  get inCore() {
    const p = this.pos;
    return !!this.world.core?.contains(p.x, p.z, p.y);
  }

  /** Outside the flat (street, lawn, patio, up on the roofs); used for terrain and ambience. */
  get outdoors() {
    return (!this.inFootprint() && !this.unit) || this.aloft;
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
    const core = this.world.core, inCore = !inside && !!core?.covers(x, z);
    const unit = !inside && !inCore ? this.world.unitAt?.(x, z, feet) : null; // a visited flat: its floors and stair (#574)
    const cands = unit ? unit.floors(x, z) : [inside ? LEVELS[0].floor : inCore ? -Infinity : groundY(x, z)]; // outdoors: the terrain (the ramp by Hus L's east gable, #256)
    if (inCore) cands.push(...core.heights(x, z)); // the stairwell's floors and flights, the lift's car (#415)
    if (inside && !inHole) cands.push(LEVELS[1].floor);
    const s = unit ? null : stairHeight(x, z);
    if (s !== null) cands.push(s);
    if (this.world.garage?.inside(x, z)) cands.push(GARAGE.floor); // the garage under the courtyard (#357)
    const r = this.world.roofs?.under(x, z, feet, PLAYER.stepUp); // a roof, the loftgång, a terrace (#360)
    if (r) cands.push(r.y);
    let best = -Infinity;
    for (const c of cands) if (c <= feet + PLAYER.stepUp && c > best) best = c;
    return best;
  }

  /** Can the visitor stand up here? (Not under the underside of the upper flight / winders.) */
  roomToStand() {
    const { x, z, y } = this.pos;
    const u = this.stairUnder(x, z);
    return !(u !== null && u > y + PLAYER.crouchEye && u < y + PLAYER.headroom);
  }

  /** True when the stair at (x, z) is a wall for someone standing at `feet`: its tread is too high to step up on and
   * its underside (not its top, #352) is lower than the head. */
  blockedByStair(x, z, feet) {
    const s = this.stairAt(x, z, feet);
    return s !== null && s > feet + PLAYER.stepUp && this.stairUnder(x, z, feet) < feet + PLAYER.headroom;
  }

  segments() {
    if (this.aloft) { // up on the roofs (#360): the walls that stand in the way of the body, feet + step … head
      const y = this.pos.y;
      return [this.world.roofs?.walls(y + PLAYER.stepUp, y + PLAYER.headroom) ?? [], [...(this.world.core?.dynamic(y) ?? []), // (+ the stairwell's door onto the loftgång, #415)
        ...(this.world.units ?? []).flatMap((u) => u.doorSegmentsAt(y))]]; // a visited flat's street / terrace door (#573)
    }
    if (this.inCore) return this.world.core.segments(this.pos.y); // the stairwell (#415)
    if (this.below) return [this.world.garage.segments, this.world.garage.dynamic()]; // (#357)
    const u = this.unit; // in a visited flat (#574): upstairs (or anywhere in one up off the street, #573) its own walls and doors
    if (u && (!u.ground || u.levelAt(this.pos.y) > 0)) { const lv = u.levelAt(this.pos.y); return [u.fixed[lv], u.doorSegments(lv)]; }
    const lvl = this.world.levels[this.level];
    const up = this.level === 0 && this.pos.y > GARAGE.floor + 1.5 ? this.world.upperSegments ?? [] : []; // over the garage door (#357)
    const low = this.fall ? lvl.segments.filter((s) => !this.clears(s)) : lvl.segments; // in the air over a low hedge (#636)
    const doorSegs = this.world.doors
      .filter((d) => (d.object.position.y < LEVELS[0].floor + 1.6 ? 0 : 1) === this.level)
      .map((d) => d.segment());
    return [low, [...doorSegs, ...up, ...(this.world.movingSegments?.(this.level) ?? [])]]; // + open furniture flaps (#118)
  }

  /** The feet height to keep for a reload (resume.js): where they stand, mid-jump the ground under them (a record in the
   * air would be refused by resumeAt and send the visitor to the start, #636). */
  restY() { return this.fall?.jump ? this.groundAt(this.pos.x, this.pos.z, this.pos.y) : this.pos.y; }

  /** Is the low obstacle `s` (a collision segment with its top y as a fifth number: the clipped entrance hedge, #636) under
   * the feet, so it does not hold the body any more? */
  clears(s) { return s.length > 4 && this.pos.y >= s[4] - PLAYER.hurdle; }

  /** The lowest ceiling over (x, z) above the feet `y0` (#636): a roof / canopy outdoors (roofs.js), the room's ceiling
   * (RH, a lowered soffit, the underside of the stair) in our flat, a visited flat or the garage. */
  ceilingAt(x, z, y0) {
    const R = this.world.roofs?.above(x, z, y0 + PLAYER.stepUp) ?? Infinity;
    if (this.aloft) return R;
    if (this.below) return Math.min(R, GARAGE.ceiling);
    const u = this.unit;
    if (u) { const L = u.levels[u.levelAt(y0)]; const s = u.stairUnderside(x, z); return Math.min(R, L.floor + L.ceiling, s !== null && s > y0 ? s : Infinity); }
    if (!this.inFootprint(x, z)) return R;
    const lv = y0 > LEVELS[0].floor + 1.6 ? 1 : 0, L = LEVELS[lv];
    let c = L.floor + L.ceiling;
    for (const f of SOFFITS) if (f.level === lv && x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1) c = Math.min(c, L.floor + f.height);
    const s = stairUnderside(x, z);
    return Math.min(c, s !== null && s > y0 ? s : Infinity);
  }

  /**
   * Closed obstacles on `level` (#314): the furniture's footprints (#302) and closed moving boxes (our parked car, the
   * hoop's base) as convex polygons. Collision is segments only, so a visitor put inside one (getting up, F putting the
   * furniture back, a resume record, the car parking on you) could never get out.
   */
  obstacles(level = this.level) {
    if (this.aloft || this.inCore) return []; // (the flat's furniture and the car are far below, #360; the stairwell, #415)
    if (this.below) return this.world.garage.obstacles(); // the cars parked down there (#357)
    return [...(this.world.levels[level]?.footprints ?? []), ...(this.world.movingPolys?.(level) ?? [])];
  }

  /** Can the visitor stand at (x, z) on `level` (#314)? Clear of every segment by the radius + `margin`, inside no obstacle. */
  isFree(x, z, level = this.level, margin = 0.02) {
    if (this.inCore) { const [a, b] = this.world.core.segments(this.pos.y); return this.world.core.covers(x, z) && ![...a, ...b].some((sg) => segDist(x, z, sg) < PLAYER.radius + margin); } // (#415)
    if (this.below) { // in the garage (#357): its walls, the förråd doors, the cars
      const g = this.world.garage;
      return g.inside(x, z) && ![...g.segments, ...g.dynamic()].some((sg) => segDist(x, z, sg) < PLAYER.radius + margin) && !g.obstacles().some((q) => inPoly(q, x, z));
    }
    const u = this.unit; // in a visited flat, off the street (#574, #573)
    if (u && (!u.ground || u.levelAt(this.pos.y) > 0)) { const lv = u.levelAt(this.pos.y); return u.contains(x, z, this.pos.y) && !(lv && u.inHole(x, z)) && ![...u.fixed[lv], ...u.doorSegments(lv)].some((sg) => segDist(x, z, sg) < PLAYER.radius + margin); }
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
    const u = this.unit, up = u && (!u.ground || u.levelAt(this.pos.y) > 0), ul = u ? u.levelAt(this.pos.y) : 0; // (a visited flat, #574)
    const walls = this.inCore ? this.world.core.segments(this.pos.y)[0] : this.below ? this.world.garage.walls : up ? [...u.fixed[ul], ...u.doorSegments(ul)] : [...(this.world.levels[level]?.fixedSegments ?? this.world.levels[level].segments),
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

  /** The suit on, outdoors, not in the garage / the stairwell, not flying the jetpack: walls may be climbed (#597). */
  get canClimb() {
    return !!this.suit?.worn && !!this.world.roofs && this.outdoors && !this.below && !this.inCore && !this.flying;
  }

  /** The top of the building whose façade is in direction (dx, dz) of (x, z) (roofs.js's surfaces), or −∞. */
  roofAhead(x, z, dx, dz) {
    const d = PLAYER.radius + SPIDER.probe;
    return this.world.roofs.topAt(x + dx * d, z + dz * d);
  }

  /** Let go of the wall (Space, the suit off): a small push off it, then an ordinary fall. Off a strand too (#600). */
  letGo() {
    this.release();
    const c = this.climb;
    if (!c) return;
    this.climb = null;
    this.pos.x += c.nx * 0.08; this.pos.z += c.nz * 0.08;
    this.vy = 0;
  }

  /** One frame on a wall (#597): up / down with W S (the stick), sideways with A D; over the edge onto a roof within
   * SPIDER.reach; down at the foot of the wall you stand again. False when it let go (the usual update goes on). */
  climbStep(dt, fwd, side, pressed) {
    if (pressed || !this.canClimb) { this.letGo(); return false; }
    const c = this.climb, p = this.pos, R = this.world.roofs;
    const up = THREE.MathUtils.clamp(fwd, -1, 1), sd = THREE.MathUtils.clamp(side, -1, 1);
    const x0 = p.x, z0 = p.z;
    p.y += up * SPIDER.climb * dt;
    p.x += c.nz * sd * SPIDER.side * dt; p.z += -c.nx * sd * SPIDER.side * dt; // right of facing the wall = (nz, −nx)
    // hug it: lean in, its segments push back out (that push is the wall's normal here, round a bend too)
    p.x -= c.nx * 0.04; p.z -= c.nz * 0.04;
    const bx = p.x, bz = p.z, [stat, dyn] = this.segments();
    for (let it = 0; it < 3; it++) {
      let hit = false;
      for (const s of stat) hit = pushOut(p, PLAYER.radius, s) || hit;
      for (const s of dyn) hit = pushOut(p, PLAYER.radius, s) || hit;
      if (!hit) break;
    }
    const px = p.x - bx, pz = p.z - bz, pl = Math.hypot(px, pz);
    if (pl > 1e-5 && (px * c.nx + pz * c.nz) / pl > 0.5) { c.nx = px / pl; c.nz = pz / pl; }
    else if (pl < 1e-5) { p.x += c.nx * 0.04; p.z += c.nz * 0.04; } // (no wall pushed: lean back)
    // over the edge: a roof behind the wall within reach of the hands
    const d = PLAYER.radius + SPIDER.probe + 0.25, ix = p.x - c.nx * d, iz = p.z - c.nz * d;
    const r = R.under(ix, iz, p.y, SPIDER.reach);
    if (up > 0 && r && r.y > p.y - 0.3) {
      p.set(ix, r.y, iz); this.climb = null; this.vy = 0; this.fall = null;
      this.onMantle?.();
      return true;
    }
    // past the side of the building: back
    if (this.roofAhead(p.x, p.z, -c.nx, -c.nz) <= p.y) { p.x = x0; p.z = z0; }
    if (this.roofAhead(p.x, p.z, -c.nx, -c.nz) <= p.y) { this.letGo(); return false; } // (nothing left to hold)
    // down at the foot of the wall: standing
    const g = this.groundAt(p.x, p.z, p.y);
    if (p.y <= g) { p.y = g; if (up <= 0) this.climb = null; }
    this.vy = 0; this.fall = null; this.flying = false; this.crouched = false; this.sprinting = false;
    return true;
  }

  /** On a web that stuck at `a` (a Vector3) on a face with normal `n` (#600): the strand pulls you towards it, you swing. */
  attach(a, n, shot = null) {
    if (!this.canClimb) return false;
    const h = Math.hypot(n?.x ?? 0, n?.z ?? 0), wall = h > 0.7; // (a façade, not a roof's top / the ground)
    const eye = this.pos.clone(); eye.y += PLAYER.eye;
    const v = this.swing ? this.swing.v.clone() : new THREE.Vector3(this.fling?.x ?? 0, this.vy, this.fling?.z ?? 0);
    this.climb = null;
    this.swing = { a: a.clone(), nx: wall ? n.x / h : 0, nz: wall ? n.z / h : 0, len: eye.distanceTo(a), t: 0, shot,
      v };
    this.fling = null; this.fall = null; this.crouched = false;
    return true;
  }

  /** Off the strand: the speed it had goes on (`fling`) until the landing (#600). */
  release() {
    const s = this.swing;
    if (!s) return;
    this.swing = null;
    this.vy = s.v.y;
    this.fling = { x: s.v.x, z: s.v.z };
  }

  /** One frame on a strand (#600): pulled towards the anchor (reeled in, gravity swings you under it), the walls hold
   * you; there (or into a façade) = on the wall when it can be climbed, else let go. False when it let go. */
  swingStep(dt, pressed) {
    const s = this.swing, p = this.pos, v = s.v, S = SPIDER.swing;
    s.t += dt;
    if (pressed || !this.canClimb || s.t > S.max) { this.release(); return false; }
    const eye = new THREE.Vector3(p.x, p.y + PLAYER.eye, p.z);
    const d = s.a.clone().sub(eye), dist = d.length();
    if (dist < S.arrive) return this.arrive();
    // held back (a canopy over the head, a wall in the way) and getting no closer: let go
    if (dist < (s.best ?? Infinity) - 0.05) { s.best = dist; s.stall = 0; } else if ((s.stall = (s.stall ?? 0) + dt) > S.stall) { this.release(); return false; }
    d.divideScalar(dist);
    v.addScaledVector(d, S.pull * dt); v.y -= GRAVITY * S.gravity * dt;
    if (v.length() > S.speed) v.setLength(S.speed);
    // the strand: never longer than it was, reeled in; at its length the outward speed goes (the swing)
    s.len = Math.max(S.arrive * 0.5, Math.min(s.len, dist) - S.reel * dt);
    const next = eye.clone().addScaledVector(v, dt), r = next.clone().sub(s.a), rl = r.length();
    if (rl > s.len) {
      r.divideScalar(rl);
      const out = v.dot(r); if (out > 0) v.addScaledVector(r, -out);
    }
    // across, in small steps against the walls (as when walking / flying)
    const mx = v.x * dt, mz = v.z * dt, steps = Math.max(1, Math.ceil(Math.hypot(mx, mz) / 0.05));
    let wallN = null;
    for (let i = 0; i < steps; i++) {
      const [stat, dyn] = this.segments();
      const px0 = p.x, pz0 = p.z;
      p.x += mx / steps; p.z += mz / steps;
      const bx = p.x, bz = p.z;
      for (let it = 0; it < 3; it++) {
        let hit = false;
        for (const sg of stat) hit = pushOut(p, PLAYER.radius, sg) || hit;
        for (const sg of dyn) hit = pushOut(p, PLAYER.radius, sg) || hit;
        if (!hit) break;
      }
      const px = p.x - bx, pz = p.z - bz, pl = Math.hypot(px, pz);
      if (pl > 1e-5) wallN = { nx: px / pl, nz: pz / pl };
      const R = this.world.roofs;
      if (this.aloft && R) { // a roof's edge / a canopy in the way of the body
        const y0 = p.y + PLAYER.stepUp, y1 = p.y + PLAYER.headroom;
        if (R.blocks(p.x, p.z, y0, y1)) { if (!R.blocks(p.x, pz0, y0, y1)) p.z = pz0; else if (!R.blocks(px0, p.z, y0, y1)) p.x = px0; else { p.x = px0; p.z = pz0; } }
      }
    }
    if (wallN) {
      const into = -(v.x * wallN.nx + v.z * wallN.nz);
      if (into > 0) { // into a wall: the wall takes that speed; up the anchor's own façade on to it, onto another one to climb
        const own = s.nx * wallN.nx + s.nz * wallN.nz > 0.7;
        if (!own && this.roofAhead(p.x, p.z, -wallN.nx, -wallN.nz) > p.y + SPIDER.minWall) return this.grab(wallN);
        v.x += wallN.nx * into; v.z += wallN.nz * into;
      }
    }
    // up / down: the ground, a roof's top, a canopy over the head
    const y0 = p.y;
    p.y += v.y * dt;
    const g = this.groundAt(p.x, p.z, Math.max(y0, p.y));
    if (p.y <= g) { p.y = g; v.y = Math.max(0, v.y); }
    const top = (this.world.roofs?.above(p.x, p.z, y0 + PLAYER.stepUp) ?? Infinity) - PLAYER.headroom;
    if (p.y > top) { p.y = Math.max(Math.min(y0, top), g); v.y = Math.min(0, v.y); }
    this.vy = 0; this.fall = null; this.flying = false; this.sprinting = false;
    return true;
  }

  /** At the anchor (#600): on the façade when it is one to climb, else let go (and drop, the speed mostly gone). */
  arrive() {
    const s = this.swing, p = this.pos;
    if (s.nx || s.nz) {
      const r = PLAYER.radius + 0.01, x = s.a.x + s.nx * r, z = s.a.z + s.nz * r, y = Math.max(s.a.y - PLAYER.eye, this.groundAt(x, z, s.a.y));
      if (this.roofAhead(x, z, -s.nx, -s.nz) > y + 0.3) { p.set(x, y, z); return this.grab({ nx: s.nx, nz: s.nz }); }
    }
    s.v.multiplyScalar(0.25);
    this.release();
    return false;
  }

  /** Onto a façade (walking into it, or off a strand, #597 / #600). */
  grab(n) {
    this.swing = null; this.fling = null;
    this.climb = { nx: n.nx, nz: n.nz }; this.vy = 0; this.fall = null; this.crouched = false; this.sprinting = false;
    this.onGrab?.();
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
    // sprints at the same pace indoors and outdoors (#546)
    const amount = keyFwd || keySide ? 1 : Math.min(1, Math.hypot(this.analog.x, this.analog.y));
    const wantsRun = k.has('ShiftLeft') || k.has('ShiftRight') || (!keyFwd && !keySide && amount > PLAYER.sprintStick);
    // Space / the touch jump button pressed this frame (#600): a jump, letting go of the wall / the strand
    const pressed = (k.has('Space') && !this.spaceDown) || this.jumpPress;
    this.spaceDown = k.has('Space'); this.jumpPress = false;
    if (this.swing && this.swingStep(dt, pressed)) { this.settleEye(dt); return; } // on a strand (#600)
    if (this.climb && this.climbStep(dt, fwd, side, pressed)) { this.settleEye(dt); return; } // on a wall (#597)
    // crouch (#70): down at once, up only where there is head room (under the stair there may be none)
    // the jetpack (#359): its thrust first (Space / ⬆; C / Ctrl / ⬇ down faster); off the ground it flies
    const jet = this.jet?.worn ? this.jet : null;
    const g0 = jet ? this.groundAt(this.pos.x, this.pos.z, this.pos.y) : 0;
    const lift = jet ? jet.lift(dt, this.pos.y <= g0 + 0.02) : 0;
    this.flying = !!jet && (this.pos.y > g0 + 0.02 || lift > GRAVITY);
    this.crouched = !this.flying && (this.crouch || this.kneel || (this.crouched && !this.roomToStand()));
    this.sprinting = wantsRun && !this.crouched && (keyFwd || keySide || amount > 0);
    const speed = (this.sprinting ? PLAYER.run : PLAYER.walk * amount) * (this.crouched ? PLAYER.crouchSpeed : 1) * (this.boost ?? 1); // boost: Kaffeturbo (#217)

    const yaw = this.camera.rotation.y;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    // right vector = (cos yaw, -sin yaw) in (x, z)
    let mx = fx * fwd + Math.cos(yaw) * side;
    let mz = fz * fwd - Math.sin(yaw) * side;
    const m = Math.hypot(mx, mz);
    if (m > 0) { mx = (mx / m) * speed * dt; mz = (mz / m) * speed * dt; }
    const x0 = this.pos.x, z0 = this.pos.z;
    if (this.flying) { // flying across (#359): towards JETPACK.speed in the steered direction, with some inertia
      const v = JETPACK.speed * Math.min(1, keyFwd || keySide ? 1 : amount), k = Math.min(1, JETPACK.accel * dt);
      const tx = m > 0 ? (mx / (Math.hypot(mx, mz) || 1)) * v : 0, tz = m > 0 ? (mz / (Math.hypot(mx, mz) || 1)) * v : 0;
      this.jv.x += (tx - this.jv.x) * k; this.jv.z += (tz - this.jv.z) * k;
      mx = this.jv.x * dt; mz = this.jv.z * dt;
    } else if (this.fling) { // the speed kept off a strand, in the air (#600): on top of the steering, the air slows it
      const k = Math.max(0, 1 - SPIDER.swing.fling * dt);
      this.fling.x *= k; this.fling.z *= k;
      mx += this.fling.x * dt; mz += this.fling.z * dt;
    }

    // move in small sub-steps so fast movement can't tunnel through thin walls
    const steps = Math.max(1, Math.ceil(Math.hypot(mx, mz) / 0.05));
    const [stat, dyn] = this.segments();
    let wallN = null; // the way the last wall pushed back (a façade to climb, #597)
    for (let i = 0; i < steps; i++) {
      const prev = this.pos.clone();
      this.pos.x += mx / steps;
      this.pos.z += mz / steps;
      const bx = this.pos.x, bz = this.pos.z;
      for (let it = 0; it < 3; it++) {
        let hit = false;
        for (const s of stat) hit = pushOut(this.pos, PLAYER.radius, s) || hit;
        for (const s of dyn) hit = pushOut(this.pos, PLAYER.radius, s) || hit;
        if (!hit) break;
      }
      const px = this.pos.x - bx, pz = this.pos.z - bz, pl = Math.hypot(px, pz);
      if (pl > 1e-5) wallN = { nx: px / pl, nz: pz / pl };
      if (this.blockedByStair(this.pos.x, this.pos.z, this.pos.y)) {
        // slide: try each axis separately
        const tryX = new THREE.Vector3(this.pos.x, prev.y, prev.z);
        const tryZ = new THREE.Vector3(prev.x, prev.y, this.pos.z);
        if (!this.blockedByStair(tryX.x, tryX.z, prev.y)) this.pos.copy(tryX);
        else if (!this.blockedByStair(tryZ.x, tryZ.z, prev.y)) this.pos.copy(tryZ);
        else this.pos.copy(prev);
      }
      if (jet && this.aloft && this.world.roofs) { // flying into a roof's edge / a canopy: in the way of the body (#359)
        const R = this.world.roofs, y0 = prev.y + PLAYER.stepUp, y1 = prev.y + PLAYER.headroom;
        if (R.blocks(this.pos.x, this.pos.z, y0, y1)) {
          if (!R.blocks(this.pos.x, prev.z, y0, y1)) this.pos.z = prev.z;
          else if (!R.blocks(prev.x, this.pos.z, y0, y1)) this.pos.x = prev.x;
          else { this.pos.x = prev.x; this.pos.z = prev.z; }
        }
      }
      const g = this.groundAt(this.pos.x, this.pos.z, this.pos.y);
      if (g >= this.pos.y) { this.pos.y = g; this.vy = 0; }
    }

    if (this.flying) { this.jv.x = (this.pos.x - x0) / dt; this.jv.z = (this.pos.z - z0) / dt; } // (a wall takes the speed)

    // the Spider-Man suit (#597): walking (or falling) into the façade of a building taller than you holds you on it
    // (or flung into it off a strand, #600)
    const flungIn = wallN && this.fling ? -(this.fling.x * wallN.nx + this.fling.z * wallN.nz) > 1 : false;
    if (wallN && ((fwd > 0.3 && -(fx * wallN.nx + fz * wallN.nz) > 0.5) || flungIn) && this.canClimb
      && this.roofAhead(this.pos.x, this.pos.z, -wallN.nx, -wallN.nz) > this.pos.y + SPIDER.minWall) {
      this.grab(wallN);
      this.settleEye(dt);
      return;
    }
    if (wallN && this.fling) { const into = -(this.fling.x * wallN.nx + this.fling.z * wallN.nz); if (into > 0) { this.fling.x += wallN.nx * into; this.fling.z += wallN.nz * into; } }

    // the jump (#600, #636): Space / the touch button, standing on something, without the jetpack, not in the stairwell / the
    // lift and with room to stand. The suit: SPIDER.jump (2.5 m); without it PLAYER.jump (~1 m, clears the entrance hedge).
    // The ceiling stops it (`ceilingAt`), so indoors the suit's jump is no higher than the room allows.
    if (pressed && !jet && !this.fall && !this.inCore && !this.kneel && this.roomToStand()
      && this.pos.y <= this.groundAt(this.pos.x, this.pos.z, this.pos.y) + 0.02) {
      const suit = !!this.suit?.worn;
      this.vy = suit ? SPIDER.jump : PLAYER.jump; this.crouched = false;
      this.fall = { top: this.pos.y, gap: 0, jump: true, from: this.pos.y, low: !suit }; // (a jump is no drop: see the landing)
      this.onJump?.(suit);
    }

    // gravity (and the jetpack's thrust, #359)
    const g = this.groundAt(this.pos.x, this.pos.z, this.pos.y);
    let impact = 0;
    if (this.pos.y > g || lift > GRAVITY || this.vy > 0) {
      const f = (this.fall ??= { top: this.pos.y, gap: 0 }); // falls (#361)
      f.top = Math.max(f.top, this.pos.y); f.gap = Math.max(f.gap, this.pos.y - g);
      const y0 = this.pos.y;
      this.vy += (lift - GRAVITY) * dt;
      if (jet) {
        if (lift > 0) this.vy = Math.min(this.vy, JETPACK.climb);
        else if (lift < 0) this.vy = Math.max(this.vy, Math.min(-JETPACK.sink, this.vy - lift * dt)); // (no faster than `sink` by the push)
      }
      this.pos.y = Math.max(g, this.pos.y + this.vy * dt);
      if (jet || this.vy > 0) { // the ceiling, and a canopy / roof over the head on the way up (a jump too, #600)
        const top = Math.min(jet ? JETPACK.ceiling : Infinity, (jet ? this.world.roofs?.above(this.pos.x, this.pos.z, y0 + PLAYER.stepUp) ?? Infinity : this.ceilingAt(this.pos.x, this.pos.z, y0)) - PLAYER.headroom);
        if (this.pos.y > top) { this.pos.y = Math.max(Math.min(y0, top), g); this.vy = Math.min(0, this.vy); }
      }
      if (this.pos.y === g) { impact = -this.vy; this.vy = 0; }
    }
    if (this.fall && this.pos.y <= g) { // landed: with the jetpack on, as hard as the speed it came down at (a soft landing on thrust)
      const f = this.fall; this.fall = null; this.fling = null;
      this.onLand?.(jet ? Math.max(0, impact) ** 2 / (2 * GRAVITY) : f.low ? Math.max(0, f.from - this.pos.y) : f.top - this.pos.y, f.gap); // (an ordinary jump counts from where it left the ground, #636)
    }
    if (this.fling && this.pos.y <= g && this.vy <= 0) this.fling = null; // (let go standing: no sliding on)

    this.world.core?.snap(this); // riding the lift (#415)
    this.settleEye(dt);
  }

  /** The camera to the feet + the eye height (smoothed over stair steps). */
  settleEye(dt) {
    const target = this.pos.y + (this.crouched ? PLAYER.crouchEye : PLAYER.eye);
    this.eyeY += (target - this.eyeY) * Math.min(1, dt * 14);
    this.camera.position.set(this.pos.x, this.eyeY, this.pos.z);
  }
}
