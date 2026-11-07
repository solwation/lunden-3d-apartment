import { COOKING } from './config.js';

// #1881: the one cooking rule for every food and appliance (the user: "Allt som går i ugn eller stekpanna ska också gå i
// airfryer, och vice versa. Grillen är lite speciell förstås, där går bara kött."). Pure (no three.js), read by the appliance
// code in main.js / fishfingers.js / fries.js / cookstores.js / chicken.js / fishing.js and by src/cookrules.test.mjs.
// A food is a COOKING.foods definition (tags, size, per-appliance rate), never a special case per appliance:
//  - the pan, the oven and the air fryer (COOKING.group) take the same foods;
//  - the grill takes only a food carrying one of COOKING.grillTags (meat; the caught fish keeps its #1754 spot as 'catch');
//  - a food bigger than an appliance's room is refused with where it does fit.

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const list = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} eller ${xs[xs.length - 1]}`);
const size = (k) => COOKING.sizes[k] ?? COOKING.sizes.m;

export const APPLIANCES = Object.keys(COOKING.appliances);
export const FOODS = Object.keys(COOKING.foods);

/** Can the appliance cook this kind of food at all (ignoring its size)? */
export function cooksKind(food, appliance) {
  const f = COOKING.foods[food];
  if (!f || !COOKING.appliances[appliance]) return false;
  if (appliance === 'grill') return f.tags.some((t) => COOKING.grillTags.includes(t));
  return COOKING.group.includes(appliance);
}

/** Does the food fit in the appliance? */
export const fits = (food, appliance) => size(COOKING.foods[food]?.size) <= size(COOKING.appliances[appliance]?.room);

/** Why `food` cannot go in / on `appliance` (a Swedish sentence for the HUD), or null when it can. */
export function cookRefusal(food, appliance) {
  const f = COOKING.foods[food], a = COOKING.appliances[appliance];
  if (!f || !a) return 'Det där går inte att laga här';
  if (!cooksKind(food, appliance)) return appliance === 'grill' ? `Det går inte att grilla ${f.noun}` : `Det går inte att ${a.verb} ${f.noun}`;
  if (!fits(food, appliance)) {
    const where = APPLIANCES.filter((k) => k !== appliance && cooksKind(food, k) && fits(food, k)).map((k) => COOKING.appliances[k].name);
    return `${cap(f.name)} är för stor för ${a.name}${where.length ? ` – använd ${list(where)}` : ''}`;
  }
  return null;
}

export const canCook = (food, appliance) => !cookRefusal(food, appliance);

/** How fast the appliance cooks the food (× the food's own seconds), 0 when it cannot. */
export const cookRate = (food, appliance) => (canCook(food, appliance) ? COOKING.foods[food].rate?.[appliance] ?? 1 : 0);

/** The COOKING food a life item type cooks as (ITEMS `cook`: rawEgg / friedEgg → 'egg', sausage → 'sausage'), or null. */
export const lifeFood = (defs, type) => defs?.[type]?.cook ?? null;
