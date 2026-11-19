// #2149 (part of the avatar realism round): how a remote figure aims a weapon. Pure data and logic (no three.js, no DOM) so tools/avataraimtest.mjs
// can check it under node: the weapon (`h`, COMBAT.weapons) and the gaze pitch (`look[1]`, already on the wire) give hand targets (armTarget form:
// { at, pole } in the figure's frame), a torso lean and the prop's tilt. Ghost.animate applies them; weapons take precedence over carried items.
import { AVATAR_AIM as A } from './config.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const hand = (o) => o ?? { at: [0, 0, 0], pole: [0, 0, 0] };

/** The aim kind of weapon `h`: 'long', 'bow', 'one' or 'swing' (also for '' and anything unknown: no aim). */
export const aimKind = (h) => A.byWeapon[h] ?? 'swing';

/** A fresh result object for `aimPose` (reuse it every frame). */
export const newAim = () => ({ kind: 'swing', R: null, L: null, lean: 0, tilt: 0, twoHands: false, _R: null, _L: null });

/** The aiming pose for weapon `h` at gaze `pitch` (rad, up positive) into `out`: `R` / `L` hand targets (null: leave that arm alone), `lean` the
 * torso tilt (rad), `tilt` the prop's elevation about its x axis (rad). The 'swing' kind (saber, ball) leaves both null: its own cut is kept. */
export function aimPose(h, pitch = 0, out = newAim()) {
  const kind = out.kind = aimKind(h), K = A.kinds[kind];
  out.R = out.L = null; out.lean = 0; out.tilt = 0; out.twoHands = false;
  if (kind === 'swing') return out;
  const p = clamp(Number.isFinite(pitch) ? pitch : 0, -A.pitchLimit, A.pitchLimit), s = Math.sin(p), c = Math.cos(p);
  const on = (slot, spec, y, elbow) => {
    const o = hand(slot), r = spec.reach;
    o.at[0] = spec.x; o.at[1] = y + r * s; o.at[2] = r * c + 0.06;
    o.pole[0] = spec.x < 0 ? -elbow : elbow; o.pole[1] = -0.6 + 0.3 * s; o.pole[2] = -0.5;
    return o;
  };
  out.R = out._R = on(out._R, K.R, K.y0, K.elbowR);
  if (K.L) { out.L = out._L = on(out._L, K.L, K.y0 + (K.L.dy ?? 0), K.elbowL); out.twoHands = true; }
  out.lean = K.lean * p; out.tilt = p;
  return out;
}
