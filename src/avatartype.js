// #2174: a remote figure that is typing in the chat looks down at a hand held up in front of the chest, as if typing on a phone. Pure functions
// (no three.js): the weight eases in / out with `typing` (the chat's existing "skriver…" flag, no wire field), the pose is a right-hand target plus a
// head pitch (down is negative) and a small forward lean, and it is suppressed while anything else owns the body. Ghost.animate blends it over the
// hand targets it has (blendHand) and adds `head` / `lean`. Tunables: TYPING in config.js.
import { TYPING } from './config.js';

/** Moves the weight `w` (0 … 1) towards 1 when `on`, else 0, over TYPING.up / TYPING.down seconds (linear steps, the pose smooths them). */
export function typeStep(w, on, dt) {
  if (!Number.isFinite(dt) || dt <= 0) return w;
  return on ? Math.min(1, w + dt / TYPING.up) : Math.max(0, w - dt / TYPING.down);
}

/** Whether the figure may type: false while cycling, driving, swimming, armed, airborne, posed (gym / lying), knocked out, kissed or hugged. Seated is fine. */
export function typeAllowed(s) {
  return !(s.bike || s.drive || s.swim || s.armed || s.air || s.gym || s.lying || s.knock || s.kiss || s.hug || s.busy);
}

/** Fills `out` { w, hand: { at, pole }, head, lean } for the weight `w` (smoothed); `side` -1 is the right hand. Returns null at weight 0. */
export function typePose(w, side = -1, out = { w: 0, hand: { at: [0, 0, 0], pole: [0, 0, 0] }, head: 0, lean: 0 }) {
  if (!(w > 0)) return null;
  const s = w * w * (3 - 2 * w), f = -side, h = out.hand;
  out.w = s; out.head = -TYPING.head * s; out.lean = -TYPING.lean * s;
  h.at[0] = TYPING.hand[0] * f; h.at[1] = TYPING.hand[1]; h.at[2] = TYPING.hand[2];
  h.pole[0] = TYPING.pole[0] * f; h.pole[1] = TYPING.pole[1]; h.pole[2] = TYPING.pole[2];
  return out;
}
