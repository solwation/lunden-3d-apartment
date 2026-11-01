// The game time and date shared with the other players in the room (#1774). "Logged in" = connected to the shared players' room (the
// room is the only account model there is: anybody connected, named or Anonym, is in it; offline / solo play sends and receives nothing).
// Whoever sets the clock (typed time, spool let go, play/pause, "Nu"), picks a date on the calendar, sets the game time for everybody:
// { t: 'tm', o, p? } (cloudflare/roomtime.js has the protocol): o = game time minus our real clock in ms, p = 1 when paused. The room
// keeps it in memory, tells late joiners in the welcome and is back on real time when empty.
// (no imports: tested with node --test without three.js)
const formatHour = (hour) => { const t = Math.floor((((hour % 24) + 24) % 24) * 60); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; }; // = daycycle.js formatHour

const SYNC_EVERY = 300; // ms between two messages (the room drops a second one within 250 ms, cloudflare/roomtime.js)

export class TimeSync {
  /** day: DayCycle; net: { ready(), send(msg) }; notice(text); disabled: a test URL (?time ?month ?day ?year ?freeze ?notimesync) neither sends nor takes. */
  constructor({ day, net, notice = () => {}, disabled = false, now = () => Date.now(), onApply = () => {} }) { Object.assign(this, { day, net, notice, disabled, now, onApply, sentAt: -Infinity, timer: 0 }); }

  /** Our game time was just changed by us: tell the room. */
  local() {
    if (this.disabled || !this.net?.ready()) return false;
    const wait = this.sentAt + SYNC_EVERY - this.now();
    if (wait > 0) { // held keys / paging change it faster than the room takes it: the last value goes out when the pause is over
      if (!this.timer) this.timer = setTimeout(() => { this.timer = 0; this.local(); }, wait);
      return false;
    }
    this.sentAt = this.now();
    const d = this.day;
    return this.net.send({ t: 'tm', o: Math.round(d.stamp - this.now()), ...(d.paused ? { p: 1 } : {}) });
  }

  /** The room's time (a message, or the welcome's { o, p? }); `who`: the ghost that set it (null = the welcome, no notice). */
  receive(m, who = null) {
    if (this.disabled || !Number.isSafeInteger(m?.o)) return;
    const d = this.day, was = d.date + '/' + d.month;
    d.setStamp(this.now() + m.o);
    Object.assign(d, { paused: m.p === 1, spool: 0, realAt: this.now() });
    d.update(0);
    this.onApply();
    if (who) {
      const name = who.name || 'Någon';
      this.notice(`${name} ställde klockan till ${formatHour(d.hour)}${was === d.date + '/' + d.month ? '' : ` den ${d.date}/${d.month}`}`);
    }
  }
}
