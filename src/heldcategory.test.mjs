// node --test src/heldcategory.test.mjs — the held-item category mapping (#1297)
import test from 'node:test';
import assert from 'node:assert/strict';
import { heldCategory, cleanHeldCategory, HELD_CATEGORIES } from './heldcategory.js';

const make = (name, props = {}) => Object.assign(new ({ [name]: class {} })[name](), props);
const life = (tags) => ({ lifeItem: true, item: { type: 't' }, life: { items: { def: () => ({ tags }) } } });

test('nothing, weapons and cats map to none', () => {
  assert.equal(heldCategory(null), ''); assert.equal(heldCategory(undefined), '');
  for (const c of ['Saber', 'Blaster', 'Wand', 'Bow', 'Basketball', 'MieleHeld']) assert.equal(heldCategory(make(c)), '', c);
  assert.equal(heldCategory({ isRifle: true }), ''); assert.equal(heldCategory({ isMiele: true }), '');
});
test('known classes map to their category', () => {
  const t = { Jug: 'bottle', Milk: 'bottle', BeerCan: 'bottle', Book: 'book', HeldDrawing: 'paper', ToiletPaper: 'paper', Pan: 'tool', Cloth: 'tool', Vacuum: 'tool', Flashlight: 'tool', Remote: 'tool', SillPot: 'plant', Fruit: 'food', FriesBag: 'food', Chicken: 'food', Trinket: 'box' };
  for (const [c, k] of Object.entries(t)) assert.equal(heldCategory(make(c)), k, c);
  assert.equal(heldCategory({ isCup: true }), 'cup');
  assert.equal(heldCategory(make('Thing', { kind: 'glass' })), 'cup');
  assert.equal(heldCategory(make('Bottle', { kind: 'wine' })), 'bottle');
  assert.equal(heldCategory(make('Thing', { kind: 'plant' })), 'plant');
  assert.equal(heldCategory(make('Photo', { kind: 'photo' })), 'paper');
  assert.equal(heldCategory(make('SomethingNew')), 'box', 'unknown things are a generic box');
});
test('life items follow their tags', () => {
  assert.equal(heldCategory(life(['dish', 'carrier'])), 'plate');
  assert.equal(heldCategory(life(['dish', 'glass'])), 'cup');
  assert.equal(heldCategory(life(['tool', 'tool:cut'])), 'tool');
  assert.equal(heldCategory(life(['food'])), 'food');
  assert.equal(heldCategory(life(['food', 'package'])), 'box');
  assert.equal(heldCategory(life(['toiletRoll'])), 'paper');
  assert.equal(heldCategory(life(['laundry'])), 'box');
});
test('every result is on the whitelist; cleanHeldCategory drops anything else', () => {
  for (const k of HELD_CATEGORIES) assert.equal(cleanHeldCategory(k), k);
  for (const v of ['', 'sword', 'CUP', 1, null, undefined, {}, ['cup'], 'cup ', '__proto__', 'constructor']) assert.equal(cleanHeldCategory(v), '', String(v));
  for (const it of [make('Cup'), make('Fruit'), life(['x']), make('Zzz')]) { const k = heldCategory(it); assert.ok(k === '' || HELD_CATEGORIES.includes(k)); }
});

test('#1687: a billiard cue is a cue (by flag and by class name), never the generic box', () => {
  assert.equal(heldCategory({ isBilliardCue: true }), 'cue');
  class BilliardCue {}
  assert.equal(heldCategory(new BilliardCue()), 'cue');
  assert.ok(HELD_CATEGORIES.includes('cue'));
});
