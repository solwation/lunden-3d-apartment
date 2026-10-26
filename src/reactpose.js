// #1639: the BIO reactions' pose (cry, laugh, scream in terror) as numbers on top of the ordinary standing / seated pose.
// Pure and procedural on the existing rig: no meshes, no draw calls. Figure frame as in src/olof.js (x = the figure's left, z forward).
import { REACT } from './config.js';

const smooth = (t) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };
const TAU = Math.PI * 2;

/** Pose of reaction `kind` (index into REACT.kinds) at `age` s, around the hips `hip` = [y, z]; null when none / over.
 * { amt: 0 … 1 blend, dy: hips up (m), lean, head (rad, added), mouth: 0 … 1, hands: [L, R] targets } */
export function reactionPose(kind, age, hip) {
  const K = REACT.kinds[kind];
  if (!K || !(age >= 0) || age >= REACT.duration) return null;
  const amt = smooth(age / REACT.ease) * smooth((REACT.duration - age) / REACT.ease), ph = age * K.hz * TAU, sn = Math.sin(ph), [hy, hz] = hip;
  let dy = 0, lean = K.lean * amt, head = K.head * amt, mouth = K.mouth, target;
  if (K.id === 'cry') { // hands over the face, head down, shoulders shaking
    dy = K.shake * sn * amt; head += 0.05 * Math.sin(ph * 0.5) * amt; mouth = K.mouth + 0.2 * Math.abs(Math.sin(ph * 0.5));
    target = (s) => ({ at: [s * 0.08, hy + 0.58 + 0.008 * sn, hz + 0.21], pole: [s * 0.9, -0.6, -0.3] });
  } else if (K.id === 'laugh') { // head back, holding the belly, bobbing
    dy = K.shake * Math.abs(sn) * amt; lean += 0.05 * sn * amt; head += 0.06 * sn * amt; mouth = K.mouth * (0.55 + 0.45 * Math.abs(sn));
    target = (s) => ({ at: [s * 0.11, hy + 0.28, hz + 0.27], pole: [s * 0.9, -0.4, -0.3] });
  } else { // scream: hands up beside the head, mouth wide open, trembling
    dy = K.shake * sn * amt; head += 0.03 * sn * amt; mouth = K.mouth - 0.08 * Math.abs(sn);
    target = (s) => ({ at: [s * (0.21 + 0.02 * sn), hy + 0.8, hz + 0.1], pole: [s * 1, -0.7, -0.1] });
  }
  return { amt, dy, lean, head, mouth: mouth * smooth(amt * 3), hands: [target(1), target(-1)] };
}

/** `current` hand target moved `amt` of the way to `goal` (both { at, pole }). */
export const mixHand = (current, goal, amt) => ({ at: current.at.map((v, i) => v + (goal.at[i] - v) * amt), pole: current.pole.map((v, i) => v + (goal.pole[i] - v) * amt) });
