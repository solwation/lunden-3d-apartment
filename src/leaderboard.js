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

const SKIP = 'lunden.nameSkipped';
const getSession = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const setSession = (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* blocked */ } };

export class Leaderboard {
  /** url: the Worker ('' = off); score(): the current score; elements: dialog, badge, input, list, etc. */
  constructor(url, score, { dialog, badge, display, nameRow, input, list, ok, skip, newPlayer, lbDialog, dialogList, onNewPlayer = () => {} }) {
    Object.assign(this, { url, score, dialog, badge, display, nameRow, input, list, ok, skip, newPlayer, lbDialog, dialogList, onNewPlayer,
      top: [], sent: null, switching: false, dialogMode: 'initial', activePlayers: null });
    if (!this.on) return;
    this.confirmedName = cleanName(get(NAME));
    this.id = get(PID) || (this.confirmedName ? uid() : null);
    if (this.id) set(PID, this.id);
    if (nameRow) nameRow.hidden = false;
    input.maxLength = L.nameMax;
    input.value = this.confirmedName;
    this.renderIdentity();
    ok?.addEventListener('click', () => this.confirmName());
    skip?.addEventListener('click', () => this.handleSkip());
    newPlayer?.addEventListener('click', () => this.openDialog('new'));
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); this.confirmName(); }
      else if (e.key === 'Escape') { e.preventDefault(); this.handleSkip(); }
    });
    // On start screen: if player hasn't confirmed name and hasn't skipped this session, open dialog
    if (!this.confirmedName && getSession(SKIP) !== '1') {
      this.openDialog('initial');
    }
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
    if (this.badge) this.badge.hidden = !this.name;
    if (this.display) this.display.textContent = this.name || 'Anonym';
  }

  openDialog(mode = 'initial') {
    if (!this.dialog) return;
    this.dialogMode = mode;
    const title = this.dialog.querySelector('#player-dialog-title');
    const desc = this.dialog.querySelector('#player-dialog-desc');
    if (mode === 'new') {
      if (title) title.textContent = 'Byt spelare';
      if (desc) desc.textContent = 'Starta en ny spelsession med noll poäng och ett nytt namn. Det tidigare resultatet sparas på topplistan.';
      if (this.skip) this.skip.textContent = 'Avbryt';
      this.input.disabled = false;
      this.input.value = '';
      if (this.ok) this.ok.hidden = false;
    } else {
      if (title) title.textContent = 'Välj spelarnamn';
      if (desc) desc.textContent = 'Skriv in ett namn om du vill synas på topplistan. Du kan även hoppa över och spela anonymt.';
      if (this.skip) this.skip.textContent = 'Hoppa över';
      this.input.disabled = !!this.name;
      this.input.value = this.name;
      if (this.ok) this.ok.hidden = !!this.name;
    }
    this.dialog.hidden = false;
    setTimeout(() => { this.input.focus(); }, 50);
  }

  closeDialog() {
    if (this.dialog) this.dialog.hidden = true;
  }

  openLeaderboardDialog() {
    if (!this.lbDialog) return;
    this.refresh();
    this.renderDialogList();
    this.lbDialog.hidden = false;
  }

  closeLeaderboardDialog() {
    if (this.lbDialog) this.lbDialog.hidden = true;
  }

  renderDialogList() {
    if (!this.dialogList) return;
    const r = this.rows();
    this.dialogList.innerHTML = r || '<li><span>Inga resultat ännu</span></li>';
  }

  handleSkip() {
    if (!this.dialog || this.dialog.hidden) return;
    if (this.dialogMode === 'initial') {
      setSession(SKIP, '1');
    }
    this.renderIdentity();
    this.closeDialog();
  }

  confirmName() {
    if (this.switching) return;
    const name = cleanName(this.input.value);
    if (!name) { this.input.focus(); return; }
    if (this.dialogMode === 'new') {
      // Switching to a new player
      this.closeDialog();
      this.startNewPlayer(name);
      return;
    }
    if (this.name) { this.closeDialog(); return; }
    this.confirmedName = name;
    this.id = uid();
    set(NAME, name); set(PID, this.id);
    this.input.value = name;
    this.renderIdentity();
    this.input.blur();
    this.closeDialog();
    this.send();
  }

  startNewPlayer(newName = null) {
    if (this.switching) return;
    this.beacon(); // captures the old id/name/score before anything is reset; queue survives reload
    this.switching = true;
    clearInterval(this.timer);
    if (newName) {
      set(NAME, newName);
      set(PID, uid());
    } else {
      remove(NAME);
      remove(PID);
    }
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
    this.renderDialogList();
  }

  rows() {
    const me = this.name;
    return this.top.map((r, i) => {
      const date = Number.isFinite(r.updated) ? new Date(r.updated).toLocaleDateString('sv-SE') : '';
      return `<li${r.name === me ? ' class="me"' : ''}><span>${i + 1}. ${esc(r.name)}${date ? ` <small>${date}</small>` : ''}</span><b>${Number(r.score) | 0}</b></li>`;
    }).join('');
  }

  getActiveNames() {
    return typeof this.activePlayers === 'function' ? this.activePlayers() : (this.activePlayers || []);
  }

  activePlayersHtml() {
    const list = this.getActiveNames();
    if (!list || !list.length) return '';
    const namesText = list.map((n) => esc(n)).join(', ');
    return `<div class="lb-presence"><h3>Aktiva spelare just nu (${list.length})</h3><p>${namesText}</p></div>`;
  }

  /** The statistics panel's part (stats.js renders it under its rows). */
  html() {
    if (!this.on) return '';
    return `<div class="lb-head"><span>⭐ Din poäng</span><b>${this.score()}</b></div>${this.top.length ? `<ol class="lb">${this.rows()}</ol>` : ''}${this.activePlayersHtml()}`;
  }
}
