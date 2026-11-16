import test from 'node:test';
import assert from 'node:assert/strict';

// #1954: the inventory's rules in src/holdable.js, with minimal stand-in things (no scene). Needs `three` resolvable for node
// (as the other three-importing tests): `node --test src/inventory.test.mjs`.
const H = await import('./holdable.js');
const { setHeld, heldItem, handBusy, selectSlot, cycleSlot, inventorySlots, inventoryTick, isStowed, isPocketed, pocketable } = H;

let n = 0;
const HAND = { isHand: true, add(m) { m.parent = HAND; } };
const thing = (cls, extra = {}) => {
  const model = { parent: null, position: { clone() { return { copy() {} }; }, copy() {} }, quaternion: { clone() { return { copy() {} }; }, copy() {} }, scale: { clone() { return {}; }, copy() {} }, visible: true,
    removeFromParent() { this.parent = null; } };
  const o = { id: n++, constructor: { name: cls }, model, held: false, placed: false, puts: 0, ...extra,
    take() { if (handBusy(o)) return false; setHeld(o); o.held = true; o.placed = false; model.parent = HAND; return true; },
    putBack() { if (!o.held) return; o.held = false; if (heldItem() === o) setHeld(null); o.puts++; model.parent = 'home'; } };
  Object.defineProperty(o, 'constructor', { value: { name: cls } });
  return o;
};
const counts = () => inventorySlots().map((s) => s.count).join('');
const reset = () => { for (let i = 0; i < 5; i++) { selectSlot(i); for (let h; (h = heldItem());) { h.broken = true; h.held = false; setHeld(null); inventoryTick(); } } selectSlot(0); for (const s of inventorySlots()) assert.equal(s.count, 0); };

test('a second weapon goes to a free place instead of sending the first home', () => {
  reset();
  const bow = thing('Bow'), saber = thing('Saber');
 
  assert.ok(pocketable(bow));
  assert.equal(bow.take(), true);
  assert.equal(handBusy(saber), false);
  assert.equal(saber.take(), true);
  assert.equal(heldItem(), saber); assert.equal(bow.puts, 0); assert.equal(bow.held, false);
  assert.ok(isPocketed(bow) && isStowed(bow) && !isPocketed(saber));
  assert.equal(counts(), '11000');
  assert.equal(inventorySlots()[1].active, true);
});

test('choosing a place swaps what is in the hand; the wheel skips empty places', () => {
  reset();
  const bow = thing('Bow'), saber = thing('Saber');
  bow.take(); saber.take();
  assert.equal(selectSlot(0), true); assert.equal(heldItem(), bow); assert.equal(bow.held, true); assert.ok(isPocketed(saber));
  assert.equal(selectSlot(0), 'same');
  assert.equal(selectSlot(3), true); assert.equal(heldItem(), null); assert.equal(counts(), '11000');
  assert.equal(cycleSlot(1), true); assert.equal(heldItem(), bow);
  assert.equal(cycleSlot(1), true); assert.equal(heldItem(), saber);
  assert.equal(cycleSlot(-1), true); assert.equal(heldItem(), bow);
  assert.equal(bow.puts + saber.puts, 0);
});

test('five places, then the hand is busy', () => {
  reset();
  const all = ['Bow', 'Saber', 'Wand', 'Blaster', 'Flashlight'].map((c) => thing(c));
  for (const t of all) { assert.equal(t.take(), true); }
  assert.equal(counts(), '11111');
  const extra = thing('Harpoon');
  assert.equal(handBusy(extra), true); assert.equal(extra.take(), false);
  assert.equal(heldItem(), all[4]);
});

test('nuts stack up to eight on one place and come back one by one', () => {
  reset();
  const nuts = [...Array(9)].map(() => thing('Nut', { isSquirrelNut: true }));
  for (const t of nuts.slice(0, 8)) { assert.equal(t.take(), true); }
  assert.equal(counts(), '80000'); assert.equal(heldItem(), nuts[7]);
  assert.equal(nuts[8].take(), true); // the ninth starts a new place
  assert.equal(counts(), '81000');
  const bow = thing('Bow'); bow.take();
  assert.equal(counts(), '81100');
  selectSlot(0); assert.equal(heldItem(), nuts[7]);
  nuts[7].putBack(); assert.equal(heldItem(), null); // put down / eaten
  inventoryTick(); assert.equal(heldItem(), nuts[6]); assert.equal(counts(), '71100');
});

test('a thing that cannot be carried keeps the old rule', () => {
  reset();
  const cup = thing('Cat', { isMiele: true }), bow = thing('Bow'), cup2 = thing('Cat', { isMiele: true });
  assert.equal(pocketable(cup), false);
  bow.take();
  assert.equal(cup.take(), true); // the bow is carried, the cup in the hand
  assert.ok(isPocketed(bow)); assert.equal(heldItem(), cup);
  assert.equal(handBusy(cup2), true); assert.equal(selectSlot(0), 'busy'); assert.equal(heldItem(), cup);
  cup.putBack(); assert.equal(selectSlot(0), true); assert.equal(heldItem(), bow);
});

test('a carried thing that was reset or broke meanwhile loses its place and is never brought back', () => {
  reset();
  const bow = thing('Bow'), saber = thing('Saber');
  bow.take(); saber.take();
  bow.model.parent = 'home'; // its owner put it back in the world
  inventoryTick();
  assert.equal(counts(), '01000'); assert.equal(isPocketed(bow), false);
  assert.equal(selectSlot(0), true); assert.equal(heldItem(), null);
});

// #1959: keep.js `inventory` part: the places, the stacks and the active place survive saveWorld → loadWorld (the other parts fail
// on the stand-in app and are skipped: each part is tried on its own).
const K = await import('./keep.js');
const named = (cls, name, extra = {}) => thing(cls, { name, home: { pos: { x: n, y: 0, z: 0 } }, keepPos: { x: n, y: 0, z: 0 }, ...extra });
const quiet = async (fn) => { const w = console.warn; console.warn = () => {}; try { return await fn(); } finally { console.warn = w; } };
const appFor = (holdables, extra = {}) => ({ holdables, cups: null, fishing: null, squirrels: null, ...extra });

test('keep: carried things, their places and the active place come back after a reload', async () => {
  reset();
  const list = ['Bow', 'Saber', 'Wand', 'Flashlight'].map((c, i) => named(c, c + i));
  for (const t of list) t.take();
  selectSlot(1); // the saber in hand, the bow on place 1 ... (slots: 0 bow, 1 saber (active), 2 wand, 3 flashlight)
  const before = inventorySlots().map((s) => [s.item?.name, s.count, s.active]);
  const app = appFor(list);
  const saved = await quiet(() => JSON.parse(JSON.stringify(K.saveWorld(app))));
  assert.ok(saved.inventory && saved.inventory.a === 1);
  // the page is rebuilt: the same things are at home again, the inventory empty
  reset(); for (const t of list) { t.broken = false; t.held = false; t.placed = false; t.model.parent = 'home'; }
  assert.equal(counts(), '00000');
  await quiet(() => K.loadWorld(app, saved));
  assert.deepEqual(inventorySlots().map((s) => [s.item?.name, s.count, s.active]), before);
  assert.equal(heldItem(), list[1]); assert.equal(list[1].held, true);
  for (const t of [list[0], list[2], list[3]]) { assert.ok(isPocketed(t)); assert.equal(t.held, false); assert.equal(t.model.parent, null); }
  assert.equal(list.reduce((s, t) => s + t.puts, 0), 0);
});

test('keep: a thing that is gone at load is dropped from its place, an old save without inventory changes nothing', async () => {
  reset();
  const [a, b, c] = ['Bow', 'Saber', 'Wand'].map((cl, i) => named(cl, cl + i));
  a.take(); b.take(); c.take();
  const saved = await quiet(() => JSON.parse(JSON.stringify(K.saveWorld(appFor([a, b, c])))));
  reset();
  for (const t of [a, b, c]) { t.broken = false; t.held = false; t.placed = false; t.model.parent = 'home'; }
  b.broken = true; // broken meanwhile: not restored
  await quiet(() => K.loadWorld(appFor([a, b, c]), saved));
  assert.ok([a, c].every((t) => heldItem() === t || isPocketed(t))); assert.ok(!isPocketed(b) && heldItem() !== b);
  assert.equal(inventorySlots().reduce((s, x) => s + x.count, 0), 2);
  const old = { v: 1 }; reset();
  await quiet(() => K.loadWorld(appFor([a, b, c]), old));
  assert.equal(counts(), '00000');
});

test('keep: a cup in the hand over carried things stays in the hand', async () => {
  reset();
  const bow = named('Bow', 'bow'), cup = named('Cup', 'cup');
  bow.take(); cup.take(); // bow carried, the cup in the hand
  assert.equal(heldItem(), cup);
  assert.equal(isPocketed(bow), true);
  const app = appFor([bow, cup]);
  const saved = await quiet(() => JSON.parse(JSON.stringify(K.saveWorld(app))));
  assert.deepEqual(saved.inventory.s.map((l) => l.length).join(''), '10000');
  const slot = inventorySlots().findIndex((x) => x.active);
  // reload: the page starts empty; the things part has put the cup into the hand again
  cup.held = false; setHeld(null); reset(); bow.broken = false; bow.held = false; bow.model.parent = 'home'; cup.broken = false; cup.held = false; cup.model.parent = 'home';
  cup.take(); assert.equal(heldItem(), cup); const puts = cup.puts;
  await quiet(() => K.loadWorld(app, saved));
  assert.ok(isPocketed(bow)); assert.equal(heldItem(), cup); assert.equal(cup.held, true);
  assert.equal(inventorySlots().findIndex((x) => x.active), slot); assert.equal(cup.puts, puts);
  bow.broken = true; cup.held = false; setHeld(null); inventoryTick(); bow.broken = false; // (leave no carried things for the next test)
});

// #1960: food and cups are carried too; their state (contents, bites, dirty) is untouched while they are away from the hand.
test('food, cups and glasses are pocketable; a picnic glass is not (the chicken: #1983 below)', () => {
  for (const [cls, flags] of [['Cup', { isCup: true }], ['Fruit', { isFruit: true }], ['Object', { isFish: true }], ['FriesBunch', { isFries: true }], ['Glass', {}], ['Bottle', {}], ['PopcornTub', {}], ['BeerCan', {}], ['Milk', {}]]) {
    assert.ok(pocketable(thing(cls, flags)), cls);
  }
  assert.equal(pocketable(thing('Glass', { isSharedPicnic: true })), false);
  assert.equal(pocketable(thing('Cup', { isCup: true, broken: true })), false);
});

test('a cup with coffee and a half-eaten fruit are carried, swapped and come back unchanged', () => {
  reset();
  const cup = thing('Cup', { isCup: true, state: 'cabinet', contents: { a: { coffee: 0.6 } }, heat: 0.7, dirty: false });
  const fruit = thing('Fruit', { isFruit: true, state: 'bowl', bites: 2, peeled: true });
  cup.take(); cup.state = 'held'; fruit.take(); fruit.state = 'held';
  assert.equal(heldItem(), fruit); assert.ok(isPocketed(cup)); assert.equal(cup.puts, 0);
  assert.equal(handBusy(thing('Saber')), false);
  assert.equal(selectSlot(0), true); assert.equal(heldItem(), cup);
  assert.deepEqual(cup.contents.a, { coffee: 0.6 }); assert.equal(cup.heat, 0.7);
  assert.equal(selectSlot(1), true); assert.equal(heldItem(), fruit); assert.equal(fruit.bites, 2); assert.equal(fruit.peeled, true);
  assert.equal(fruit.puts, 0);
});

test('keep: a carried cup and a carried food portion come back to their places after a reload', async () => {
  reset();
  const cups = [thing('Cup', { isCup: true, state: 'cabinet' }), thing('Cup', { isCup: true, state: 'cabinet' })];
  const fruit = thing('Fruit', { isFruit: true, state: 'bowl' });
  let loaded = null;
  const owner = { saveStowed: (it) => (it === fruit && it.state === 'held' ? { slot: 0, bites: 1 } : null), loadStowed: (st) => { loaded = st; fruit.take(); fruit.state = 'held'; return fruit; } };
  cups[0].take(); cups[0].state = 'held'; fruit.take(); fruit.state = 'held'; cups[1].take(); cups[1].state = 'held';
  assert.equal(counts(), '11100');
  const app = appFor([], { cups: { cups }, bicycleStow: { fruit: owner } });
  const saved = await quiet(() => JSON.parse(JSON.stringify(K.saveWorld(app))));
  assert.deepEqual(saved.inventory.s.slice(0, 3).map((l) => l[0][0] + (l[0][1] ?? '')), ['c0', 'bfruit', 'c1']);
  assert.deepEqual(saved.things.cups.map((c) => c.s), ['pocket', 'held']);
  reset(); for (const c of [...cups, fruit]) c.broken = false; // (reset marks what it empties as broken)
  for (const c of cups) { c.state = 'cabinet'; c.held = false; c.model.parent = 'home'; } fruit.state = 'bowl'; fruit.held = false; fruit.model.parent = 'home';
  cups[1].take(); cups[1].state = 'held'; // the things part brings the hand cup back
  await quiet(() => K.loadWorld(app, saved));
  assert.deepEqual(loaded, { slot: 0, bites: 1 });
  assert.ok(isPocketed(cups[0]) || heldItem() === cups[0]); assert.ok(isPocketed(fruit) || heldItem() === fruit);
  assert.equal(inventorySlots().reduce((s, x) => s + x.count, 0), 3);
});

// #1961: the life simulator's things. A stand-in view per instance with LifeItem's hooks; the real domain (items.js).
const { Items } = await import('./items.js');
const { ITEMS } = await import('./config.js');
const lifeThing = (items, type) => {
  const item = items.create(type, { at: 'world', pos: [0, 1, 0], yaw: 0 });
  const life = { items };
  const v = thing('LifeItem', { lifeItem: true, life, item,
    onPocket(on) { items.move(item, on ? { at: 'pocket' } : { at: 'hand' }, { force: true, except: items.held() }); } });
  Object.assign(v, {
    take() {
      if (handBusy(v)) return false;
      const h = items.held();
      if (items.move(item, { at: 'hand' }, { except: h && h !== item && heldItem()?.item === h ? h : null })) return false;
      setHeld(v); v.held = true; v.model.parent = HAND; return true;
    } });
  return v;
};
test('life things are carried: the domain counts a carried thing as in no hand, store or carrier', () => {
  reset();
  const items = new Items(ITEMS);
  const bag = lifeThing(items, 'rubbishBag'), clothes = lifeThing(items, 'laundryClothes');
  assert.ok(!pocketable(bag) || bag.item.place.at === 'hand'); // only a held thing is judged
  assert.equal(bag.take(), true); assert.ok(pocketable(bag));
  assert.equal(clothes.take(), true);
  assert.ok(isPocketed(bag)); assert.deepEqual(bag.item.place, { at: 'pocket' }); assert.deepEqual(clothes.item.place, { at: 'hand' });
  assert.equal(items.held(), clothes.item); // exactly one in the hand
  assert.deepEqual(items.audit(), []);
  assert.equal(items.check(bag.item, { at: 'hand' }), `Lägg ifrån dig ${items.name(clothes.item)} först`); // the domain rule is unchanged
  assert.equal(selectSlot(0), true);
  assert.equal(heldItem(), bag); assert.equal(items.held(), bag.item); assert.deepEqual(clothes.item.place, { at: 'pocket' });
  assert.deepEqual(items.audit(), []);
});
test('a carried life thing is dropped from its place when removed; fixed things (bins) are never carried', () => {
  reset();
  const items = new Items(ITEMS);
  const bag = lifeThing(items, 'rubbishBag'), other = lifeThing(items, 'knife');
  bag.take(); other.take();
  assert.ok(isPocketed(bag));
  H.forgetPocketed(bag); items.remove(bag.item);
  assert.ok(!isPocketed(bag));
  const bin = lifeThing(items, 'bin'); bin.item.place = { at: 'hand' };
  assert.equal(pocketable(bin), false);
  assert.match(items.check(bin.item, { at: 'pocket' }), /bära/);
});
test('a record with a carried thing loads it back as carried, and a new visit sends it home', () => {
  const items = new Items(ITEMS);
  const bag = items.create('rubbishBag', { at: 'pocket' });
  assert.deepEqual(items.audit(), []);
  const rec = items.serialize();
  const a = new Items(ITEMS); a.load(rec, { hand: true });
  assert.deepEqual(a.get(bag.id).place, { at: 'pocket' });
  const b = new Items(ITEMS); b.load(rec, { hand: false });
  assert.notEqual(b.get(bag.id).place.at, 'pocket');
});

// #1983: the whole chicken and its pieces are carried; several pieces at once, none replacing another.
test('chicken: the whole bird and several pieces share places and swap into the hand', () => {
  reset();
  const bird = thing('Chicken'), p1 = thing('ChickenPiece', { isChickenPiece: true }), p2 = thing('ChickenPiece', { isChickenPiece: true });
  assert.ok(pocketable(bird) && pocketable(p1));
  assert.equal(p1.take(), true); assert.equal(handBusy(p2), false);
  assert.equal(p2.take(), true); assert.equal(bird.take(), true);
  assert.equal(counts(), '11100'); assert.equal(p1.puts + p2.puts + bird.puts, 0);
  assert.ok(isPocketed(p1) && isPocketed(p2) && heldItem() === bird);
  selectSlot(0); assert.equal(heldItem(), p1); assert.ok(isPocketed(bird));
  p1.broken = true; p1.held = false; setHeld(null); inventoryTick(); // eaten / discarded: its place is free, the others stay
  assert.equal(counts(), '01100'); assert.ok(isPocketed(p2) && isPocketed(bird));
});
