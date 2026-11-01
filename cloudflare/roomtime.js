// #1774: the game time and date shared by everybody in the players' room. A client that sets the clock / the date / "Nu" sends
// { t: 'tm', o, p? }: o = the game time minus the sender's real clock in ms (so the room is "real time + offset", and a room without
// an offset is on real time), p = 1 when the time stands still (paused; then the game time is the receiver's clock + o at that moment).
// The room keeps ONLY that one value in memory (no storage, no KV, #1689), sends { t: 'tm', i, o, p? } to the others and the same
// value in the welcome ({ t: 'w', tm: { o, p? } }) to a newcomer; it forgets it when the last player leaves (real time again).
// Limits: |o| <= 10 years, one message per `every` ms per connection (more is dropped), a running time at an unchanged offset is not sent again.

export const ROOM_TIME = { maxOffset: 10 * 365 * 864e5, every: 250 }; // (*guess*: far more than any sensible date picking; a few changes a second are plenty)

/** A time message from a client, or null. */
export function cleanTime(text) {
  let m;
  try { m = JSON.parse(text); } catch { return null; }
  if (m?.t !== 'tm' || !Number.isSafeInteger(m.o) || Math.abs(m.o) > ROOM_TIME.maxOffset) return null;
  if (m.p !== undefined && m.p !== 0 && m.p !== 1) return null;
  return { o: m.o, p: m.p === 1 ? 1 : 0 };
}

export class RoomTime {
  /** `peers()` → [{ ws, a }] open sockets; `send(ws, text)`. */
  constructor(peers, send) { this.peers = peers; this.send = send; this.cur = null; this.last = new WeakMap(); }
  /** What a newcomer is told: { o, p? } or undefined (real time). A paused time is moved on so it reads the same stamp to the newcomer. */
  welcome(now = Date.now()) { return this.cur ? { o: this.cur.o + (this.cur.p ? this.cur.at - now : 0), ...(this.cur.p ? { p: 1 } : {}) } : undefined; }
  handle(ws, a, m, now = Date.now()) {
    if (now - (this.last.get(ws) ?? -Infinity) < ROOM_TIME.every) return;
    this.last.set(ws, now);
    const c = this.cur;
    if (!m.p && (c ? !c.p && c.o === m.o : m.o === 0)) return; // nothing new (a running time at the offset the room already has)
    this.cur = { o: m.o, p: m.p, at: now };
    const out = JSON.stringify({ t: 'tm', i: a.i, o: m.o, ...(m.p ? { p: 1 } : {}) });
    for (const x of this.peers()) if (x.ws !== ws) this.send(x.ws, out);
  }
  /** The players left after one goes: nobody → real time again. */
  trim(left) { if (!left) this.cur = null; }
}
