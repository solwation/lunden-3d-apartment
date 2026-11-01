// #1774: the client side of the shared game time (src/timesync.js): sends an offset, takes one, notice text, test URL opt-out.
//   node --test cloudflare/timesync.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TimeSync } from '../src/timesync.js';

const fakeDay = (stamp) => { const d = { paused: false, spool: 0, realAt: 0, date: 0, month: 0, hour: 0, update() {}, get stamp() { return this.s; }, setStamp(ms) { this.s = ms; const t = new Date(ms); Object.assign(this, { date: t.getDate(), month: t.getMonth() + 1, hour: t.getHours() + t.getMinutes() / 60 }); } }; d.setStamp(stamp); return d; };
test('local sends the offset, receive applies it, notice names the setter and the time', () => {
  const now = new Date(2026, 10, 1, 12).getTime(), sent = [], notes = [];
  const mk = (day, extra = {}) => new TimeSync({ day, net: { ready: () => true, send: (m) => sent.push(m) }, notice: (t) => notes.push(t), now: () => now, ...extra });
  const a = fakeDay(new Date(2026, 10, 1, 22).getTime()), ta = mk(a);
  assert.ok(ta.local()); assert.deepEqual(sent.at(-1), { t: 'tm', o: 10 * 3600e3 });
  const b = fakeDay(now), tb = mk(b);
  tb.receive(sent.at(-1), { name: 'Olof' });
  assert.equal(b.hour, 22); assert.deepEqual(notes, ['Olof ställde klockan till 22:00']);
  tb.receive({ t: 'tm', o: 36 * 3600e3, p: 1 }, { name: 'Sara' });
  assert.ok(b.paused); assert.match(notes.at(-1), /^Sara ställde klockan till 00:00 den 3\/11$/);
  tb.receive({ t: 'tm', o: 0 }); assert.equal(notes.length, 2, 'the welcome gives no notice'); assert.equal(b.hour, 12);
  const off = mk(fakeDay(now), { disabled: true }); assert.equal(off.local(), false); const c = fakeDay(now); mk(c, { disabled: true }).receive({ o: 5 * 3600e3 }, { name: 'X' }); assert.equal(c.hour, 12);
});
