import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomThings, cleanThingText } from './things.js';

// #1974: the room's memory is empty after a hibernation; what the connections hold is in their attachments.
test('after a hibernation the holders are rebuilt from the attachments: a held thing is still refused to the others', () => {
  const sent = [], A = { i: 'aaaa', th: ['s0', 'k1'], s: { p: [0, 0, 0] } }, B = { i: 'bbbb', s: { p: [1, 0, 0] } }, saved = [];
  const peers = [{ ws: 'wa', a: A }, { ws: 'wb', a: B }];
  const room = new RoomThings((ws, text) => sent.push([ws, JSON.parse(text)]), () => peers, (ws, a) => saved.push([ws, [...(a.th ?? [])]]));
  assert.deepEqual(room.list(), [['s0', 'held', 'aaaa'], ['k1', 'held', 'aaaa']]);
  room.handle('wb', B, cleanThingText('{"t":"th","i":"s0","k":"take","n":1}'), 5000);
  assert.deepEqual(sent, [['wb', { t: 'th', i: 's0', m: 'held', at: 1, by: 'aaaa', no: 'held', n: 1 }]]);
  // the holder still puts it down, and the attachment follows
  room.handle('wa', A, cleanThingText('{"t":"th","i":"s0","k":"put","n":2,"p":[0.5,0,0],"q":[0,0,0,1]}'), 6000);
  assert.deepEqual(A.th, ['k1']); assert.deepEqual(saved.at(-1), ['wa', ['k1']]);
  assert.equal(sent.filter(([, m]) => m.m === 'world').length, 2, 'both hear where it lies');
  // a holder that is no longer connected does not block anybody
  peers.shift();
  room.handle('wb', B, cleanThingText('{"t":"th","i":"k1","k":"take","n":3}'), 7000);
  assert.deepEqual(sent.at(-1), ['wb', { t: 'th', i: 'k1', m: 'held', at: 7000, by: 'bbbb' }]);
  assert.deepEqual(B.th, ['k1']);
});

test('one connection holds at most THING_SYNC.held things', async () => {
  const { THING_SYNC } = await import('../src/config.js');
  const sent = [], A = { i: 'aaaa' }, room = new RoomThings((ws, text) => sent.push(JSON.parse(text)), () => [{ ws: 'wa', a: A }]);
  const ids = ['s0', 's1', 's2', 's3', 'b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'w0'];
  assert.ok(ids.length > THING_SYNC.held);
  ids.forEach((i, n) => room.handle('wa', A, cleanThingText(JSON.stringify({ t: 'th', i, k: 'take', n })), 1000 * (n + 1)));
  assert.equal(A.th.length, THING_SYNC.held);
  assert.equal(sent.at(-1).no, 'full');
  assert.equal(cleanThingText('not json'), null);
});
