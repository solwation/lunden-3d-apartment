import { LEADERBOARD as L } from './config.js';

// The global leaderboard (#198): with the shared world on (cloud.js's address) the start screen asks for a name
// (optional — skipping it never holds up the start, you are just not on the list) and shows the top list, which
// is also at the bottom of the statistics panel (Tab). The score (stats.js totalScore) is sent when it has
// changed, at most every L.every s, and with sendBeacon when the tab is hidden or closed. One row per browser: a
// random player id in localStorage. Names are only ever shown as text (escaped). Off (no address): nothing shows,
// nothing is sent.

const NAME = 'lunden.name', PID = 'lunden.playerId', QUEUE = 'lunden.scoreQueue';
const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* blocked */ } };
const remove = (k) => { try { localStorage.removeItem(k); } catch { /* blocked */ } };
const cleanName = (name) => String(name ?? '').replace(/[\u0000-\u001f<>&"]/g, '').trim().slice(0, L.nameMax);
const uid = () => crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
const pending = () => { try { const q = JSON.parse(get(QUEUE) ?? '[]'); return Array.isArray(q) ? q : []; } catch { return []; } };
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export class Leaderboard {
  /** url: the Worker ('' = off); score(): the current score; nameRow / input / list: start-screen elements. */
  constructor(url, score, { nameRow, input, list, ok, newPlayer, onNewPlayer = () => {} }) {
    Object.assign(this, { url, score, input, list, ok, newPlayer, onNewPlayer, top: [], sent: null, switching: false });
    if (!this.on) return;
    this.confirmedName = cleanName(get(NAME));
    this.id = get(PID) || (this.confirmedName ? uid() : null);
    if (this.id) set(PID, this.id);
    nameRow.hidden = false;
    input.maxLength = L.nameMax;
    input.value = this.confirmedName;
    this.renderIdentity();
    ok?.addEventListener('click', () => this.confirmName());
    newPlayer?.addEventListener('click', () => this.startNewPlayer());
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); this.confirmName(); }
    });
    this.refresh();
    this.flush(); // upload results saved by the previous player, even before a new name is entered
    this.timer = setInterval(() => this.send(), L.every * 1000);
    const bye = () => this.beacon();
    addEventListener('pagehide', bye);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') bye(); });
  }

  get on() { return !!this.url; }
  get name() { return this.confirmedName ?? ''; }

  renderIdentity() {
    this.input.disabled = !!this.name;
    if (this.ok) this.ok.hidden = !!this.name;
    if (this.newPlayer) this.newPlayer.hidden = !this.name;
  }

  confirmName() {
    if (this.name || this.switching) return;
    const name = cleanName(this.input.value);
    if (!name) { this.input.focus(); return; }
    this.confirmedName = name;
    this.id = uid();
    set(NAME, name); set(PID, this.id);
    this.input.value = name;
    this.renderIdentity();
    this.input.blur();
    this.send();
  }

  startNewPlayer() {
    if (this.switching || !this.name) return;
    this.beacon(); // captures the old id/name/score before anything is reset; queue survives reload
    this.switching = true;
    clearInterval(this.timer);
    remove(NAME); remove(PID);
    this.onNewPlayer();
  }

  enqueue() {
    const payload = JSON.parse(this.body());
    set(QUEUE, JSON.stringify([...pending().filter((p) => p.id !== payload.id), payload]));
  }

  flush() {
    if (!this.on || this.switching) return Promise.resolve();
    this.flushing ??= this.drain().finally(() => { this.flushing = null; });
    return this.flushing;
  }

  async drain() {
    while (!this.switching) {
      const payload = pending()[0];
      if (!payload) return;
      try {
        const body = JSON.stringify(payload);
        const r = await fetch(`${this.url}/scores`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body });
        if (!r.ok) return;
        const top = await r.json();
        set(QUEUE, JSON.stringify(pending().filter((p) => JSON.stringify(p) !== body)));
        if (!this.switching) {
          if (payload.id === this.id && payload.name === this.name) this.sent = payload.score;
          this.show(top);
        }
      } catch { return; } // offline: retain completed players and retry after reconnect/reload
    }
  }

  async refresh() {
    try {
      const r = await fetch(`${this.url}/scores`, { cache: 'no-store' });
      if (r.ok) this.show(await r.json());
    } catch { /* offline: the old list stays */ }
  }

  body() { return JSON.stringify({ id: this.id, name: this.name, score: this.score() }); }

  /** Send the score if it changed (and there is a name); the answer is the new top list. */
  async send() {
    if (!this.on || this.switching) return;
    if (!this.name) return this.flush();
    const s = this.score();
    if (s !== this.sent) this.enqueue();
    await this.flush();
    if (s === this.sent) this.refresh();
  }

  beacon() {
    if (!this.on || !this.name || this.switching || this.score() === this.sent) return;
    this.enqueue();
    navigator.sendBeacon?.(`${this.url}/scores`, new Blob([this.body()], { type: 'text/plain' }));
  }

  show(top) {
    this.top = Array.isArray(top) ? top.slice(0, L.show) : [];
    this.list.hidden = !this.top.length;
    this.list.innerHTML = this.rows();
  }

  rows() {
    const me = this.name;
    return this.top.map((r, i) => {
      const date = Number.isFinite(r.updated) ? new Date(r.updated).toLocaleDateString('sv-SE') : '';
      return `<li${r.name === me ? ' class="me"' : ''}><span>${i + 1}. ${esc(r.name)}${date ? ` <small>${date}</small>` : ''}</span><b>${Number(r.score) | 0}</b></li>`;
    }).join('');
  }

  /** The statistics panel's part (stats.js renders it under its rows). */
  html() {
    if (!this.on) return '';
    return `<div class="lb-head"><span>⭐ Din poäng</span><b>${this.score()}</b></div>${this.top.length ? `<ol class="lb">${this.rows()}</ol>` : ''}`;
  }
}
