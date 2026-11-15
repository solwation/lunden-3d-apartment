import test from 'node:test';
import assert from 'node:assert/strict';
import { thingId, cleanPlace, cleanTurn, cleanThing, cleanThingState, ThingLedger } from './thingsync.js';
import { THING_SYNC as C } from './config.js';

test('ids: a known group, an index under its max, no padding', () => {
  for (const i of ['s0', 's3', 'a0', 'c11', 'r0']) assert.equal(thingId(i), true, i);
  for (const i of ['s4', 'a1', 'z0', 's01', 's-1', 'S0', 's', '0', 's0 ', 5, null, 'c12', '__proto__']) assert.equal(thingId(i), false, String(i));
  assert.ok(Object.values(C.max).every((n) => Number.isInteger(n) && n > 0 && n <= 1000));
});

test('places and turns: inside the bounds, finite, rounded; a turn is a unit quaternion', () => {
  assert.deepEqual(cleanPlace([1.23456, -5, 20]), [1.235, -5, 20]);
  for (const p of [[0, 0], [0, 0, 0, 0], [NaN, 0, 0], [0, 0, 9999], [0, -100, 0], ['1', 0, 0], null]) assert.equal(cleanPlace(p), null);
  assert.deepEqual(cleanTurn([0, 0, 0, 2 * 0.52]), [0, 0, 0, 1]);
  for (const q of [[0, 0, 0, 0], [0, 0, 0, 3], [0, 0, 1], [0, 0, 0, Infinity]]) assert.equal(cleanTurn(q), null);
});

test('messages: take / home carry id and number, put a place and a turn; anything else is dropped', () => {
  assert.deepEqual(cleanThing({ t: 'th', i: 's0', k: 'take', n: 3, p: [1, 2, 3], extra: 1 }), { i: 's0', k: 'take', n: 3 });
  assert.deepEqual(cleanThing({ t: 'th', i: 's0', k: 'put', n: 4, p: [1, 2, 3], q: [0, 0, 0, 1] }), { i: 's0', k: 'put', n: 4, p: [1, 2, 3], q: [0, 0, 0, 1] });
  for (const m of [{ t: 'dr', i: 's0', k: 'take', n: 1 }, { t: 'th', i: 's0', k: 'put', n: 1 }, { t: 'th', i: 's0', k: 'take', n: 1.5 }, { t: 'th', i: 's9', k: 'take', n: 1 }, null]) assert.equal(cleanThing(m), null);
  assert.equal(cleanThingState({ i: 's0', m: 'world', at: 5, by: 'abc' }), null, 'a lying thing needs its place');
  assert.deepEqual(cleanThingState({ i: 's0', m: 'held', at: 5, by: 'abcdefgh' }), { i: 's0', m: 'held', at: 5, by: 'abcdefgh' });
});

test('the ledger: requests go out numbered, the room\'s word is applied, a refusal restores the room\'s state, stale news is ignored', () => {
  const sent = [], changes = [];
  const L = new ThingLedger({ send: (m) => { sent.push(m); return true; }, me: () => 'me', hooks: { change: (s, was, why) => changes.push([s.i, s.m, was.m, why]) } });
  assert.equal(L.get('s0').m, 'home');
  assert.equal(L.request('s0', 'take'), true);
  assert.deepEqual(sent.at(-1), { t: 'th', i: 's0', k: 'take', n: 1 });
  assert.equal(L.pending.size, 1);
  assert.deepEqual(L.receive({ t: 'th', i: 's0', m: 'held', at: 100, by: 'me' }).refused, null);
  assert.equal(L.pending.size, 0); assert.equal(L.heldByOther('s0'), false);
  assert.equal(L.request('s0', 'put', [1, 0, 2], [0, 0, 0, 1]), true);
  L.receive({ t: 'th', i: 's0', m: 'world', at: 200, by: 'me', p: [1, 0, 2], q: [0, 0, 0, 1] });
  assert.deepEqual(L.get('s0').p, [1, 0, 2]);
  // somebody else takes it; our late take is refused with the room's state
  L.receive({ t: 'th', i: 's0', m: 'held', at: 300, by: 'you' });
  assert.equal(L.heldByOther('s0'), true);
  L.request('s0', 'take');
  const r = L.receive({ t: 'th', i: 's0', m: 'held', at: 300, by: 'you', no: 'held', n: 3 });
  assert.equal(r.refused, 'held'); assert.equal(L.pending.size, 0); assert.equal(L.get('s0').by, 'you');
  assert.equal(L.receive({ t: 'th', i: 's0', m: 'home', at: 250, by: 'you' }), null, 'older than what we hold');
  L.receive({ t: 'th', i: 's0', m: 'home', at: 400, by: 'you' });
  assert.equal(L.get('s0').m, 'home'); assert.equal(L.state.size, 0);
  assert.equal(L.receive({ t: 'th', i: 'zz', m: 'held', at: 1, by: 'x' }), null);
  assert.deepEqual(changes.at(-1), ['s0', 'home', 'held', 'room']);
  assert.equal(L.request('s9', 'take'), false, 'an unknown thing is never sent');
});

test('the ledger: the welcome replaces everything; offline nothing is sent or kept; a dropped connection resets', () => {
  const changes = [];
  const L = new ThingLedger({ send: () => true, me: () => 'me', hooks: { change: (s, was, why) => changes.push([s.i, s.m, why]) } });
  L.receive({ t: 'th', i: 'k0', m: 'held', at: 5, by: 'x' });
  L.welcome([['s0', 'held', 'you'], ['a0', 'world', 'you', [1, 2, 3], [0, 0, 0, 1]], ['zz', 'held', 'q'], ['c1', 'world', 'q'], 'junk']);
  assert.deepEqual([...L.state.keys()].sort(), ['a0', 's0']);
  assert.deepEqual(changes.slice(-3), [['k0', 'home', 'welcome'], ['s0', 'held', 'welcome'], ['a0', 'world', 'welcome']]);
  L.reset();
  assert.equal(L.state.size, 0); assert.deepEqual(changes.slice(-2).map((c) => c[2]), ['reset', 'reset']);
  const off = new ThingLedger({ send: () => false });
  assert.equal(off.request('s0', 'take'), false); assert.equal(off.pending.size, 0);
});
