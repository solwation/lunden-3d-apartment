import { CONVERSATION as C } from './config.js';
import { CONVERSATION_KINDS as kinds, CONVERSATION_LABELS as labels, CONVERSATION_LINES as lines, conversationNear } from './conversationwire.js';
// Renderer-free fixed-line client/menu state. The host supplies the existing focus/wall/weapon guard and speech route.
export class Conversation {
  constructor({ net, peer, position, allowed = () => true, onLine = () => {}, notice = () => {}, now = () => performance.now() }) {
    Object.assign(this, { net, peer, position, allowed, onLine, notice, now, capable: false, seq: 0, last: -Infinity, incoming: null, pending: null, page: 'main', target: null, seen: new Set() });
  }
  welcome(capability) { this.capable = capability?.v === C.version; this.seq = 0; this.pending = this.incoming = null; this.seen.clear(); this.closeMenu(); }
  closeMenu() { this.page = 'main'; this.target = null; }
  back() { if (this.page === 'main') return false; this.page = this.page === 'conversation' ? 'talk' : 'main'; return true; }
  update() {
    if (!this.net.ready()) { this.pending = this.incoming = null; this.closeMenu(); return; }
    if (this.incoming && this.now() >= this.incoming.until) this.incoming = null;
    if (this.pending && this.now() >= this.pending.until) { this.pending = null; this.notice('Samtalet kunde inte bekräftas – försök igen'); }
  }
  replyFor(id) { return this.net.ready() && this.incoming?.from === id && this.now() < this.incoming.until ? this.incoming : null; }
  reason(id) {
    if (!this.capable) return 'samtal kräver uppdaterad server';
    const p = this.peer(id);
    if (!this.net.ready() || !p || p.armed || !conversationNear(this.position(), p.position)) return 'gå närmare utan vapen';
    if (this.pending) return 'vänta på bekräftelse';
    return this.now() - this.last < C.everyMs ? 'vänta ett ögonblick' : null;
  }
  send(id, kind, ref) {
    this.update(); if (this.reason(id) || !this.allowed(id)) return false;
    if (!kinds.includes(kind) && !(kind === 'reply' && this.replyFor(id)?.id === ref)) return false;
    const q = ++this.seq, message = { t: 'cv', v: C.version, to: id, q, k: kind, ...(kind === 'reply' ? { r: ref } : {}) };
    this.pending = { q, to: id, ref, until: this.now() + C.pendingMs };
    if (!this.net.send(message)) { this.pending = null; return false; }
    this.last = this.now(); return true;
  }
  receive(m) {
    if (m?.v !== C.version) return;
    if (m.why === 'context') { if (this.incoming?.id === m.r) this.incoming = null; if (this.pending?.ref === m.r) { this.pending = null; this.notice('Den repliken går inte längre att svara på'); } return; }
    if (!Object.hasOwn(lines, m.k) || typeof m.i !== 'string' || !m.i.length || m.i.length > 16 || typeof m.to !== 'string' || !m.to.length || m.to.length > 16 || typeof m.id !== 'string' || !m.id.length || m.id.length > 80 || this.seen.has(m.id)) return;
    this.seen.add(m.id); if (this.seen.size > C.receipts) this.seen.delete(this.seen.values().next().value);
    if (m.i === this.net.id() && m.id === `${m.i}:${this.pending?.q}`) { this.pending = null; this.last = this.now(); }
    if (m.r && this.incoming?.id === m.r && m.i === this.net.id()) this.incoming = null;
    if (m.to === this.net.id() && kinds.includes(m.k) && Number.isFinite(m.ttl) && m.ttl > 0 && m.ttl <= C.replyMs) this.incoming = { from: m.i, id: m.id, kind: m.k, until: this.now() + m.ttl };
    this.onLine(m, lines[m.k]);
  }
  rows(g, existing) {
    this.update(); if (this.target !== g.id) { this.target = g.id; this.page = 'main'; }
    const navigate = page => { if (this.net.ready() && this.allowed(g.id)) this.page = page; };
    const row = (id, label, run, reason) => ({ id, label, run, noReach: true, ...(reason ? { reason } : {}) });
    const back = row('talk-back', 'tillbaka', () => this.back());
    const reply = this.replyFor(g.id), reason = this.reason(g.id);
    if (this.page === 'main') return [row('talk', `prata med ${g.name}`, () => navigate('talk')), ...existing.filter(r => r.id !== 'greet')];
    if (this.page === 'talk') return [existing.find(r => r.id === 'greet'), row('conversation', 'konversera', () => navigate('conversation'), this.capable ? null : reason), ...(reply ? [row('reply', 'svara', () => this.send(g.id, 'reply', reply.id), reason)] : []), back].filter(Boolean);
    return [...kinds.map(k => row(k, labels[k], () => this.send(g.id, k), reason)), back];
  }
}
