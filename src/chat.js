import * as THREE from 'three';
import { CHAT, GHOSTS } from './config.js';
import { setIcon } from './hudicons.js';
import { ANON } from './ghosts.js';
import { gameView } from './viewport.js';
import { censor } from './chatfilter.js';

// The chat (#675): while the players' room (#666, src/ghosts.js) is on, the console (>_ / § / Enter) sends what you write
// to the others; a code or a line starting with '/' stays a cheat (src/cheats.js `isCommand`, run in main.js, never sent).
// Lines show see-through in a column on the left (#chat-log, a DOM overlay: no draw calls), newest at the bottom, at most
// CHAT.show, each fading out after CHAT.ttl s. The button beside it (#chat-toggle) hides / shows the column (remembered in
// localStorage CHAT.hiddenKey); hidden, it counts what came in meanwhile. Text is plain text everywhere (textContent).
// Without the room (no cloud, ?mp=0, the month's cap reached) none of this shows and the console is the old one.
//
// Bubbles (#676): while someone writes, "skriver…" (three dots) floats over their ghost; their sent line replaces it, for
// CHAT.ttl s or until their next line. Only the flag goes to the room ({ t: 'k', on }), never the letters: on at the first
// key, again every CHAT.typingAgain ms while still typing, off when sent, closed, or after CHAT.typingMs without a key;
// someone else's goes off by itself after CHAT.typingStale ms without word (a lost connection), and with their ghost.
// Each bubble is one DOM element in the speech layer (greet.js's `.say` style, no draw calls), placed over the ghost's
// tag, smaller further away, hidden with the tag (far away, behind a wall, off screen). There is no own body in first
// person: your own "Du skriver…" and lines are in the column. Shown also while the column is hidden (#675's button).
const tmp = new THREE.Vector3();

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
  /** ghosts: the Ghosts; log: the column element; toggle: its hide / show button; name(): our name; camera + layer (the
   * speech bubbles' element) + hidden(p) (a wall between the eye and p) for the bubbles over the ghosts (#676). */
  constructor({ ghosts, log, toggle, name = () => '', camera = null, layer = null, hidden = () => false, typingLine = null }) {
    Object.assign(this, { ghosts, log, toggle, name, camera, layer, behind: hidden, typingLine, lines: [], unseen: 0, tokens: CHAT.burst, refilled: 0, open: false, sent: 0,
      bubbles: new Map(), typing: false, lastKey: 0, lastOn: 0, muted: new Set() });
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
    let m = censor(text); // (#719: shown as the others will see it) the room takes at most 256 characters of JSON (quotes and backslashes count twice)
    while (JSON.stringify({ t: 'm', m }).length > 250) m = Array.from(m).slice(0, -1).join('');
    if (!this.ghosts.talk({ t: 'm', m })) return 'Chatten är inte ansluten just nu. Försök igen om en stund.';
    this.tokens--; this.sent++;
    this.typing = false; // (the room puts our "skriver…" off with the line)
    this.add(cleanName(this.name()), m, true);
    return '';
  }

  /** A key in the chat field (#676): "skriver…" on for the others (only the flag, never the letters). */
  keyed() {
    if (!this.open || !this.ghosts.connected) return;
    const t = performance.now();
    this.lastKey = t;
    if (!this.typing || t - this.lastOn >= CHAT.typingAgain) { // on, or again while still typing (theirs goes stale otherwise)
      if (!this.ghosts.talk({ t: 'k', on: true })) return;
      this.lastOn = t;
      if (!this.typing) { this.typing = true; this.renderTyping(); }
    }
  }

  stopTyping() {
    if (!this.typing) return;
    this.typing = false;
    this.ghosts.talk({ t: 'k', on: false });
    this.renderTyping();
  }

  isMuted(name) { return this.muted.size > 0 && this.muted.has(String(name).toLowerCase()); }

  /** Chat commands (#719), or null for anything else: `/tysta namn` hides that player's lines and bubbles here until the
   * page is reloaded (by name: the ids change with every connection; "Anonym" mutes every nameless one), `/tysta` lists,
   * `/prata namn` / `/prata` undoes one / all. Nothing is sent or stored. */
  command(line) {
    const m = /^\s*\/(tysta|prata)(?:\s+(.*))?$/i.exec(line);
    if (!m) return null;
    const name = cleanName(m[2] ?? '').trim(), key = name.toLowerCase(), named = !!m[2]?.trim();
    if (m[1].toLowerCase() === 'prata') {
      if (!named) { this.muted.clear(); return 'Ingen är tystad längre.'; }
      return this.muted.delete(key) ? `Du ser vad ${name} skriver igen.` : `${name} var inte tystad.`;
    }
    if (!named) return this.muted.size ? `Tystade: ${[...this.muted].join(', ')}. /prata namn ångrar.` : 'Ingen är tystad. Skriv /tysta och ett namn.';
    if (key === cleanName(this.name()).toLowerCase() && key !== ANON.toLowerCase()) return 'Du kan inte tysta dig själv.';
    this.muted.add(key);
    for (const [id, b] of this.bubbles) if (b.ghost.name.toLowerCase() === key) this.unbubble(id);
    return `Du ser inte längre vad ${name} skriver (tills sidan laddas om). /prata ${name} ångrar.`;
  }

  /** The chat's own commands, for help. */
  get help() { return '/tysta namn — dölj en spelares chatt (tills du laddar om)\n/prata namn — visa den igen'; }

  /** From the room: a line from someone ({ t: 'm', i, n, m }), our own refused ({ t: 'mx' }), someone's "skriver…" ({ t: 'k', i, on }). */
  heard(m, g) {
    if (m.t === 'mx') { this.add('', 'För många meddelanden – vänta lite.', true, true); return; }
    if (this.isMuted(g?.name ?? cleanName(m.n))) return; // (#719: muted here, lines and bubbles alike)
    if (m.t === 'k') { if (g) { if (m.on) this.bubble(g, null); else if (this.bubbles.get(g.id)?.typing) this.unbubble(g.id); } return; }
    const text = censor(cleanText(m.m));
    if (!text) return;
    this.add(cleanName(m.n), text);
    if (g) this.bubble(g, text);
  }

  /** Someone's bubble (#676): `text`, or "skriver…" with null. A new one replaces the old (one element per player). */
  bubble(g, text) {
    if (!this.layer) return;
    let b = this.bubbles.get(g.id);
    if (!b) {
      const el = document.createElement('div');
      this.layer.append(el);
      b = { el, ghost: g };
      this.bubbles.set(g.id, b);
    }
    b.ghost = g; b.typing = text === null; b.t = (b.typing ? CHAT.typingStale / 1000 : CHAT.ttl);
    b.el.className = `say theirs chat-bubble${b.typing ? ' typing' : text.length > 32 ? ' long' : ''}`;
    if (b.typing) {
      const dots = document.createElement('span');
      dots.className = 'dots';
      dots.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
      b.el.replaceChildren(document.createTextNode('skriver'), dots);
    } else b.el.textContent = text;
    this.renderTyping();
  }

  unbubble(id) {
    this.bubbles.get(id)?.el.remove();
    this.bubbles.delete(id);
    this.renderTyping();
  }

  /** The column's last row: who is writing now ("Du", and the others by name). */
  renderTyping() {
    if (!this.typingLine) return;
    const who = [...(this.typing ? ['Du'] : []), ...[...this.bubbles.values()].filter((b) => b.typing).map((b) => b.ghost.name)];
    const text = who.length ? `${who.join(', ')} skriver…` : '';
    if (this.typingLine.textContent !== text) this.typingLine.textContent = text;
    this.typingLine.hidden = !text;
  }

  add(name, text, mine = false, note = false) {
    const el = document.createElement('div');
    el.className = `chat-line${mine ? ' mine' : ''}${note ? ' note' : ''}`;
    if (name) { const b = document.createElement('b'); b.textContent = name; el.append(b, ' '); }
    el.append(document.createTextNode(text));
    this.log.insertBefore(el, this.typingLine?.parentNode === this.log ? this.typingLine : null); // (the "skriver…" row stays last)
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
  opened(on) { this.open = on; if (!on) this.stopTyping(); this.render(); }

  render() {
    const avail = this.available;
    this.log.hidden = !avail || this.hidden;
    if (!this.toggle) return;
    this.toggle.hidden = !avail || !(this.open || this.lines.length || this.unseen || (this.hidden && this.open));
    setIcon(this.toggle, this.hidden ? 'chat-off' : 'chat', this.hidden ? 'Visa chatten' : 'Dölj chatten');
    this.toggle.setAttribute('aria-pressed', String(this.hidden));
    this.toggle.dataset.unseen = this.hidden && this.unseen ? String(Math.min(this.unseen, 99)) : '';
  }

  /** Each frame: lines fade out and go after CHAT.ttl s; our "skriver…" off after a pause; the bubbles follow the ghosts. */
  update(dt) {
    if (this.typing && (performance.now() - this.lastKey > CHAT.typingMs || !this.ghosts.connected)) this.stopTyping();
    if (this.bubbles.size) this.place(dt);
    this.fade(dt);
  }

  /** Bubbles over the ghosts' tags, on screen; gone with the ghost (left, disconnected) or after their time. */
  place(dt) {
    const w = gameView.w, h = gameView.h, eye = this.camera.position;
    for (const [id, b] of this.bubbles) {
      const g = this.ghosts.others.get(id);
      b.t -= dt;
      if (!g || g !== b.ghost || b.t <= 0) { this.unbubble(id); continue; }
      tmp.copy(g.root.position);
      const tagY = g.tag?.position.y ?? GHOSTS.tagY; // (#705: the tag sits over a taller / shorter avatar's head)
      tmp.y += tagY + GHOSTS.tagHeight / 2 + CHAT.bubbleGap;
      const d = tmp.distanceTo(eye);
      tmp.project(this.camera);
      const off = !g.root.visible || (g.tag && !g.tag.visible) || tmp.z > 1 || Math.abs(tmp.x) > 1.1 || Math.abs(tmp.y) > 1.1 || this.behind(g.root.position.clone().setY(g.root.position.y + tagY));
      b.el.style.visibility = off ? 'hidden' : 'visible';
      if (off) continue;
      const s = THREE.MathUtils.clamp(CHAT.bubbleNear / Math.max(d, 0.1), CHAT.bubbleMin, 1);
      b.el.style.transform = `translate(${Math.round(((tmp.x + 1) / 2) * w)}px, ${Math.round(((1 - tmp.y) / 2) * h)}px) translate(-50%, -100%) scale(${s.toFixed(2)})`;
      b.el.style.opacity = b.typing ? '' : String(Math.min(1, b.t / 0.6));
    }
  }

  fade(dt) {
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

  /** For tests: the bubbles over the ghosts (#676). */
  bubbleList() {
    return [...this.bubbles.entries()].map(([id, b]) => ({ id, name: b.ghost.name, text: b.el.textContent, typing: b.typing, shown: b.el.style.visibility === 'visible', t: Math.round(b.t * 10) / 10 }));
  }
}
