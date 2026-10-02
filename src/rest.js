import * as THREE from 'three';
import { REST } from './config.js';

// Sitting down and lying down (#71/#72). Furniture builders put `userData.rest = { kind, name, verb,
// spots }` on a piece (spots in its local frame: x, y = seat/mattress height, z, optional dir = the way
// the face / the feet point, default local +z). furniture.js turns them into world-space E targets.
// While resting the visitor cannot walk; the camera moves smoothly to the spot, looking can turn
// within REST limits, and E again stands up where you were standing before.

/** World-space rest target for a furniture piece (called by buildFurniture). */
export function restTarget(obj, item, levelFloor) {
  const R = obj.userData.rest, yaw = obj.rotation.y, c = Math.cos(yaw), s = Math.sin(yaw);
  const toWorld = (lx, lz) => [c * lx + s * lz, -s * lx + c * lz];
  const spots = R.spots.map((p) => {
    const [ox, oz] = toWorld(p.x, p.z), [dx, dz] = toWorld(...(p.dir ?? [0, 1]));
    return {
      ...p,
      pos: new THREE.Vector3(item.x + ox, levelFloor + p.y + (R.kind === 'lie' ? REST.lieEye : REST.sitEye), item.z + oz),
      yaw: Math.atan2(-dx, -dz), // camera yaw facing that way
    };
  });
  return { kind: 'rest', rest: R.kind, name: R.name, verbText: R.verb, pickable: obj, spots, level: item.level,
    get verb() { return this.verbText; } };
}

/** The spot a look ray points at (nearest to the ray), skipping ones the cat sits on. */
export function chooseSpot(target, ray, catPos) {
  let best = null, bestD = Infinity;
  for (const sp of target.spots) {
    if (catPos && Math.hypot(catPos.x - sp.pos.x, catPos.z - sp.pos.z) < 0.35 && Math.abs(catPos.y - (sp.pos.y - 0.6)) < 0.6) continue;
    const d = ray.distanceSqToPoint(sp.pos);
    if (d < bestD) { bestD = d; best = sp; }
  }
  return best;
}

/** Resting state machine (one at a time). */
export class Rest {
  constructor(camera) {
    Object.assign(this, { camera, spot: null, target: null, t: 0, from: null, standing: null });
  }

  get active() { return this.spot !== null; }
  get kind() { return this.target?.rest ?? null; }

  /** Sit / lie down at `spot` of `target`; `stand` = where to get up again (player feet pos + yaw). */
  begin(target, spot, stand) {
    const cam = this.camera;
    this.target = target;
    this.spot = spot;
    this.standing = stand;
    this.t = 0;
    this.from = { pos: cam.position.clone(), yaw: cam.rotation.y, pitch: cam.rotation.x };
    const lim = REST[target.rest];
    this.to = { yaw: spot.yaw, pitch: target.rest === 'lie' ? lim.startPitch : 0 };
  }

  end() {
    const s = this.standing;
    this.spot = this.target = null;
    return s;
  }

  update(dt) {
    if (!this.active || this.t >= 1) return;
    this.t = Math.min(1, this.t + dt / REST.move);
    const e = this.t * this.t * (3 - 2 * this.t), cam = this.camera;
    cam.position.lerpVectors(this.from.pos, this.spot.pos, e);
    let dy = this.to.yaw - this.from.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy)); // the short way round
    cam.rotation.y = this.from.yaw + dy * e;
    cam.rotation.x = this.from.pitch + (this.to.pitch - this.from.pitch) * e;
  }

  /** Clamp a look while resting (yaw within ± of the seat's direction, pitch within its range). */
  clampLook(cam) {
    if (!this.active || this.t < 1) return;
    const lim = REST[this.target.rest];
    let d = cam.rotation.y - this.spot.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    cam.rotation.y = this.spot.yaw + THREE.MathUtils.clamp(d, -lim.yaw, lim.yaw);
    cam.rotation.x = THREE.MathUtils.clamp(cam.rotation.x, lim.pitch[0], lim.pitch[1]);
  }
}
