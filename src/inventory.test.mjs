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
  const cup = thing('Cup', { isCup: true }), bow = thing('Bow'), cup2 = thing('Cup', { isCup: true });
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
});
