import { SPRAY } from '../src/config.js';

// #1724: the spray paint (#1707, src/graffiti.js) shared between the players. Gossip, no storage: the room keeps the UNION of the
// spots its players bring, in memory only (lost when the object hibernates or the last player leaves), never in KV (#1689) or
// Durable Object storage (a cost decision, see #1724). Every client keeps the union it has seen in its own localStorage, so the
// paint lives on as long as somebody who saw it comes back within SPRAY.hours. Spots are the client's wire records
// [x, y, z, nx, ny, nz, colour index, size cm, t (s since epoch)] (src/graffiti.js `writeSpots`), identified by
// `spotKey` (position, colour, time).
//   client -> room: { t: 'gf', s: [spot …] } at most GRAFFITI_SYNC.block spots and GRAFFITI_SYNC.maxBytes characters, at most one
//   message per GRAFFITI_SYNC.every s per connection (sooner ones are dropped); a malformed spot drops the whole message.
//   room -> client: { t: 'gf', w: 1, s: [the union] } right after the welcome (always, also empty: the client then uploads only what
//   the room lacks); { t: 'gf', s: [new spots] } to everybody but the sender when somebody adds spots; { t: 'gf', k: 'ask' } to ONE
//   player (the most recently active) when a newcomer arrives at a room whose memory was lost (hibernation): that player re-uploads
//   its whole store, which the room passes on. Outgoing messages are not billed; incoming ones count like any (1/20 request).
// Limits (our picks, *guess*): per connection a spot bucket of `burst` (a whole local store on joining) refilled with `perSecond`
// spots a second (a can paints at most 1 / SPRAY.every = 20); per room at most `roomPerMinute` new spots a minute; the union at
// most SPRAY.max spots (the oldest go), none older than SPRAY.hours or more than `future` s ahead of the room's clock.
export const GRAFFITI_SYNC = {
  prefix: '{"t":"gf"', // the one message type allowed past PLAYERS.maxBytes (like the paddock's grass mask)
  maxBytes: 8192,      // characters per message: `block` spots of the widest kind (≤ 64 characters each) fit (cloudflare/graffiti.test.mjs)
  block: 120,          // spots per message (the client's SPRAY.share.block, kept equal by hand)
  every: 1,            // s: one graffiti message per connection at most this often (×0.8 for jitter; the client's SPRAY.share.every is longer)
  burst: SPRAY.max,    // spots: a connection's bucket (a full local store uploaded on joining)
  perSecond: 25,       // spots a second refilled into the bucket (a can paints ≤ 20 a second)
  roomPerMinute: 6000, // new spots accepted by the whole room per minute
  future: 300,         // s: a spot stamped further ahead of the room's clock is refused (it would outlive SPRAY.hours)
  bound: 5000,         // m: coordinates beyond this are refused (the site is a few hundred metres)
};

const LIFE = SPRAY.hours * 3600;
const r2 = (v) => Math.round(v * 100) / 100;
const fin = (v, lim) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim;
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
/** The identity of a spot (two players never paint the same position, colour and second by chance). */
export const spotKey = (a) => `${a[0]},${a[1]},${a[2]},${a[6]},${a[8]}`;

/** One wire spot, rounded as the client writes it, or null when malformed. */
export function cleanSpot(a) {
  if (!Array.isArray(a) || a.length !== 9) return null;
  if (![0, 1, 2].every((i) => fin(a[i], GRAFFITI_SYNC.bound)) || ![3, 4, 5].every((i) => fin(a[i], 1.01))) return null;
  const len = Math.hypot(a[3], a[4], a[5]);
  if (len < 0.9 || len > 1.1) return null;
  if (!int(a[6], 0, SPRAY.cans.length - 1) || !int(a[7], 2, 100) || !int(a[8], 0, 1e10)) return null;
  return [r2(a[0]), r2(a[1]), r2(a[2]), r2(a[3]), r2(a[4]), r2(a[5]), a[6], a[7], a[8]];
}

/** A graffiti message from a client { s: [spot …] }, or null (not one, too many spots, or any spot malformed). */
export function cleanGraffiti(text) {
  if (typeof text !== 'string' || !text.startsWith(GRAFFITI_SYNC.prefix) || text.length > GRAFFITI_SYNC.maxBytes) return null;
  let m;
  try { m = JSON.parse(text); } catch { return null; }
  if (m?.t !== 'gf' || !Array.isArray(m.s) || m.s.length < 1 || m.s.length > GRAFFITI_SYNC.block) return null;
  const s = m.s.map(cleanSpot);
  return s.every(Boolean) ? { s } : null;
}

/** The graffiti of one players room. `peers()` → [{ ws, a }] open sockets with their attachments. */
export class RoomGraffiti {
  constructor(peers, send) {
    this.peers = peers; this.send = send;
    this.spots = new Map(); // key → wire spot
    this.seeded = false;    // false in a fresh object: the union may have been lost by hibernation
    this.rw = 0; this.rn = 0; this.prunedAt = 0;
  }
  get count() { return this.spots.size; }
  /** Drop the spots older than SPRAY.hours; keep at most SPRAY.max, the newest. */
  prune(now = Date.now(), force = false) {
    if (!force && now - this.prunedAt < 10_000 && this.spots.size <= SPRAY.max) return;
    this.prunedAt = now;
    const old = now / 1000 - LIFE;
    for (const [k, a] of this.spots) if (a[8] <= old) this.spots.delete(k);
    if (this.spots.size > SPRAY.max) {
      const order = [...this.spots].sort((x, y) => x[1][8] - y[1][8]);
      for (let i = 0; i < order.length - SPRAY.max; i++) this.spots.delete(order[i][0]);
    }
  }
  list() { return [...this.spots.values()].sort((x, y) => x[8] - y[8]); }
  /** A newcomer `ws` (already accepted): the union at once; a room that lost its memory asks one other player to send everything. */
  join(ws, others, now = Date.now()) {
    this.prune(now, true);
    this.send(ws, JSON.stringify({ t: 'gf', w: 1, s: this.list() }));
    if (this.seeded) return;
    this.seeded = true;
    const best = others.filter((o) => o.ws !== ws).sort((x, y) => (y.a.t ?? 0) - (x.a.t ?? 0))[0];
    if (best) this.send(best.ws, '{"t":"gf","k":"ask"}');
  }
  /** Spots from player `ws` (attachment `a`, saved by the caller): add the new ones within the limits, pass them on to the others. */
  handle(ws, a, m, now = Date.now()) {
    if (now - (a.gfAt ?? 0) < GRAFFITI_SYNC.every * 800) return 0;
    a.gfAt = now;
    const tokens = Math.min(GRAFFITI_SYNC.burst, (a.gfb ?? GRAFFITI_SYNC.burst) + ((now - (a.gfr ?? now)) / 1000) * GRAFFITI_SYNC.perSecond);
    a.gfr = now;
    if (now - this.rw >= 60_000) { this.rw = now; this.rn = 0; }
    this.prune(now);
    const sec = now / 1000, fresh = [];
    let left = tokens;
    for (const s of m.s) {
      if (s[8] <= sec - LIFE || s[8] > sec + GRAFFITI_SYNC.future) continue; // expired / from the future
      const k = spotKey(s);
      if (this.spots.has(k)) continue; // known: costs nothing
      if (left < 1 || this.rn >= GRAFFITI_SYNC.roomPerMinute) break;
      left--; this.rn++;
      this.spots.set(k, s); fresh.push(s);
    }
    a.gfb = left;
    if (!fresh.length) return 0;
    if (this.spots.size > SPRAY.max) this.prune(now, true);
    const out = fresh.filter((s) => this.spots.has(spotKey(s))); // (an old spot pushed out at once by the cap is not passed on)
    if (out.length) { const text = JSON.stringify({ t: 'gf', s: out }); for (const o of this.peers()) if (o.ws !== ws) this.send(o.ws, text); }
    return out.length;
  }
  /** The last player left: the union is forgotten (the clients keep it). */
  trim(remaining) { if (!remaining) { this.spots.clear(); this.seeded = false; } }
}
