import { PONY_MOTION as M } from './config.js';
import { siteWindOffset } from './sitewind.js';

// #2127: the ponies' secondary motion, computed per pony per frame without three.js objects (node-testable; src/paddock.js applies it).
// Local frame of a pony: x = its left (+x, the `_L` bones), y up, z = nose. Everything here is a bounded offset on top of the GLB clips
// (idle / walk / graze / watch / pet) and the existing state machine, so feeding, petting, the shelter, the grass mask and the shared
// paddock (#1644: followers derive it locally from the synced state, no new network fields) are unchanged.
//  - weight shift: the body rolls a little over the loaded side; the other hind leg rests on its toe;
//  - chewing: head nod and jaw grind with the head down (grazing or eating hay);
//  - ears: each turns on its own, forward to the visitor while watching or petted, back for a moment when a fly lands;
//  - tail: a damped three-joint spring chain blown by the site wind (src/sitewind.js `siteWind`, real weather since #2117);
//  - mane: the wind's local vector + a travelling ripple for the shader in paddock.js (`uPonyMane`);
//  - flies (summer, dry): a skin twitch at a random flank spot (`uPonyTwitch`) and a tail swat to that side.

/** Seeded generator (the motion's own, so the walking / grazing decisions of `p.rnd` keep their sequence). */
export function motionRandom(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const clamp = (v, a) => Math.max(-a, Math.min(a, v));
const span = (r, [a, b]) => a + r() * (b - a);

/** A fresh motion state. */
export function newPonyMotion(seed) {
  const rnd = motionRandom(seed * 7919 + 2127);
  return {
    rnd, t: 0, lean: 0, side: rnd() < 0.5 ? -1 : 1, shiftT: span(rnd, M.shift.period), rest: 0,
    chewPh: rnd() * 6.28, chew: 0, grind: 0, eat: 0,
    ears: [{ y: 0, x: 0, ty: 0, t: span(rnd, M.ears.period) }, { y: 0, x: 0, ty: 0, t: span(rnd, M.ears.period) }],
    tail: [0, 1, 2].map(() => ({ z: 0, vz: 0, x: 0, vx: 0, g: 0, gx: 0 })),
    wind: { x: 0, z: 0, power: 0 }, mane: { x: 0, z: 0, ripple: 0 },
    flyT: span(rnd, M.flies.interval), twitch: { x: 0, y: 0, z: 0, a: 0, t: 0 }, swat: 0, swatSide: 1,
    driftT: span(rnd, M.drift.every),
  };
}

/** Fly season: the summer months in `PONY_MOTION.flies.months`, and not while it rains. */
export function flySeason(month, rain = 0) { return M.flies.months.includes(month) && !(rain > 0.2); }

/**
 * The site wind at a pony in its own frame: { x, z } (≈ −1.7…1.7 at full power, gusting and swaying in phase with the trees at that
 * spot via `siteWindOffset`) and `power` 0…1. `state` is src/sitewind.js `siteWind`.
 */
export function ponyWind(state, x, z, yaw, out = { x: 0, z: 0, power: 0 }) {
  const w = 0.2, g = siteWindOffset(state, { x, z }, w), wx = g.x / w, wz = g.z / w, c = Math.cos(yaw), s = Math.sin(yaw);
  out.x = wx * c - wz * s; out.z = wx * s + wz * c; out.power = state.power > 0 ? state.power : 0;
  return out;
}

/**
 * Advance pony motion `m` by `dt` s. `o`: { state ('idle' | 'graze' | 'walk' | 'watch' | 'pet' | 'feed'), walking, headDown (neck pitch
 * past grazing), wind ({x, z, power} from ponyWind), flies (bool) }. Returns `m` with bounded fields: `lean` −1…1 (+ = weight on the
 * left legs), `rest` 0…1 (the unloaded hind leg rests), `chew`/`grind` −1…1, `ears[k].x/y` rad, `tail[k].x/z` rad, `mane`, `twitch`.
 */
export function stepPonyMotion(m, dt, o) {
  if (!(dt > 0)) return m;
  dt = Math.min(dt, 0.1); m.t += dt;
  const r = m.rnd, st = o.state, standing = !o.walking && st !== 'walk' && st !== 'pet';
  // weight shift: a new loaded side every `period` s while standing; walking evens the weight out
  m.shiftT -= dt;
  if (m.shiftT <= 0) { m.shiftT = span(r, M.shift.period); m.side = r() < 0.75 ? -m.side : m.side; }
  const k = Math.min(1, dt * M.shift.ease);
  m.lean += ((standing ? m.side : 0) - m.lean) * k;
  m.rest += ((standing ? 1 : 0) - m.rest) * Math.min(1, dt * M.shift.ease * 1.5);
  // chewing with the head down (grass or hay)
  m.eat += (((st === 'graze' || st === 'feed') && o.headDown ? 1 : 0) - m.eat) * Math.min(1, dt * 3);
  m.chewPh += dt * 6.2832 * M.chew.hz;
  m.chew = Math.max(0, Math.sin(m.chewPh)) * m.eat; m.grind = Math.sin(m.chewPh + 1.2) * m.eat;
  // ears: own random turns; forward while attentive; flattened briefly by a fly
  const attentive = st === 'watch' || st === 'pet';
  m.ears.forEach((e, i) => {
    e.t -= dt;
    if (e.t <= 0) { e.t = span(r, M.ears.period); e.ty = attentive ? (r() - 0.5) * 0.3 * M.ears.turn : (r() * 2 - 1) * M.ears.turn; }
    if (attentive) e.ty *= Math.max(0, 1 - dt * 2);
    const ke = Math.min(1, dt * M.ears.ease);
    e.y += (e.ty - e.y) * ke;
    const flat = m.twitch.a > 0 && (i === 0) === (m.swatSide > 0) ? M.ears.back : 0;
    e.x += (flat - e.x) * ke;
    e.y = clamp(e.y, M.ears.turn); e.x = clamp(e.x, M.ears.back);
  });
  // flies: a landing → skin twitch there and a tail swat to that side
  m.twitch.t = Math.max(0, m.twitch.t - dt); m.twitch.a = m.twitch.t > 0 ? Math.sin(m.twitch.t / M.flies.secs * Math.PI) : 0;
  m.swat = Math.max(0, m.swat - dt);
  if (o.flies && st !== 'walk') {
    m.flyT -= dt;
    if (m.flyT <= 0) {
      m.flyT = span(r, M.flies.interval);
      const side = r() < 0.5 ? -1 : 1, onRump = r() < 0.6;
      m.swatSide = side;
      m.twitch.x = side * (0.2 + r() * 0.06); m.twitch.y = 0.95 + r() * 0.2; m.twitch.z = onRump ? -0.35 - r() * 0.25 : 0.1 + r() * 0.25;
      m.twitch.t = M.flies.secs;
      if (onRump) m.swat = M.flies.swatSecs;
    }
  } else m.flyT = Math.max(m.flyT, 1);
  // wind for the mane (shader) and the tail chain
  const w = o.wind ?? { x: 0, z: 0, power: 0 };
  m.wind.x = w.x; m.wind.z = w.z; m.wind.power = w.power;
  m.mane.x = clamp(w.x * M.mane.wind, M.mane.max); m.mane.z = clamp(w.z * M.mane.wind, M.mane.max); m.mane.ripple = M.mane.ripple * Math.min(1, w.power * 1.5);
  const T = M.tail, swat = m.swat > 0 ? Math.sin((1 - m.swat / M.flies.swatSecs) * Math.PI) * M.flies.swat * m.swatSide : 0;
  const sway = T.sway * Math.sin(m.t * 0.9) * (standing ? 1 : 0.4);
  const tz = clamp(w.x * T.wind * 0.6, T.wind) + sway + swat;
  const tx = Math.max(0, -w.z) * T.lift * 0.6 + (o.walking ? T.walk : 0); // a tail wind (blowing towards the rump, −z) lifts it back
  // the base follows the target; each lower joint bends by how far its parent lags behind the target (secondary motion) and a little
  // further downwind (the hair), so a swat whips and the switch streams in the wind
  const flutter = Math.sin(m.t * 5.1 + m.chewPh * 0.1) * 0.08 * w.power;
  m.tail.forEach((j, i) => {
    let gz = tz, gx = tx;
    if (i > 0) { const up = m.tail[i - 1]; gz = (up.z - up.g) * T.lag + clamp(w.x * T.wind * 0.25, T.wind) + flutter * i; gx = (up.x - up.gx) * T.lag * 0.5 + Math.max(0, -w.z) * T.lift * 0.2; }
    j.g = gz; j.gx = gx;
    j.vz += ((gz - j.z) * T.stiff - j.vz * T.damp) * dt; j.z = clamp(j.z + j.vz * dt, T.max);
    j.vx += ((gx - j.x) * T.stiff - j.vx * T.damp) * dt; j.x = clamp(j.x + j.vx * dt, T.max * 0.6);
  });
  return m;
}

/** While grazing: time for a slow step to the next bite? Returns null or { dist, turn } (m, rad) and resets the timer. */
export function grazeDrift(m, dt, grazing) {
  if (!grazing) { m.driftT = Math.max(m.driftT, 2); return null; }
  m.driftT -= dt;
  if (m.driftT > 0) return null;
  const r = m.rnd; m.driftT = span(r, M.drift.every);
  return { dist: span(r, M.drift.dist), turn: (r() * 2 - 1) * M.drift.turn };
}
