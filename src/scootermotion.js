// #2229: the e-scooters' pure rules (no three.js; tests: tools/scooter2229test.mjs). The riding itself is the bicycle's Player path
// (player.js bikeStep): these supply the scooter's speed profile to bikemotion.js, the tuning progress, the jump bookkeeping, the local
// slow motion and the chase camera, and the deterministic pavement spots.
import { SCOOTER as S } from './config.js';
import { bicycleSpeed, bicycleTakeoff } from './bikemotion.js';

const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** The speed profile ({ speed, reverse, motion }) of a scooter, tuned or not. */
export const scooterProfile = (tuned) => (tuned ? S.tuned : S.untuned);
/** One step of a scooter's longitudinal speed (m/s): the bicycle's rule with the scooter's motor, cap and drag. */
export const scooterSpeed = (speed, input, pitch, airborne, dt, tuned = false) => bicycleSpeed(speed, input, pitch, airborne, dt, scooterProfile(tuned));
/** The bicycle's crest/kerb take-off with the scooter's launch speed and lift cap. */
export const scooterTakeoff = (speed, previousVy, nextVy, dt, gap, tuned = false) => bicycleTakeoff(speed, previousVy, nextVy, dt, gap, scooterProfile(tuned).motion);
/** km/h for the display: whole, never negative. */
export const kmh = (v) => Math.round(Math.abs(fin(v)) * 3.6);

/**
 * The screwdriver at the hatch: `progress` s so far; it grows by `dt` only while the button is held AND the hatch is aimed at
 * (letting go or looking away pauses it, nothing is lost). { progress, fraction 0 … 1, done }.
 */
export function tuneStep(progress, dt, holding, aimed, time = S.tune.time) {
  let p = clamp(fin(progress), 0, time);
  if (holding && aimed) p = Math.min(time, p + Math.max(0, fin(dt)));
  return { progress: p, fraction: time > 0 ? p / time : 1, done: p >= time };
}

/** A flight's bookkeeping: `trackJump(j, airborne, clear)` each frame; on the landing of a flight that got at least S.jump.min m clear
 * of the ground it returns { height } (m, the highest clearance), else null. */
export const newJump = () => ({ air: false, top: 0 });
export function trackJump(j, airborne, clear) {
  if (airborne) { j.air = true; j.top = Math.max(j.top, Math.max(0, fin(clear))); return null; }
  if (!j.air) return null;
  const top = j.top; j.air = false; j.top = 0;
  return top >= S.jump.min ? { height: top } : null;
}
/** A jump for the statistics: whole centimetres, capped. */
export const jumpCm = (height) => clamp(Math.round(fin(height) * 100), 0, S.jump.maxCm);

/**
 * The local slow motion of a big jump: it starts (latched) once a scooter flight gets S.jump.slowmo m clear of the ground and ends on
 * the landing (or when not riding a scooter). `k` eases towards it with the REAL frame time; returns the factor for the own physics dt
 * (1 … S.jump.scale). Nothing else is slowed: the network, the world and other players keep their time.
 */
export const newSlowMo = () => ({ on: false, k: 0 });
export function slowMoStep(s, dt, riding, airborne, clear) {
  if (!riding || !airborne) s.on = false;
  else if (fin(clear) >= S.jump.slowmo) s.on = true;
  const a = 1 - Math.exp(-S.jump.ease * clamp(fin(dt), 0, 0.25));
  s.k += ((s.on ? 1 : 0) - s.k) * a;
  if (!s.on && s.k < 1e-3) s.k = 0;
  return 1 + (S.jump.scale - 1) * s.k;
}

/** The chase camera: behind the scooter (heading `yaw`, the player's convention: forward = (cos, -sin)), raised, looking at the rider.
 * Returns { x, y, z, yaw (camera rotation.y), pitch (rotation.x) }. */
export function chaseCamera(px, py, pz, yaw, out = {}) {
  const C = S.chase, fx = Math.cos(yaw), fz = -Math.sin(yaw);
  out.x = px - fx * C.back; out.y = py + C.up; out.z = pz - fz * C.back;
  out.yaw = yaw - Math.PI / 2; out.pitch = Math.atan2(py + C.look - out.y, C.back);
  return out;
}

/** A small deterministic hash of an integer → 0 … 1. */
export const hash01 = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/**
 * The scooters' spots on the pavements: candidates every S.step m along each path road with `walks`, `inset` of the pavement's width out
 * from the kerb on each side, kept only when `ok(x, z)` (the caller's pavement / carriageway / building test) and within S.area, then
 * picked in a seeded order at least S.spacing apart, `count` of them. `samples(road)`: roads.js's dense centre-line samples.
 * [{ x, z, yaw }] with the scooter along the road (either way).
 */
export function scooterSpots(roads, samples, ok, count = S.count) {
  const cands = [];
  let id = 0;
  for (const road of roads) {
    if (!road.path || !road.walks) continue;
    const P = samples(road);
    for (let k = 1, next = 0; k < P.length; k++) {
      const a = P[k - 1], b = P[k], len = Math.hypot(b.x - a.x, b.z - a.z);
      while (len > 0 && next <= b.s) {
        const f = clamp((next - a.s) / Math.max(1e-6, b.s - a.s), 0, 1), w = a.w + (b.w - a.w) * f;
        const cx = a.x + (b.x - a.x) * f, cz = a.z + (b.z - a.z) * f, tx = (b.x - a.x) / len, tz = (b.z - a.z) / len, nx = -tz, nz = tx; // (right-hand normal)
        for (const wk of road.walks) {
          const off = wk.side * (w / 2 + wk.w * S.inset), x = cx + nx * off, z = cz + nz * off;
          id++;
          if (Math.hypot(x - S.area.x, z - S.area.z) > S.area.r || !ok(x, z)) continue;
          const yaw = Math.atan2(-tz, tx) + (hash01(id * 7 + S.seed) < 0.5 ? 0 : Math.PI);
          cands.push({ x, z, yaw, r: hash01(id + S.seed) });
        }
        next += S.step;
      }
    }
  }
  cands.sort((p, q) => p.r - q.r);
  const out = [];
  for (const c of cands) {
    if (out.length >= count) break;
    if (out.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < S.spacing)) continue;
    out.push({ x: c.x, z: c.z, yaw: Math.atan2(Math.sin(c.yaw), Math.cos(c.yaw)) });
  }
  return out;
}
