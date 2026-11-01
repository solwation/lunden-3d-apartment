// #1775: DoorSync (src/doorsync.js) with fake doors.   node --test src/doorsync.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DoorSync } from './doorsync.js';

const door = () => ({ target: 0, get isOpen() { return this.target === 1; }, toggle() { this.target = this.target ? 0 : 1; this.n = (this.n ?? 0) + 1; } });

test('a local toggle sends once; a remote change flips without sending back, older ones are ignored', () => {
  const sent = [], heard = [], s = new DoorSync({ send: (m) => sent.push(m) }), d = door();
  assert.equal(s.register('w3', d, { sound: (o) => heard.push(o) }), true);
  assert.equal(s.register('w3', door()), false); // twice
  assert.equal(s.register('w99', door()), false); // over the group's max
  assert.equal(s.register('x1', door()), false); // unknown group
  d.toggle();
  assert.deepEqual(sent, [{ t: 'dr', i: 'w3', o: 1 }]);
  s.receive({ t: 'dr', i: 'w3', o: 1, at: 10 }); // the echo of our own change: already open, nothing to do
  assert.equal(d.n, 1); assert.deepEqual(heard, []);
  s.receive({ t: 'dr', i: 'w3', o: 0, at: 20 }); // somebody shuts it
  assert.equal(d.isOpen, false); assert.deepEqual(heard, [false]); assert.equal(sent.length, 1);
  s.receive({ t: 'dr', i: 'w3', o: 1, at: 15 }); // stale (room clock)
  assert.equal(d.isOpen, false);
  s.receive({ t: 'dr', i: 'nope', o: 1, at: 30 }); s.receive({ t: 'dr', i: 'w3', o: 7, at: 30 }); s.receive(null);
  assert.equal(d.isOpen, false);
});

test('the welcome opens the listed doors quietly; offline nothing is sent', () => {
  const sent = [], heard = [];
  let online = false;
  const s = new DoorSync({ send: (m) => sent.push(m), ready: () => online }), a = door(), b = door();
  s.register('g1', a, { sound: (o) => heard.push(o) }); s.register('A0', b);
  a.toggle(); a.toggle(); assert.deepEqual(sent, []);
  online = true;
  s.receive({ t: 'dr', list: [['g1', 1], ['A0', 1], ['zz', 1]] });
  assert.ok(a.isOpen && b.isOpen); assert.deepEqual(heard, []); assert.deepEqual(sent, []);
});
