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
