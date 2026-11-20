import { AVATAR_FOOT_IK as K } from './config.js';

// #2015: the feet follow the real ground. The gait (walkGait / groundMotion in avatar.js, avatarmotion.js) plans every foot on a flat floor at
// the root's height; this module adds, per foot, the height of the ground under that foot (`ground(x, z, feetY)` = Player.groundAt, so stair
// treads, ramps, kerbs and floors come from the same data the player walks on) and the slope under the sole, and says how far the hips
// follow. poseOlof's two-bone leg IK (olof.js `ik`) then reaches the raised / lowered ankle; avatar.js lowers the hips to the legs' reach.
// All of it is an offset on top of the planned foot, recomputed every frame and never fed back into the gait's own foot state.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (cur, goal, dt, rate) => cur + (goal - cur) * (1 - Math.exp(-rate * dt));

/** The world point of the figure-frame point (px, pz) for the frame [x, z, yaw] of a figure scaled `sc` (as avatarmotion.js `world`). */
export function footWorld(out, px, pz, f, sc) {
  const c = Math.cos(f[2]), s = Math.sin(f[2]);
  out[0] = f[0] + sc * (px * c + pz * s); out[1] = f[1] + sc * (-px * s + pz * c); return out;
}

/** Pure helper: the ground slope (rad, toe up) from the ground heights under the heel, the ankle and the toe, `len` m heel to toe (the ankle `share` of
 * the way). 0 across a step edge: a stair's rise over a sole is steeper than any ramp, and its heights do not lie on one line (the ankle is
 * not between the heel's and the toe's by the sole's proportion), so only a ramp's straight ground tilts the foot. */
export function slopePitch(heel, ankle, toe, len, share = K.heel / (K.heel + K.toe)) {
  if (!Number.isFinite(heel) || !Number.isFinite(toe)) return 0;
  const d = toe - heel;
  if (Math.abs(d) > K.edgeSlope * len) return 0;
  if (Number.isFinite(ankle) && Math.abs(ankle - (heel + d * share)) > K.lineTol + K.lineShare * Math.abs(d)) return 0;
  return clamp(Math.atan2(d, len), -K.maxPitch, K.maxPitch);
}

/**
 * Per frame, after the gait has planned `gt.feet` (figure frame, ankle [x, y, z]) and `gt.pitch` (toe-up rad):
 * raises / lowers each foot onto the ground under it and adds the ground's slope to the foot's pitch.
 * `frame` [x, z, yaw] and `floorY` = the world position / height of the figure's floor (its root), `sc` its scale, `ground` (x, z, feetY) -> height.
 * Returns the hips' shift (figure units, applied by the caller) and `av.footIK` = { off: [l, r], pitch: [l, r], ground: [l, r], active }.
 * `enabled` false (seated, air, swimming, dancing …): the offsets ease back to nothing, so a pose never jumps.
 */
export function footGround(av, dt, gt, frame, floorY, sc, ground, enabled) {
  const s = av.footIK ??= { off: [0, 0], pitch: [0, 0], ground: [NaN, NaN], sm: [NaN, NaN], active: false, hip: 0, weight: 0, p: [0, 0], q: [0, 0] };
  const live = enabled && !!ground && !!frame && Number.isFinite(floorY);
  if (!live) {
    s.weight = smooth(s.weight, 0, dt, K.ease); s.ground[0] = s.ground[1] = NaN;
    for (let i = 0; i < 2; i++) { s.off[i] *= Math.exp(-K.ease * dt); s.pitch[i] *= Math.exp(-K.ease * dt); }
  } else {
    // The body stands on the ground (the root is at it, or a little under while it climbs): full weight. Well above it (jump, a drop): fade out.
    const g0 = ground(frame[0], frame[1], floorY + K.reach), airborne = Number.isFinite(g0) ? floorY - g0 : K.fade[1];
    s.weight = smooth(s.weight, clamp(1 - (airborne - K.fade[0]) / (K.fade[1] - K.fade[0]), 0, 1), dt, K.ease);
    for (let i = 0; i < 2; i++) {
      const f = gt.feet[i], w = footWorld(s.p, f[0], f[2], frame, sc), g = ground(w[0], w[1], floorY + K.reach);
      s.ground[i] = g;
      // The world height under the foot is smoothed, not the offset from the root: when the root itself steps (a stair under the player) a planted
      // foot keeps its world height, and a swinging foot rises onto the next tread inside its swing.
      // A swinging foot must clear what is ahead of it: it is lifted to the higher of the ground under its ankle and under its toe (a riser's top).
      let gt0 = g;
      if (Number.isFinite(g) && !av.gaitInfo?.contact[i]) {
        const sn0 = Math.sin(frame[2]), c0 = Math.cos(frame[2]), d = K.toe * sc, gToe = ground(w[0] + sn0 * d, w[1] + c0 * d, floorY + K.reach);
        if (Number.isFinite(gToe) && gToe > g) gt0 = gToe;
      }
      if (Number.isFinite(gt0)) s.sm[i] = Number.isFinite(s.sm[i]) && s.weight > 0.01 ? smooth(s.sm[i], gt0, dt, av.gaitInfo?.contact[i] ? K.rateStance : K.rate) : gt0;
      // #2208: a planted sole cannot lag BELOW a newly reached tread. The exponential filter leaves ~5.6 cm of an
      // 18 cm rise after one 60 Hz frame (rateStance=70). Keep easing down/swinging, but bound support by the live ground.
      if (av.gaitInfo?.contact[i] && Number.isFinite(g)) s.sm[i] = Math.max(s.sm[i], g);
      s.off[i] = Number.isFinite(s.sm[i]) ? clamp((s.sm[i] - floorY) / sc, -K.maxDrop, K.maxRise) * s.weight : 0;
      // the sole's slope: ground under the heel and the toe along the foot's own direction
      const c = Math.cos(frame[2]), sn = Math.sin(frame[2]), hz = -K.heel * sc, tz = K.toe * sc;
      const ref = (Number.isFinite(g) ? g : floorY) + K.edgeTol;
      const hh = ground(w[0] + sn * hz, w[1] + c * hz, ref), th = ground(w[0] + sn * tz, w[1] + c * tz, ref);
      s.pitch[i] = smooth(s.pitch[i], slopePitch(hh, g, th, (K.heel + K.toe) * sc) * s.weight, dt, K.rate);
    }
  }
  s.active = s.weight > 0.01 || Math.abs(s.off[0]) > 0.002 || Math.abs(s.off[1]) > 0.002;
  if (s.active) for (let i = 0; i < 2; i++) { gt.feet[i][1] += s.off[i]; gt.pitch[i] = (gt.pitch[i] ?? 0) + s.pitch[i]; }
  s.hip = s.active ? K.hipFollow * (s.off[0] + s.off[1]) / 2 : 0;
  return s.hip;
}
