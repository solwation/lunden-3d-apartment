import { BOARD_LISTS, boardCounters } from './boardcatalog.js';
import { portraitThumb } from './playerportraits.js';
import { playerLocalStorage as localStorage } from './playerprofiles.js';
// The alternative top lists (#1710, part of #1709): the picker in the "Topplista" dialog (Totalpoäng is the default; the
// choice is kept in localStorage) and the counter sync to the Worker's /boards (cloudflare/boards.js). The sync is generic:
// it sends the counters of src/boardcatalog.js COUNTERS (stats.js numbers) for this player id at most once a minute and
// only when something changed (the Worker keeps one stored row per id and also refuses writes closer than 30 s); the
// achievements (#1711) reuse it by reading the same counters. Names are only ever shown as text.
const PICK = 'lunden.board', EVERY = 60_000;
const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* blocked */ } };
const fmt = (n) => Number(n).toLocaleString('sv-SE');

export class Boards {
  /** leaderboard: src/leaderboard.js (id, name, lookCode, url, mine(), fill()); stats: the counters; select/list: the dialog's elements. */
  constructor(leaderboard, stats, { select, list, hint }) {
    Object.assign(this, { lb: leaderboard, stats, select, list, hint, lists: null, sent: '', pick: get(PICK) || 'score' });
    if (!BOARD_LISTS.some((l) => l.id === this.pick)) this.pick = 'score';
    this.build();
    select?.addEventListener('change', () => { this.pick = select.value; set(PICK, this.pick); this.lb.renderDialogList(); this.refresh(); });
    if (this.on) {
      this.timer = setInterval(() => this.send(), EVERY);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.send(true); });
      setTimeout(() => this.send(), 5000);
    }
  }

  get on() { return !!this.lb.url; }
  /** A non-default list is selected: the leaderboard hands the dialog list over to us. */
  active() { return this.pick !== 'score'; }
  current() { return BOARD_LISTS.find((l) => l.id === this.pick); }

  build() {
    const s = this.select; if (!s) return;
    const group = (label, items) => { const g = document.createElement('optgroup'); g.label = label; for (const [v, t] of items) g.append(new Option(t, v)); return g; };
    s.replaceChildren(new Option('Totalpoäng', 'score'),
      group('Flest', BOARD_LISTS.filter((l) => l.kind === 'most').map((l) => [l.id, l.title])),
      group('Först', BOARD_LISTS.filter((l) => l.kind === 'first').map((l) => [l.id, l.title])));
    s.value = this.pick;
  }

  body() { return JSON.stringify({ id: this.lb.id, name: this.lb.name, c: boardCounters(this.stats), ...(this.lb.lookCode ? { avatar: this.lb.lookCode } : {}) }); }

  /** Send the counters when they changed since the last accepted send. */
  async send(beacon = false) {
    if (!this.on || this.lb.switching) return;
    const body = this.body(), c = JSON.stringify(boardCounters(this.stats));
    if (c === '{}' || c + this.lb.name + this.lb.lookCode === this.sent) return;
    try {
      if (beacon && navigator.sendBeacon) { if (navigator.sendBeacon(`${this.lb.url}/boards`, new Blob([body], { type: 'text/plain' }))) this.sent = c + this.lb.name + this.lb.lookCode; return; }
      const r = await fetch(`${this.lb.url}/boards`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body, keepalive: true });
      if (r.ok) { this.sent = c + this.lb.name + this.lb.lookCode; this.onMedals?.((await r.json().catch(() => null))?.m); }
    } catch { /* offline: the next tick retries */ }
  }

  /** The medals the Worker has for this player id (#1711): a new device gets them back; read-only on the server. */
  async restore() {
    if (!this.on) return null;
    try {
      const r = await fetch(`${this.lb.url}/boards`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ id: this.lb.id, restore: true }) });
      return r.ok ? ((await r.json()).m ?? null) : null;
    } catch { return null; }
  }

  async refresh() {
    if (!this.on || !this.active()) return;
    try {
      const r = await fetch(`${this.lb.url}/boards`, { cache: 'no-store' });
      if (r.ok) { this.lists = (await r.json()).lists ?? {}; this.render(); }
    } catch { /* offline: the old list stays */ }
  }

  /** Draw the selected list into the dialog's list element. */
  render() {
    const l = this.current(), el = this.list; if (!l || !el) return;
    if (this.hint) this.hint.textContent = l.kind === 'first' ? 'Den som först nådde det här i spelet.' : '';
    const rows = this.lists?.[l.id] ?? [];
    const items = rows.map((r, i) => {
      const li = document.createElement('li'); if (this.lb.mine(r)) li.className = 'me';
      const who = document.createElement('span'); who.className = 'lb-who';
      const label = document.createElement('span'); label.textContent = `${i + 1}. ${r.name || 'Anonym'}`;
      who.append(portraitThumb(r.avatar), label);
      const v = document.createElement('b');
      v.textContent = l.kind === 'first' ? new Date(r.value).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' }) : `${fmt(r.value)} ${l.unit}`;
      li.append(who, v); return li;
    });
    if (!items.length) { const li = document.createElement('li'), t = document.createElement('span'); t.textContent = this.lists ? 'Ingen har hamnat på den här listan ännu' : 'Hämtar listan…'; li.append(t); items.push(li); }
    el.replaceChildren(...items);
  }
}
