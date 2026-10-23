// #1405: the player-interaction menu rows (greet / hug / Sarah↔Olof kiss) and the hug's range and envelope.
import test from 'node:test';
import assert from 'node:assert/strict';
import { canHug, hugAmount, playerChoices } from '../src/hug.js';
import { HUG, KISS, GHOSTS } from '../src/config.js';
test('ordinary pairs get greet + hug; only a complementary Sarah/Olof pair also gets kiss, both directions', () => {
  for (const [a, b] of [['Bertil', 'Anna'], ['Sarah', 'Sarah'], ['Olof', 'Olof'], ['Sarah Olof', 'Olof'], ['Sarah', 'Olof Sarah'], ['Olofsarah', 'Sarah'], ['', 'Olof'], [null, 'Sarah']])
    assert.deepEqual(playerChoices(a, b), ['greet', 'hug'], `${a}/${b}`);
  for (const [a, b] of [['Sarah', 'Olof'], ['Olof', 'Sarah'], ['sArAh 2', 'Ｏｌｏｆsson']]) assert.deepEqual(playerChoices(a, b), ['greet', 'hug', 'kiss'], `${a}/${b}`);
});
test('hug range is inclusive 3D and rejects malformed feet; the reserved phrase never collides', () => {
  assert(canHug([0, 0, 0], [0, 0, HUG.range]));
  for (const to of [[0, 0, HUG.range + .001], [0, 2, 0], [NaN, 0, 0], [], null]) assert(!canHug([0, 0, 0], to));
  assert(!canHug(undefined, [0, 0, 1]));
  assert.notEqual(HUG.phrase, KISS.phrase); assert(HUG.phrase >= GHOSTS.hello.length && HUG.phrase < 16);
});
test('hug envelope approaches, holds and returns to 0', () => {
  assert.equal(hugAmount(-1), 0); assert.equal(hugAmount(0), 0); assert.equal(hugAmount(HUG.contact), 1);
  assert.equal(hugAmount(HUG.release), 1); assert.equal(hugAmount(HUG.duration), 0);
  assert(hugAmount(HUG.duration - .05) < .1);
});
