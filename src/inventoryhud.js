import { inventorySlots } from './holdable.js';

// #1954: the inventory's row in the HUD: one box per place (src/holdable.js), the hand's highlighted, each with its key, an icon for
// the thing on top and how many there are (nuts stack). A click / tap on a box puts that place in the hand. On a keyboard the row is
// shown whenever something is carried; on touch the 🎒 button opens it and a choice closes it again. DOM only: no draw call.

/** The keys that choose place 1 … 5. F5 is left to the browser (reload). */
export const INVENTORY_KEYS = ['F1', 'F2', 'F3', 'F4', 'F6'];

const ICONS = [['isRifle', '🔫'], ['isBow', '🏹'], ['isHarpoon', '🔱'], ['isFishingRod', '🎣'], ['isBinoculars', '🔭'], ['isSquirrelNut', '🌰'], ['isMussel', '🦪'],
  ['isCaughtFish', '🐟'], ['isSharkFin', '🦈'], ['isSprayCan', '🎨'], ['isCup', '☕'], ['isMiele', '🐈']];
const BY_CLASS = { Saber: '⚔️', Blaster: '🔫', Wand: '🪄', Flashlight: '🔦', Basketball: '🏀',
  Glass: '🍷', Bottle: '🍾', BeerCan: '🍺', Milk: '🥛', PopcornTub: '🍿', FriesBag: '🍟', Chicken: '🐔', ChickenPiece: '🍗' }; // #1960: the drinks and snacks that can be carried
const FRUIT = { apple: '🍎', pear: '🍐', orange: '🍊', clementine: '🍊', banana: '🍌' }; // fruit.js kinds
// #1961: the life simulator's things by instance type (items.js), else by tag
const LIFE_ICON = { toiletRoll: '🧻', hallJacket: '🧥', hallShoes: '👟', wateringCan: '🚿', laundryClothes: '👕', eggCarton: '🥚', rawEgg: '🥚', friedEgg: '🍳', sausagePack: '🌭', sausage: '🌭',
  bunBag: '🥖', hotdogBun: '🌭', billysBox: '🍕', billys: '🍕', gorbysBox: '🥟', pirog: '🥟', iceCreamBox: '🍨', iceCreamConeVanilla: '🍦', iceCreamConeStrawberry: '🍦', iceCreamConeChocolate: '🍦',
  plate: '🍽️', board: '🪵', cucumber: '🥒', cucumberSlice: '🥒', cheese: '🧀', cheeseSlice: '🧀', cheeseSlicer: '🧀', butter: '🧈', breadBag: '🍞', breadSlice: '🍞', peas: '🫛',
  rubbishBag: '🗑️', knife: '🔪', butterKnife: '🔪', glass: '🥛' };
const LIFE_TAG = [['food', '🍽️'], ['dish', '🍽️'], ['tool', '🔪']];
/** The icon of a held / carried thing. */
export function inventoryIcon(item) {
  if (!item) return '';
  for (const [flag, icon] of ICONS) if (item[flag]) return icon;
  if (item.lifeItem) return LIFE_ICON[item.item?.type] ?? LIFE_TAG.find(([t]) => item.life?.items.has(item.item, t))?.[1] ?? '📦';
  if (item.isFruit) return FRUIT[item.kind] ?? '🍎'; // #1960: what is carried shows, not a generic hand
  if (item.isFries) return '🍟';
  if (item.isFish) return '🍤'; // a fish finger (fishfingers.js: a plain object)
  return BY_CLASS[item.constructor?.name] ?? '✋';
}

export class InventoryHUD {
  /** row: the #inventory element; button: the touch 🎒 button; touch(): touch controls on; onSelect(i): a box was chosen. */
  constructor({ row, button, touch = () => false, onSelect = () => {} }) {
    Object.assign(this, { row, button, touch, onSelect, sig: '', open: false, boxes: [] });
    INVENTORY_KEYS.forEach((key, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('role', 'option');
      b.innerHTML = '<kbd></kbd><span class="icon"></span><span class="count"></span>';
      b.firstChild.textContent = key;
      b.addEventListener('click', (e) => { e.stopPropagation(); this.onSelect(i); this.setOpen(false); });
      row.append(b); this.boxes.push(b);
    });
    button?.addEventListener('click', (e) => { e.stopPropagation(); this.setOpen(!this.open); });
  }
  setOpen(on) { this.open = on; this.button?.setAttribute('aria-expanded', String(on)); this.sig = ''; }
  /** Per frame: redraws only when what is carried changed. `show`: the HUD may be shown at all (playing, not reading …). */
  update(show = true) {
    const slots = inventorySlots(), carried = slots.some((s) => s.count > 0), touch = this.touch();
    const sig = `${show}|${touch}|${this.open}|` + slots.map((s) => `${s.active ? '*' : ''}${inventoryIcon(s.item)}${s.count}`).join(',');
    if (sig === this.sig) return;
    this.sig = sig;
    if (this.button) this.button.hidden = !(show && touch && carried);
    if (!carried && this.open) this.open = false;
    this.row.hidden = !(show && carried && (!touch || this.open));
    slots.forEach((s, i) => {
      const b = this.boxes[i];
      b.classList.toggle('on', s.active); b.classList.toggle('empty', !s.count);
      b.setAttribute('aria-selected', String(s.active));
      b.setAttribute('aria-label', `Plats ${i + 1}: ${s.item?.name ?? 'tom'}${s.count > 1 ? `, ${s.count} stycken` : ''}`);
      b.children[1].textContent = inventoryIcon(s.item);
      b.children[2].textContent = s.count > 1 ? String(s.count) : '';
    });
  }
}
