// #2146: Olof at the wheel comes alive. Pure helpers (no three.js, headless-testable: tools/olofdrivetest.mjs; numbers OLOF_DRIVE in config.js):
// the steering wheel's angle from the path's curvature, where he looks (the visitor, over his shoulder while reversing, or the road), and the
// small body motion on braking, starting and cornering. The blinking, saccades and breathing are the avatars' own (avatargaze.js, avatarchest.js).
import { OLOF_DRIVE as D } from './config.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const wrapAngle = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

/** Curvature (rad of heading per m, + = to the left) from the heading `yaw0` at path distance `d0` and `yaw1` at `d1` (the car's yaw: + turns left). */
export const curvature = (yaw0, yaw1, d0, d1) => (d1 - d0 > 1e-6 ? wrapAngle(yaw1 - yaw0) / (d1 - d0) : 0);

/** The steering wheel's angle (rad, + = turned left, counter-clockwise from the driver's seat) for a path curvature `k` (as `curvature`, along the
 * path). Backing up (`rev`) the car's front goes the other way along the path, so the wheel is turned the other way for the same bend. */
export function wheelAngle(k, rev = false) {
  const road = Math.atan(D.wheelBase * k) * (rev ? -1 : 1);
  return clamp(road * D.ratio, -D.maxWheel, D.maxWheel);
}

/** The path window [d0, d1] for the curvature at distance `d`: `span` m wide, kept on one side of the reversing cusp `revEnd` (the heading flips there) and within [0, total]. */
export function curveWindow(d, total, revEnd = 0) {
  const lo = d < revEnd ? 0 : revEnd + 1e-3, hi = d < revEnd ? revEnd - 1e-3 : total;
  return [clamp(d - D.span / 2, lo, hi), clamp(d + D.span / 2, lo, hi)];
}

/** The hands' places on the wheel: centre `c` [x, y, z] (his frame: x his left, z forward), radius `r`, the wheel's tilt `tilt` (rad, its face leans back),
 * turned `steer` rad (+ left). Returns [leftHand, rightHand]; at steer 0 they sit at c ± r on x. */
export function wheelHands(c, r, tilt, steer) {
  const cs = Math.cos(steer), sn = Math.sin(steer), ey = Math.cos(tilt), ez = -Math.sin(tilt); // the wheel's own up, in the figure's frame
  const dx = r * cs, dy = -r * sn * ey, dz = -r * sn * ez; // (a left turn takes the left hand down)
  return [[c[0] + dx, c[1] + dy, c[2] + dz], [c[0] - dx, c[1] - dy, c[2] - dz]];
}

/** Weight 0 … 1 of the look over the shoulder `t` s into a reversing manoeuvre: held, with a short glance back to the road every `forwardEvery` s. */
export function shoulderWeight(t) {
  const m = ((t % D.forwardEvery) + D.forwardEvery) % D.forwardEvery, from = D.forwardEvery - D.forwardFor;
  return m < from ? 1 : 1 - 0.9 * Math.sin(Math.PI * (m - from) / D.forwardFor);
}

/** What he looks at: 'shoulder' while backing up; 'visitor' when greeted (state 'joke') or the car is parked with the visitor within `range` m; else 'road'. */
export function driverFocus({ state, parked, reversing, dist }) {
  if (reversing) return 'shoulder';
  if (state === 'joke') return 'visitor';
  if (parked && Number.isFinite(dist) && dist <= D.range) return 'visitor';
  return 'road';
}

/** The head's direction to a target seen at (`x` left, `y` up, `z` forward) from his head, in his frame: { turn (rad, + left), pitch (rad, + up) }, the head's share of it, capped. */
export function headToward(x, y, z) {
  const yaw = Math.atan2(x, z), pit = Math.atan2(y, Math.hypot(x, z));
  return { turn: clamp(yaw * D.headShare, -D.maxTurn, D.maxTurn), pitch: clamp(pit * D.headShare, -D.maxPitch, D.maxPitch) };
}

/** His body on the car's motion: `accel` m/s² along the car's front (+ starting, − braking), `lat` m/s² of cornering (+ a left turn). Returns the extra torso
 * lean (rad, + back into the seat) and sideways tilt (rad, + to his right = the outside of a left turn). */
export function bodyMotion(accel, lat) {
  return { lean: clamp(accel * D.accel, -D.maxLean, D.maxLean), roll: clamp(lat * D.roll, -D.maxRoll, D.maxRoll) };
}
