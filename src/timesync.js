// #1865: explicit clock/calendar/cheat edits share a server-owned persistent world calendar.
import { WORLD_TIME, worldStamp, setWorldStamp } from './worldtime.js';
const formatHour = hour => { const t = Math.floor((((hour % 24) + 24) % 24) * 60); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
export class TimeSync {
  constructor({ day, net, notice = () => {}, disabled = false, now = () => performance.now(), onApply = () => {} }) { Object.assign(this, { day, net, notice, disabled, now, onApply, sentAt: -Infinity, timer: 0, queued: null, q: -1, capable: false, pending: false }); }
  welcome() { clearTimeout(this.timer); this.timer = 0; this.queued = null; this.capable = false; this.q = -1; this.pending = false; }
  /** Called only by an explicit user time edit; never by welcome, receive or ordinary entry. */
  local(kind = 'set') {
    if (this.disabled || !this.net?.ready()) return false;
    if (!this.capable) { this.notice('Gemensam klocka väntar på serveruppdatering – försök igen efter återanslutning'); return false; }
    this.queued = kind === 'now' ? { k: 'now' } : { k: 'set', stamp: worldStamp(this.day), p: this.day.paused ? 1 : 0, s: Math.sign(this.day.spool) };
    return this.flush();
  }
  flush() {
    if (!this.queued || this.disabled || !this.net?.ready()) { this.queued = null; return false; }
    if (this.pending) return false; // wait for the prior server ACK before the next control enters Ghosts' outbox
    const wait = this.sentAt + WORLD_TIME.clientEvery - this.now();
    if (wait > 0) { if (!this.timer) this.timer = setTimeout(() => { this.timer = 0; this.flush(); }, wait); return false; }
    const cmd = this.queued; this.queued = null; this.sentAt = this.now();
    this.pending = true;
    const sent = this.net.send({ t: 'tm', v: WORLD_TIME.version, q: this.q, ...cmd });
    if (!sent) this.pending = false; return sent;
  }
  receive(m, who = null) {
    if (this.disabled || m?.v !== WORLD_TIME.version || !Number.isSafeInteger(m.q) || m.q < this.q || !Number.isSafeInteger(m.stamp) || ![0, 1].includes(m.p) || ![-1, 0, 1].includes(m.s)) return;
    this.capable = true;
    if (m.why || (m.i && m.i === this.net.id?.())) { this.pending = false; this.sentAt = this.now(); } // server ACK anchors rate despite transport batching
    if (m.q === this.q && who && !m.why) return; // duplicate event; a silent reconnect welcome still reanchors elapsed time
    this.q = m.q;
    const d = this.day, was = d.date + '/' + d.month;
    setWorldStamp(d, m.stamp); Object.assign(d, { paused: m.p === 1, spool: m.s, sharedTime: true, realAt: Date.now() }); d.update(0); this.onApply();
    if (m.why) this.notice(m.why === 'storage' ? 'Servern kunde inte spara tiden – försök igen' : m.why === 'range' ? 'Datumet ligger utanför den gemensamma klockans intervall' : 'Tiden hann uppdateras – försök igen');
    else if (who && m.i !== this.net.id?.()) this.notice(`${who.name || 'Någon'} ställde klockan till ${formatHour(d.hour)}${was === d.date + '/' + d.month ? '' : ` den ${d.date}/${d.month}`}`);
    if (this.queued) this.flush();
  }
}
