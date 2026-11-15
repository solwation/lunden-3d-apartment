import { HARPOON } from './config.js';

// #1953: the harpoon's spear on its line, the pure rules (no three.js, no river: `node --test src/harpoonflight.test.mjs`).
// The spear leaves the gun at HARPOON.speed m/s. In the water it is slowed (`drag`) and barely sinks (`sink`); in the air it falls
// (`gravity`). It is tied to the gun: once it is `line` m from the muzzle (or `flight` s have passed) it turns back and is reeled in at
// `reel` m/s; something solid holds it `stuck` s first. Only when it is back in the gun can it be shot again. src/harpoon.js owns the
// meshes, what is water, what is solid and what is a fish.
// The state: { phase: 'ready' | 'out' | 'stuck' | 'back', x, y, z, vx, vy, vz, t (s in this phase) }.

export const newSpear = () => ({ phase: 'ready', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0 });

/** Shoot from `o` along the unit direction `d` ([x, y, z] each). False (nothing changes) unless the spear is in the gun. */
export function fireSpear(st, o, d, C = HARPOON) {
  if (st.phase !== 'ready') return false;
  const n = Math.hypot(d[0], d[1], d[2]);
  if (!(n > 1e-6) || !o.every(Number.isFinite)) return false;
  Object.assign(st, { phase: 'out', t: 0, x: o[0], y: o[1], z: o[2], vx: (d[0] / n) * C.speed, vy: (d[1] / n) * C.speed, vz: (d[2] / n) * C.speed });
  return true;
}

/** One frame on the way out. `muzzle` = { x, y, z } (where the line is tied now), `wet`: the spear is under water.
 * Returns null, or 'taut' when the line ran out / the flight time is up (the phase is then 'back'; the spear stays within `line` m). */
export function stepSpear(st, dt, muzzle, wet, C = HARPOON) {
  if (st.phase !== 'out') return null;
  st.t += dt;
  if (wet) { const k = Math.exp(-C.drag * dt); st.vx *= k; st.vy = st.vy * k - C.sink * dt; st.vz *= k; } else st.vy -= C.gravity * dt;
  st.x += st.vx * dt; st.y += st.vy * dt; st.z += st.vz * dt;
  const dx = st.x - muzzle.x, dy = st.y - muzzle.y, dz = st.z - muzzle.z, d = Math.hypot(dx, dy, dz);
  if (d >= C.line) { const k = C.line / d; st.x = muzzle.x + dx * k; st.y = muzzle.y + dy * k; st.z = muzzle.z + dz * k; }
  if (d >= C.line || st.t >= C.flight) { st.phase = 'back'; st.t = 0; return 'taut'; }
  return null;
}

/** The spear went into something solid at `p` = { x, y, z }: it sits there HARPOON.stuck s, then comes back. */
export function stickSpear(st, p) {
  if (st.phase !== 'out') return false;
  Object.assign(st, { phase: 'stuck', t: 0, x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: 0 });
  return true;
}

/** It hit a fish (or the line is pulled in early): straight to the way back. */
export function recallSpear(st) {
  if (st.phase !== 'out' && st.phase !== 'stuck') return false;
  st.phase = 'back'; st.t = 0;
  return true;
}

/** One frame stuck / on the way back to `muzzle`. Returns true the frame the spear is in the gun again (phase 'ready'). */
export function reelSpear(st, dt, muzzle, C = HARPOON) {
  if (st.phase === 'stuck') { st.t += dt; if (st.t >= C.stuck) { st.phase = 'back'; st.t = 0; } return false; }
  if (st.phase !== 'back') return false;
  st.t += dt;
  const dx = muzzle.x - st.x, dy = muzzle.y - st.y, dz = muzzle.z - st.z, d = Math.hypot(dx, dy, dz), step = C.reel * dt;
  if (d <= step || d < 1e-6) { Object.assign(st, { phase: 'ready', t: 0, x: muzzle.x, y: muzzle.y, z: muzzle.z, vx: 0, vy: 0, vz: 0 }); return true; }
  st.vx = (dx / d) * C.reel; st.vy = (dy / d) * C.reel; st.vz = (dz / d) * C.reel;
  st.x += st.vx * dt; st.y += st.vy * dt; st.z += st.vz * dt;
  return false;
}

/** The first of `targets` ([{ x, y, z, r }]) the segment a → b ({ x, y, z }) passes within its `r` of: { i, k } (index, 0…1 along the
 * segment where it is closest / enters), or null. */
export function spearHit(a, b, targets) {
  const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, L2 = ux * ux + uy * uy + uz * uz;
  let best = null;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i], wx = t.x - a.x, wy = t.y - a.y, wz = t.z - a.z;
    const k = L2 > 0 ? Math.max(0, Math.min(1, (wx * ux + wy * uy + wz * uz) / L2)) : 0;
    const d = Math.hypot(wx - ux * k, wy - uy * k, wz - uz * k);
    if (d <= t.r && (!best || k < best.k)) best = { i, k };
  }
  return best;
}
