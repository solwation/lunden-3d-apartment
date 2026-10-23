// #1370: a small renderer-free pétanque simulation on the courtyard's gravel court. Metres/seconds, world x/z.
// Thrown objects land (the flight is drawn by boule.js) and then roll with a constant gravel deceleration; boules and
// the jack collide with mass-weighted restitution and bounce weakly off the timber edge. No rendering or network.
export class BoulePhysics {
  /** `c`: BOULE from config.js plus `court` {x0, x1, z0, z1} (the court's outer timber edge). */
  constructor(c) { this.c = c; this.onHit = null; this.reset(); }
  /** Every boule and the jack back in the hand (inactive). Ids: 0 the jack, 1… the boules (team = (id - 1) % 2). */
  reset() {
    const c = this.c;
    this.objects = [{ id: 0, team: -1, r: c.jackR, m: c.jackMass, x: 0, z: 0, vx: 0, vz: 0, active: false }];
    for (let i = 0; i < c.balls * 2; i++) this.objects.push({ id: i + 1, team: i % 2, r: c.ballR, m: c.ballMass, x: 0, z: 0, vx: 0, vz: 0, active: false });
  }
  get jack() { return this.objects[0]; }
  /** Inner playing area for an object of radius r. */
  bounds(r) { const c = this.c, e = c.edge, k = c.court; return { x0: k.x0 + e + r, x1: k.x1 - e - r, z0: k.z0 + e + r, z1: k.z1 - e - r }; }
  get moving() { const s = this.c.stopSpeed ** 2; return this.objects.some((o) => o.active && o.vx * o.vx + o.vz * o.vz > s); }
  /** The next boule of `team` still in the hand, or null. */
  nextBall(team) { return this.objects.find((o) => o.id > 0 && o.team === team && !o.active) ?? null; }
  /** Put an object down at (x, z) rolling with (vx, vz). Invalid input is refused without changing state. */
  land(o, x, z, vx = 0, vz = 0) {
    if (!o || ![x, z, vx, vz].every(Number.isFinite)) return false;
    const b = this.bounds(o.r);
    Object.assign(o, { x: Math.min(b.x1, Math.max(b.x0, x)), z: Math.min(b.z1, Math.max(b.z0, z)), vx, vz, active: true });
    return true;
  }
  edge(o) {
    const b = this.bounds(o.r), k = this.c.edgeBounce; let impact = 0;
    if (o.x < b.x0) { o.x = b.x0; if (o.vx < 0) { impact = -o.vx; o.vx = -o.vx * k; } }
    if (o.x > b.x1) { o.x = b.x1; if (o.vx > 0) { impact = o.vx; o.vx = -o.vx * k; } }
    if (o.z < b.z0) { o.z = b.z0; if (o.vz < 0) { impact = Math.max(impact, -o.vz); o.vz = -o.vz * k; } }
    if (o.z > b.z1) { o.z = b.z1; if (o.vz > 0) { impact = Math.max(impact, o.vz); o.vz = -o.vz * k; } }
    if (impact) this.onHit?.('edge', o.x, o.z, impact);
  }
  step(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const c = this.c, t = Math.min(dt, 0.1), n = Math.ceil(t / c.maxStep), h = t / n, list = this.objects;
    for (let k = 0; k < n; k++) {
      for (const o of list) if (o.active) {
        const s = Math.hypot(o.vx, o.vz), f = s ? Math.max(0, s - c.friction * h) / s : 0;
        o.vx *= f; o.vz *= f; o.x += o.vx * h; o.z += o.vz * h; this.edge(o);
      }
      for (let pass = 0; pass < 2; pass++) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j]; if (!a.active || !b.active) continue;
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), rr = a.r + b.r; if (d >= rr) continue;
        const nx = d > 1e-9 ? dx / d : 1, nz = d > 1e-9 ? dz / d : 0, im = 1 / a.m, jm = 1 / b.m, w = (rr - d) / (im + jm);
        a.x -= nx * w * im; a.z -= nz * w * im; b.x += nx * w * jm; b.z += nz * w * jm; // separate by inverse mass
        const closing = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (closing < 0) {
          const p = -(1 + c.bounce) * closing / (im + jm);
          a.vx -= p * im * nx; a.vz -= p * im * nz; b.vx += p * jm * nx; b.vz += p * jm * nz;
          this.onHit?.(a.id && b.id ? 'ball' : 'jack', (a.x + b.x) / 2, (a.z + b.z) / 2, -closing);
        }
      }
      for (const o of list) if (o.active) { this.edge(o); if (Math.hypot(o.vx, o.vz) < c.stopSpeed) o.vx = o.vz = 0; }
    }
  }
  /** Distance (m, centre to centre) from each thrown boule to the jack: [{id, team, d}]. */
  distances() {
    const j = this.jack; if (!j.active) return [];
    return this.objects.filter((o) => o.id > 0 && o.active).map((o) => ({ id: o.id, team: o.team, d: Math.hypot(o.x - j.x, o.z - j.z) }));
  }
}
