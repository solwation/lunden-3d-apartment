// #1333: join / leave notices (src/joinnotice.js): node --test tools/joinnoticetest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { JoinNotice, list } from '../src/joinnotice.js';
import { JOIN_NOTICE as P } from '../src/config.js';

const setup = () => { let t = 0; const out = []; const n = new JoinNotice((x) => out.push(x), () => t); return { n, out, adv: (ms) => { for (let d = 0; d < ms; d += 500) { t += Math.min(500, ms - d); n.tick(); } } }; };

test('a join is announced after the batch delay, anonymous as Anonym', () => {
  const { n, out, adv } = setup();
  n.joined('Anna'); adv(P.batchMs - 1); assert.deepEqual(out, []); adv(1); assert.deepEqual(out, ['Anna kom in i spelet']);
  n.joined(''); adv(P.batchMs); assert.equal(out[1], 'Anonym kom in i spelet');
});
test('a leave waits for the grace period', () => {
  const { n, out, adv } = setup();
  n.left('Anna'); adv(P.graceMs - 1000); assert.deepEqual(out, []);
  adv(1000 + P.batchMs); assert.deepEqual(out, ['Anna lämnade spelet']);
});
test('coming back within the grace period gives no notice at all', () => {
  const { n, out, adv } = setup();
  n.left('Anna'); adv(10_000); assert.equal(n.joined('Anna'), false); adv(P.graceMs * 2); assert.deepEqual(out, []);
});
test('coming back after the notice is a new join', () => {
  const { n, out, adv } = setup();
  n.left('Anna'); adv(P.graceMs + P.batchMs); n.joined('Anna'); adv(P.batchMs);
  assert.deepEqual(out, ['Anna lämnade spelet', 'Anna kom in i spelet']);
});
test('a crowd is merged and capped', () => {
  const { n, out, adv } = setup();
  for (const x of ['A', 'B', 'C', 'D', 'E']) n.joined(x);
  adv(P.batchMs); assert.deepEqual(out, ['A, B, C och 2 till kom in i spelet']);
  assert.equal(list(['A', 'B']), 'A och B');
});
test('reset forgets pending leaves', () => {
  const { n, out, adv } = setup();
  n.left('Anna'); n.reset(); adv(P.graceMs * 2); assert.deepEqual(out, []);
});
