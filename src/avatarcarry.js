// #2144 (part of the avatar realism round): how a figure carries what it holds. Pure data and logic (no three.js, no DOM) so
// tools/avatarcarrytest.mjs can check it under node: a held category (heldcategory.js `hi`) and the gaze pitch give hand targets
// (armTarget form: { at, pole } in the figure's frame), a torso lean and where the held proxy sits; Ghost.animate applies them to
// remote avatars and the mirror self-ghost. Nothing goes over the wire beyond `hi`.
import { AVATAR_CARRY as C } from './config.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const hand = (o) => o ?? { at: [0, 0, 0], pole: [0, 0, 0] };
const set = (h, x, y, z, px, py, pz) => { h.at[0] = x; h.at[1] = y; h.at[2] = z; h.pole[0] = px; h.pole[1] = py; h.pole[2] = pz; return h; };

/** The carry kind of a category: 'one' (default: a hand held out), 'heavy', 'tray', 'hang', 'hug', 'eyes' or 'aim'. '' or unknown: 'one'. */
export const carryKind = (category) => C.byCategory[category] ?? 'one';

/** A fresh result object for `carryPose` (reuse it every frame). */
export const newCarry = () => ({ kind: 'one', R: null, L: null, lean: 0, item: null, twoHands: false, tilt: 0, _R: null, _L: null });

/** The pose for `category` at gaze `pitch` (rad, up positive) into `out`: `R` / `L` hand targets (null: leave that arm to the ordinary pose;
 * `R` null for a plain 'one' kind: the caller's default), `lean` the torso tilt (rad), `item` [right, up, back] the proxy's shift or null. */
export function carryPose(category, pitch = 0, out = newCarry()) {
  const kind = out.kind = carryKind(category), K = C.kinds[kind];
  out.lean = K.lean; out.item = K.item ?? null; out.twoHands = false; out.tilt = 0; out.R = out.L = null;
  const slotR = () => (out._R = hand(out._R)), slotL = () => (out._L = hand(out._L));
  if (kind === 'one') return out;
  const e = K.elbow, p = clamp(Number.isFinite(pitch) ? pitch : 0, -C.pitchLimit, C.pitchLimit);
  const R = out.R = slotR();
  if (kind === 'aim') { // the arm points along the gaze: the wrist on a line from the shoulder at the look's elevation
    const r = K.reach, y = K.y0 + r * Math.sin(p), z = r * Math.cos(p) + 0.06;
    if (category !== 'rod') out.tilt = p; // the proxy points along the arm (the rod's own elevation stays)
    return set(R, -K.side, y, z, -e, -0.6 + 0.3 * Math.sin(p), -0.5), out;
  }
  if (kind === 'hang') return set(R, -K.side, K.y, K.z, -e, -0.3, -1), out;
  out.twoHands = true; const L = out.L = slotL();
  if (kind === 'eyes') { // up in front of the eyes; the raise grows with the look so it stays in front of them
    const y = K.y + 0.1 * Math.sin(p);
    set(R, -K.side, y, K.z, -e, -0.2, -0.3); set(L, K.side + 0.05, y, K.z, e, -0.2, -0.3);
    return out;
  }
  set(R, -K.side, K.y, K.z, -e, -0.6, -0.4); set(L, K.side, K.y, K.z, e, -0.6, -0.4);
  return out;
}

/** Eases `lean` towards `target` over `dt` s (C.ease per second). */
export const easeLean = (lean, target, dt) => lean + (target - lean) * (1 - Math.exp(-C.ease * Math.max(0, dt)));
