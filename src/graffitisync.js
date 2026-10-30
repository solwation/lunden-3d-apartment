import { SPRAY as S } from './config.js';
import { spotWire, wireKey } from './graffitiwire.js';

// #1724: the spray paint shared with the other players through the players' room (cloudflare/graffiti.js has the protocol and
// the room's limits). Gossip: on joining the room sends what it holds ({ t: 'gf', w: 1, s }); we take the others' spots into our
// own store (graffiti.js `merge`, so they last across reloads, 72 h from when they were painted) and send the room, in blocks of
// S.share.block at most every S.share.every s, the spots it does not have yet — our stored ones first time, then each new one we
// paint. { t: 'gf', s } from the room = somebody else's new spots; { t: 'gf', k: 'ask' } = the room lost its memory (it
// hibernated): send everything again. Nothing is sent before the room's first snapshot (an older Worker sends none).
// `net`: { ready() → connected, send(msg) → false when it cannot take it now, me() → our id in the room (changes per connection) }.

export class GraffitiSync {
  constructor(graffiti, net) {
    Object.assign(this, { graffiti, net, room: null, known: new Set(), dirty: false, wait: 0, sent: 0, got: 0 });
    graffiti.onSpot = () => { this.dirty = true; };
  }

  receive(m) {
    if (m?.t !== 'gf') return;
    if (m.k === 'ask') { this.known.clear(); this.dirty = true; return; }
    if (!Array.isArray(m.s)) return;
    if (m.w) { this.room = this.net.me?.() ?? true; this.known = new Set(); this.dirty = true; }
    for (const a of m.s) if (Array.isArray(a)) this.known.add(wireKey(a));
    this.got += this.graffiti.merge(m.s);
  }

  /** The next block of spots the room does not have (newest first: what was just painted shows soonest), or null. */
  block() {
    const out = [], spots = this.graffiti.spots;
    for (let i = spots.length - 1; i >= 0 && out.length < S.share.block; i--) {
      const w = spotWire(spots[i]), k = wireKey(w);
      if (!this.known.has(k)) { out.push(w); this.known.add(k); }
    }
    return out.length ? out : null;
  }

  tick(dt) {
    if (!this.net.ready()) { this.room = null; return; }
    if (this.room === null || (this.net.me && this.room !== true && this.room !== this.net.me())) { this.room = null; return; } // a new connection: wait for its snapshot
    this.wait -= dt;
    if (!this.dirty || this.wait > 0) return;
    const list = this.block();
    if (!list) { this.dirty = false; return; }
    if (!this.net.send({ t: 'gf', s: list })) { for (const w of list) this.known.delete(wireKey(w)); return; } // busy: again next time
    this.sent += list.length; this.wait = S.share.every;
  }
}
