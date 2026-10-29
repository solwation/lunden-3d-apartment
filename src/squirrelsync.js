import { SQUIRRELS as C } from './config.js';

// #1686: the squirrels and their nuts shared between the players near them. No three.js, so a node test can drive it.
// The Worker room (cloudflare/squirrels.js) owns no simulation and writes nothing to storage or KV: it picks ONE leader among the
// players near the squirrels (the earliest to arrive; the next one when it leaves) and relays, like the pony paddock (#1644). The leader's
// client keeps simulating the brains and the NutField as before and sends two things: the animals' poses ('s', every `sync.every` s)
// and the nuts lying out ('n', only when they changed, at most every `sync.nutEvery` s). The others (followers) do not simulate: they
// adopt those snapshots and glide towards them. A solo visitor (nobody else near) is the leader with nobody to tell and sends nothing.
// Taking a nut is arbitrated by the room: { k: 't', s: slot, b: born } -> the first one gets { k: 'ok' }, a later one { k: 'no' } and drops
// the nut; everyone else gets { k: 'g' } so the nut is gone for all, the leader gets { k: 't', i } and keeps the slot out of play. Putting a
// held nut down ('p'), and feeding a squirrel (leader -> room 'f', everybody else gets 'F'), travel the same way. The feeder is the one
// who held the nut: only they score. Remote visitors lure squirrels from what the leader already knows of them (their ghost: a crouched,
// still player holding a nut, hi 'nut'), so no extra per-frame traffic.

export const STATES = ['perch', 'leap', 'down', 'up', 'forage', 'search', 'fetch', 'eat', 'toTree', 'flee', 'approach', 'take'];
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const r2 = (v) => Math.round(v * 100) / 100;
const r1 = (v) => Math.round(v * 10) / 10;
const between = ([a, b], r) => a + (b - a) * r();

/** One animal's pose as 9 numbers: x y z yaw pitch rise run state nut. */
export const encodeAnimal = (b) => [r2(b.x), r2(b.y), r2(b.z), r2(b.yaw), r2(b.pitch), r1(b.rise), r1(b.run), Math.max(0, STATES.indexOf(b.state)), b.hasNut ? 1 : 0];
/** The nuts lying out as a flat integer list, 4 per nut: slot + 64 * kind, x cm, z cm, born. Held nuts are not in it. */
export function encodeNuts(slots) {
  const v = [];
  slots.forEach((s, i) => { if (s.alive && !s.held) v.push(i + 64 * s.kind, Math.round(s.x * 100), Math.round(s.z * 100), s.born); });
  return v;
}

export class SquirrelSync {
  /** field: NutField; brains: the SquirrelBrain list; send(m): false when not connected; hooks: { fed(an, who), dropHeld(slot) }. */
  constructor({ field, brains, send, hooks = {}, me = () => '' }) {
    Object.assign(this, { field, brains, send, hooks, me, near: false, lead: true, n: 0, t: 0, lastSnap: -1e9, sT: 0, nT: 0, nutKey: '', force: true, tg: [], remoteHeld: new Map(), sent: 0 });
  }
  /** Talking to the room: only near the squirrels and with somebody else involved (or following). */
  get sharing() { return this.near && (this.n > 0 || !this.lead); }
  /** Adopting the leader's snapshots instead of simulating (they stopped for `sync.follow` s: simulate here again). */
  get follow() { return !this.lead && this.t - this.lastSnap < C.sync.follow; }
  say(m) { return this.send({ t: 'sq', ...m }); }
  setNear(v) {
    if (v === this.near) return;
    this.near = v; this.say({ k: v ? 'on' : 'off' });
    if (!v) { this.lead = true; this.n = 0; this.remoteHeld.clear(); }
  }
  receive(m) {
    const f = this.field;
    switch (m.k) {
      case 'L': {
        if (m.off || m.lead === false) { this.lead = false; this.n = 0; break; }
        const was = this.lead; this.lead = true; this.n = m.n | 0; this.force = true; this.remoteHeld.clear();
        if (!was) for (const s of f.slots) if (s.alive && !(s.life > s.age)) s.life = between(C.life, f.rnd);
        for (const [i, b, who, kind] of m.c ?? []) { const s = f.slots[i]; if (!s) continue; Object.assign(s, { alive: true, held: true, by: who, born: b, kind, age: 0 }); this.remoteHeld.set(who, i); }
        break;
      }
      case 's': if (!this.lead) this.adopt(m.a); break;
      case 'n': if (!this.lead) this.adoptNuts(m.v); break;
      case 'g': { const s = f.slots[m.s]; if (!this.lead && s && s.born === m.b && !s.held) s.alive = false; break; }
      case 'p': {
        const s = f.slots[m.s]; if (!s) break;
        Object.assign(s, { alive: true, held: false, by: null, x: m.x, z: m.z, y: f.ground(m.x, m.z), kind: m.kd, born: m.b, age: 0, life: s.life > 0 ? s.life : between(C.life, f.rnd) });
        if (this.remoteHeld.get(m.i) === m.s) this.remoteHeld.delete(m.i);
        this.force = true; break;
      }
      case 't': { // leader: somebody else holds this nut now
        const s = f.slots[m.s]; if (!this.lead || !s || !s.alive || s.born !== m.b || s.held) break;
        s.held = true; s.by = m.i; this.remoteHeld.set(m.i, m.s); this.force = true; break;
      }
      case 'x': { const s = f.slots[m.s]; if (this.lead && s && s.born === m.b && s.by) { this.remoteHeld.delete(s.by); f.remove(s); this.force = true; } break; }
      case 'no': { const s = f.slots[m.s]; if (s && s.born === m.b) this.hooks.dropHeld?.(s); break; }
      case 'F': this.hooks.fed?.(m.an, m.i); break;
    }
  }
  /** The follower adopts a leader snapshot of the animals. */
  adopt(list) {
    list.forEach((q, i) => {
      const b = this.brains[i]; if (!b) return;
      const prev = this.tg[i], dt = prev ? Math.min(1.5, Math.max(0.2, this.t - prev.at)) : 1;
      const g = { x: q[0], y: q[1], z: q[2], yaw: q[3], pitch: q[4], rise: q[5], run: q[6], st: q[7], nut: q[8], vx: 0, vz: 0, at: this.t };
      if (prev && Math.hypot(g.x - prev.x, g.z - prev.z) < 12) {
        const cap = (v) => Math.max(-8, Math.min(8, v));
        g.vx = cap((g.x - prev.x) / dt); g.vz = cap((g.z - prev.z) / dt);
      }
      if (!prev || Math.hypot(g.x - b.x, g.z - b.z) > 15) Object.assign(b, { x: g.x, y: g.y, z: g.z, yaw: g.yaw });
      this.tg[i] = g;
      Object.assign(b, { state: STATES[g.st] ?? 'perch', hasNut: !!g.nut, rise: g.rise, run: g.run, pitch: g.pitch });
    });
    this.lastSnap = this.t;
  }
  adoptNuts(v) {
    const f = this.field, listed = new Set();
    for (let i = 0; i + 3 < v.length; i += 4) {
      const i0 = v[i] & 63, s = f.slots[i0]; if (!s) continue;
      listed.add(i0); if (s.held) continue;
      Object.assign(s, { alive: true, kind: v[i] >> 6, x: v[i + 1] / 100, z: v[i + 2] / 100, born: v[i + 3], age: 0 }); s.y = f.ground(s.x, s.z);
    }
    f.slots.forEach((s, i) => { if (!listed.has(i) && s.alive && !s.held) s.alive = false; });
  }
  /** Per frame: the leader sends, a follower glides. */
  tick(dt) {
    this.t += dt;
    if (this.sharing && this.lead) {
      if ((this.sT -= dt) <= 0) { this.sT = C.sync.every; if (this.say({ k: 's', a: this.brains.map(encodeAnimal) })) this.sent++; }
      this.nT -= dt;
      const v = encodeNuts(this.field.slots), key = v.join(',');
      if ((key !== this.nutKey || this.force) && this.nT <= 0 && this.say({ k: 'n', v })) { this.nutKey = key; this.force = false; this.nT = C.sync.nutEvery; this.sent++; }
    }
    if (this.follow) {
      const k = 1 - Math.exp(-dt * 8);
      this.brains.forEach((b, i) => {
        const g = this.tg[i]; if (!g) return;
        const age = Math.min(0.6, this.t - g.at);
        b.x += (g.x + g.vx * age - b.x) * k; b.z += (g.z + g.vz * age - b.z) * k; b.y += (g.y - b.y) * k;
        b.yaw += wrap(g.yaw - b.yaw) * k;
      });
    }
  }
  // --- the local visitor's own nut actions (optimistic: the nut moves at once, the room arbitrates) ---
  take(slot) { if (this.sharing) this.say({ k: 't', s: this.field.slots.indexOf(slot), b: slot.born }); }
  put(slot, x, z) { if (this.sharing) this.say({ k: 'p', s: this.field.slots.indexOf(slot), b: slot.born, x: r2(x), z: r2(z) }); }
  /** The leader's squirrel took the nut `slot` from player `who` (a remote id or our own). */
  feed(slot, who, an) {
    if (this.sharing) this.say({ k: 'f', s: this.field.slots.indexOf(slot), b: slot.born, to: who, an });
    if (this.remoteHeld.get(who) === this.field.slots.indexOf(slot)) this.remoteHeld.delete(who);
  }
}
