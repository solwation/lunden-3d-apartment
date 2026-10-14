import { BOW, rifleHeadBaseY } from './config.js';
import { nerfPlayerContact as segmentPlayerContact } from './nerf.js';

/** Existing visible arrow step: gravity first, then translation; also used by combat prediction. */
export function stepArrow(position, velocity, dt) {
  velocity.y -= BOW.gravity * dt;
  position.x += velocity.x * dt;
  position.y += velocity.y * dt;
  position.z += velocity.z * dt;
}

/** The existing 20ms prediction, at the actual arrow TIP, bounded by flight life and travelled range. */
export function* bowSegments(shot, range) {
  if (!Array.isArray(shot?.o) || shot.o.length !== 3 || !Array.isArray(shot.d) || shot.d.length !== 3 ||
    ![...shot.o, ...shot.d].every(Number.isFinite) || !Number.isFinite(range) || range <= 0 ||
    !Number.isFinite(shot.s) || shot.s < BOW.speed[0] || shot.s > BOW.speed[1]) return;
  const norm = Math.hypot(...shot.d);
  if (norm < .9 || norm > 1.1) return;
  const p = { x: shot.o[0], y: shot.o[1], z: shot.o[2] };
  const velocity = { x: shot.d[0]*shot.s, y: shot.d[1]*shot.s, z: shot.d[2]*shot.s };
  // The physical tip starts BOW.len ahead; it must not extend the existing world-distance range.
  let travelled = BOW.len;
  for (let index = 0; index*.02 < BOW.flight && travelled < range; index++) {
    const from = [p.x, p.y, p.z], dt = Math.min(.02, BOW.flight-index*.02);
    stepArrow(p, velocity, dt);
    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
    if (!speed) return;
    const direction = [velocity.x/speed, velocity.y/speed, velocity.z/speed];
    const length = Math.min(speed*dt, range-travelled);
    const origin = from.map((x,i)=>x+direction[i]*BOW.len);
    const end = origin.map((x,i)=>x+direction[i]*length);
    yield { origin, direction, length, end };
    travelled += length;
  }
}

export const bowPlayerContact = segmentPlayerContact;

/** First player contact decides head/body; a later box cannot override an earlier body. */
export function bowHeadContact(seed, state, shot, range) {
  if (shot?.t !== 'a' || shot.w !== 'bow' || rifleHeadBaseY(seed,state)===null) return null;
  for (const segment of bowSegments(shot, range)) {
    const hit = bowPlayerContact(seed, state, segment);
    if (hit) return hit.head ? hit : null;
  }
  return null;
}
