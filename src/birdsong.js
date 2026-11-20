// #2178: when the birds sing and what a phrase is made of — pure (no Web Audio, no three), config-only (BIRD_SONG). `songPlan` turns month,
// hour, the sun's times and the rain into a phrase rate and a species mix (dawn chorus Mar–Jul, a smaller evening session, thin late summer
// and winter with robin and great tit, nearly silent in rain); `songPhrase` / `gullCall` build the notes of one call (a plain list the
// audio.js oscillator + band-pass plays); `BirdSong` is the scheduler: a Poisson draw per tick, a treetop within `range` m (3D) for a
// songbird, a gull from the circling flock for a call, and a flushed flock's alarm. The cap on simultaneous voices lives in audio.js
// (VoiceCap). Node test: tools/birdsongtest.mjs.
import { BIRD_SONG as S } from './config.js';

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, k) => a + (b - a) * k;
export const SPECIES = ['blackbird', 'chaffinch', 'greatTit', 'robin'];

/** 0…1 bump over hours relative to a sun time: up from `from` to `full`, flat to `hold`, down to `to`. */
const bump = (h, B) => smooth(B.from, B.full, h) * (1 - smooth(B.hold, B.to, h));

/** Share 0…1 of the peak rate at `hour` (month 1–12, `rise`/`set` the sun's clock times): night 0, a dawn chorus and a smaller evening session
 *  in the chorus months, else a flat day. */
export function timeFactor(month, hour, rise = 6, set = 18) {
  const chorus = S.chorus.includes(month), dr = hour - rise, ds = hour - set;
  const lit = smooth(S.night.before, S.night.before + 0.7, dr) * (1 - smooth(0, S.night.after, ds));
  const dawn = bump(dr, S.dawn), eve = bump(ds, S.evening);
  return clamp01(lit * S.day + (chorus ? S.dawn.boost * dawn + S.evening.boost * eve : S.nonChorusBoost * (dawn + eve)) * lit);
}

/** Rain 0…1 → the share of song left (1 dry, `rainLeft` in a downpour). */
export const rainFactor = (rain) => lerp(1, S.rainLeft, smooth(S.rainFrom, S.rainTo, rain));

/** { rate (phrases per minute near a perch), mix: { blackbird, chaffinch, greatTit, robin } (sums to 1, or all 0 when silent) }. */
export function songPlan({ month = 6, hour = 12, rise = 6, set = 18, rain = 0 } = {}) {
  const m = S.month[(Math.round(month) - 1 + 12) % 12], level = m[0];
  const rate = S.peak * level * timeFactor(Math.round(month), hour, rise, set) * rainFactor(rain);
  const w = [m[1], m[2], m[3], m[4]], sum = w[0] + w[1] + w[2] + w[3];
  const mix = { blackbird: 0, chaffinch: 0, greatTit: 0, robin: 0 };
  if (sum > 0) SPECIES.forEach((k, i) => { mix[k] = w[i] / sum; });
  return { rate, mix };
}

/** Gull calls per minute (a gull within range): by day only, thin in the middle of the night's edges, none in rain. */
export function gullRate({ hour = 12, rise = 6, set = 18, rain = 0 } = {}) {
  const lit = smooth(0, 0.6, hour - rise) * (1 - smooth(-0.6, 0, hour - set));
  return S.gull * lit * (1 - smooth(0.03, 0.3, rain));
}

/** Pick a species from a mix by u in [0, 1). */
export function pickSpecies(mix, u) {
  let acc = 0, last = null;
  for (const k of SPECIES) { if (mix[k] > 0) { acc += mix[k]; last = k; if (u < acc) return k; } }
  return last;
}

const rr = (rnd, a, b) => a + (b - a) * rnd();
/** One phrase of `species`: { species, type, hz, q, dur, notes: [{ t, d, f0, f1, g }] } — `hz`/`q` the band-pass, notes glide f0 → f1 over d s at gain g. */
export function songPhrase(species, rnd = Math.random) {
  const notes = [];
  let t = 0, hz = 3000, q = 1, type = 'sine';
  const note = (d, f0, f1, g = 1, gap = 0.05) => { notes.push({ t, d, f0, f1, g }); t += d + gap; };
  if (species === 'blackbird') { // slow flute notes with glides, sometimes a high twitter at the end
    hz = 2200; q = 0.8;
    let f = rr(rnd, 1500, 2300);
    for (let n = 3 + Math.floor(rnd() * 3); n > 0; n--) { const to = Math.min(3000, Math.max(1300, f * rr(rnd, 0.8, 1.3))); note(rr(rnd, 0.25, 0.65), f, to, rr(rnd, 0.75, 1), rr(rnd, 0.08, 0.25)); f = to; }
    if (rnd() < 0.5) { let g = 3300; for (let n = 0; n < 4; n++) { note(0.05, g, g * 0.95, 0.5, 0.03); g *= rr(rnd, 0.95, 1.05); } }
  } else if (species === 'greatTit') { // "ti-tu ti-tu ti-tu"
    hz = 3500; q = 1.2;
    const hi = rr(rnd, 4000, 4500), lo = hi * rr(rnd, 0.72, 0.8);
    for (let n = 3 + Math.floor(rnd() * 3); n > 0; n--) { note(0.1, hi, hi * 0.97, 0.9, 0.06); note(0.12, lo, lo * 0.98, 1, 0.2); }
  } else if (species === 'chaffinch') { // a falling trill ending in a flourish
    hz = 4200; q = 1; type = 'triangle';
    let f = rr(rnd, 5000, 5500);
    for (let n = 11 + Math.floor(rnd() * 5); n > 0; n--) { note(0.03, f, f * 0.96, 0.8, 0.03); f *= 0.968; }
    note(0.14, 3400, 5000, 1, 0);
  } else { // robin: thin, quick, wandering warble
    hz = 5000; q = 1.5;
    let f = rr(rnd, 4500, 6200);
    for (let n = 6 + Math.floor(rnd() * 4); n > 0; n--) { const to = Math.min(7000, Math.max(3000, f * rr(rnd, 0.7, 1.35))); note(rr(rnd, 0.06, 0.14), f, to, rr(rnd, 0.5, 1), rr(rnd, 0.03, 0.09)); f = to; }
  }
  return { species, type, hz, q, dur: t, notes };
}

/** A gull call: kind 'call' (a long "kee-aw"), 'laugh' (a descending run of "ha"s) or 'alarm' (a harsh rapid cry of a flushed flock). */
export function gullCall(kind, rnd = Math.random) {
  const notes = [];
  let t = 0;
  const note = (d, f0, f1, g, gap) => { notes.push({ t, d, f0, f1, g }); t += d + gap; };
  if (kind === 'alarm') for (let n = 6 + Math.floor(rnd() * 4); n > 0; n--) note(0.2, rr(rnd, 1300, 1600), rr(rnd, 900, 1100), rr(rnd, 0.8, 1), 0.07);
  else if (kind === 'laugh') { let f = rr(rnd, 1100, 1300), g = 1; for (let n = 5 + Math.floor(rnd() * 3); n > 0; n--) { note(0.15, f, f * 0.9, g, 0.05); f *= 0.95; g *= 0.93; } }
  else { note(0.12, 1000, 1700, 0.8, 0.02); note(rr(rnd, 0.45, 0.65), 1700, 800, 1, 0); }
  return { species: 'gull', kind, type: 'sawtooth', hz: kind === 'alarm' ? 1500 : 1600, q: 1.3, dur: t, notes };
}

const range3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/**
 * A treetop within `range` m (3D) of the eye, chosen at random among those that are (crowns: [{ x, z, r, y }], the top at y + 0.8 r),
 * written to `out`; null when none is near. `rnd` in [0, 1).
 */
export function pickPerch(crowns, eye, range, rnd, out = { x: 0, y: 0, z: 0 }) {
  let n = 0;
  for (const c of crowns) {
    const dx = c.x - eye.x; if (dx > range || -dx > range) continue;
    const y = c.y + 0.8 * c.r;
    if (Math.hypot(dx, c.z - eye.z, y - eye.y) <= range && rnd() * ++n < 1) { out.x = c.x; out.y = y; out.z = c.z; }
  }
  return n ? out : null;
}

/**
 * The scheduler. `play(call, pos, level)` → true when a voice was taken (audio.js sfx.birdCall: the VoiceCap lives there).
 * `update(dt, st)`: st = { month, hour, rise, set, rain, indoors, eye: { x, y, z }, crowns, gulls: { n, at(i, out) } | null,
 * flushed (a running count of flushes of the gull flock), flushAt: { x, y, z } }.
 */
export class BirdSong {
  constructor(play, rnd = Math.random) {
    Object.assign(this, { play, rnd, perch: { x: 0, y: 0, z: 0 }, gull: { x: 0, y: 0, z: 0 }, flushed: null, stats: { song: 0, gull: 0, alarm: 0, skipped: 0 } });
  }
  /** Poisson: does an event of `perMin` per minute happen within `dt` s? */
  hit(perMin, dt) { return perMin > 0 && this.rnd() < 1 - Math.exp(-perMin * dt / 60); }
  update(dt, st) {
    const level = st.indoors ? S.indoors : 1, rnd = this.rnd, T = this.stats;
    if (st.gulls && this.flushed !== null && st.flushed > this.flushed && st.flushAt && range3(st.flushAt, st.eye) < S.gullRange) {
      this.play(gullCall('alarm', rnd), st.flushAt, S.level.alarm * level) ? T.alarm++ : T.skipped++;
    }
    this.flushed = st.flushed ?? 0;
    const plan = songPlan(st);
    if (this.hit(plan.rate, dt)) {
      const pos = pickPerch(st.crowns, st.eye, S.range, rnd, this.perch), sp = pickSpecies(plan.mix, rnd());
      if (pos && sp) this.play(songPhrase(sp, rnd), pos, S.level.song * level) ? T.song++ : T.skipped++;
    }
    if (st.gulls && this.hit(gullRate(st), dt)) {
      let near = 0, g = this.gull, pick = -1;
      for (let i = 0; i < st.gulls.n; i++) { st.gulls.at(i, g); if (range3(g, st.eye) <= S.gullRange && rnd() * ++near < 1) pick = i; }
      if (pick >= 0) { st.gulls.at(pick, g); this.play(gullCall(rnd() < 0.35 ? 'laugh' : 'call', rnd), g, S.level.gull * level) ? T.gull++ : T.skipped++; }
    }
  }
}
