// #2188: the ponies' ambient voices and their visible breath in the cold. Pure helpers (no three.js, no Web Audio; headless-testable:
// tools/ponysoundtest.mjs). `stepPonyVoice` is a per-pony schedule: which sound (snort, shuffle, hoof step, grass tearing, a greeting
// nicker, a far whinny) is due now from its state, the visitor's distance and the cold; audio.js plays it under a VoiceCap and paddock.js
// calls it once per pony per frame. `breathCold` / `stepPonyBreath` give the exhales that BreathPuffs (avatarbreath.js, the avatars'
// shared point cloud: no new draw call) shows as vapour. Numbers: PONY_VOICE (config.js).
import { PONY_VOICE as V } from './config.js';

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const span = ([a, b], rnd) => a + (b - a) * rnd();

/** How visible a pony's breath is now (0 … 1): none from V.breath.warm °C up, full at V.breath.cold, at least snowMin while it snows. */
export const breathCold = (temp = 10, kind = null) => Math.max(1 - smooth(V.breath.cold, V.breath.warm, temp), kind === 'snow' ? V.breath.snowMin : 0);

/** A fresh voice state (timers staggered randomly so two ponies never act in step). `rnd` = () => 0 … 1. */
export function newPonyVoice(rnd = Math.random) {
  return { t: {}, state: null, step: rnd() * V.stride, greet: 0, breath: rnd() * 3, snortNext: false };
}

const arm = (v, state, rnd, cold) => { // (re)draw the timers of `state`'s events; the cold makes a pony snort a bit more often
  v.t = {};
  for (const [k, r] of Object.entries(V.every[state] ?? {})) v.t[k] = span(r, rnd) * (k === 'snort' ? 1 - 0.35 * cold : 1);
};

/** Advances voice `v` by `dt` s for a pony in `state` ('idle' | 'walk' | 'graze' | 'watch' | 'pet' | 'feed'), `dist` m from the listener,
 * `cold` 0 … 1 (breathCold). Returns the sound due now ('snort' | 'nicker' | 'whinny' | 'step' | 'shuffle' | 'tear') or null; at most one
 * per call. Nothing is scheduled beyond V.range m, while petted (the pat has its own whinny, #1320) or in a state without sounds. */
export function stepPonyVoice(v, dt, state, dist, cold = 0, rnd = Math.random) {
  dt = Math.min(Math.max(Number(dt) || 0, 0), 0.25);
  const key = state === 'feed' ? 'graze' : state;
  if (v.state !== key) { // a visitor who makes a pony look up at the fence gets a greeting nicker, then a cooldown
    const was = v.state; v.state = key; arm(v, key, rnd, cold);
    if (key === 'watch' && was && v.greet <= 0 && dist < V.greetRange) { v.greet = V.cooldown; return 'nicker'; }
  }
  v.greet = Math.max(0, v.greet - dt);
  if (!(dist < V.range) || key === 'pet' || !dt) return null;
  if (key === 'walk') { // hoof beats, one per stride
    v.step -= dt;
    if (v.step <= 0) { v.step += V.stride * (0.9 + 0.2 * rnd()); return 'step'; }
    return null;
  }
  let due = null;
  for (const k of Object.keys(v.t)) {
    v.t[k] -= dt;
    if (v.t[k] <= 0 && (!due || k === 'whinny')) due = k;
  }
  if (!due) return null;
  v.t[due] = span(V.every[key][due], rnd) * (due === 'snort' ? 1 - 0.35 * cold : 1);
  if (due === 'whinny' && dist < 4) return 'nicker'; // a visitor right at the fence gets the soft one, not a call across the field
  return due;
}

/** Exhales: advances `b` ({ t }) and returns the puff strength (0 … 1; 0 = none this step) when the pony breathes out. A snort (`snort` true
 * for this step) is an exhale at once, bigger (V.breath.snort). Nothing while it is too warm to see. */
export function stepPonyBreath(b, dt, state, cold, snort = false) {
  dt = Math.min(Math.max(Number(dt) || 0, 0), 0.25);
  if (!(cold > 0.02)) { b.t = 0; return 0; }
  b.t = (b.t ?? 0) - dt;
  if (snort) { b.t = (V.breath.period[state] ?? V.breath.period.idle) * 0.8; return V.breath.snort * cold; }
  if (b.t > 0) return 0;
  b.t = (V.breath.period[state] ?? V.breath.period.idle) * (0.85 + 0.3 * ((b.k = ((b.k ?? 0.37) * 9301 + 0.211) % 1)));
  return cold;
}
