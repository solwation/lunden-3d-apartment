// #1854: renderer-free authoritative pétanque and bounded local replay. Same existing rules/physics.
import { BOULE as B, COURTYARD } from './config.js';
import { BoulePhysics } from './boulephysics.js';
import { BouleRules } from './boulerules.js';
export const BOULE_SYNC = B.sync;
export const circle = { x: (COURTYARD.boule.x0 + COURTYARD.boule.x1) / 2, z: COURTYARD.boule.z0 + B.circle.dz };
export function freshBoule(q = 0) { return { q, rules: { ...new BouleRules(B.balls, B.target) }, objects: new BoulePhysics({ ...B, court: COURTYARD.boule }).objects }; }
export const copyBoule = s => structuredClone(s);
export function cleanBoule(text) {
  let m; try { m = JSON.parse(text); } catch { return null; }
  if (m?.t !== 'bl' || !['g', 't', 'm', 'r', 'c'].includes(m.k) || !Number.isSafeInteger(m.q) || m.q < 0) return null;
  if (m.k !== 't') return { k: m.k, q: m.q };
  if (!Array.isArray(m.aim) || m.aim.length !== 2 || !m.aim.every(v => Number.isFinite(v) && Math.abs(v) < BOULE_SYNC.maxCoord)) return null;
  return { k: m.k, q: m.q, aim: m.aim.map(v => Math.round(v * 10000) / 10000) };
}
export function nearBoule(p, throwOnly = false) { return Array.isArray(p) && p.length === 3 && p.every(Number.isFinite) && Math.abs(p[1]) < 2 && (throwOnly ? Math.hypot(p[0] - circle.x, p[2] - circle.z) <= B.circle.reach + BOULE_SYNC.reachSlack : Math.hypot(p[0] - B.desk.x, p[2] - B.desk.z) < BOULE_SYNC.controlReach); }
/** Server chooses seed/from. Returns final state and optional local 30 Hz replay, never streamed. */
export function playBoule(state, cmd, seed = 1, from = [circle.x, 1.2, circle.z], trace = false) {
  const s = copyBoule(state), r = Object.assign(new BouleRules(B.balls, B.target), s.rules), p = new BoulePhysics({ ...B, court: COURTYARD.boule });
  p.objects = s.objects; const frames = [];
  if (cmd.k === 'r') { r.reset(); p.reset(); }
  else if (cmd.k === 'm') { if (r.over) return { error: 'over' }; r.restartMene(); p.reset(); }
  else if (cmd.k === 'c') { if (r.next !== 'collect') return { error: 'phase' }; r.collect(); p.reset(); }
  else if (cmd.k === 't') {
    const kind = r.next; if (kind !== 'jack' && kind !== 'ball') return { error: 'phase' };
    if (kind === 'jack') p.reset();
    const o = kind === 'jack' ? p.jack : p.nextBall(r.turn); if (!o) return { error: 'phase' };
    const b = p.bounds(o.r), tx = Math.min(b.x1, Math.max(b.x0, cmd.aim[0])), tz = Math.min(b.z1, Math.max(b.z0, cmd.aim[1]));
    let dx = tx - circle.x, dz = tz - circle.z; const dist = Math.hypot(dx, dz); if (dist < 1e-3) { dx = 0; dz = 1; } else { dx /= dist; dz /= dist; }
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }, g = () => Math.sqrt(-2 * Math.log(1 - random() * .999)) * Math.cos(2 * Math.PI * random());
    const land = Math.max(B.minLand, dist - B.roll), v = Math.sqrt(2 * B.friction * Math.max(0, dist - land));
    const lx = circle.x + dx * land + g() * B.scatter * dist, lz = circle.z + dz * land + g() * B.scatter * dist;
    const flight = B.flight + B.flightPerM * dist, h = B.arc * dist; let landed = false, count = 0;
    const sample = t => p.objects.map(x => { if (x === o && !landed) { const u = Math.min(1, t / flight); return { ...x, active: true, x: from[0] + (lx - from[0]) * u, y: from[1] + (B.surface + o.r - from[1]) * u + 4 * h * u * (1 - u), z: from[2] + (lz - from[2]) * u }; } return { ...x, y: B.surface + x.r }; });
    if (trace) frames.push({ t: 0, objects: sample(0) });
    do {
      count++; const t = count * BOULE_SYNC.step;
      if (!landed && t >= flight) { p.land(o, lx, lz, dx * v, dz * v); landed = true; }
      p.step(BOULE_SYNC.step);
      if (trace && count % BOULE_SYNC.sample === 0) frames.push({ t, objects: sample(t) });
    } while ((!landed || p.moving) && count < BOULE_SYNC.maxSeconds / BOULE_SYNC.step);
    if (!landed || p.moving) return { error: 'simulation' };
    const seconds = count * BOULE_SYNC.step;
    if (trace) frames.push({ t: seconds, objects: sample(seconds) });
    if (kind === 'jack') { const d = Math.hypot(p.jack.x - circle.x, p.jack.z - circle.z); r.jackThrown(d >= B.jackMin && d <= B.jackMax); }
    else r.ballThrown(p.distances());
    return { end: { q: s.q + 1, rules: { ...r }, objects: p.objects }, ms: Math.ceil(seconds * 1000), frames };
  } else return { error: 'command' };
  return { end: { q: s.q + 1, rules: { ...r }, objects: p.objects }, ms: 0, frames };
}
