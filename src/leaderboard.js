import { drawPlayerPortrait } from './playerportraits.js';
import { profiles } from './playerprofiles.js';
import { deletePlayerPhotos } from './idb.js';
import { drawAvatarPreview } from './customizer.js';
import { decodeAvatarLook } from './config.js';
import { playerLocalStorage as localStorage, playerSessionStorage as sessionStorage } from './playerprofiles.js';
import { LEADERBOARD as L } from './config.js';

// The global leaderboard (#198): with the shared world on (cloud.js's address) the start screen asks for a name
// (optional — skipping it never holds up the start) and shows the top list, which is also at the bottom of the
// statistics panel (Tab). The score (stats.js totalScore) is sent when it has changed, at most every L.every s, and
// with sendBeacon when the tab is hidden or closed. One row per local player UUID. Without a
// name you are "Anonym" (#677: an own row with the name '', shown as "Anonym"; a name later renames the same row).
// Everybody shows up for others (#723 removed the opt-out box; an old 'lunden.share' value is just deleted). Names are
// only ever shown as text (escaped). Off (no address): nothing shows, nothing is sent.

const NAME = 'lunden.name', PID = 'lunden.playerId', QUEUE = 'lunden.scoreQueue';
const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* blocked */ } };
const remove = (k) => { try { localStorage.removeItem(k); } catch { /* blocked */ } };
const cleanName = (name) => String(name ?? '').replace(/[\u0000-\u001f<>&"]/g, '').trim().slice(0, L.nameMax);
const uid = () => crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
const pending = () => { try { const q = JSON.parse(get(QUEUE) ?? '[]'); return Array.isArray(q) ? q : []; } catch { return []; } };
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const SKIP = 'lunden.nameSkipped', OLD_SHARE = 'lunden.share'; // OLD_SHARE: the removed opt-out box (#723), cleaned away
export const ANON_NAME = 'Anonym';
const getSession = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const setSession = (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* blocked */ } };

export class Leaderboard {
  /** url: the Worker ('' = off); score(): the current score; elements: dialog, badge, input, list, etc. */
  constructor(url, score, { dialog, badge, display, nameRow, input, list, ok, skip, newPlayer, lbDialog, dialogList, onNewPlayer = () => {} }) {
    Object.assign(this, { url, score, dialog, badge, display, nameRow, input, list, ok, skip, newPlayer, lbDialog, dialogList, onNewPlayer,
      top: [], sent: null, switching: false, dialogMode: 'initial', activePlayers: null });
    this.confirmedName = cleanName(get(NAME));
    this.id = get(PID) || uid(); // anonymous players have a row too (#677)
    set(PID, this.id);
    remove(OLD_SHARE);
    if (nameRow) nameRow.hidden = false;
    const note = document.getElementById?.('share-note'); if (note) note.hidden = !this.on; // #723: you are visible to others
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
    if (this.on) this.refresh();
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
    if (this.newPlayer) this.newPlayer.hidden = false;
    if (this.badge) this.badge.hidden = false;
    if (this.display) this.display.textContent = this.name || ANON_NAME;
    this.renderAvatar();
  }

  renderAvatar(code = get('lunden.avatar')) {
    drawPlayerPortrait(this.badge?.querySelector('#player-avatar'), code, this.name);
  }

  openDialog(mode = 'initial') {
    if (!this.dialog) return;
    this.dialogMode = mode;
    const title = this.dialog.querySelector('#player-dialog-title');
    const desc = this.dialog.querySelector('#player-dialog-desc');
    if (mode === 'new') {
      if (title) title.textContent = 'Byt spelare';
      if (desc) desc.textContent = 'Välj en sparad spelare eller skriv ett nytt namn. Varje spelare har sitt eget utseende, hem, poäng och statistik.';
      if (this.skip) this.skip.textContent = 'Avbryt';
      this.input.disabled = false;
      this.input.value = '';
      if (this.ok) this.ok.hidden = false;
    } else {
      if (title) title.textContent = 'Välj spelarnamn';
      if (desc) desc.textContent = 'Skriv in ett namn om du vill synas på topplistan. Hoppar du över syns du som "Anonym", med din poäng, för andra spelare.';
      if (this.skip) this.skip.textContent = 'Hoppa över';
      this.input.disabled = !!this.name;
      this.input.value = this.name;
      if (this.ok) this.ok.hidden = !!this.name;
    }
    this.renderPlayers();
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
    if (!name) { if (this.dialogMode === 'new') this.input.focus(); else this.handleSkip(); return; } // empty: "Anonym" (#677)
    if (this.dialogMode === 'new') {
      // Switching to a new player
      this.closeDialog();
      this.startNewPlayer(name);
      return;
    }
    if (this.name) { this.closeDialog(); return; }
    this.confirmedName = name;
    this.sent = null; // (the new name must be sent even at the same score)
    set(NAME, name); // the same id: the anonymous row (if any) is renamed, not duplicated (#677)
    this.input.value = name;
    this.renderIdentity();
    this.input.blur();
    this.closeDialog();
    this.send();
  }

  async startNewPlayer(newName = null) {
    if (this.switching) return;
    this.beacon(); // captures the old id/name/score before anything is reset; queue survives reload
    this.switching = true;
    try {
      const target = profiles.create(newName || 'Anonym');
      await this.onNewPlayer(() => profiles.select(target));
    } catch (error) { this.switching = false; this.showPlayerError(error); }
  }

  showPlayerError(error) {
    const el = this.dialog?.querySelector('#player-error');
    if (el) { el.textContent = `Kunde inte spara spelarbytet: ${error.message}`; el.hidden = false; }
    if (this.dialog) this.dialog.hidden = false;
  }

  renderPlayers() {
    const list = this.dialog?.querySelector('#saved-players');
    if (!list || !profiles) return;
    list.replaceChildren();
    for (const p of profiles.list()) {
      const row = document.createElement('li');
      const pick = document.createElement('button'); pick.type = 'button'; pick.className = 'player-pick';
      const canvas = document.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true');
      drawAvatarPreview(canvas, decodeAvatarLook(p.avatar, p.name));
      const label = document.createElement('span'); label.textContent = `${p.name || ANON_NAME}${p.id === profiles.id ? ' (du)' : ''}`;
      pick.append(canvas, label); pick.addEventListener('click', async () => {
        if (p.id === profiles.id) { this.handleSkip(); return; }
        if (this.switching) return;
        this.beacon(); this.switching = true;
        try { await this.onNewPlayer(() => profiles.select(p.id)); } catch (error) { this.switching = false; this.showPlayerError(error); }
      });
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Ta bort';
      remove.setAttribute('aria-label', `Ta bort ${p.name || ANON_NAME}`);
      remove.addEventListener('click', async () => {
        if (this.switching || !confirm(`Vill du verkligen ta bort kontot ”${p.name || ANON_NAME}” och all dess lokala speldata, inklusive utseende, foton, poäng och statistik? Det går inte att ångra. Delade teckningar och publicerade topplisteresultat finns kvar.`)) return;
        remove.disabled = true;
        try {
          if (p.id === profiles.id) {
            this.switching = true;
            await this.onNewPlayer(() => profiles.remove(p.id, deletePlayerPhotos), { discard: true });
          } else { await profiles.remove(p.id, deletePlayerPhotos); this.renderPlayers(); }
        } catch (error) { this.switching = false; remove.disabled = false; this.showPlayerError(error); }
      });
      row.append(pick, remove); list.append(row);
    }
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
    if (!this.on) return;
    try {
      const r = await fetch(`${this.url}/scores`, { cache: 'no-store' });
      if (r.ok) this.show(await r.json());
    } catch { /* offline: the old list stays */ }
  }

  body() { return JSON.stringify({ id: this.id, name: this.name, score: this.score() }); }

  /** Send the score if it changed (and there is a name); the answer is the new top list. */
  async send() {
    if (!this.on || this.switching) return;
    const s = this.score();
    if (!this.name && !s) return this.flush(); // nothing to show for an anonymous player yet

    if (s !== this.sent) this.enqueue();
    await this.flush();
    if (s === this.sent) this.refresh();
  }

  beacon() {
    if (!this.on || (!this.name && !this.score()) || this.switching || this.score() === this.sent) return;
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
      return `<li${me && r.name === me ? ' class="me"' : ''}><span>${i + 1}. ${esc(r.name || ANON_NAME)}${date ? ` <small>${date}</small>` : ''}</span><b>${Number(r.score) | 0}</b></li>`;
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
    return `<div class="lb-head"><span>⭐ Din poäng</span><b>${this.score()}</b></div>${this.top.length ? `<ol class="lb">${this.rows()}</ol>` : ''}`;
  }
}
