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
  const t = { Jug: 'bottle', Milk: 'bottle', BeerCan: 'bottle', Book: 'book', HeldDrawing: 'paper', ToiletPaper: 'paper', Pan: 'pan', Cloth: 'tool', Vacuum: 'tool', Flashlight: 'flashlight', Remote: 'remote', SillPot: 'plant', Fruit: 'food', FriesBag: 'fries', Chicken: 'chicken', Trinket: 'box' };
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
  assert.equal(heldCategory(life(['hallShoes'])), 'box');
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

test('#1755: binoculars, spray cans, gifts, bags and fish fingers are no longer the generic box', () => {
  assert.equal(heldCategory({ isBinoculars: true }), 'binoculars');
  assert.equal(heldCategory({ isSprayCan: true }), 'spray');
  assert.equal(heldCategory(make('Binoculars')), 'binoculars');
  assert.equal(heldCategory(make('SprayCan')), 'spray');
  assert.equal(heldCategory(make('ChristmasGift')), 'gift');
  assert.equal(heldCategory({ isFish: true }), 'fishfinger'); // (#1963: its own proxy, no longer the generic food)
  assert.equal(heldCategory(life(['rubbishBag'])), 'bag');
  assert.equal(heldCategory(life(['laundry'])), 'bag');
  assert.equal(heldCategory(make('Nut', { isSquirrelNut: true })), 'nut');
  for (const k of ['nut', 'binoculars', 'spray', 'gift', 'bag']) assert.ok(HELD_CATEGORIES.includes(k), k);
});

test('#1753: the fishing rod and a caught fish have their own categories (a fish finger is no fish: #1963 gave it its own category)', () => {
  assert.equal(heldCategory({ isFishingRod: true }), 'rod');
  assert.equal(heldCategory({ isCaughtFish: true }), 'fish');
  assert.equal(heldCategory(make('FishingRod')), 'rod');
  assert.equal(heldCategory(make('CaughtFish')), 'fish');
  assert.equal(heldCategory({ isFish: true }), 'fishfinger'); // (#1963: its own proxy, no longer the generic food)
  for (const k of ['rod', 'fish']) assert.ok(HELD_CATEGORIES.includes(k), k);
});

test('#1769: a shark fin has its own category, and the Worker keeps it', () => {
  assert.equal(heldCategory({ isSharkFin: true }), 'sharkfin');
  assert.equal(heldCategory(make('SharkFin')), 'sharkfin');
  assert.equal(cleanHeldCategory('sharkfin'), 'sharkfin');
  assert.equal(heldCategory({ isMussel: true }), 'mussel'); // #1945
  assert.equal(heldCategory(make('Mussel')), 'mussel');
  assert.equal(cleanHeldCategory('mussel'), 'mussel');
});

test('#1963: the other players see what is carried: chicken, fries, popcorn, fish fingers, each fruit, pan, torch, remote, harpoon', () => {
  const t = { Chicken: 'chicken', ChickenPiece: 'drumstick', FriesBag: 'fries', FriesBunch: 'fries', PopcornTub: 'popcorn', FishFinger: 'fishfinger', Pan: 'pan', Flashlight: 'flashlight', Remote: 'remote', Harpoon: 'harpoon' };
  for (const [c, k] of Object.entries(t)) { assert.equal(heldCategory(make(c)), k, c); assert.ok(HELD_CATEGORIES.includes(k), k); }
  assert.notEqual(heldCategory(make('Chicken')), heldCategory(make('Fruit', { kind: 'apple' })), 'a chicken is not an apple');
  for (const [kind, k] of Object.entries({ apple: 'food', pear: 'pear', orange: 'orange', clementine: 'orange', banana: 'banana' })) {
    assert.equal(heldCategory(make('Fruit', { kind, isFruit: true })), k, kind);
    assert.equal(heldCategory({ isFruit: true, kind }), k, `${kind} by flag`);
  }
  assert.equal(heldCategory({ isHarpoon: true }), 'harpoon');
  assert.equal(heldCategory({ isHarpoon: true, isFruit: false }), 'harpoon');
  assert.equal(new Set(HELD_CATEGORIES).size, HELD_CATEGORIES.length, 'no duplicate keys');
});
