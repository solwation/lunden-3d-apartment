import { CHORE_SYNC } from '../src/config.js';
import { cleanChore } from '../src/choresync.js';

// #1976: who completed which goal of the day's chores, so that everybody who helped is paid (the protocol and the rules are in
// src/choresync.js). MEMORY ONLY (no KV, no storage): the room forgets when it is evicted, and then an absent helper's points lapse
// (the user's choice, 2026-11-15). Bounded: CHORE_SYNC.days days, CHORE_SYNC.goals goals a day, CHORE_SYNC.helpers helpers a goal.

/** A chore message from a client (text), or null. */
export function cleanChoreText(text) { try { return cleanChore(JSON.parse(text)); } catch { return null; } }

export class RoomChores {
  constructor(send, peers) { Object.assign(this, { send, peers, days: new Map() }); } // day -> Map('chore|goal' -> Map(helper key -> name))
  rows(u) {
    const out = [];
    for (const [d, goals] of this.days) for (const [key, who] of goals) {
      const [i, g] = key.split('|'), mine = who.has(u);
      out.push([d, i, g, mine ? 1 : 0, mine ? '' : [...who.values()][0] ?? '']);
    }
    return out;
  }
  handle(ws, a, m, now = Date.now()) {
    if (m.k === 'hi') {
      if (now - (a.chHi ?? 0) < 2000) return;
      a.chHi = now; a.chU = m.u;
      this.send(ws, JSON.stringify({ t: 'ch', k: 'L', rows: this.rows(m.u) }));
      return;
    }
    if (now - (a.chAt ?? 0) < CHORE_SYNC.every * 1000 * 0.8) return;
    a.chAt = now;
    let goals = this.days.get(m.d);
    if (!goals) {
      if (this.days.size >= CHORE_SYNC.days) this.days.delete([...this.days.keys()].sort()[0]); // the oldest day goes
      this.days.set(m.d, goals = new Map());
    }
    const key = `${m.i}|${m.g}`;
    let who = goals.get(key);
    if (!who) { if (goals.size >= CHORE_SYNC.goals) return; goals.set(key, who = new Map()); }
    const first = who.size === 0;
    if (!who.has(m.u) && who.size < CHORE_SYNC.helpers) who.set(m.u, typeof a.n === 'string' ? a.n.slice(0, CHORE_SYNC.name) : '');
    if (!first) return; // (the goal was already done for everybody: only the helper is noted)
    const out = JSON.stringify({ t: 'ch', k: 'g', d: m.d, i: m.i, g: m.g, n: typeof a.n === 'string' ? a.n.slice(0, CHORE_SYNC.name) : '' });
    for (const { ws: x } of this.peers()) if (x !== ws) this.send(x, out);
  }
}
