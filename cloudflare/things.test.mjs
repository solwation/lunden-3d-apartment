import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomThings, cleanThingText } from './things.js';
import { THING_SYNC } from '../src/config.js';

// #1974 / #1978: the room's rules for shared loose things, with a stand-in Durable Object storage.
const mk = (init) => { const s = { m: new Map(Object.entries(init ?? {})), fail: false, puts: 0 }; s.get = async (k) => structuredClone(s.m.get(k)); s.put = async (k, v) => { if (s.fail) throw new Error('storage'); s.puts++; s.m.set(k, structuredClone(v)); }; return s; };
const msg = (o) => cleanThingText(JSON.stringify({ t: 'th', ...o }));

test('after a hibernation the holders are rebuilt from the attachments: a held thing is still refused to the others', async () => {
  const sent = [], A = { i: 'aaaa', th: ['s0', 'k1'], s: { p: [0, 0, 0] } }, B = { i: 'bbbb', s: { p: [1, 0, 0] } }, saved = [];
  const peers = [{ ws: 'wa', a: A }, { ws: 'wb', a: B }];
  const room = new RoomThings({ storage: mk() }, (ws, text) => sent.push([ws, JSON.parse(text)]), () => peers, (ws, a) => saved.push([ws, [...(a.th ?? [])]]));
  assert.deepEqual(await room.welcome(1000), [['s0', 'held', 'aaaa'], ['k1', 'held', 'aaaa']]);
  await room.handle('wb', B, msg({ i: 's0', k: 'take', n: 1 }), 5000);
  assert.deepEqual(sent, [['wb', { t: 'th', i: 's0', m: 'held', at: 1, by: 'aaaa', no: 'held', n: 1 }]]);
  // the holder still puts it down, and the attachment follows
  await room.handle('wa', A, msg({ i: 's0', k: 'put', n: 2, p: [0.5, 0, 0], q: [0, 0, 0, 1] }), 6000);
  assert.deepEqual(A.th, ['k1']); assert.deepEqual(saved.at(-1), ['wa', ['k1']]);
  assert.equal(sent.filter(([, m]) => m.m === 'world').length, 2, 'both hear where it lies');
  // a holder that is no longer connected does not block anybody
  peers.shift();
  await room.handle('wb', B, msg({ i: 'k1', k: 'take', n: 3 }), 7000);
  assert.deepEqual(sent.at(-1), ['wb', { t: 'th', i: 'k1', m: 'held', at: 7000, by: 'bbbb' }]);
  assert.deepEqual(B.th, ['k1']);
});

test('one connection holds at most THING_SYNC.held things', async () => {
  const sent = [], A = { i: 'aaaa' }, room = new RoomThings({ storage: mk() }, (ws, text) => sent.push(JSON.parse(text)), () => [{ ws: 'wa', a: A }]);
  const ids = ['s0', 's1', 's2', 's3', 'b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'w0'];
  assert.ok(ids.length > THING_SYNC.held);
  for (const [n, i] of ids.entries()) await room.handle('wa', A, msg({ i, k: 'take', n }), 1000 * (n + 1));
  assert.equal(A.th.length, THING_SYNC.held);
  assert.equal(sent.at(-1).no, 'full');
  assert.equal(cleanThingText('not json'), null);
});

test('#1978: where things lie is saved before it is confirmed, survives an empty room and a new object, and is never saved for a held thing', async () => {
  const storage = mk(), sent = [], A = { i: 'aaaa', s: { p: [0, 0, 0] } }, peers = [{ ws: 'wa', a: A }];
  const room = new RoomThings({ storage }, (ws, text) => sent.push(JSON.parse(text)), () => peers);
  await room.handle('wa', A, msg({ i: 's0', k: 'take', n: 1 }), 1000);
  assert.equal(storage.puts, 0, 'holding writes nothing');
  await room.handle('wa', A, msg({ i: 's0', k: 'put', n: 2, p: [1, 0, 2], q: [0, 0, 0, 1] }), 2000);
  assert.equal(storage.puts, 1);
  assert.deepEqual(storage.m.get('things'), { v: 1, rows: [['s0', 'aaaa', [1, 0, 2], [0, 0, 0, 1], 2000]] });
  // everybody leaves; a new object (after eviction / hibernation) reads the save
  peers.length = 0; room.reset();
  const B = { i: 'bbbb', s: { p: [1, 0, 1] } }, again = new RoomThings({ storage }, (ws, text) => sent.push(JSON.parse(text)), () => [{ ws: 'wb', a: B }]);
  assert.deepEqual(await again.welcome(3000), [['s0', 'world', 'aaaa', [1, 0, 2], [0, 0, 0, 1]]]);
  // taken from where it lay: the saved place goes; sent home: nothing more to write
  await again.handle('wb', B, msg({ i: 's0', k: 'take', n: 1 }), 4000);
  assert.deepEqual(storage.m.get('things'), { v: 1, rows: [] });
  const puts = storage.puts;
  await again.handle('wb', B, msg({ i: 's0', k: 'home', n: 2 }), 5000);
  assert.equal(storage.puts, puts);
});

test('#1978: a failed write refuses the request and changes nothing', async () => {
  const storage = mk(), sent = [], A = { i: 'aaaa', s: { p: [0, 0, 0] } }, room = new RoomThings({ storage }, (ws, text) => sent.push(JSON.parse(text)), () => [{ ws: 'wa', a: A }]);
  await room.handle('wa', A, msg({ i: 's0', k: 'take', n: 1 }), 1000);
  storage.fail = true;
  await room.handle('wa', A, msg({ i: 's0', k: 'put', n: 2, p: [1, 0, 2], q: [0, 0, 0, 1] }), 2000);
  assert.deepEqual(sent.at(-1), { t: 'th', i: 's0', m: 'held', at: 1000, by: 'aaaa', no: 'save', n: 2 });
  assert.deepEqual(A.th, ['s0'], 'still in the hand');
  storage.fail = false;
  assert.deepEqual(await room.welcome(3000), [['s0', 'held', 'aaaa']]);
});

test('#1978: a lying thing nobody touched for THING_SYNC.keepDays days goes home; a damaged save is ignored', async () => {
  const day = 864e5, storage = mk({ things: { v: 1, rows: [['s0', 'aaaa', [1, 0, 2], [0, 0, 0, 1], 1000], ['k0', 'aaaa', [3, 0, 2], [0, 0, 0, 1], 20 * day], ['zz', 'x', [0, 0, 0], [0, 0, 0, 1], 5], ['b0', 'x', [0, 0, 99999], [0, 0, 0, 1], 5], 'junk'] } });
  const sent = [], room = new RoomThings({ storage }, (ws, text) => sent.push(JSON.parse(text)), () => [{ ws: 'wa', a: { i: 'aaaa' } }]);
  assert.deepEqual(await room.welcome(1000 + (THING_SYNC.keepDays + 1) * day), [['k0', 'world', 'aaaa', [3, 0, 2], [0, 0, 0, 1]]]);
  assert.deepEqual(sent.map((m) => [m.i, m.m]), [['s0', 'home']]);
  assert.deepEqual(storage.m.get('things').rows.map((r) => r[0]), ['k0']);
  const bad = new RoomThings({ storage: mk({ things: 'nonsense' }) }, () => {}, () => []);
  assert.deepEqual(await bad.welcome(1), []);
});
