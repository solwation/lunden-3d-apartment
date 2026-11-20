// #2162: a remote figure aiming at the billiard table bends over it: the left hand is the bridge on the felt near the cue tip, the right hand
// holds the cue's butt end, the stroke arm goes back with the charge and forward on the shot, the torso leans over. Pure logic (no three.js) so
// tools/avatarcuetest.mjs can check it under node. Everything is in the figure's frame (facing +z, floor at 0, metres; src/avatar.js armTarget):
// the caller (Ghost) converts the cue frame the table gave it (billiards.js updateRemoteCues: the rest tip and the tip-to-butt axis) first.
import { CUE_ARM as C, PLAYROOM } from './config.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** A fresh result object for `cueArms` (reuse it every frame). */
export const newCueArms = () => ({ L: { at: [0, 0, 0], pole: [0, 0, 0] }, R: { at: [0, 0, 0], pole: [0, 0, 0] }, lean: 0, over: 0 });

// one wrist target `p` for the arm whose shoulder is at `sh`, held within C.reach of it (the point moves towards the shoulder, never past it)
function reachTo(p, sh, at) {
  const d = dist3(p, sh), k = d > C.reach ? C.reach / d : 1;
  for (let i = 0; i < 3; i++) at[i] = sh[i] + (p[i] - sh[i]) * k;
  return d;
}

/** The arm targets and the torso bend for a cue given by its rest tip `tip` (the point behind the cue ball with no pull-back), the unit axis `u`
 * from the tip towards the butt, and the current `pull` (m drawn back, negative = through the ball), all in the figure's frame.
 * `L` is the bridge hand, `R` the stroke hand. `lean` is poseOlof's lean (negative = forward, rad), `over` how far the farthest hand is beyond comfort. */
export function cueArms(tip, u, pull, out = newCueArms()) {
  const shL = [C.shoulderX, C.shoulderY, 0], shR = [-C.shoulderX, C.shoulderY, 0];
  const bridge = [tip[0] + u[0] * C.bridgeS, tip[1] + u[1] * C.bridgeS, tip[2] + u[2] * C.bridgeS];
  const s = pull + C.gripS, grip = [tip[0] + u[0] * s, tip[1] + u[1] * s, tip[2] + u[2] * s];
  const dL = reachTo(bridge, shL, out.L.at), dR = reachTo(grip, shR, out.R.at);
  for (let i = 0; i < 3; i++) { out.L.pole[i] = C.poleL[i]; out.R.pole[i] = C.poleR[i]; }
  out.over = Math.max(0, Math.max(dL, dR) - C.comfort);
  out.lean = -Math.min(C.leanMax, C.leanBase + C.leanK * out.over);
  return out;
}

/** The cue's draw-back (m) `age` s into a shot that began with `pull0` m drawn back: the same curve billiards.js draws the cue with (pull
 * running out, then a travel through the ball); null once the stroke is over (age beyond PLAYROOM.billiards.strokeSeconds + C.shot) or before it. */
export function strokePull(pull0, age) {
  const B = PLAYROOM.billiards;
  if (!Number.isFinite(age) || age < 0 || age > B.strokeSeconds + C.shot) return null;
  const k = Math.min(1, age / B.strokeSeconds);
  return pull0 * (1 - k) * (1 - k) - Math.sin(k * Math.PI) * B.cueTravel;
}
