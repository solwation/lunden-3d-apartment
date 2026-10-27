// #1648: the largest player-state message a client can send (every optional field at its widest accepted value, following
// cleanState in players.js and Ghosts.sendState in src/ghosts.js) must stay well below PLAYERS.maxBytes, because the room
// drops an oversize message without telling anybody (the sender then freezes for the others).
//   node --test cloudflare/statesize.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYERS, COMBAT, cleanState } from './players.js';
import { HELD_CATEGORIES } from '../src/heldcategory.js';
import { AVATAR_LOOK_EXT_MAX } from '../src/config.js';

const longest = (a) => a.reduce((m, s) => (s.length > m.length ? s : m), '');
const widest = {
  p: [-4999.99, -4999.99, -4999.99], r: -99.99, score: 10_000_000,
  h: longest(Object.keys(COMBAT.weapons)), hi: longest(HELD_CATEGORIES),
  c: true, pose: 3, look: [-0.3, -0.3], sp: true, jp: 2, dn: 1, bk: -99.99,
  cat: [7, 0, false], cq: [-0.99, -0.14, 0.99],
  av: '490374011190', ax: 'a123'.repeat(AVATAR_LOOK_EXT_MAX / 4),
};
const MARGIN = 128; // bytes of headroom a future field may use before this test (and the limit) must be revisited

test('the widest state is accepted whole by cleanState', () => {
  const s = cleanState(JSON.stringify(widest));
  assert.ok(s);
  for (const k of ['h', 'hi', 'c', 'pose', 'look', 'sp', 'jp', 'dn', 'bk', 'cat', 'cq', 'av', 'ax']) assert.ok(s[k] !== undefined && s[k] !== '', `${k} dropped`);
});

test(`the widest state leaves at least ${MARGIN} bytes under PLAYERS.maxBytes`, () => {
  const n = Buffer.byteLength(JSON.stringify(widest));
  console.log(`widest state: ${n} bytes of ${PLAYERS.maxBytes}`);
  assert.ok(n + MARGIN <= PLAYERS.maxBytes, `${n} bytes + ${MARGIN} margin exceeds ${PLAYERS.maxBytes}`);
});
