// #1777: the ghosts' outbox overflow policy (src/outbox.js).   node --test src/outbox.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trimOutbox, outboxTier } from './outbox.js';

const sq = (k) => ({ t: 'sq', k }), pk = { t: 'pk', k: 's' }, rfc = { t: 'rf', k: 'c', f: 3, b: 0 };
const keys = (q) => q.map((m) => m.t + (m.k ?? '') + (m.to ? '!' : ''));

test('a catch request added to a full queue of squirrel / paddock snapshots stays and is sent; the snapshots go first', () => {
  const q = [sq('n'), pk, sq('s')];
  q.push(rfc);
  assert.deepEqual(keys(trimOutbox(q, 3, 8)), ['sqn']); // the oldest snapshot
  assert.deepEqual(keys(q), ['pks', 'sqs', 'rfc']);
  for (const m of [sq('n'), pk, sq('s'), sq('n'), pk]) { q.push(m); trimOutbox(q, 3, 8); } // the leader keeps sending
  assert.ok(q.includes(rfc), 'the catch request is never pushed out by snapshots');
  const sent = [];
  while (q.length) sent.push(q.shift()); // the 5 Hz budget drains it
  assert.ok(sent.includes(rfc));
});

test('the shark catch, river fish on / off, doors and squirrel takes are kept; an incoming snapshot is dropped instead', () => {
  const q = [{ t: 'rf', k: 'sc', p: [0, 0, 0], r: 0 }, { t: 'dr', i: 'w3', o: 1 }, { t: 'rf', k: 'on' }];
  q.push(pk);
  assert.deepEqual(keys(trimOutbox(q, 3, 8)), ['pks']);
  q.push(sq('t'));
  assert.deepEqual(trimOutbox(q, 3, 8), []); // actions wait beyond the 3 slots
  assert.deepEqual(keys(q), ['rfsc', 'dr', 'rfon', 'sqt']);
});

test('cosmetic events go before actions: a miss before a hit (#667), a greeting before a catch', () => {
  const q = [rfc, { t: 'a', w: 'nerf', to: 'x' }, { t: 'a', w: 'nerf' }, { t: 'g', to: 'x', k: 1 }];
  assert.deepEqual(keys(trimOutbox(q, 3, 8)), ['a']);
  q.push({ t: 'c', k: 0 });
  assert.deepEqual(keys(trimOutbox(q, 3, 8)), ['g1!']);
  assert.deepEqual(keys(q), ['rfc', 'a!', 'c0']);
});

test('the hard cap: the oldest action goes, a catch request only when nothing else is left; fall / consume never', () => {
  const q = [{ t: 'fall', id: 1 }, rfc, ...Array.from({ length: 7 }, (_, i) => ({ t: 'dr', i: 'd' + i, o: 1 }))];
  assert.equal(q.length, 9);
  assert.deepEqual(trimOutbox(q, 3, 8).map((m) => m.i), ['d0']);
  assert.equal(q[0].t, 'fall'); assert.ok(q.includes(rfc));
  const only = [{ t: 'consume', id: 2 }, ...Array.from({ length: 9 }, (_, f) => ({ t: 'rf', k: 'c', f }))];
  assert.deepEqual(trimOutbox(only, 3, 8).map((m) => m.f), [0, 1]);
  assert.equal(only[0].t, 'consume');
  assert.equal(outboxTier({ t: 'fall' }), Infinity);
  assert.equal(outboxTier({ t: 'pkg', v: '' }), 0);
  assert.equal(outboxTier({ t: 'pk', k: 'pet', i: 0 }), 2);
});
