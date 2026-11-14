import { SHARK } from './config.js';

// #1947: the shark that bites swimmers, as a pure state machine (no three.js, no terrain: `node --test src/sharkattack.test.mjs`).
// While somebody swims there is a small chance per second (SHARK.attack.perMinute) that a shark surfaces `speed x warn` m away along the
// river and makes for the swimmer at `speed` m/s; within `bite` m of a swimmer it bites. On land the swimmer is safe: the shark goes on
// to where they left the water, waits `linger` s and sinks again (it bites if they come back in before that). This shark is local to
// the swimmer: nothing travels, the shared weekly shark (#1769, sharkswim.js) is untouched. src/sharkhunt.js supplies the river
// (where to surface, what is water) and draws it with the #1769 fin; main.js owns the death.
// The state: { phase: 'idle' | 'warn' | 'leave', swum (s swum without an attack), cool (s until the next attack may start), t (s since it
// surfaced), lost (s the prey has been out of the water), show (0..1: how far up the fin is), x, z, yaw, speed (m/s now), tx, tz (the goal) }.

export const newAttack = () => ({ phase: 'idle', swum: 0, cool: 0, t: 0, lost: 0, show: 0, x: 0, z: 0, yaw: 0, speed: 0, tx: 0, tz: 0 });

const turn = (from, to, k) => { let d = (to - from) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2; return from + d * k; };

/** One frame. `w`: { dt, swimming (the prey is in the water), x, z (the prey), random() 0..1, spawn(sign) → { x, z } a water point
 * SHARK.attack.speed x warn m up (+1) / down (-1) the river or null, water(x, z) → may the shark be there, centre(x, z) → the nearest
 * centre-line point, blocked (no new attack now), test (the debug rates SHARK.attack.test) }.
 * Returns null, 'warn' (a shark surfaced), 'bite' (it reached a swimmer) or 'gone' (it gave up: the prey stayed on land). */
export function attackStep(st, w, C = SHARK.attack) {
  const dt = w.dt, T = w.test ? { ...C, ...C.test } : C;
  if (st.phase === 'idle') {
    st.cool = Math.max(0, st.cool - dt);
    if (!w.swimming) { st.swum = 0; return null; }
    st.swum += dt;
    if (w.blocked || st.cool > 0 || st.swum < T.calm) return null;
    if (w.random() >= 1 - Math.exp(-dt * T.perMinute / 60)) return null;
    const sign = w.random() < 0.5 ? 1 : -1, at = w.spawn(sign) ?? w.spawn(-sign);
    if (!at) return null;
    Object.assign(st, { phase: 'warn', t: 0, lost: 0, show: 0, speed: 0, x: at.x, z: at.z, tx: w.x, tz: w.z, yaw: Math.atan2(w.x - at.x, w.z - at.z) });
    return 'warn';
  }
  st.t += dt;
  if (st.phase === 'leave') { // sinking, gliding on the way it was heading
    st.show -= dt / C.sink;
    const step = C.speed * 0.4 * dt, nx = st.x + Math.sin(st.yaw) * step, nz = st.z + Math.cos(st.yaw) * step;
    if (w.water(nx, nz)) { st.x = nx; st.z = nz; st.speed = C.speed * 0.4; } else st.speed = 0;
    if (st.show <= 0) { st.show = 0; st.phase = 'idle'; st.swum = 0; }
    return null;
  }
  // 'warn': on its way
  st.show = Math.min(1, st.show + dt / C.rise);
  if (w.swimming) { st.lost = 0; st.tx = w.x; st.tz = w.z; } else st.lost += dt;
  const dx = st.tx - st.x, dz = st.tz - st.z, d = Math.hypot(dx, dz);
  if (w.swimming && d <= C.bite) { st.phase = 'leave'; st.cool = T.again; return 'bite'; }
  if (st.lost >= C.linger) { st.phase = 'leave'; st.cool = T.again; return 'gone'; }
  const step = Math.min(C.speed * dt, Math.max(0, d - (w.swimming ? 0 : C.bite))); // (it stops short of where the prey went ashore)
  let moved = 0;
  if (step > 1e-6) {
    let nx = st.x + (dx / d) * step, nz = st.z + (dz / d) * step;
    if (!w.water(nx, nz)) { // round a bend: along the channel instead of over the bank
      const c = w.centre(nx, nz), ex = c.x - st.x, ez = c.z - st.z, e = Math.hypot(ex, ez);
      if (e > 1e-6) { nx = st.x + (ex / e) * step; nz = st.z + (ez / e) * step; }
      if (e <= 1e-6 || !w.water(nx, nz)) { nx = st.x; nz = st.z; }
    }
    moved = Math.hypot(nx - st.x, nz - st.z);
    if (moved > 1e-6) st.yaw = turn(st.yaw, Math.atan2(nx - st.x, nz - st.z), Math.min(1, dt * 6));
    st.x = nx; st.z = nz;
  }
  st.speed = dt > 0 ? moved / dt : 0;
  return null;
}
