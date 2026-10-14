import { TOYS, LEVELS, COMBAT, rifleBoxHeadContact, rifleHeadBaseY } from './config.js';

/** The same analytic segment for a visible foam dart and its combat prediction (#714). Returns travel distance. */
export function stepNerf(position, velocity, dt, remaining = Infinity, floor = -Infinity) {
  const gravity = TOYS.nerf.dart.gravity;
  let time = dt, landed = false;
  if (position.y + velocity.y * time - gravity * time * time / 2 <= floor) {
    landed = true;
    time = Math.max(0, Math.min(time, (velocity.y + Math.sqrt(velocity.y ** 2 + 2 * gravity * Math.max(0, position.y - floor))) / gravity));
  }
  const length = (t) => Math.hypot(velocity.x * t, velocity.y * t - gravity * t * t / 2, velocity.z * t);
  if (length(time) > remaining) {
    landed = false;
    let low = 0, high = time;
    for (let i = 0; i < 24; i++) { const middle = (low + high) / 2; if (length(middle) > remaining) high = middle; else low = middle; }
    time = low;
  }
  const distance = length(time);
  position.x += velocity.x * time;
  position.y = landed ? floor : Math.max(floor, position.y + velocity.y * time - gravity * time * time / 2);
  position.z += velocity.z * time;
  velocity.y -= gravity * time;
  return distance;
}
export const nerfFloor = (from) => from.y > LEVELS[1].floor + 0.3 ? LEVELS[1].floor : LEVELS[0].floor;

/** Existing 20 ms muzzle prediction, shared with the authoritative head check (#894).
 * Arrays/plain coordinates keep this usable in the Worker without Three or scene state. */
export function* nerfSegments(shot, range) {
  const p = { x: shot.o[0], y: shot.o[1], z: shot.o[2] };
  const speed = shot.s || TOYS.nerf.dart.speed;
  const velocity = { x: shot.d[0] * speed, y: shot.d[1] * speed, z: shot.d[2] * speed };
  const floor = nerfFloor(p) + .008, limit = Math.min(range, TOYS.nerf.dart.range);
  let travelled = 0;
  while (travelled < limit - 1e-7) {
    const origin = [p.x, p.y, p.z];
    const length = stepNerf(p, velocity, .02, limit - travelled, floor);
    if (!Number.isFinite(length) || length <= 0) break;
    const end = [p.x, p.y, p.z], direction = end.map((x, i) => (x - origin[i]) / length);
    yield { origin, end, direction, length };
    travelled += length;
    if (p.y <= floor) break;
  }
}

/** Existing full body capsule, clipped only above the shared logical neck (#894).
 * Analytic intervals preserve ordinary body hits outside the cosmetic mesh. */
export function nerfBodyContact(origin, direction, length, feet, ceiling = Infinity) {
  let first = Infinity;
  const clip = (near, far, low, high, o, d) => {
    if (d === 0) return o >= low && o <= high ? [near, far] : [1, -1];
    const a = (low - o) / d, b = (high - o) / d;
    return [Math.max(near, Math.min(a,b)), Math.min(far, Math.max(a,b))];
  };
  const radius = COMBAT.hitRadius, bottom = feet[1]+COMBAT.body[0], top = feet[1]+COMBAT.body[1];
  const ox = origin[0]-feet[0], oz = origin[2]-feet[2], [dx,dy,dz] = direction;
  const accept = (a,b,c, low=-Infinity, high=Infinity) => {
    let near=0, far=length;
    if (a === 0) { if (c > 0) return; }
    else {
      const disc=b*b-a*c;
      if (disc < 0) return;
      near=Math.max(near,(-b-Math.sqrt(disc))/a); far=Math.min(far,(-b+Math.sqrt(disc))/a);
    }
    [near,far]=clip(near,far,low,Math.min(high,ceiling),origin[1],dy);
    if (near<=far) first=Math.min(first,near);
  };
  accept(dx*dx+dz*dz,ox*dx+oz*dz,ox*ox+oz*oz-radius*radius,bottom,top);
  for (const center of [bottom,top]) {
    const oy=origin[1]-center;
    accept(dx*dx+dy*dy+dz*dz,ox*dx+oy*dy+oz*dz,ox*ox+oy*oy+oz*oz-radius*radius);
  }
  return Number.isFinite(first)?first:null;
}

/** Nearest head or existing body contact within one finite muzzle segment. */
export function nerfPlayerContact(seed, state, segment) {
  const head=rifleBoxHeadContact(seed,state,segment.origin,segment.direction,segment.length);
  const body=nerfBodyContact(segment.origin,segment.direction,segment.length,state.p,rifleHeadBaseY(seed,state));
  if (head && (body===null || head.distance<body)) return {distance:head.distance,point:head.point,head:true};
  return body===null?null:{distance:body,head:false};
}

/** Recompute the FIRST player contact: an earlier body contact cannot earn a later head bonus. */
export function nerfHeadContact(seed, state, shot, range) {
  if (shot?.t !== 'a' || shot.w !== 'nerf' || !Array.isArray(shot.o) || !Array.isArray(shot.d)
    || shot.o.length !== 3 || shot.d.length !== 3 || ![...shot.o, ...shot.d].every(Number.isFinite)
    || !Number.isFinite(range) || range < 0 || (shot.s !== undefined && (!Number.isFinite(shot.s) || shot.s < 0 || shot.s > 60))) return null;
  if (Math.hypot(...shot.d) < .9 || Math.hypot(...shot.d) > 1.1 || rifleHeadBaseY(seed,state)===null) return null;
  for (const segment of nerfSegments(shot, range)) {
    const hit=nerfPlayerContact(seed,state,segment);
    if (hit) return hit.head?hit:null;
  }
  return null;
}
