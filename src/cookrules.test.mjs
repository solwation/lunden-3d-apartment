// node --test src/cookrules.test.mjs — the shared cooking rule (#1881)
import test from 'node:test';
import assert from 'node:assert/strict';
import { COOKING, ITEMS } from './config.js';
import { APPLIANCES, FOODS, cooksKind, cookRefusal, canCook, cookRate, fits, lifeFood } from './cookrules.js';

const group = ['pan', 'oven', 'airfryer'];

test('the pan, the oven and the air fryer take the same kinds of food', () => {
  assert.deepEqual(COOKING.group, group);
  for (const f of FOODS) {
    const yes = group.map((a) => cooksKind(f, a));
    assert.ok(yes.every((v) => v === yes[0]), `${f}: ${yes}`);
    assert.ok(yes[0], `${f} cooks in the group`);
  }
});

test('the grill takes only meat (and the caught fish, #1754)', () => {
  const grill = FOODS.filter((f) => canCook(f, 'grill')).sort();
  assert.deepEqual(grill, ['caughtFish', 'chicken', 'sausage']);
  for (const f of FOODS) assert.equal(cooksKind(f, 'grill'), COOKING.foods[f].tags.some((t) => ['meat', 'catch'].includes(t)), f);
});

test('grill refusals name the food', () => {
  assert.equal(cookRefusal('fries', 'grill'), 'Det går inte att grilla pommes');
  assert.equal(cookRefusal('fishFinger', 'grill'), 'Det går inte att grilla fiskpinnar');
  assert.equal(cookRefusal('egg', 'grill'), 'Det går inte att grilla ägg');
});

test('the full matrix: everything in the group, the whole chicken too big for the pan and the basket', () => {
  const m = Object.fromEntries(FOODS.map((f) => [f, Object.fromEntries(APPLIANCES.map((a) => [a, canCook(f, a)]))]));
  assert.deepEqual(m, {
    fishFinger: { pan: true, oven: true, airfryer: true, grill: false },
    fries: { pan: true, oven: true, airfryer: true, grill: false },
    sausage: { pan: true, oven: true, airfryer: true, grill: true },
    egg: { pan: true, oven: true, airfryer: true, grill: false },
    caughtFish: { pan: true, oven: true, airfryer: true, grill: true },
    chicken: { pan: false, oven: true, airfryer: false, grill: true },
  });
  assert.ok(!fits('chicken', 'pan') && !fits('chicken', 'airfryer') && fits('chicken', 'oven'));
  assert.equal(cookRefusal('chicken', 'pan'), 'Kycklingen är för stor för stekpannan – använd ugnen eller grillen');
  assert.equal(cookRefusal('chicken', 'airfryer'), 'Kycklingen är för stor för airfryern – använd ugnen eller grillen');
});

test('rates: old pairs unchanged, refused pairs zero, every allowed pair positive', () => {
  assert.equal(cookRate('fishFinger', 'pan'), 1);
  assert.equal(cookRate('fishFinger', 'airfryer'), 1.2 * 6 / 20); // AIRFRYER.rate (#287)
  assert.equal(cookRate('fries', 'airfryer'), 1);
  assert.equal(cookRate('sausage', 'grill'), 1); assert.equal(cookRate('sausage', 'pan'), 1);
  assert.equal(cookRate('caughtFish', 'pan'), 1.25); assert.equal(cookRate('chicken', 'oven'), 1);
  assert.equal(cookRate('fries', 'grill'), 0); assert.equal(cookRate('chicken', 'pan'), 0);
  for (const f of FOODS) for (const a of APPLIANCES) if (canCook(f, a)) assert.ok(cookRate(f, a) > 0, `${f}/${a}`);
});

test('life items declare which food they cook as; unknowns are refused', () => {
  assert.equal(lifeFood(ITEMS, 'rawEgg'), 'egg'); assert.equal(lifeFood(ITEMS, 'friedEgg'), 'egg'); assert.equal(lifeFood(ITEMS, 'sausage'), 'sausage');
  assert.equal(lifeFood(ITEMS, 'breadSlice'), null);
  assert.ok(cookRefusal('nothing', 'pan')); assert.ok(cookRefusal('fries', 'toaster'));
});
