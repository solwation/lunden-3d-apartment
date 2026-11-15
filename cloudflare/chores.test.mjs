import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomChores, cleanChoreText } from './chores.js';
import { cleanChore, cleanGoal, helperKey, newHelperKey } from '../src/choresync.js';
import { CHORE_SYNC } from '../src/config.js';

const UA = 'a'.repeat(16), UB = 'b'.repeat(16), UC = 'c'.repeat(16), D = '2026-11-15';
const msg = (o) => cleanChoreText(JSON.stringify({ t: 'ch', ...o }));
function room() {
  const inbox = { wa: [], wb: [], wc: [] }, peers = [{ ws: 'wa' }, { ws: 'wb' }, { ws: 'wc' }];
  return { inbox, peers, r: new RoomChores((ws, text) => inbox[ws].push(JSON.parse(text)), () => peers), A: { i: 'aaaa', n: 'Anna' }, B: { i: 'bbbb', n: 'Bo' }, C: { i: 'cccc', n: 'Cia' } };
}

test('validation: a helper key, a day, plain ids; anything else is dropped', () => {
  const k = newHelperKey(); assert.equal(helperKey(k), k); assert.equal(helperKey('nope'), null);
  assert.match(newHelperKey(), /^[0-9a-f]{16}$/);
  assert.deepEqual(cleanChore({ t: 'ch', k: 'hi', u: UA, extra: 1 }), { k: 'hi', u: UA });
  assert.deepEqual(cleanChore({ t: 'ch', k: 'g', u: UA, d: D, i: 'resetKitchen', g: 'wipe' }), { k: 'g', u: UA, d: D, i: 'resetKitchen', g: 'wipe' });
  for (const m of [{ t: 'ch', k: 'g', u: 'short', d: D, i: 'x', g: 'y' }, { t: 'ch', k: 'g', u: UA, d: '15/11', i: 'x', g: 'y' }, { t: 'ch', k: 'g', u: UA, d: D, i: 'x|y', g: 'y' }, { t: 'ch', k: 'g', u: UA, d: D, i: 'x', g: '__proto__' },
    { t: 'ch', k: 'zz', u: UA }, { t: 'dr', k: 'hi', u: UA }, null]) assert.equal(cleanChore(m), null, JSON.stringify(m));
  assert.equal(cleanChoreText('junk'), null);
  assert.deepEqual(cleanGoal(D, 'a', 'b', 1, 'x'.repeat(99)), { d: D, i: 'a', g: 'b', mine: true, name: 'x'.repeat(CHORE_SYNC.name) });
  assert.equal(cleanGoal('x', 'a', 'b'), null);
});

test('a goal is told to everybody else once, with the helper\'s name, never the key', () => {
  const { r, inbox, A, B } = room();
  r.handle('wa', A, msg({ k: 'g', u: UA, d: D, i: 'resetKitchen', g: 'dishes' }), 1000);
  assert.deepEqual(inbox.wa, []);
  assert.deepEqual(inbox.wb, [{ t: 'ch', k: 'g', d: D, i: 'resetKitchen', g: 'dishes', n: 'Anna' }]);
  assert.deepEqual(inbox.wc, inbox.wb);
  r.handle('wb', B, msg({ k: 'g', u: UB, d: D, i: 'resetKitchen', g: 'dishes' }), 2000); // B did the same goal too: noted, not told again
  assert.equal(inbox.wa.length, 0); assert.equal(inbox.wc.length, 1);
  assert.ok(!JSON.stringify(inbox).includes(UA) && !JSON.stringify(inbox).includes(UB));
});

test('the room remembers who helped: a helper who comes back is told which goals were theirs', () => {
  const { r, inbox, A, B, C } = room();
  r.handle('wa', A, msg({ k: 'g', u: UA, d: D, i: 'resetKitchen', g: 'dishes' }), 1000);
  r.handle('wb', B, msg({ k: 'g', u: UB, d: D, i: 'resetKitchen', g: 'wipe' }), 2000);
  r.handle('wb', B, msg({ k: 'g', u: UB, d: D, i: 'resetKitchen', g: 'rubbish' }), 3000);
  // A reconnects as a new connection with the same key
  const A2 = { i: 'a2a2', n: 'Anna' };
  r.handle('wa', A2, msg({ k: 'hi', u: UA }), 10000);
  assert.deepEqual(inbox.wa.at(-1), { t: 'ch', k: 'L', rows: [[D, 'resetKitchen', 'dishes', 1, ''], [D, 'resetKitchen', 'wipe', 0, 'Bo'], [D, 'resetKitchen', 'rubbish', 0, 'Bo']] });
  r.handle('wc', C, msg({ k: 'hi', u: UC }), 11000);
  assert.deepEqual(inbox.wc.at(-1).rows.map((x) => x[3]), [0, 0, 0], 'C helped with nothing');
});

test('bounds: too fast is dropped, the oldest day goes, a day holds a limited number of goals', () => {
  const { r, inbox, A } = room();
  r.handle('wa', A, msg({ k: 'g', u: UA, d: D, i: 'a', g: 'x' }), 1000);
  r.handle('wa', A, msg({ k: 'g', u: UA, d: D, i: 'a', g: 'y' }), 1050);
  assert.equal(inbox.wb.length, 1);
  for (let k = 0; k < CHORE_SYNC.days + 2; k++) r.handle('wa', A, msg({ k: 'g', u: UA, d: `2026-12-0${k + 1}`, i: 'a', g: 'x' }), 5000 + k * 1000);
  assert.equal(r.days.size, CHORE_SYNC.days); assert.equal(r.days.has(D), false);
  const day = '2027-01-01';
  for (let k = 0; k < CHORE_SYNC.goals + 5; k++) r.handle('wa', A, msg({ k: 'g', u: UA, d: day, i: 'a', g: `g${k}` }), 100000 + k * 1000);
  assert.equal(r.days.get(day).size, CHORE_SYNC.goals);
});
