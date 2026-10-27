import { PADDOCK } from '../src/config.js';
import { centre } from '../src/paddockgeo.js';

// #1644: the pony paddock shared between the players near it. The room owns no simulation and stores nothing: it only picks
// ONE leader among the players within PADDOCK_SYNC.enter m of the paddock (the earliest to arrive; the next one when the leader
// leaves or disconnects) and relays. Presence follows the last state's feet like the children's room (#1355), with a
// `leave` hysteresis. Room → leader: { t: 'pk', k: 'L', n, need? } (you lead; n = the other players present; need = somebody
// just arrived and wants the grass) or { k: 'L', off: true } (you no longer lead). Leader → room: a pony snapshot
// { t: 'pk', k: 's', p: [[x, z, yaw, state, gone] per pony], h?: [hay amounts] } (sent ~1 Hz, only while n > 0), forwarded
// to the others present as is; and the grass-length mask { t: 'pkg', W, H, v } (one base64 character = 6 bits per cell,
// up to `maxGrass` characters: the one message allowed above PLAYERS.maxBytes), forwarded the same way. Anybody present
// but the leader → room: a pat { t: 'pk', k: 'pet', i }, forwarded to the leader only as { t: 'pk', k: 'pet', i, x, z }
// (x / z = the patter's last known feet, never client-supplied). Everything else is dropped. Solo players get 'L' with
// n 0 and send nothing at all.

export const PADDOCK_SYNC = {
  enter: PADDOCK.viewDist, leave: PADDOCK.viewDist + 15, // m from the paddock's centre (the client simulates within viewDist)
  every: 0.6,       // s: one snapshot per leader at most this often (×0.8 for jitter; the client sends one a second)
  grassEvery: 2,    // s: one grass mask per leader at most this often
  petEvery: 0.5,    // s: one pat per player at most this often
  maxGrass: 12000,  // characters of mask; the paddock's mask is 111 × 81 = 8991 cells
  ponies: PADDOCK.pony.animals.length,
  states: 6,        // the client's PONY_STATES (src/paddock.js)
};
export const GRASS_PREFIX = '{"t":"pkg"';

const fin = (v, lim) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim;
const r2 = (v) => Math.round(v * 100) / 100;

/** A paddock message from a client (#1644), or null: { k: 's', p, h? } | { k: 'g', W, H, v } | { k: 'pet', i }. */
export function cleanPaddock(text) {
  let m;
  try { m = JSON.parse(text); } catch { return null; }
  if (m?.t === 'pkg') {
    if (!Number.isInteger(m.W) || !Number.isInteger(m.H) || m.W < 1 || m.H < 1 || m.W * m.H > PADDOCK_SYNC.maxGrass) return null;
    return typeof m.v === 'string' && m.v.length === m.W * m.H && /^[A-Za-z0-9+/]+$/.test(m.v) ? { k: 'g', W: m.W, H: m.H, v: m.v } : null;
  }
  if (m?.t !== 'pk') return null;
  if (m.k === 'pet') return Number.isInteger(m.i) && m.i >= 0 && m.i < PADDOCK_SYNC.ponies ? { k: 'pet', i: m.i } : null;
  if (m.k !== 's' || !Array.isArray(m.p) || m.p.length !== PADDOCK_SYNC.ponies) return null;
  const pony = (q) => Array.isArray(q) && q.length === 5 && fin(q[0], 5000) && fin(q[1], 5000) && fin(q[2], 100)
    && Number.isInteger(q[3]) && q[3] >= 0 && q[3] < PADDOCK_SYNC.states && (q[4] === 0 || q[4] === 1);
  if (!m.p.every(pony)) return null;
  if (m.h !== undefined && !(Array.isArray(m.h) && m.h.length <= 4 && m.h.every((v) => fin(v, 1) && v >= 0))) return null;
  return { k: 's', p: m.p.map((q) => [r2(q[0]), r2(q[1]), r2(q[2]), q[3], q[4]]), ...(m.h ? { h: m.h.map(r2) } : {}) };
}

const away = (p) => (p ? Math.hypot(p[0] - centre.x, p[2] - centre.z) : Infinity);

/** The paddock relay of one players room. `peers()` → [{ ws, a }] open sockets with their (deserialized) attachments. */
export class RoomPaddock {
  constructor(peers, send) { this.peers = peers; this.send = send; }
  /** The players present, with `ws`'s own (not yet serialized) attachment `a` swapped in, without `except`. */
  present(ws, a, except) { return this.peers().filter((o) => o.ws !== except).map((o) => (o.ws === ws ? { ws, a } : o)).filter((o) => o.a.pk === true); }
  /** Make sure the players present have a leader and tell it how many others are here (need: send the grass now). */
  settle(ws, a, except, need = false) {
    const list = this.present(ws, a, except);
    let lead = list.find((o) => o.a.pkL === true);
    if (!lead && list.length) {
      lead = list.reduce((x, y) => ((y.a.pkAt ?? 0) < (x.a.pkAt ?? 0) ? y : x));
      lead.a.pkL = true; need = false;
      if (lead.ws !== ws) lead.ws.serializeAttachment(lead.a);
    }
    if (lead) this.send(lead.ws, JSON.stringify({ t: 'pk', k: 'L', n: list.length - 1, ...(need && lead.ws !== ws ? { need: true } : {}) }));
  }
  /** A state arrived: arriving at the paddock (within `enter` m) or leaving it (beyond `leave` m). */
  presence(ws, a, now = Date.now()) {
    const d = away(a.s?.p);
    if (a.pk !== true && d <= PADDOCK_SYNC.enter) { a.pk = true; a.pkAt = now; this.settle(ws, a, null, true); }
    else if (a.pk === true && d > PADDOCK_SYNC.leave) {
      a.pk = false;
      if (a.pkL) { a.pkL = false; this.send(ws, JSON.stringify({ t: 'pk', k: 'L', off: true })); }
      this.settle(ws, a, ws);
    }
  }
  /** A socket is gone: a new leader when it was the leader, else the leader's count. */
  trim(ws, a) { if (a?.pk === true) this.settle(null, null, ws); }
  handle(ws, a, m, now = Date.now()) {
    if (a.pk !== true) return;
    if (m.k === 'pet') {
      if (a.pkL === true || now - (a.pkp ?? 0) < PADDOCK_SYNC.petEvery * 800 || !a.s?.p) return;
      a.pkp = now;
      const lead = this.present(ws, a).find((o) => o.a.pkL === true);
      if (lead) this.send(lead.ws, JSON.stringify({ t: 'pk', k: 'pet', i: m.i, x: a.s.p[0], z: a.s.p[2] }));
      return;
    }
    if (a.pkL !== true) return; // snapshots and grass only from the leader
    const key = m.k === 'g' ? 'pkg' : 'pks', every = m.k === 'g' ? PADDOCK_SYNC.grassEvery : PADDOCK_SYNC.every;
    if (now - (a[key] ?? 0) < every * 800) return;
    a[key] = now;
    const out = JSON.stringify(m.k === 'g' ? { t: 'pkg', W: m.W, H: m.H, v: m.v } : { t: 'pk', k: 's', p: m.p, ...(m.h ? { h: m.h } : {}) });
    for (const o of this.present(ws, a)) if (o.ws !== ws) this.send(o.ws, out);
  }
}
