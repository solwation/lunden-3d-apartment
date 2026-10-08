import { DRINKS } from './config.js';
// Clean existing state, never reset stock, furniture, settings or full drinks (#514).
export function cleanHome({ life, cups, pan, vacuum, cloth, marks, breaker, holdables, dishProg, toiletPaper }) {
  life.interrupt('clean');
  dishProg?.cancel(); // no delayed programme can reapply stale dish state
  const I = life.items;
  life.mess?.clear();
  if (life.mess) life.mess.dustT = 0;
  toiletPaper.reset();
  marks.clear(); // includes spills on the patio; decals are not persistent
  breaker.glass.clear(); breaker.china.clear();
  vacuum.emptyIntoBin();
  cloth.wipes = 0; cloth.updateColor();
  const dirtyDishes = [];
  for (const item of I.all()) {
    if (I.has(item, 'bin')) {
      I.setAmount(item, 0); I.set(item, { parts: [], machine: { nobag: null } });
    } else if (I.has(item, 'rubbishBag') || (I.has(item, 'package') && (item.pkg === 'empty' || item.amount <= 0)) || life.isEnd?.(item)) {
      I.remove(item); // all these are leaf waste; never cascade-remove saved food or dishes
    } else if (item.clean && item.clean !== 'clean' && !I.has(item, 'laundry')) {
      const full = I.has(item, 'glass') && item.amount >= (I.def(item).capacity ?? Infinity) - 1e-6;
      if (I.has(item, 'glass') && !full) { I.setAmount(item, 0); }
      I.set(item, { clean: 'clean', machine: { crumbs: null, load: null, loadType: null, drink: I.has(item, 'glass') && !full ? null : item.machine.drink } });
      if (!full && !I.children(item).length) dirtyDishes.push(item);
    }
  }
  // Only dishes we just washed return to an available original slot. Clean arranged dishes/food stay put.
  for (const item of dirtyDishes) if (item.home && item.place.at !== 'on') I.move(item, item.home, { ignoreShut: true });
  for (const cup of cups.cups) if (cup.dirty && cup.state !== 'spare') {
    if (cup.fill >= 1 - 1e-6) { cup.wash(); continue; }
    cup.contents.clear(); cup.heat = cup.coffeeWas = cup.milkWas = 0; cup.wash();
    const slot = cup.freeSlot?.() ?? -1;
    if (slot >= 0) cup.goHome(slot); // no shared-slot overlap and no new cup creation
    else if (cup.held) cup.putBack();
    else if (cup.state === 'dishwasher') { cup.unpark(); cup.placeAt(cup.counter); }
  }
  if (pan?.dirty) { pan.wash(); if (!pan.egg && !pan.occupied?.()) { if (pan.held) pan.putBack(); else pan.goHome(); } }
  for (const item of holdables) if (item.breakKind === 'glass' && item.used) {
    const full = DRINKS.pour.glass[item.contents.main]?.to ?? DRINKS.pour.glass[item.contents.main]?.add ?? 1;
    if (item.fill < full - 1e-6) { if (item.held) item.putBack(); else item.goHome(); item.used = false; }
  }
  for (const item of holdables) if (item.wasteKind && !item.lifeItem) item.discard?.();
  life.dirty = true; life.flush();
  return 'Hemmet och uteplatsen städade.';
}
