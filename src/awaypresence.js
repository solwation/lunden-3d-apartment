// #2216: away presence, the timeline of a player who closed their socket on purpose (tab hidden, start screen, standing still).
// Pure, no DOM or runtime: the players' room (cloudflare/players.js) keeps one entry per away player — their last state, lives and
// a per-tab token — for AWAY.ms, shows them to the others as a state with `aw: 1`, and sends the leave (`x`) only when the entry
// is due. A reconnect with the same token and name within the time takes the entry back (same id: no leave, no join, no
// duplicate). The token is never relayed to the others. Tunables: AWAY in config.js.
import { AWAY } from './config.js';

/** A client's away token (?a=), or '' when it is not one: 12–32 lower-case letters / digits. */
export const cleanAwayToken = (s) => (typeof s === 'string' && /^[a-z0-9]{12,32}$/.test(s) ? s : '');

/** A fresh random token for this tab (the client keeps it in sessionStorage). */
export function newAwayToken(rand = () => Math.random()) {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  if (globalThis.crypto?.getRandomValues) for (const v of crypto.getRandomValues(new Uint8Array(20))) s += abc[v % abc.length];
  else for (let k = 0; k < 20; k++) s += abc[Math.floor(rand() * abc.length)];
  return s;
}

/** The state shown while away: unarmed (no combat with a figure nobody plays), not dancing, no cue raised, the jetpack not thrusting. */
export function awayState(s) {
  if (!s || typeof s !== 'object') return s ?? null;
  const o = { ...s };
  delete o.h; delete o.dn; delete o.cq;
  if (o.jp === 2) o.jp = 1;
  return o;
}

export class AwayRoster {
  /** `list`: saved entries { i, n, s, l, healAt?, tok, until } (from storage); `ms` / `max` default to AWAY. */
  constructor(list = [], ms = AWAY.ms, max = AWAY.max) {
    this.ms = ms; this.max = max;
    this.list = Array.isArray(list) ? list.filter((e) => e && typeof e.i === 'string' && cleanAwayToken(e.tok) && Number.isFinite(e.until)) : [];
  }

  get size() { return this.list.length; }

  /** The player `a` (a room attachment with a last state) went away at `now`. Returns the entries that leave now (oldest first): an
   * older one with the same token (a duplicated tab) and those pushed out by `max`. */
  add(a, tok, now) {
    const gone = this.list.filter((e) => e.tok === tok && e.i !== a.i);
    this.list = this.list.filter((e) => e.i !== a.i && e.tok !== tok);
    this.list.push({ i: a.i, n: a.n ?? '', s: awayState(a.s), l: a.l, ...(Number.isFinite(a.healAt) ? { healAt: a.healAt } : {}), tok, until: now + this.ms });
    return this.list.length > this.max ? gone.concat(this.list.splice(0, this.list.length - this.max)) : gone;
  }

  /** The entry for a reconnect with `tok`, taken out of the roster, or null (none, or already due at `now`). */
  take(tok, now) {
    if (!cleanAwayToken(tok)) return null;
    const k = this.list.findIndex((e) => e.tok === tok && e.until > now);
    return k < 0 ? null : this.list.splice(k, 1)[0];
  }

  /** The entries due at `now` (their leave is sent now), taken out of the roster. */
  due(now) {
    const out = this.list.filter((e) => e.until <= now);
    if (out.length) this.list = this.list.filter((e) => e.until > now);
    return out;
  }

  /** When the next entry is due (ms), or null. */
  next() { return this.list.length ? Math.min(...this.list.map((e) => e.until)) : null; }

  /** What the others see: the welcome's `ps` rows / the state broadcast ({ i, n, ...s, l, aw: 1 }; never the token). */
  rows(lives) { return this.list.map((e) => AwayRoster.row(e, lives)); }
  static row(e, lives) { return { i: e.i, n: e.n, ...(e.s ?? {}), l: e.l ?? lives, aw: 1 }; }

  clear() { const had = this.list.length > 0; this.list = []; return had; }
}
