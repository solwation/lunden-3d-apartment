// Join / leave notices for the players' room (#1333). Pure logic, no DOM: ghosts.js feeds it the room's join ('j') and leave
// ('x') messages and main.js shows what it emits as a badge at the top of the screen.
// A leave is only announced after `graceMs` without the same player coming back: the client disconnects at once when its tab is
// hidden (Alt+Tab, a short tab switch), so a short absence must show neither "lämnade" nor a second "kom in". The same player
// is recognised by name + look code (the room gives every connection a new id). Notices within `batchMs` are merged into one
// line and the number of names in a line is capped, so a crowd does not flood the screen.
import { JOIN_NOTICE as P } from './config.js';

export class JoinNotice {
  /** `emit(text)` gets each finished notice; `now()` is the clock in ms (injectable for tests). */
  constructor(emit, now = () => performance.now()) {
    this.emit = emit; this.now = now;
    this.pending = new Map(); // key -> { name, at }: gone, leave notice not yet due
    this.queue = { join: [], leave: [] }; // names waiting for the batch
    this.flushAt = 0;
  }

  static key(name, look = '') { return `${name || ''}\u0000${look || ''}`; }

  /** Someone joined. A player who comes back within the grace period is the same presence: no notice at all. */
  joined(name, look = '') {
    if (this.pending.delete(JoinNotice.key(name, look))) return false;
    this.add('join', name);
    return true;
  }

  /** Someone left (their connection closed): the notice waits for the grace period. */
  left(name, look = '') {
    const k = JoinNotice.key(name, look);
    if (!this.pending.has(k)) this.pending.set(k, { name, at: this.now() + P.graceMs });
  }

  /** Forget everything (our own connection closed: nobody's absence is known any more). */
  reset() { this.pending.clear(); this.queue = { join: [], leave: [] }; this.flushAt = 0; }

  add(kind, name) {
    this.queue[kind].push(name || P.anon);
    if (!this.flushAt) this.flushAt = this.now() + P.batchMs;
  }

  /** Call about once a second: due leaves join the batch, a due batch is emitted. */
  tick() {
    const t = this.now();
    for (const [k, p] of this.pending) if (t >= p.at) { this.pending.delete(k); this.add('leave', p.name); }
    if (!this.flushAt || t < this.flushAt) return;
    this.flushAt = 0;
    const parts = [];
    for (const [kind, verb] of [['join', 'kom in i'], ['leave', 'lämnade']]) {
      const names = this.queue[kind]; this.queue[kind] = [];
      if (names.length) parts.push(`${list(names)} ${verb} spelet`);
    }
    for (const text of parts) this.emit(text);
  }
}

/** "Anna", "Anna och Bo", "Anna, Bo och Cia", "Anna, Bo, Cia och 2 till" (at most P.names named). */
export function list(names) {
  const n = names.length;
  if (n === 1) return names[0];
  if (n <= P.names) return `${names.slice(0, -1).join(', ')} och ${names[n - 1]}`;
  return `${names.slice(0, P.names).join(', ')} och ${n - P.names} till`;
}
