// #1355: renderer-free helpers that let the children's-room billiard table be shared (Worker `cloudflare/players.js` + client).
// The room owns the game: it keeps a table snapshot, runs every stroke through the same BilliardPhysics / BilliardRules the
// clients use (fixed STEP so the result never depends on a frame rate) and sends { stroke direction, end snapshot } to the
// players in the room. Clients animate the stroke locally with the same fixed step and then adopt the end snapshot, so a
// tiny float difference between engines can never make two clients disagree about the game. Positions travel as whole
// millimetres, so "rest" states are identical bit for bit everywhere.
import { BilliardPhysics } from './billiardphysics.js';
import { BilliardRules, MODES } from './billiardrules.js';

export const STEP = 1 / 120;       // s, the fixed physics step (server and clients)
export const MAX_STROKE_S = 20;    // s of simulated time before the server forces rest (friction stops a stroke in ~6 s)
const GROUP = [null, 'solid', 'stripe'];
const mm = (v) => Math.round(v * 1000);

/** The complete game state as plain JSON: whole millimetres, bit masks for active / remaining balls, rule state and the last verdict. */
export function snapshotTable(physics, rules, q = 0) {
  let a = 0, r = 0; const p = [];
  for (const b of physics.balls) { if (b.active) a |= 1 << b.id; p.push(b.active ? mm(b.x) : 0, b.active ? mm(b.z) : 0); }
  for (const id of rules.remaining) r |= 1 << id;
  return { q, m: rules.mode, t: rules.turn, g: rules.groups.map((g) => Math.max(0, GROUP.indexOf(g))), o: rules.over ? 1 : 0, w: rules.winner ?? -1, r, a, p, s: rules.message };
}

/** Is `s` a well-formed snapshot (what the room stores and what a client may adopt)? */
export function validSnapshot(s) {
  return !!s && typeof s === 'object' && Number.isSafeInteger(s.q) && MODES.includes(s.m) && (s.t === 0 || s.t === 1)
    && Array.isArray(s.g) && s.g.length === 2 && s.g.every((g) => g === 0 || g === 1 || g === 2) && (s.o === 0 || s.o === 1) && [-1, 0, 1].includes(s.w)
    && Number.isInteger(s.r) && s.r >= 0 && s.r < 1 << 16 && Number.isInteger(s.a) && s.a >= 0 && s.a < 1 << 16
    && Array.isArray(s.p) && s.p.length === 32 && s.p.every((v) => Number.isInteger(v) && Math.abs(v) < 5000) && typeof s.s === 'string' && s.s.length < 120;
}

/** Put a snapshot into a physics + rules pair (balls at rest). */
export function restoreTable(physics, rules, s) {
  physics.firstHit = null;
  physics.balls.forEach((b, i) => { const on = !!(s.a >> b.id & 1); Object.assign(b, { active: on, vx: 0, vz: 0, x: on ? s.p[i * 2] / 1000 : 0, z: on ? s.p[i * 2 + 1] / 1000 : 0 }); });
  rules.mode = s.m; rules.turn = s.t; rules.groups = s.g.map((g) => GROUP[g]); rules.over = !!s.o; rules.winner = s.w < 0 ? null : s.w;
  rules.remaining = new Set(); for (let id = 1; id <= 15; id++) if (s.r >> id & 1) rules.remaining.add(id);
  rules.message = s.s; rules.pocketed = []; rules.firstHit = null;
}

/** A fresh rack in `mode`, as a snapshot (sequence number `q`). */
export function freshTable(config, mode = 'free', q = 0) {
  const physics = new BilliardPhysics(config), rules = new BilliardRules(mode);
  return snapshotTable(physics, rules, q);
}

/** A unit stroke direction from two numbers rounded to 4 decimals, or null (not finite / zero). */
export function cleanDirection(d) {
  if (!Array.isArray(d) || d.length !== 2 || !d.every((v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e3)) return null;
  const len = Math.hypot(d[0], d[1]);
  if (len < 1e-6) return null;
  const r = (v) => Math.round(v / len * 1e4) / 1e4;
  return [r(d[0]), r(d[1])];
}

/** Run one stroke from snapshot `s` (the physics config's units): { snap, ms } with the end snapshot (`q` not touched) and the
 * simulated duration, or { error: 'over' | 'busy' }. Deterministic: same input, same output, on any machine. */
export function simulateStroke(config, s, dir) {
  const physics = new BilliardPhysics(config), rules = new BilliardRules(s.m);
  restoreTable(physics, rules, s);
  if (!rules.canShoot) return { error: 'over' };
  physics.onPocket = (id) => rules.notePocket(id);
  if (!physics.shoot(dir[0], dir[1])) return { error: 'busy' };
  rules.beginShot();
  let t = 0;
  while ((t < config.strokeSeconds || physics.moving) && t < MAX_STROKE_S) { physics.step(STEP); t += STEP; }
  for (const b of physics.balls) b.vx = b.vz = 0; // (only reached by the time cap)
  rules.endShot(physics.firstHit);
  return { snap: snapshotTable(physics, rules, s.q), ms: Math.ceil(t * 1000) };
}
