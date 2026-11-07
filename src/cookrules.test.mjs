// node --test src/cookrules.test.mjs — the shared cooking rule (#1881), realistic per food (#1887)
import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS } from './config.js';
import { APPLIANCES, FOODS, cookRefusal, canCook, cookRate, cooksIn, fits, lifeFood } from './cookrules.js';

test('the full matrix (#1887): each food only where it sensibly cooks', () => {
  const m = Object.fromEntries(FOODS.map((f) => [f, Object.fromEntries(APPLIANCES.map((a) => [a, canCook(f, a)]))]));
  assert.deepEqual(m, {
    fishFinger: { pan: true, oven: true, airfryer: true, grill: false },
    fries: { pan: false, oven: true, airfryer: true, grill: false },
    sausage: { pan: true, oven: true, airfryer: true, grill: true },
    egg: { pan: true, oven: false, airfryer: false, grill: false },
    caughtFish: { pan: true, oven: true, airfryer: true, grill: true },
    chicken: { pan: false, oven: true, airfryer: false, grill: true },
  });
  assert.deepEqual(cooksIn('fries'), ['oven', 'airfryer']);
  assert.deepEqual(cooksIn('egg'), ['pan']);
});

test('refusals sound natural and say where the food goes', () => {
  assert.equal(cookRefusal('fries', 'pan'), 'Pommes gör man i ugnen eller airfryern');
  assert.equal(cookRefusal('fries', 'grill'), 'Pommes gör man i ugnen eller airfryern');
  assert.equal(cookRefusal('egg', 'oven'), 'Ägg steker man i stekpannan');
  assert.equal(cookRefusal('egg', 'airfryer'), 'Ägg steker man i stekpannan');
  assert.equal(cookRefusal('egg', 'grill'), 'Ägg steker man i stekpannan');
  assert.equal(cookRefusal('fishFinger', 'grill'), 'Fiskpinnar gör man i stekpannan, ugnen eller airfryern');
});

test('the whole chicken is too big for the pan and the basket', () => {
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
  assert.equal(cookRate('fries', 'pan'), 0); assert.equal(cookRate('egg', 'oven'), 0); assert.equal(cookRate('chicken', 'pan'), 0);
  for (const f of FOODS) for (const a of APPLIANCES) if (canCook(f, a)) assert.ok(cookRate(f, a) > 0, `${f}/${a}`);
});

test('life items declare which food they cook as; unknowns are refused', () => {
  assert.equal(lifeFood(ITEMS, 'rawEgg'), 'egg'); assert.equal(lifeFood(ITEMS, 'friedEgg'), 'egg'); assert.equal(lifeFood(ITEMS, 'sausage'), 'sausage');
  assert.equal(lifeFood(ITEMS, 'breadSlice'), null);
  assert.ok(cookRefusal('nothing', 'pan')); assert.ok(cookRefusal('fries', 'toaster'));
});
