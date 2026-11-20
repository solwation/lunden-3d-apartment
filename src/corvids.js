// #2196: corvids all year, without three.js (headless, tools/corvidtest.mjs). `corvidCount` is the species/season helper (how many of a
// species live in a home area in a month, and with which gait); `CorvidFlock` is a #2129 SmallFlock with the corvid ground gaits: a jackdaw
// or crow STRIDES on a lawn (a steady walk, the body and head rocking with each step, pauses to peck), a magpie HOPS and flicks its tail
// now and then (a short pitch kick: the model has no separate tail bone). Flying, perching, landing, flushing and the cats' hooks
// (groundBirds / perchedBirds) are all SmallFlock's. Tunables: config.js CORVIDS (*guess*).
import { SmallFlock } from './birdflock.js';
import { CORVIDS as K, BIRD_LIFE } from './config.js';

export const CORVID_KINDS = Object.keys(K.species);
const lerp = ([a, b], k) => a + (b - a) * k;

/** Birds of `kind` in the home area `home` ('gården' | 'parken') in `month` (1–12): base x the season's multiplier, at least 1; 0 where the
 *  species has no base there or the phone profile (`lowMemory`) drops it (courtyard only, half the number, at least one). */
export function corvidCount(kind, home, month, lowMemory = false) {
  const s = K.species[kind], base = s?.base[home] ?? 0;
  if (!base || (lowMemory && (!s.phone || home !== 'gården'))) return 0;
  const n = Math.max(1, Math.round(base * (s.season[(Math.round(month) - 1 + 12) % 12] ?? 1)));
  return lowMemory ? Math.max(1, Math.round(n / 2)) : n;
}

/** The most birds of `kind` there can be in `home` over the whole year (the instance buffer's size). */
export function corvidCapacity(kind, home, lowMemory = false) {
  let m = 0; for (let i = 1; i <= 12; i++) m = Math.max(m, corvidCount(kind, home, i, lowMemory)); return m;
}

/** 'walk' | 'hop' of a species. */
export const corvidGait = (kind) => K.species[kind]?.gait ?? 'hop';

/** The BIRD_LIFE of a species: the small-bird rules with the species' own overrides on top. */
export const corvidLife = (kind) => ({ ...BIRD_LIFE, ...K.species[kind].life });

export class CorvidFlock extends SmallFlock {
  constructor({ kind, ...rest }) {
    super({ ...rest, C: rest.C ?? corvidLife(kind) });
    this.kind = kind; this.gait = corvidGait(kind); this.spec = K.species[kind];
  }

  sitDown(b) { super.sitDown(b); b.legRem = 0; b.pause = lerp(K.pause, this.rnd()); b.phase = this.rnd() * 6.283; b.flickT = lerp(K.flickEvery, this.rnd()); b.flickU = 1; }

  sit(b, dt) {
    const g = this.group;
    if (this.gait === 'walk' && g.kind === 'ground' && !b.hop) { this.walk(b, dt, g); return; }
    super.sit(b, dt);
    if (this.gait === 'hop' && !b.hop && !(b.peck > 0)) this.flick(b, dt);
  }

  /** The magpie's tail flick: a short upward kick every few seconds (a negative pitch tips the body up, like the landing flare). */
  flick(b, dt) {
    if ((b.flickT -= dt) <= 0) { b.flickT = lerp(K.flickEvery, this.rnd()); b.flickU = 0; }
    if (b.flickU < 1) { b.flickU += dt / K.flickTime; b.pitch = -K.flick * Math.sin(Math.PI * Math.min(1, b.flickU)); }
  }

  /** A crow's / jackdaw's walk on a lawn: legs of `K.stride` m at `K.walkSpeed` m/s with the body rocking per step, then a pause, often a peck. */
  walk(b, dt, g) {
    const C = this.C;
    b.flap = 0; b.fold = 1; b.bank = 0;
    if (b.peck > 0) { b.peck -= dt; b.pitch = C.peckPitch * Math.sin(Math.PI * (1 - b.peck / C.peckTime)); return; }
    if (b.legRem > 0) { // (a number, not an object: no allocation per leg)
      const step = Math.min(dt * K.walkSpeed, b.legRem);
      b.x += Math.sin(b.yaw) * step; b.z += Math.cos(b.yaw) * step; b.y = g.yAt(b.x, b.z); b.legRem -= step;
      b.phase += dt * K.stepHz * 6.2832; b.pitch = K.rock * Math.sin(b.phase) - 0.04;
      if (b.legRem <= 1e-6) { b.legRem = 0; b.pause = lerp(K.pause, this.rnd()); }
      return;
    }
    b.pitch = 0;
    if ((b.pause -= dt) > 0) return;
    if (this.rnd() < 0.5) { b.peck = C.peckTime; b.pause = lerp([0.3, 1], this.rnd()); return; }
    const a = b.yaw + (this.rnd() - 0.5) * 1.8, len = lerp(K.stride, this.rnd()), x = b.x + Math.sin(a) * len, z = b.z + Math.cos(a) * len;
    if (g.ok(x, z) && Math.hypot(x - g.x, z - g.z) < 3) { b.yaw = a; b.legRem = len; }
    else { b.yaw += (this.rnd() - 0.5) * 2; b.pause = 0.3; } // no room that way: turn
  }
}
