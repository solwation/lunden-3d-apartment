import * as THREE from 'three';
import { LEVELS, PLAYER, STAIR } from './config.js';
import { stairHeight } from './stairs.js';
import { groundY } from './surroundings.js';

const GRAVITY = 9.8;

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
  }

  spawn(x, z, yaw) {
    this.pos.set(x, this.groundAt(x, z, 0) ?? 0, z);
    this.vy = 0;
    this.eyeY = this.pos.y + PLAYER.eye;
    this.camera.position.set(x, this.eyeY, z);
    this.camera.rotation.set(0, yaw, 0, 'YXZ');
  }

  /** Outside the flat's footprint (street, lawn, patio): the only place to sprint. */
  get outdoors() {
    const { x: W, z: D } = this.world.size, p = this.pos;
    return !(p.x > 0 && p.x < W && p.z > 0 && p.z < D);
  }

  get level() {
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
    let best = -Infinity;
    for (const c of cands) if (c <= feet + PLAYER.stepUp && c > best) best = c;
    return best;
  }

  /** Can the visitor stand up here? (Not under the underside of the upper flight / winders.) */
  roomToStand() {
    const { x, z, y } = this.pos;
    const s = stairHeight(x, z);
    return !(s !== null && s > y + PLAYER.crouchEye + 0.25 && s - 0.25 < y + PLAYER.headroom);
  }

  /** True when a stair surface at (x, z) is a wall for someone standing at `feet`. */
  blockedByStair(x, z, feet) {
    const s = stairHeight(x, z);
    return s !== null && s > feet + PLAYER.stepUp && s < feet + PLAYER.headroom;
  }

  segments() {
    const lvl = this.world.levels[this.level];
    const doorSegs = this.world.doors
      .filter((d) => (d.object.position.y < LEVELS[0].floor + 1.6 ? 0 : 1) === this.level)
      .map((d) => d.segment());
    return [lvl.segments, [...doorSegs, ...(this.world.movingSegments?.(this.level) ?? [])]]; // + open furniture flaps (#118)
  }

  update(dt) {
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
      this.vy -= GRAVITY * dt;
      this.pos.y = Math.max(g, this.pos.y + this.vy * dt);
      if (this.pos.y === g) this.vy = 0;
    }

    // smooth the eye height over stair steps
    const target = this.pos.y + (this.crouched ? PLAYER.crouchEye : PLAYER.eye);
    this.eyeY += (target - this.eyeY) * Math.min(1, dt * 14);
    this.camera.position.set(this.pos.x, this.eyeY, this.pos.z);
  }
}
