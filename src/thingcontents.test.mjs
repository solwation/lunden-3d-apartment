import test from 'node:test';
import assert from 'node:assert/strict';
import { drinkData, readDrink } from './thingcontents.js';
import { cleanData } from './thingsync.js';

test('a drink travels as a short valid string and comes back the same', () => {
  const d = drinkData({ wine: 0.61234, coffee: 0.002 }, true);
  assert.equal(d, '{"a":{"wine":0.612},"u":1}');
  assert.equal(cleanData(d), d, 'fits the wire');
  assert.deepEqual(readDrink(d), { a: { wine: 0.612 }, used: true, heat: 0 });
  assert.deepEqual(readDrink(drinkData({ coffee: 0.5, milk: 0.2 }, false, 0.8)), { a: { milk: 0.2, coffee: 0.5 }, used: false, heat: 0.8 });
});

test('empty, clean and cold is nothing to carry; dirty and empty is', () => {
  assert.equal(drinkData({}, false), null); assert.equal(drinkData({ wine: 0.001 }, false, 0.9), null);
  assert.equal(drinkData(null, true), '{"u":1}');
  assert.deepEqual(readDrink(null), { a: {}, used: false, heat: 0 });
});

test('a reader trusts nothing: unknown drinks, bad numbers, too much and junk are dropped', () => {
  assert.deepEqual(readDrink('{"a":{"poison":1,"wine":"x","whisky":0.4,"beer":0.9},"u":true,"h":5}'), { a: { beer: 0.9 }, used: false, heat: 1 }); // (beer first; the whisky would make it more than a glassful)
  assert.deepEqual(readDrink('not json'), { a: {}, used: false, heat: 0 });
  assert.deepEqual(readDrink('[1,2]'), { a: {}, used: false, heat: 0 });
  assert.deepEqual(readDrink('{"a":{"wine":-1},"h":0.5}'), { a: {}, used: false, heat: 0 });
});

test('#1976 a coffee cup carries its pattern, drink, coarse heat and dirt; an unknown pattern is dropped', async () => {
  const { cupData, readCup } = await import('./thingcontents.js');
  const d = cupData({ coffee: 0.6, milk: 0.1 }, true, 0.83, 'red-dots');
  assert.equal(cleanData(d), d);
  assert.deepEqual(readCup(d, ['red-dots', 'cat']), { a: { milk: 0.1, coffee: 0.6 }, used: true, heat: 1, design: 'red-dots' });
  assert.equal(cupData({ coffee: 0.6 }, false, 0.8, 'cat'), cupData({ coffee: 0.6 }, false, 0.76, 'cat'), 'a little cooling is not a change');
  assert.equal(readCup(cupData({}, false, 0, 'cat'), ['cat']).design, 'cat');
  assert.equal(readCup('{"g":"evil<script>"}', ['cat']).design, null);
  assert.equal(readCup(cupData({}, false, 0, 'nope'), ['cat']).design, null);
});
