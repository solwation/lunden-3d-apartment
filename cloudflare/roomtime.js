// #1865 supersedes #1774/#1689 memory-only client offsets. One persistent server-anchored timeline.
import { WORLD_TIME, worldNow, timelineAt } from '../src/worldtime.js';
export const ROOM_TIME = WORLD_TIME;
export function cleanTime(text) {
  let m; try { m = JSON.parse(text); } catch { return null; }
  if (m?.t !== 'tm' || m.v !== WORLD_TIME.version || !Number.isSafeInteger(m.q) || m.q < 0) return null;
  if (m.k === 'now' || m.k === 'get') return { k: m.k, q: m.q };
  if (m.k !== 'set' || !Number.isSafeInteger(m.stamp) || ![0, 1].includes(m.p) || ![-1, 0, 1].includes(m.s)) return null;
  return { k: 'set', q: m.q, stamp: m.stamp, p: m.p, s: m.s };
}
const valid = s => s?.v === WORLD_TIME.version && Number.isSafeInteger(s.q) && s.q >= 0 && Number.isSafeInteger(s.stamp) && Number.isSafeInteger(s.at) && [0, 1].includes(s.p) && [-1, 0, 1].includes(s.s);
export class RoomTime {
  constructor(ctx, peers, send) {
    Object.assign(this, { ctx, peers, send, cur: null, last: new WeakMap(), chain: Promise.resolve() });
    this.ready = ctx.storage.get('world-time-v2').then(async s => { this.cur = valid(s) ? s : { v: WORLD_TIME.version, q: 0, stamp: worldNow(), at: Date.now(), p: 0, s: 0 }; if (!valid(s)) await ctx.storage.put('world-time-v2', this.cur); });
  }
  welcome(now = Date.now()) { const c = this.cur; return { v: WORLD_TIME.version, q: c.q, stamp: timelineAt(c, now), p: c.p, s: c.s }; }
  reply(ws, why, now) { this.send(ws, JSON.stringify({ t: 'tm', ...this.welcome(now), ...(why ? { why } : {}) })); }
  handle(ws, a, m, now = Date.now()) {
    const work = this.chain.then(async () => {
      await this.ready;
      if (m.k === 'get') return this.reply(ws, null, now);
      if (now - (this.last.get(ws) ?? -Infinity) < WORLD_TIME.every) return this.reply(ws, 'fast', now);
      this.last.set(ws, now);
      if (m.q !== this.cur.q) return this.reply(ws, 'stale', now);
      if (m.k === 'set' && Math.abs(m.stamp - worldNow(now)) > WORLD_TIME.maxOffset) return this.reply(ws, 'range', now);
      const next = { v: WORLD_TIME.version, q: this.cur.q + 1, at: now, ...(m.k === 'now' ? { stamp: worldNow(now), p: 0, s: 0 } : { stamp: m.stamp, p: m.p, s: m.s }) };
      try { await this.ctx.storage.put('world-time-v2', next); }
      catch { return this.reply(ws, 'storage', now); } // failure releases the sender, never publishes a new revision
      this.cur = next; // persist before publishing/ACK
      const out = JSON.stringify({ t: 'tm', i: a.i, ...this.welcome(now) });
      for (const x of this.peers()) this.send(x.ws, out);
    });
    this.chain = work.catch(() => {}); return work;
  }
  // No empty-room reset: both running and intentionally paused/spooled reference survive.
  trim() {}
}
