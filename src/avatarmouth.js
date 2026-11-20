// #2160: the remote figure's drink / bite / toast move as pure functions (no three.js): the right wrist goes to the mouth (or, for a toast,
// up and forward with the glass), the head tips back, and everything returns to rest. Ghost.animate blends the result over the hand targets
// it already has and adds `head` to the gaze pitch and `lean` to the torso. Tunables: MOUTH in config.js. Unknown kinds do nothing.
import { MOUTH } from './config.js';

const smooth = (x) => x * x * (3 - 2 * x);

/** The move's strength 0 … 1 for `kind` at `age` s since it began: eases up, holds, eases down; 0 for an unknown kind, before the start or after the end. */
export function mouthWeight(kind, age) {
  const M = Object.hasOwn(MOUTH, kind) ? MOUTH[kind] : null;
  if (!M || !Number.isFinite(age) || age <= 0 || age >= M.dur) return 0;
  const k = age / M.dur;
  return k < M.up ? smooth(k / M.up) : k > 1 - M.down ? smooth((1 - k) / M.down) : 1;
}

/** Fills `out` { w, hand: { at, pole } | null, head, lean } for `kind` at `age`; `side` -1 is the right hand. Returns null when it is not running. */
export function mouthPose(kind, age, side = -1, out = { w: 0, hand: { at: [0, 0, 0], pole: [0, 0, 0] }, head: 0, lean: 0 }) {
  const w = mouthWeight(kind, age);
  if (!w) return null;
  const M = MOUTH[kind];
  out.w = w; out.head = M.head * w; out.lean = M.lean * w;
  const h = out.hand, f = -side; // MOUTH's hand is for the right side (x < 0): mirror for the left
  h.at[0] = M.hand[0] * f; h.at[1] = M.hand[1]; h.at[2] = M.hand[2];
  h.pole[0] = M.pole[0] * f; h.pole[1] = M.pole[1]; h.pole[2] = M.pole[2];
  return out;
}

/** `from` (a hand target) eased towards `to` by `w`, written into `out` (allocated when omitted). */
export function blendHand(from, to, w, out = { at: [0, 0, 0], pole: [0, 0, 0] }) {
  for (let i = 0; i < 3; i++) { out.at[i] = from.at[i] + (to.at[i] - from.at[i]) * w; out.pole[i] = from.pole[i] + (to.pole[i] - from.pole[i]) * w; }
  return out;
}
