// #2153: room acoustics. Pure helpers (zone → profile, impulse response generation, crossfade plan) plus `RoomReverb`, which wires ONE
// shared send bus into two ConvolverNodes (crossfaded between zones) and back into the master. Impulse responses are generated
// procedurally (decaying, darkening noise), deterministic per profile, never downloaded.
import { ROOM_REVERB as R } from './config.js';
import { indoorRoomClass } from './stepsurface.js';

/** Zone name for a listener position (feet): indoor class from the existing step-surface data, else courtyard rectangle, else 'open'. */
export function reverbZone(world, pos) {
  const c = indoorRoomClass(world, pos);
  if (c) return c;
  const y = R.courtyard;
  return pos.x >= y.x0 && pos.x <= y.x1 && pos.z >= y.z0 && pos.z <= y.z1 && pos.y < y.maxY ? 'courtyard' : 'open';
}

/** Profile of a zone; phones get a capped short tail and wet level. */
export function profileFor(zone, low = false) {
  const p = R.profiles[zone] ?? R.profiles.open;
  if (!low) return p;
  return { ...p, rt60: Math.min(p.rt60, R.lowMemory.rt60Cap), wet: Math.min(p.wet, R.lowMemory.wetCap), taps: undefined };
}

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1; }

/** Impulse response channels for a profile: `channels` arrays of Float32 at `rate`. Length = 1.1 × rt60 (+ taps). Deterministic. */
export function makeImpulse(profile, rate = R.irRate, channels = 2, seedOffset = 0) {
  const len = Math.max(64, Math.ceil(rate * (profile.rt60 * 1.1 + (profile.pre ?? 0))));
  const pre = Math.floor((profile.pre ?? 0) * rate), out = [];
  for (let c = 0; c < channels; c++) {
    const r = rng(R.seed + seedOffset + c * 7919 + Math.round(profile.rt60 * 1000)), d = new Float32Array(len);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / rate, k = t / profile.rt60;
      const hz = profile.damp[0] * Math.pow(profile.damp[1] / profile.damp[0], Math.min(1, k)); // the tail darkens exponentially
      const a = 1 - Math.exp(-2 * Math.PI * hz / rate);
      lp += a * (r() - lp);
      d[i] = lp * Math.pow(10, -3 * k) * (1 - Math.exp(-t / 0.004)); // -60 dB at rt60, short onset
    }
    for (const [dt, lvl] of profile.taps ?? []) {
      const j = Math.floor(dt * rate) + c * 11; // a hair of stereo spread
      if (j < len) { const w = r() > 0 ? 1 : -1; for (let q = 0; q < 6 && j + q < len; q++) d[j + q] += w * lvl * (1 - q / 6); }
    }
    out.push(d);
  }
  return out;
}

/** Schroeder backward-integrated RT60 estimate (T20 extrapolated) of one channel, seconds. */
export function measureRt60(data, rate) {
  const e = new Float64Array(data.length); let s = 0;
  for (let i = data.length - 1; i >= 0; i--) { s += data[i] * data[i]; e[i] = s; }
  const db = (i) => 10 * Math.log10(e[i] / e[0] + 1e-30);
  let i5 = 0, i25 = 0;
  for (let i = 0; i < e.length; i++) { if (!i5 && db(i) <= -5) i5 = i; if (db(i) <= -25) { i25 = i; break; } }
  return i25 > i5 ? (i25 - i5) / rate * 3 : 0;
}

/**
 * Crossfade plan between two convolver slots. state = { zone, active (0|1), slots:[zone|null, zone|null] }.
 * Same zone → no change. New zone → the idle slot is loaded with its impulse response while silent, then becomes the active one;
 * a zone already held by the idle slot is reused. Returns { state, load: {slot, zone}|null, gains:[g0,g1] } (gains = target wet levels).
 */
export function planZone(state, zone, low = false) {
  if (low) { // one convolver: the zone only picks its short impulse response and level
    const slot0 = state.slots[0];
    return { state: { zone, active: 0, slots: [zone === 'open' ? slot0 : zone, null] }, load: zone !== 'open' && slot0 !== zone ? { slot: 0, zone } : null, gains: [profileFor(zone, true).wet, 0] };
  }
  if (zone === state.zone && state.slots[state.active] !== null) return { state, load: null, gains: gainsFor(state) };
  let active = state.active, load = null;
  const slots = [...state.slots];
  if (zone !== 'open' && slots[active] !== zone) {
    if (slots[1 - active] === zone) active = 1 - active;
    else { active = 1 - active; slots[active] = zone; load = { slot: active, zone }; }
  }
  const next = { zone, active, slots };
  return { state: next, load, gains: gainsFor(next) };
}
function gainsFor(s) { const g = [0, 0]; if (s.zone !== 'open' && s.slots[s.active]) g[s.active] = profileFor(s.zone).wet; return g; }
export const initialPlan = () => ({ zone: 'open', active: 0, slots: [null, null] });

/** The audio graph: input (send bus) → convolver slots → per-slot gain → return → `dest`. Wired by audio.js. */
export class RoomReverb {
  constructor(ctx, dest, low = false) {
    this.ctx = ctx; this.low = low; this.plan = initialPlan(); this.cache = new Map();
    this.input = ctx.createGain(); this.input.gain.value = 1;
    this.ret = ctx.createGain(); this.ret.connect(dest);
    this.convolvers = []; this.gains = [];
    for (let i = 0; i < (low ? 1 : 2); i++) {
      const cv = ctx.createConvolver(), g = ctx.createGain(); g.gain.value = 0;
      this.input.connect(cv); cv.connect(g); g.connect(this.ret);
      this.convolvers.push(cv); this.gains.push(g);
    }
  }
  buffer(zone) {
    let b = this.cache.get(zone);
    if (!b) {
      const ch = this.low ? 1 : 2, prof = profileFor(zone, this.low), data = makeImpulse(prof, this.ctx.sampleRate, ch); // a ConvolverNode needs the context's own rate
      b = this.ctx.createBuffer(ch, data[0].length, this.ctx.sampleRate);
      data.forEach((d, c) => b.copyToChannel(d, c));
      this.cache.set(zone, b);
    }
    return b;
  }
  /** Switch the zone; `immediate` sets gains without ramps (offline tests). */
  setZone(zone, immediate = false) {
    if (zone === this.plan.zone) return;
    const p = planZone(this.plan, zone, this.low), t = this.ctx.currentTime;
    this.plan = p.state;
    if (p.load) { this.gains[p.load.slot].gain.cancelScheduledValues(t); this.gains[p.load.slot].gain.setValueAtTime(0, t); this.convolvers[p.load.slot].buffer = this.buffer(p.load.zone); }
    this.gains.forEach((g, i) => { if (!g) return; if (immediate) g.gain.setValueAtTime(p.gains[i] ?? 0, t); else g.gain.setTargetAtTime(p.gains[i] ?? 0, t, R.fade); });
  }
  get zone() { return this.plan.zone; }
}
