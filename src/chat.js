import { CHAT } from './config.js';
import { setIcon } from './hudicons.js';
import { ANON } from './ghosts.js';

// The chat (#675): while the players' room (#666, src/ghosts.js) is on, the console (>_ / § / Enter) sends what you write
// to the others; a code or a line starting with '/' stays a cheat (src/cheats.js `isCommand`, run in main.js, never sent).
// Lines show see-through in a column on the left (#chat-log, a DOM overlay: no draw calls), newest at the bottom, at most
// CHAT.show, each fading out after CHAT.ttl s. The button beside it (#chat-toggle) hides / shows the column (remembered in
// localStorage CHAT.hiddenKey); hidden, it counts what came in meanwhile. Text is plain text everywhere (textContent).
// Without the room (no cloud, ?mp=0, the month's cap reached) none of this shows and the console is the old one.

/** Plain text as the room cleans it (cloudflare/players.js `cleanText`): control, zero-width and bidi characters out,
 * whitespace folded, at most CHAT.max characters. */
export function cleanText(s) {
  if (typeof s !== 'string') return '';
  const t = s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2028\u2029\u2060-\u206f\ufeff\ufff9-\ufffb]/g, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(t).slice(0, CHAT.max).join('').trim();
}
/** A name as the room cleans it (players.js `cleanName`), "Anonym" without one. */
const cleanName = (s) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f<>&"]/g, '').trim().slice(0, 20) : '') || ANON;

export class Chat {
  /** ghosts: the Ghosts; log: the column element; toggle: its hide / show button; name(): our name. */
  constructor({ ghosts, log, toggle, name = () => '' }) {
    Object.assign(this, { ghosts, log, toggle, name, lines: [], unseen: 0, tokens: CHAT.burst, refilled: 0, open: false, sent: 0 });
    try { this.hidden = localStorage.getItem(CHAT.hiddenKey) === '1'; } catch { this.hidden = false; }
    ghosts.onTalk = (m, g) => this.heard(m, g);
    toggle?.addEventListener('click', (e) => { e.preventDefault(); this.hide(!this.hidden); });
    this.render();
  }

  /** The room is there to talk to: otherwise the console is the plain cheat console. */
  get available() { return !!this.ghosts.on && !this.ghosts.capped; }

  /** Send a line; returns what the console should say ('' = sent, close it). */
  send(raw) {
    const text = cleanText(raw);
    if (!text) return '';
    if (!this.ghosts.connected) return 'Chatten är inte ansluten just nu. Försök igen om en stund.';
    const t = performance.now();
    this.tokens = Math.min(CHAT.burst, this.tokens + (t - this.refilled) / CHAT.everyMs); this.refilled = t;
    if (this.tokens < 1) return 'Lugn i stormen – vänta en sekund.';
    let m = text; // the room takes at most 256 characters of JSON (quotes and backslashes count twice)
    while (JSON.stringify({ t: 'm', m }).length > 250) m = Array.from(m).slice(0, -1).join('');
    if (!this.ghosts.talk({ t: 'm', m })) return 'Chatten är inte ansluten just nu. Försök igen om en stund.';
    this.tokens--; this.sent++;
    this.add(cleanName(this.name()), m, true);
    return '';
  }

  /** From the room: a line from someone ({ t: 'm', i, n, m }) or our own refused ({ t: 'mx' }). */
  heard(m) {
    if (m.t === 'mx') { this.add('', 'För många meddelanden – vänta lite.', true, true); return; }
    const text = cleanText(m.m);
    if (text) this.add(cleanName(m.n), text);
  }

  add(name, text, mine = false, note = false) {
    const el = document.createElement('div');
    el.className = `chat-line${mine ? ' mine' : ''}${note ? ' note' : ''}`;
    if (name) { const b = document.createElement('b'); b.textContent = name; el.append(b, ' '); }
    el.append(document.createTextNode(text));
    this.log.append(el);
    this.lines.push({ el, t: CHAT.ttl });
    while (this.lines.length > CHAT.show) this.lines.shift().el.remove();
    if (this.hidden && !mine) this.unseen++;
    this.render();
  }

  hide(on) {
    this.hidden = on;
    if (!on) this.unseen = 0;
    try { localStorage.setItem(CHAT.hiddenKey, on ? '1' : '0'); } catch { /* not remembered */ }
    this.render();
  }

  /** The console is open in chat mode (the toggle shows then too). */
  opened(on) { this.open = on; this.render(); }

  render() {
    const avail = this.available;
    this.log.hidden = !avail || this.hidden;
    if (!this.toggle) return;
    this.toggle.hidden = !avail || !(this.open || this.lines.length || this.unseen || (this.hidden && this.open));
    setIcon(this.toggle, this.hidden ? 'chat-off' : 'chat', this.hidden ? 'Visa chatten' : 'Dölj chatten');
    this.toggle.setAttribute('aria-pressed', String(this.hidden));
    this.toggle.dataset.unseen = this.hidden && this.unseen ? String(Math.min(this.unseen, 99)) : '';
  }

  /** Each frame: lines fade out and go after CHAT.ttl s. */
  update(dt) {
    if (!this.lines.length) return;
    let gone = false;
    for (const l of this.lines) {
      l.t -= dt;
      if (l.t < CHAT.fade) l.el.style.opacity = String(Math.max(0, l.t / CHAT.fade));
      if (l.t <= 0) { l.el.remove(); gone = true; }
    }
    if (gone) { this.lines = this.lines.filter((l) => l.t > 0); if (!this.lines.length && this.hidden) this.unseen = 0; this.render(); }
  }

  /** For tests: what the column shows. */
  list() { return this.lines.map((l) => ({ text: l.el.textContent, mine: l.el.classList.contains('mine'), opacity: l.el.style.opacity })); }
}
