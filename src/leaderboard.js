import { LEADERBOARD as L } from './config.js';

// The global leaderboard (#198): with the shared world on (cloud.js's address) the start screen asks for a name
// (optional — skipping it never holds up the start, you are just not on the list) and shows the top list, which
// is also at the bottom of the statistics panel (Tab). The score (stats.js totalScore) is sent when it has
// changed, at most every L.every s, and with sendBeacon when the tab is hidden or closed. One row per browser: a
// random player id in localStorage. Names are only ever shown as text (escaped). Off (no address): nothing shows,
// nothing is sent.

const NAME = 'lunden.name', PID = 'lunden.playerId';
const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* blocked */ } };
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export class Leaderboard {
  /** url: the Worker ('' = off); score(): the current score; nameRow / input / list: start-screen elements. */
  constructor(url, score, { nameRow, input, list }) {
    Object.assign(this, { url, score, input, list, top: [], sent: null });
    if (!this.on) return;
    let id = get(PID);
    if (!id) { id = crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`; set(PID, id); }
    this.id = id;
    nameRow.hidden = false;
    input.maxLength = L.nameMax;
    input.value = get(NAME) ?? '';
    input.addEventListener('input', () => { set(NAME, this.name); this.sent = null; });
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') input.blur(); }); // typing never drives the game
    this.refresh();
    this.timer = setInterval(() => this.send(), L.every * 1000);
    const bye = () => this.beacon();
    addEventListener('pagehide', bye);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') bye(); });
  }

  get on() { return !!this.url; }
  get name() { return (this.input.value ?? '').replace(/[\u0000-\u001f<>&"]/g, '').trim().slice(0, L.nameMax); }

  async refresh() {
    try {
      const r = await fetch(`${this.url}/scores`, { cache: 'no-store' });
      if (r.ok) this.show(await r.json());
    } catch { /* offline: the old list stays */ }
  }

  body() { return JSON.stringify({ id: this.id, name: this.name, score: this.score() }); }

  /** Send the score if it changed (and there is a name); the answer is the new top list. */
  async send() {
    if (!this.on || !this.name) return;
    const s = this.score();
    if (s === this.sent) { this.refresh(); return; }
    try {
      // text/plain: a "simple" request, no CORS preflight (the Worker reads the JSON anyway)
      const r = await fetch(`${this.url}/scores`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: this.body() });
      if (r.ok) { this.sent = s; this.show(await r.json()); }
    } catch { /* offline: next time */ }
  }

  beacon() {
    if (!this.on || !this.name || this.score() === this.sent) return;
    if (navigator.sendBeacon?.(`${this.url}/scores`, new Blob([this.body()], { type: 'text/plain' }))) this.sent = this.score();
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
