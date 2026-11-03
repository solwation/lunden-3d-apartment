import { BOULE_SYNC, cleanBoule, freshBoule, nearBoule, playBoule } from '../src/boulesync.js';
export { cleanBoule };
// One bounded DO record; latest revision is the duplicate/result ledger. No socket attachment state.
export class RoomBoule {
  constructor(ctx, peers, send) { this.ctx = ctx; this.peers = peers; this.send = send; this.last = new WeakMap(); this.chain = Promise.resolve(); this.state = { snap: freshBoule(), seats: [null, null], action: null }; this.ready = ctx.storage.get('boule').then(s => { if (s?.snap && Number.isSafeInteger(s.snap.q)) this.state = s; }); }
  snapshot(now = Date.now()) { const s = this.state, a = s.action; return { v: BOULE_SYNC.version, e: s.snap, seats: s.seats, ...(a && now - a.at < a.ms ? { action: { ...a, elapsed: Math.max(0, now - a.at) } } : {}) }; }
  msg(ws, why) { this.send(ws, JSON.stringify({ t: 'bl', ...this.snapshot(), ...(why ? { why } : {}) })); }
  handle(ws, a, cmd, now) { // serialize across storage awaits as well as same-tick races
    const work = this.chain.then(async () => {
      await this.ready;
      if (cmd.k === 'g') return this.msg(ws);
      if (!nearBoule(a.s?.p, cmd.k === 't')) return this.msg(ws, 'away');
      if (now - (this.last.get(ws) ?? -Infinity) < BOULE_SYNC.every) return this.msg(ws, 'fast');
      this.last.set(ws, now);
      const s = this.state;
      if (cmd.q !== s.snap.q) return this.msg(ws, 'stale');
      if (s.action && now < s.action.at + s.action.ms) return this.msg(ws, 'busy');
      const ids = new Set(this.peers().map(p => p.a?.i)); s.seats = s.seats.map(id => ids.has(id) ? id : null);
      const turn = s.snap.rules.turn;
      if (cmd.k === 't') {
        if (s.seats[turn] && s.seats[turn] !== a.i) return this.msg(ws, 'turn');
        const other = this.peers().some(p => p.a?.i !== a.i && nearBoule(p.a?.s?.p));
        if (s.seats[1 - turn] === a.i && other) return this.msg(ws, 'turn');
      }
      // Standing launch hand: existing 1.62 m eye minus 0.45 m (boule.js); server never trusts a client origin.
      const seed = (Math.random() * 4294967296) >>> 0, from = cmd.k === 't' ? [a.s.p[0], a.s.p[1] + 1.17, a.s.p[2]] : undefined;
      const result = playBoule(s.snap, cmd, seed, from); if (result.error) return this.msg(ws, result.error);
      const seats = [...s.seats]; if (cmd.k === 't') seats[turn] = a.i; if (cmd.k === 'r') seats.fill(null);
      const next = { snap: result.end, seats, action: result.ms ? { start: s.snap, cmd, seed, from, at: now, ms: result.ms } : null };
      await this.ctx.storage.put('boule', next); // persist before ACK: retry cannot credit a result twice
      this.state = next;
      for (const p of this.peers()) this.msg(p.ws);
    });
    this.chain = work.catch(() => {}); return work;
  }
}
